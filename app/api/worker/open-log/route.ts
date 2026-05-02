import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id = searchParams.get('worker_id')

    if (!worker_id) {
      return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('time_logs')
      .select('id, clock_in, clock_out, hours_worked, amount_earned, is_overtime')
      .eq('worker_id', worker_id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ openLog: data || null })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
