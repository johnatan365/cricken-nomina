import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date_from = searchParams.get('date_from')
  const date_to   = searchParams.get('date_to')
  const supplier  = searchParams.get('supplier')
  const supabase  = createAdminClient()

  let q = supabase
    .from('kitchen_orders')
    .select('*, worker:workers(full_name), items:kitchen_order_items(*, product:kitchen_products(*))')
    .order('delivery_date', { ascending: false })

  if (date_from) q = q.gte('delivery_date', date_from)
  if (date_to)   q = q.lte('delivery_date', date_to)

  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Filtrar por proveedor en memoria si se solicita
  let orders = data || []
  if (supplier && supplier !== 'all') {
    orders = orders.map(o => ({
      ...o,
      items: (o.items || []).filter((i: {product: {supplier: string}}) =>
        i.product?.supplier === supplier
      )
    })).filter(o => o.items.length > 0)
  }

  return NextResponse.json({ orders })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()

  // Modificar item individual (cantidad pedida o entregada)
  if (body.type === 'item') {
    const { item_id, qty_requested, qty_delivered } = body
    const update: Record<string, number> = {}
    if (qty_requested !== undefined) update.qty_requested = qty_requested
    if (qty_delivered !== undefined) update.qty_delivered = qty_delivered
    const { error } = await supabase.from('kitchen_order_items').update(update).eq('id', item_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Modificar precio de producto (en este pedido, en tabla de productos, y pedidos futuros)
  if (body.type === 'price') {
    const { product_id, new_price, order_date } = body
    // 1. Actualizar tabla de productos
    await supabase.from('kitchen_products').update({ price: new_price }).eq('id', product_id)
    // 2. Pedidos anteriores NO se tocan — ya están registrados
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('kitchen_orders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
