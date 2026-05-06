import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date_from = searchParams.get('date_from')
  const date_to   = searchParams.get('date_to')
  const supplier  = searchParams.get('supplier')
  const supabase  = createAdminClient()

  const order_type = searchParams.get('order_type') || 'kitchen'

  let q = supabase
    .from('kitchen_orders')
    .select('*, worker:workers!kitchen_orders_worker_id_fkey(full_name), items:kitchen_order_items(*, product:kitchen_products(*))')
    .eq('order_type', order_type)
    .order('delivery_date', { ascending: false })

  if (date_from) q = q.gte('delivery_date', date_from)
  if (date_to)   q = q.lte('delivery_date', date_to)

  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  let orders = data || []
  if (supplier && supplier !== 'all') {
    orders = orders.map(o => ({
      ...o,
      items: (o.items || []).filter((i: {product: {supplier: string}}) => i.product?.supplier === supplier)
    })).filter(o => o.items.length > 0)
  }

  return NextResponse.json({ orders })
}

export async function POST(req: NextRequest) {
  // Agregar item a pedido existente
  const { order_id, product_id, qty_requested } = await req.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('kitchen_order_items')
    .insert({ order_id, product_id, qty_requested, qty_delivered: null })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()

  if (body.type === 'item') {
    const { item_id, qty_requested, qty_delivered, observation } = body
    const update: Record<string, unknown> = {}
    if (qty_requested !== undefined) update.qty_requested = qty_requested
    if (qty_delivered !== undefined) update.qty_delivered = qty_delivered
    if (observation  !== undefined) update.observation   = observation
    const { error } = await supabase.from('kitchen_order_items').update(update).eq('id', item_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'date') {
    const { order_id, delivery_date } = body
    const { error } = await supabase.from('kitchen_orders').update({ delivery_date }).eq('id', order_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'price') {
    const { product_id, new_price, item_id, update_product, order_date } = body
    // 1. Guardar price_override solo en este item
    if (item_id) {
      await supabase.from('kitchen_order_items').update({ price_override: new_price }).eq('id', item_id)
    }
    // 2. Actualizar tabla de productos (futuros pedidos)
    if (update_product) {
      await supabase.from('kitchen_products').update({ price: new_price }).eq('id', product_id)
    }
    // 3. Actualizar price_override en pedidos POSTERIORES a order_date (no anteriores)
    if (order_date && product_id) {
      const { data: futureItems } = await supabase
        .from('kitchen_order_items')
        .select('id, order_id, kitchen_orders!inner(delivery_date)')
        .eq('product_id', product_id)
        .neq('id', item_id || '')
      if (futureItems) {
        for (const fi of futureItems) {
          const orderDeliveryDate = (fi as any).kitchen_orders?.delivery_date
          if (orderDeliveryDate && orderDeliveryDate > order_date) {
            await supabase.from('kitchen_order_items').update({ price_override: new_price }).eq('id', fi.id)
          }
        }
      }
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id      = searchParams.get('id')
  const item_id = searchParams.get('item_id')
  const supabase = createAdminClient()

  if (item_id) {
    const { error } = await supabase.from('kitchen_order_items').delete().eq('id', item_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (id) {
    const { error } = await supabase.from('kitchen_orders').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'id requerido' }, { status: 400 })
}
