import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getDeliveryDate(): string {
  // 12am-1:59pm → mismo día
  // 2pm-11:59pm → día siguiente
  const now    = new Date()
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const hour   = bogota.getUTCHours()
  const target = hour < 14
    ? bogota                                               // antes de las 2pm → mismo día
    : new Date(bogota.getTime() + 24 * 60 * 60 * 1000)   // 2pm en adelante → día siguiente
  const yyyy = target.getUTCFullYear()
  const mm   = String(target.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(target.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const worker_id = searchParams.get('worker_id')
  if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

  const supabase     = createAdminClient()
  const deliveryDate = getDeliveryDate()

  const orderType = searchParams.get('order_type') || 'kitchen'

  // Buscar pedido activo (pending) para la fecha calculada
  const { data: order } = await supabase
    .from('kitchen_orders')
    .select('*, worker:workers(full_name), items:kitchen_order_items(*, product:kitchen_products(*))')
    .eq('delivery_date', deliveryDate)
    .eq('status', 'pending')
    .eq('order_type', orderType)
    .maybeSingle()

  const { data: products } = await supabase
    .from('kitchen_products')
    .select('*')
    .eq('is_active', true)
    .eq('order_type', orderType)
    .order('sort_order')

  const orderWithName = order ? { ...order, worker_name: (order as any).worker?.full_name || '' } : null
  return NextResponse.json({ order: orderWithName, products, deliveryDate })
}

export async function POST(req: NextRequest) {
  const body_data = await req.json()
  const { worker_id, items, delivery_date } = body_data
  const supabase = createAdminClient()

  // Solo bloquear si hay un pedido PENDING para esa fecha
  const { data: existing } = await supabase
    .from('kitchen_orders')
    .select('id')
    .eq('delivery_date', delivery_date)
    .eq('status', 'pending')
    .eq('order_type', body_data.order_type || 'kitchen')
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya existe un pedido pendiente para ese día' }, { status: 409 })

  const orderType = body_data.order_type || 'kitchen'
  const { data: order, error } = await supabase
    .from('kitchen_orders')
    .insert({ worker_id, delivery_date, status: 'pending', order_type: orderType })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const orderItems = items
    .filter((i: {qty_requested: number}) => i.qty_requested > 0)
    .map((i: {product_id: string; qty_requested: number}) => ({
      order_id: order.id, product_id: i.product_id, qty_requested: i.qty_requested,
    }))

  if (orderItems.length > 0) await supabase.from('kitchen_order_items').insert(orderItems)

  // Generar link wa.me con el pedido completo
  const lines = items
    .filter((i: {qty_requested: number}) => i.qty_requested > 0)
    .map((i: {name: string; qty_requested: number}) => `• ${i.name}: ${i.qty_requested}`)
    .join('\n')
  const msg     = `🛒 *Pedido Cricken*\n📅 Entrega: ${delivery_date}\n\n${lines}`
  const waLink  = `https://wa.me/573192099123?text=${encodeURIComponent(msg)}`

  return NextResponse.json({ ok: true, order, waLink })
}

export async function PATCH(req: NextRequest) {
  const { order_id, deliveries } = await req.json()
  const supabase = createAdminClient()

  for (const d of deliveries) {
    const update: Record<string, unknown> = { qty_delivered: d.qty_delivered }
    if (d.observation !== undefined) update.observation = d.observation
    await supabase.from('kitchen_order_items')
      .update(update)
      .eq('order_id', order_id)
      .eq('product_id', d.product_id)
  }

  await supabase.from('kitchen_orders').update({ status: 'delivered' }).eq('id', order_id)
  return NextResponse.json({ ok: true })
}
