import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const supabase = createAdminClient()
  let q = supabase.from('kitchen_orders')
    .select('*, worker:workers(full_name), items:kitchen_order_items(*, product:kitchen_products(*))')
    .order('delivery_date', { ascending: false })
  if (date) q = q.eq('delivery_date', date)
  const { data, error } = await q.limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ orders: data })
}
