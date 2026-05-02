import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('schedules').select('*').order('day_of_week')
    return NextResponse.json({ schedules: data || [] })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { schedules } = await req.json()
    const supabase = createAdminClient()
    for (const sched of schedules) {
      if (sched.id) {
        await supabase.from('schedules').update({
          start_time: sched.start_time,
          end_time: sched.end_time,
          is_active: sched.is_active,
        }).eq('id', sched.id)
      } else {
        await supabase.from('schedules').insert({
          day_of_week: sched.day_of_week,
          start_time: sched.start_time,
          end_time: sched.end_time,
          is_active: sched.is_active,
        })
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
