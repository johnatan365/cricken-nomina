// app/api/admin/cash-registers/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET — lista de cierres para el admin con filtros opcionales
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { searchParams } = new URL(req.url)
    const worker_id  = searchParams.get('worker_id')
    const date_from  = searchParams.get('date_from')
    const date_to    = searchParams.get('date_to')
    const shift      = searchParams.get('shift')

    const supabase = createAdminClient()

    // Modo: devolver solo los trabajadores que tienen al menos un cierre (para poblar el filtro)
    if (searchParams.get('workers_with_registers')) {
      const { data: regs, error: e1 } = await supabase
        .from('cash_registers')
        .select('worker_id')
      if (e1) return NextResponse.json({ error: e1.message }, { status: 400 })
      const ids = Array.from(new Set((regs || [])
        .map((r: { worker_id: string }) => r.worker_id)
        .filter(Boolean)))
      if (ids.length === 0) return NextResponse.json({ workers: [] })
      const { data: ws, error: e2 } = await supabase
        .from('workers')
        .select('id, full_name')
        .in('id', ids)
        .order('full_name')
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
      return NextResponse.json({ workers: ws })
    }

    let query = supabase
      .from('cash_registers')
      .select('*, worker:workers(full_name), location:locations(name)')
      .order('register_date', { ascending: false })
      .order('submitted_at', { ascending: false })

    if (worker_id)  query = query.eq('worker_id', worker_id)
    if (shift)      query = query.eq('shift', shift)
    if (date_from)  query = query.gte('register_date', date_from)
    if (date_to)    query = query.lte('register_date', date_to)

    const { data, error } = await query.limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ registers: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('cash_registers')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { id, register_date } = await req.json()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('cash_registers')
    .update({ register_date })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
