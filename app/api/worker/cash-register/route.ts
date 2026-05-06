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

    // Historial de cierres
    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('worker_id', worker_id)
      .order('register_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const last = data?.[0]

    // Base sugerida — no pre-cargar si hay solicitud de cambio pendiente
    const hasPendingBaseRequest = last?.base_change_status === 'pending'
    const suggestedBase = (!hasPendingBaseRequest && last?.next_base) ? last.next_base : 0

    // Verificar borrador pendiente de aprobación (descuadre)
    const { data: draft } = await supabase
      .from('cash_register_drafts')
      .select('id, difference, status')
      .eq('worker_id', worker_id)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      registers: data,
      suggestedBase,
      hasPendingBaseRequest,
      hasPendingDifference: !!draft,
      pendingDraft: draft || null,
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
      next_base_requested, base_change_reason,
      // Si viene isDraft=true, es un borrador para aprobación
      isDraft,
      didi_cash_total, didi_transfer_total, whatsapp_total,
      cancelled_total, supplier_total, total_real_sales,
      expected_cash, difference, next_base,
    } = body

    if (!worker_id || !shift)
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

    const supabase = createAdminClient()

    // Bloqueo: verificar si hay borrador pendiente
    const { data: existingDraft } = await supabase
      .from('cash_register_drafts')
      .select('id')
      .eq('worker_id', worker_id)
      .eq('status', 'pending_approval')
      .maybeSingle()

    if (existingDraft)
      return NextResponse.json({
        error: 'Tienes un cierre con descuadre pendiente de aprobación. El admin debe revisarlo antes.',
        blocked: true,
      }, { status: 403 })

    // Verificar duplicado
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

    // Si viene como borrador → guardarlo en cash_register_drafts
    if (isDraft) {
      const { data: draft, error: draftErr } = await supabase
        .from('cash_register_drafts')
        .upsert({
          worker_id, shift,
          register_date: register_date || new Date().toISOString().split('T')[0],
          opening_fund:        n(opening_fund),
          puve_cash:           n(puve_cash),
          puve_transfer:       n(puve_transfer),
          puve_total_reported: n(puve_total_reported),
          didi_orders:         didi_orders || [],
          whatsapp_orders:     whatsapp_orders || [],
          cancelled_orders:    cancelled_orders || [],
          supplier_payments:   supplier_payments || [],
          cash_counted:        n(cash_counted),
          cash_to_owner:       n(cash_to_owner),
          bill_counts:         bill_counts || [],
          puve_transfers:      puve_transfers || [],
          didi_cash_total:     n(didi_cash_total),
          didi_transfer_total: n(didi_transfer_total),
          whatsapp_total:      n(whatsapp_total),
          cancelled_total:     n(cancelled_total),
          supplier_total:      n(supplier_total),
          total_real_sales:    n(total_real_sales),
          expected_cash:       n(expected_cash),
          difference:          n(difference),
          next_base:           n(next_base),
          difference_note:     difference_note || null,
          status:              'pending_approval',
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'worker_id,shift,register_date' })
        .select().single()

      if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, isDraft: true, draft })
    }

    // Cierre sin descuadre → registrar directamente
    const didiOrders       = didi_orders || []
    const whatsappOrders   = whatsapp_orders || []
    const cancelledOrders  = cancelled_orders || []
    const supplierPayments = supplier_payments || []

    const dCash   = didiOrders.reduce((s: number, o: {cash: number}) => s + n(o.cash), 0)
    const dTrans  = didiOrders.reduce((s: number, o: {transfers: {amount: number}[]}) =>
      s + (o.transfers || []).reduce((ss: number, t: {amount: number}) => ss + n(t.amount), 0), 0)
    const wTotal  = whatsappOrders.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)
    const cTotal  = cancelledOrders.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)
    const sTotal  = supplierPayments.reduce((s: number, o: {amount: number}) => s + n(o.amount), 0)

    const puveRep  = n(puve_total_reported)
    const puveCash = n(puve_cash)
    const puveTr   = n(puve_transfer)
    const openFund = n(opening_fund)
    const cashCnt     = n(cash_counted)
    // El worker envía:
    //   cash_to_owner = el sobre (efectivo - base)
    //   next_base     = la base que deja en caja
    // Usar directamente sin recalcular
    const cashOwn     = n(cash_to_owner)   // sobre
    const nextBaseVal = n(next_base)        // base que deja

    const totalSales  = puveRep + dCash + dTrans + wTotal - cTotal
    const expCash     = openFund + puveCash + dCash + wTotal - sTotal
    const diff        = cashCnt - expCash
    const hasBaseChg  = next_base_requested !== undefined && next_base_requested !== null &&
                        Math.abs(n(next_base_requested) - nextBaseVal) >= 1

    const { data: reg, error: regErr } = await supabase
      .from('cash_registers')
      .insert({
        worker_id,
        location_id:         location_id || null,
        shift,
        register_date:       register_date || new Date().toISOString().split('T')[0],
        opening_fund:        openFund,
        puve_cash:           puveCash,
        puve_transfer:       puveTr,
        puve_total_reported: puveRep,
        didi_orders:         didiOrders,
        whatsapp_orders:     whatsappOrders,
        cancelled_orders:    cancelledOrders,
        supplier_payments:   supplierPayments,
        cash_counted:        cashCnt,
        cash_to_owner:       cashOwn,
        next_base:           nextBaseVal,
        next_base_requested: hasBaseChg ? n(next_base_requested) : null,
        bill_counts:         bill_counts || [],
        puve_transfers:      puve_transfers || [],
        didi_cash_total:     dCash,
        didi_transfer_total: dTrans,
        whatsapp_total:      wTotal,
        cancelled_total:     cTotal,
        supplier_total:      sTotal,
        total_real_sales:    totalSales,
        expected_cash:       expCash,
        difference:          diff,
        difference_note:     difference_note || null,
        base_change_status:  hasBaseChg ? 'pending' : null,
      })
      .select().single()

    if (regErr) return NextResponse.json({ error: regErr.message }, { status: 400 })

    // Si hay cambio de base → crear solicitud
    if (hasBaseChg && reg) {
      await supabase.from('base_change_requests').insert({
        cash_register_id: reg.id,
        worker_id,
        base_calculated: nextBaseVal,
        base_requested:  n(next_base_requested),
        reason:          base_change_reason || 'Sin motivo',
      })
    }

    return NextResponse.json({ ok: true, register: reg })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
