import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getDeliveryDate(): string {
  // Hora actual en Bogotá (UTC-5)
  const now = new Date()
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const hour = bogota.getUTCHours()

  // Antes de medianoche (0-23:59) → día siguiente
  // Después de medianoche (0:00-11:59 del turno extendido) → ese mismo día
  // Regla: si hora < 12 (madrugada) → mismo día, si hora >= 12 → día siguiente
  if (hour < 12) {
    // Madrugada — mismo día calendario
    const yyyy = bogota.getUTCFullYear()
    const mm   = String(bogota.getUTCMonth() + 1).padStart(2, '0')
    const dd   = String(bogota.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  } else {
    // Tarde/noche — día siguiente
    const next = new Date(bogota.getTime() + 24 * 60 * 60 * 1000)
    const yyyy = next.getUTCFullYear()
    const mm   = String(next.getUTCMonth() + 1).padStart(2, '0')
    const dd   = String(next.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const worker_id = searchParams.get('worker_id')
  if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const deliveryDate = getDeliveryDate()

  // Buscar pedido para la fecha de entrega calculada
  const { data: order } = await supabase
    .from('kitchen_orders')
    .select('*, items:kitchen_order_items(*, product:kitchen_products(*))')
    .eq('delivery_date', deliveryDate)
    .maybeSingle()

  const { data: products } = await supabase
    .from('kitchen_products')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return NextResponse.json({ order, products, deliveryDate })
}

export async function POST(req: NextRequest) {
  const { worker_id, items, delivery_date } = await req.json()
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('kitchen_orders')
    .select('id')
    .eq('delivery_date', delivery_date)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya existe un pedido para ese día' }, { status: 409 })

  const { data: order, error } = await supabase
    .from('kitchen_orders')
    .insert({ worker_id, delivery_date, status: 'pending' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const orderItems = items
    .filter((i: {qty_requested: number}) => i.qty_requested > 0)
    .map((i: {product_id: string; qty_requested: number}) => ({
      order_id: order.id,
      product_id: i.product_id,
      qty_requested: i.qty_requested,
    }))

  if (orderItems.length > 0) await supabase.from('kitchen_order_items').insert(orderItems)

  // WhatsApp CallMeBot
  const apiKey = process.env.CALLMEBOT_API_KEY || ''
  if (apiKey) {
    const lines = items
      .filter((i: {qty_requested: number}) => i.qty_requested > 0)
      .map((i: {name: string; qty_requested: number}) => `• ${i.name}: ${i.qty_requested}`)
      .join('\n')
    const msg = encodeURIComponent(`🛒 *Pedido Cricken*\n📅 Entrega: ${delivery_date}\n\n${lines}`)
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=573192099123&text=${msg}&apikey=${apiKey}`).catch(() => {})
    await supabase.from('kitchen_orders').update({ whatsapp_sent: true }).eq('id', order.id)
  }

  return NextResponse.json({ ok: true, order })
}

export async function PATCH(req: NextRequest) {
  const { order_id, deliveries } = await req.json()
  const supabase = createAdminClient()

  for (const d of deliveries) {
    await supabase.from('kitchen_order_items')
      .update({ qty_delivered: d.qty_delivered })
      .eq('order_id', order_id)
      .eq('product_id', d.product_id)
  }

  await supabase.from('kitchen_orders').update({ status: 'delivered' }).eq('id', order_id)
  return NextResponse.json({ ok: true })
}
