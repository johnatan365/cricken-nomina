// app/api/admin/cash-registers/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — lista de cierres para el admin con filtros opcionales
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id  = searchParams.get('worker_id')
    const date_from  = searchParams.get('date_from')
    const date_to    = searchParams.get('date_to')
    const shift      = searchParams.get('shift')

    const supabase = createAdminClient()

    let query = supabase
      .from('cash_registers_admin')  // usa la vista con nombre del trabajador
      .select('*')
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
