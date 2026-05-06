import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date_from  = searchParams.get('date_from')
  const date_to    = searchParams.get('date_to')
  const supplier   = searchParams.get('supplier')
  const order_type = searchParams.get('order_type') || 'kitchen'
  const supabase   = createAdminClient()

  // Query sin join a workers para evitar ambigüedad de FK
  let q = supabase
    .from('kitchen_orders')
    .select('id, delivery_date, status, whatsapp_sent, worker_id, delivered_by, order_type, items:kitchen_order_items(id, product_id, qty_requested, qty_delivered, observation, price_override, product:kitchen_products(id, name, price, supplier))')
    .eq('order_type', order_type)
    .order('delivery_date', { ascending: false })

  if (date_from) q = q.gte('delivery_date', date_from)
  if (date_to)   q = q.lte('delivery_date', date_to)

  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const orders = data || []

  // Obtener nombres de workers en una sola query
  const workerIds = [...new Set([
    ...orders.map(o => o.worker_id),
    ...orders.map(o => o.delivered_by)
  ].filter(Boolean))] as string[]

  const workerMap: Record<string, string> = {}
  if (workerIds.length > 0) {
    const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds)
    ;(workers || []).forEach(w => { workerMap[w.id] = w.full_name })
  }

  const enrichedOrders = orders.map(o => ({
    ...o,
    worker: { full_name: workerMap[o.worker_id] || 'Desconocido' },
    delivered_by_worker: o.delivered_by ? { full_name: workerMap[o.delivered_by] || 'Desconocido' } : null,
  }))

  let result = enrichedOrders
  if (supplier && supplier !== 'all') {
    result = enrichedOrders
      .map(o => ({ ...o, items: (o.items || []).filter((i: any) => i.product?.supplier === supplier) }))
      .filter(o => o.items.length > 0)
  }

  return NextResponse.json({ orders: result })
}

export async function POST(req: NextRequest) {
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
    const update: Record<string, unknown> = { type: undefined }
    delete update.type
    const u: Record<string, unknown> = {}
    if (body.qty_requested !== undefined) u.qty_requested = body.qty_requested
    if (body.qty_delivered !== undefined) u.qty_delivered = body.qty_delivered
    if (body.observation  !== undefined) u.observation   = body.observation
    const { error } = await supabase.from('kitchen_order_items').update(u).eq('id', body.item_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'date') {
    const { error } = await supabase.from('kitchen_orders').update({ delivery_date: body.delivery_date }).eq('id', body.order_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'price') {
    const { product_id, new_price, item_id, update_product, order_date } = body
    if (item_id) {
      await supabase.from('kitchen_order_items').update({ price_override: new_price }).eq('id', item_id)
    }
    if (update_product) {
      await supabase.from('kitchen_products').update({ price: new_price }).eq('id', product_id)
    }
    if (order_date && product_id) {
      const { data: futureOrders } = await supabase.from('kitchen_orders').select('id').gt('delivery_date', order_date)
      if (futureOrders && futureOrders.length > 0) {
        const ids = futureOrders.map(o => o.id)
        await supabase.from('kitchen_order_items').update({ price_override: new_price })
          .eq('product_id', product_id).in('order_id', ids).neq('id', item_id || '')
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
