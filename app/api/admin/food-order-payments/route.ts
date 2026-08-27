import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireUser(req); if (denied) return denied
  const { searchParams } = new URL(req.url)
  const date_from = searchParams.get('date_from')
  const date_to   = searchParams.get('date_to')
  const supabase  = createAdminClient()

  // Obtener pedidos food entregados con su estado de pago
  let q = supabase
    .from('kitchen_orders')
    .select('id, delivery_date, status, items:kitchen_order_items(id, qty_delivered, price_override, product:kitchen_products(name, price, supplier))')
    .eq('order_type', 'food')
    .eq('status', 'delivered')
    .order('delivery_date', { ascending: false })

  if (date_from) q = q.gte('delivery_date', date_from)
  if (date_to)   q = q.lte('delivery_date', date_to)

  const { data: orders, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Obtener pagos existentes para esos pedidos
  const orderIds = (orders || []).map(o => o.id)
  let payments: any[] = []
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('food_order_payments')
      .select('*')
      .in('order_id', orderIds)
    payments = data || []
  }

  const paidOrderIds = new Set(payments.map(p => p.order_id))

  const ordersWithTotal = (orders || []).map(o => {
    const total = (o.items || []).reduce((s: number, i: any) =>
      s + (i.qty_delivered ?? 0) * (i.price_override ?? i.product?.price ?? 0), 0)
    return { ...o, total, isPaid: paidOrderIds.has(o.id), payment: payments.find(p => p.order_id === o.id) || null }
  })

  return NextResponse.json({ orders: ordersWithTotal, payments })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { order_ids, notes } = await req.json()
  const supabase = createAdminClient()

  // Calcular monto por pedido
  const { data: orders } = await supabase
    .from('kitchen_orders')
    .select('id, items:kitchen_order_items(qty_delivered, price_override, product:kitchen_products(price))')
    .in('id', order_ids)

  const inserts = (orders || []).map((o: any) => ({
    order_id: o.id,
    amount: (o.items || []).reduce((s: number, i: any) =>
      s + (i.qty_delivered ?? 0) * (i.price_override ?? i.product?.price ?? 0), 0),
    notes: notes || null,
  }))

  const { error } = await supabase.from('food_order_payments').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { searchParams } = new URL(req.url)
  const order_id = searchParams.get('order_id')
  const supabase = createAdminClient()
  const { error } = await supabase.from('food_order_payments').delete().eq('order_id', order_id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
