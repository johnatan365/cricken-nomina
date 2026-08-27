import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const denied = await requireUser(req); if (denied) return denied
  try {
    const worker_id = req.nextUrl.searchParams.get('worker_id')
    const supabase = createAdminClient()
    let query = supabase.from('worker_schedules').select('*').order('day_of_week')
    if (worker_id) query = query.eq('worker_id', worker_id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ schedules: data || [] })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { worker_id, schedules } = await req.json()
    const supabase = createAdminClient()
    for (const sched of schedules) {
      if (sched.is_active) {
        await supabase.from('worker_schedules').upsert({
          worker_id,
          day_of_week: sched.day_of_week,
          start_time: sched.start_time,
          end_time: sched.end_time,
          is_active: true,
        }, { onConflict: 'worker_id,day_of_week' })
      } else {
        await supabase.from('worker_schedules')
          .update({ is_active: false })
          .eq('worker_id', worker_id)
          .eq('day_of_week', sched.day_of_week)
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
