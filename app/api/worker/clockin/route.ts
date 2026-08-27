import { createAdminClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const denied = await requireUser(req); if (denied) return denied
  try {
    const body = await req.json()
    const { worker_id, clock_in_lat, clock_in_lng, clock_in_notes,
            early_entry_reason, corrected_clock_in } = body

    const supabase = createAdminClient()

    // Check worker is active
    const { data: workerData } = await supabase
      .from('workers').select('is_active').eq('id', worker_id).single()

    if (!workerData?.is_active) {
      return NextResponse.json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' }, { status: 403 })
    }

    // Check no open log exists
    const { data: existing } = await supabase
      .from('time_logs')
      .select('id')
      .eq('worker_id', worker_id)
      .is('clock_out', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Ya tienes una entrada abierta' }, { status: 400 })
    }

    // Use corrected time if worker specified one (early entry correction)
    // Otherwise use server time — never trust raw client timestamp
    const serverTime = new Date().toISOString()
    const clock_in = corrected_clock_in || serverTime

    const { data, error } = await supabase.from('time_logs').insert({
      worker_id,
      clock_in,
      clock_in_lat,
      clock_in_lng,
      clock_in_notes: clock_in_notes || null,
      early_entry_reason: early_entry_reason || null,
      status: 'open',
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, log: data, server_time: serverTime })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
