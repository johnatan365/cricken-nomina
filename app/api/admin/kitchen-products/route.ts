import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('kitchen_products').select('*').eq('is_active', true).order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ products: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()

  // Reordenar productos
  if (body.type === 'reorder') {
    for (const { id, sort_order } of body.items) {
      await supabase.from('kitchen_products').update({ sort_order }).eq('id', id)
    }
    return NextResponse.json({ ok: true })
  }

  const { data, error } = await supabase.from('kitchen_products')
    .insert({ name: body.name, price: body.price || 0, supplier: body.supplier || 'Brisas', sort_order: 999 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('kitchen_products')
    .update({ name: body.name, price: body.price, supplier: body.supplier, is_active: body.is_active })
    .eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supabase = createAdminClient()
  const { error } = await supabase.from('kitchen_products').update({ is_active: false }).eq('id', searchParams.get('id')!)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
