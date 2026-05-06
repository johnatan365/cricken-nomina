import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') // YYYY-MM
  const supabase = createAdminClient()

  let q = supabase
    .from('supplier_payments')
    .select('*')
    .order('paid_at', { ascending: false })

  if (month) {
    const start = `${month}-01`
    const end   = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
      .toISOString().split('T')[0]
    q = q.gte('paid_at', start).lte('paid_at', end + 'T23:59:59')
  }

  const { data, error } = await q.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ payments: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('supplier_payments')
    .insert({
      supplier:   body.supplier,
      amount:     body.amount,
      date_from:  body.date_from,
      date_to:    body.date_to,
      order_type: body.order_type || 'all',
      notes:      body.notes || null,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ payment: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createAdminClient()
  const { error } = await supabase.from('supplier_payments').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
