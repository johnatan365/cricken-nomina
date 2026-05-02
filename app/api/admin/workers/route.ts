import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_RATES = [
  { start_time: '08:00:00', end_time: '18:00:00', rate_per_hour: 8000 },
  { start_time: '18:00:00', end_time: '05:00:00', rate_per_hour: 9000 },
]

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data: workers, error } = await supabase
      .from('workers').select('*').order('full_name')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ workers })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const supabase = createAdminClient()
    const { error } = await supabase.from('workers').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// Called after worker registers to assign default rates
export async function POST(req: NextRequest) {
  try {
    const { worker_id } = await req.json()
    const supabase = createAdminClient()

    // Check if already has rates
    const { data: existing } = await supabase
      .from('hourly_rates').select('id').eq('worker_id', worker_id)

    if (!existing || existing.length === 0) {
      await supabase.from('hourly_rates').insert(
        DEFAULT_RATES.map((r) => ({ ...r, worker_id }))
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const supabase = createAdminClient()

    // Get auth_user_id before deleting
    const { data: worker } = await supabase
      .from('workers').select('auth_user_id').eq('id', id).single()

    // Delete related data first
    await supabase.from('hourly_rates').delete().eq('worker_id', id)
    await supabase.from('time_logs').delete().eq('worker_id', id)
    await supabase.from('payments').delete().eq('worker_id', id)
    await supabase.from('workers').delete().eq('id', id)

    // Delete from auth.users using admin API
    if (worker?.auth_user_id) {
      await supabase.auth.admin.deleteUser(worker.auth_user_id)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
