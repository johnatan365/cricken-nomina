// app/api/worker/cash-register/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id = searchParams.get('worker_id')
    if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('worker_id', worker_id)
      .order('register_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Solo pre-cargar base si el último cierre NO tiene solicitud pendiente
    const last = data?.[0]
    const suggestedBase = (last && last.base_change_status !== 'pending')
      ? (last.next_base ?? 0)
      : 0  // si hay pendiente → trabajador ingresa manualmente

    // Bloqueo: si el último cierre tiene descuadre sin aprobar
    const hasPendingDifference = last &&
      Math.abs(last.difference || 0) >= 1 &&
      last.difference_approved === 'pending'

    return NextResponse.json({
      registers: data,
      suggestedBase,
      hasPendingBaseRequest: last?.base_change_status === 'pending',
      hasPendingDifference: !!hasPendingDifference,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      worker_id, location_id, shift, register_date,
      opening_fund, puve_cash, puve_transfer, puve_total_reported,
      didi_orders, whatsapp_orders, cancelled_orders, supplier_payments,
      cash_counted, cash_to_owner, difference_note,
      bill_counts, puve_transfers,
      // Solicitud de cambio de base
      next_base_requested, base_change_reason,
    } = body

    if (!worker_id || !shift)
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

    const supabase = createAdminClient()

    // Verificar si hay descuadre pendiente de aprobación en cualquier cierre anterior
    const { data: pendingDiff } = await supabase
      .from('cash_registers')
      .select('id, difference, register_date')
      .eq('worker_id', worker_id)
      .eq('difference_approved', 'pending')
      .limit(1)
      .maybeSingle()

    if (pendingDiff)
      return NextResponse.json({
        error: 'Tienes un descuadre pendiente de aprobación del admin. No puedes registrar un nuevo cierre hasta que sea revisado.',
        blocked: true,
      }, { status: 403 })

    const { data: existing } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('worker_id', worker_id)
      .eq('shift', shift)
      .eq('register_date', register_date || new Date().toISOString().split('T')[0])
      .maybeSingle()

    if (existing)
      return NextResponse.json({ error: 'Ya existe un cierre para este turno hoy' }, { status: 409 })

    const n = (v: unknown) => parseFloat(String(v)) || 0

    const didiOrders       = didi_orders || []
    const whatsappOrders   = whatsapp_orders || []
    const cancelledOrders  = cancelled_orders || []
    const supplierPayments = supplier_payments || []

    const didi_cash_total     = didiOrders.reduce((s: number, o: {cash: number}) => s + n(o.cash), 0)
    const didi_transfer_total = didiOrders.reduce((s: number, o: {transfers: {amount: number}[]}) =>
      s + (o.transfers || []).reduce((ss: number, t: {amount: number}) => ss + n(t.amount), 0), 0)
    const whatsapp_total   = whatsappOrders.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)
    const cancelled_total  = cancelledOrders.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)
    const supplier_total   = supplierPayments.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)

    const puveCash       = n(puve_cash)
    const puveTransfer   = n(puve_transfer)
    const puveReported   = n(puve_total_reported)
    const openingFund    = n(opening_fund)
    const cashCounted    = n(cash_counted)
    const cashToOwner    = n(cash_to_owner)

    const total_real_sales = puveReported + didi_cash_total + didi_transfer_total + whatsapp_total - cancelled_total
    const expected_cash    = openingFund + puveCash + didi_cash_total + whatsapp_total - supplier_total
    const difference       = cashCounted - expected_cash

    // Base calculada automáticamente
    const next_base_calculated = cashCounted - cashToOwner

    // Si el trabajador modificó la base → viene next_base_requested diferente
    const hasBaseChange = next_base_requested !== undefined &&
      next_base_requested !== null &&
      Math.abs(n(next_base_requested) - next_base_calculated) >= 1

    const base_change_status = hasBaseChange ? 'pending' : null
    const next_base = hasBaseChange ? next_base_calculated : next_base_calculated  // siempre guardamos la calculada

    const { data, error } = await supabase
      .from('cash_registers')
      .insert({
        worker_id,
        location_id: location_id || null,
        shift,
        register_date: register_date || new Date().toISOString().split('T')[0],
        opening_fund:  openingFund,
        puve_cash:     puveCash,
        puve_transfer: puveTransfer,
        puve_total_reported: puveReported,
        didi_orders:       didiOrders,
        whatsapp_orders:   whatsappOrders,
        cancelled_orders:  cancelledOrders,
        supplier_payments: supplierPayments,
        cash_counted:      cashCounted,
        cash_to_owner:     cashToOwner,
        next_base,
        next_base_requested: hasBaseChange ? n(next_base_requested) : null,
        didi_cash_total,
        didi_transfer_total,
        whatsapp_total,
        cancelled_total,
        supplier_total,
        total_real_sales,
        expected_cash,
        difference,
        difference_note: difference_note || null,
        difference_approved: Math.abs(cashCounted - expected_cash) >= 1 ? 'pending' : null,
        bill_counts:    bill_counts || [],
        puve_transfers: puve_transfers || [],
        base_change_status,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Si hay cambio de base → crear la solicitud
    if (hasBaseChange && data) {
      await supabase
        .from('base_change_requests')
        .insert({
          cash_register_id: data.id,
          worker_id,
          base_calculated: next_base_calculated,
          base_requested:  n(next_base_requested),
          reason:          base_change_reason || 'Sin motivo especificado',
        })
    }

    return NextResponse.json({ ok: true, register: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
