// app/api/worker/cash-register/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — historial + base del último cierre para pre-cargar
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

    // La base del siguiente día es el next_base del último cierre
    const lastRegister = data?.[0] || null
    const suggestedBase = lastRegister?.next_base ?? 0

    return NextResponse.json({ registers: data, suggestedBase })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — guardar cierre detallado
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      worker_id,
      location_id,
      shift,
      register_date,
      opening_fund,
      puve_cash,
      puve_transfer,
      didi_orders,       // [{order_id, cash, transfer}]
      whatsapp_orders,   // [{amount}]
      cancelled_orders,  // [{invoice, amount}]
      supplier_payments, // [{description, amount}]
      cash_counted,
      cash_to_owner,
      difference_note,
    } = body

    if (!worker_id || !shift) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verificar duplicado
    const { data: existing } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('worker_id', worker_id)
      .eq('shift', shift)
      .eq('register_date', register_date || new Date().toISOString().split('T')[0])
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un cierre para este turno hoy' },
        { status: 409 }
      )
    }

    // Calcular totales
    const didiOrders       = didi_orders || []
    const whatsappOrders   = whatsapp_orders || []
    const cancelledOrders  = cancelled_orders || []
    const supplierPayments = supplier_payments || []

    const didi_cash_total      = didiOrders.reduce((s: number, o: {cash: number}) => s + (Number(o.cash) || 0), 0)
    const didi_transfer_total  = didiOrders.reduce((s: number, o: {transfer: number}) => s + (Number(o.transfer) || 0), 0)
    const whatsapp_total       = whatsappOrders.reduce((s: number, o: {amount: number}) => s + (Number(o.amount) || 0), 0)
    const cancelled_total      = cancelledOrders.reduce((s: number, o: {amount: number}) => s + (Number(o.amount) || 0), 0)
    const supplier_total       = supplierPayments.reduce((s: number, o: {amount: number}) => s + (Number(o.amount) || 0), 0)

    const puveCash     = Number(puve_cash) || 0
    const puveTransfer = Number(puve_transfer) || 0
    const openingFund  = Number(opening_fund) || 0
    const cashCounted  = Number(cash_counted) || 0
    const cashToOwner  = Number(cash_to_owner) || 0

    // Total ventas real = Puve + Didi + WhatsApp - Cancelados
    const total_real_sales =
      puveCash + puveTransfer +
      didi_cash_total + didi_transfer_total +
      whatsapp_total -
      cancelled_total

    // Efectivo esperado en caja =
    // Base + Puve efectivo + Didi efectivo + WhatsApp - Proveedores
    const expected_cash =
      openingFund +
      puveCash +
      didi_cash_total +
      whatsapp_total -
      supplier_total

    const difference  = cashCounted - expected_cash
    const next_base   = cashCounted - cashToOwner

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
        didi_orders:       didiOrders,
        whatsapp_orders:   whatsappOrders,
        cancelled_orders:  cancelledOrders,
        supplier_payments: supplierPayments,
        cash_counted:      cashCounted,
        cash_to_owner:     cashToOwner,
        next_base,
        didi_cash_total,
        didi_transfer_total,
        whatsapp_total,
        cancelled_total,
        supplier_total,
        total_real_sales,
        expected_cash,
        difference,
        difference_note: difference_note || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, register: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
