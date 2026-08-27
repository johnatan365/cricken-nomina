import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/auth'

function calculateEarnings(
  clockIn: Date,
  clockOut: Date,
  rates: Array<{ start_time: string; end_time: string; rate_per_hour: number }>
): { hours: number; amount: number } {
  const totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000
  if (rates.length === 0) return { hours: Math.round(totalHours * 100) / 100, amount: 0 }

  const bogotaOffsetMs = 5 * 60 * 60000

  function getBogotaDayStartUTC(dateUTC: Date): Date {
    const bogota = new Date(dateUTC.getTime() - bogotaOffsetMs)
    bogota.setUTCHours(0, 0, 0, 0)
    return new Date(bogota.getTime() + bogotaOffsetMs)
  }

  let amount = 0
  const clockInDayStart = getBogotaDayStartUTC(clockIn)
  const clockOutDayStart = getBogotaDayStartUTC(clockOut)
  const msPerDay = 24 * 60 * 60000
  const daysDiff = Math.round((clockOutDayStart.getTime() - clockInDayStart.getTime()) / msPerDay)

  for (let d = 0; d <= daysDiff; d++) {
    const dayStartUTC = new Date(clockInDayStart.getTime() + d * msPerDay)
    for (const rate of rates) {
      const [startH, startM] = rate.start_time.split(':').map(Number)
      const [endH, endM] = rate.end_time.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      let endMinutes = endH * 60 + endM
      if (endMinutes === 0 || endMinutes <= startMinutes) endMinutes += 24 * 60
      const rateStart = new Date(dayStartUTC.getTime() + startMinutes * 60000)
      const rateEnd = new Date(dayStartUTC.getTime() + endMinutes * 60000)
      const overlapStart = Math.max(clockIn.getTime(), rateStart.getTime())
      const overlapEnd = Math.min(clockOut.getTime(), rateEnd.getTime())
      if (overlapEnd > overlapStart) {
        amount += ((overlapEnd - overlapStart) / 3600000) * rate.rate_per_hour
      }
    }
  }

  return {
    hours: Math.round(totalHours * 100) / 100,
    amount: Math.round(amount * 100) / 100,
  }
}


export async function GET(req: NextRequest) {
  const denied = await requireUser(req); if (denied) return denied
  try {
    const worker_id = req.nextUrl.searchParams.get('worker_id')
    const supabase = createAdminClient()
    let query = supabase.from('hourly_rates').select('*').order('start_time')
    if (worker_id) query = query.eq('worker_id', worker_id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ rates: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const body = await req.json()
    const supabase = createAdminClient()
    const { error } = await supabase.from('hourly_rates').insert(body)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Auto-recalculate ALL $0 records for this worker using service role
    const worker_id = body.worker_id
    if (worker_id) {
      const { data: zeroLogs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('worker_id', worker_id)
        .not('clock_out', 'is', null)
        .or('amount_earned.eq.0,amount_earned.is.null')

      if (zeroLogs && zeroLogs.length > 0) {
        const { data: allRates } = await supabase
          .from('hourly_rates').select('*').eq('worker_id', worker_id)

        for (const log of zeroLogs) {
          const { hours, amount } = calculateEarnings(
            new Date(log.clock_in),
            new Date(log.clock_out),
            allRates || []
          )
          await supabase.from('time_logs')
            .update({ hours_worked: hours, amount_earned: amount })
            .eq('id', log.id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const supabase = createAdminClient()
    const { error } = await supabase.from('hourly_rates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
