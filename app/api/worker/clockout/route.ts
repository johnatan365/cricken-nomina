import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function calculateEarnings(
  clockIn: Date,
  clockOut: Date,
  rates: Array<{ start_time: string; end_time: string; rate_per_hour: number }>
): { hours: number; amount: number } {
  const totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000
  if (rates.length === 0) return { hours: Math.round(totalHours * 100) / 100, amount: 0 }
  const bogotaOffsetMs = 5 * 60 * 60000

  // Calcula el inicio del día Bogotá para una fecha UTC dada
  function getBogotaDayStartUTC(dateUTC: Date): Date {
    const bogota = new Date(dateUTC.getTime() - bogotaOffsetMs)
    bogota.setUTCHours(0, 0, 0, 0)
    return new Date(bogota.getTime() + bogotaOffsetMs)
  }

  // Itera día por día desde el día de clock_in hasta el día de clock_out en Bogotá
  // Esto cubre turnos que cruzan medianoche y cambian de tarifa al día siguiente
  let amount = 0
  const clockInDayStart = getBogotaDayStartUTC(clockIn)
  const clockOutDayStart = getBogotaDayStartUTC(clockOut)
  const msPerDay = 24 * 60 * 60000

  // Número de días calendario Bogotá que cubre el turno
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { log_id, worker_id, clock_out_lat, clock_out_lng,
            clock_out_notes, is_overtime, overtime_reason, original_clock_out,
            corrected_clock_out } = body
    // Use corrected time if worker specified one (forgot to clock out scenario)
    // Otherwise use server time
    const clock_out = corrected_clock_out || new Date().toISOString()

    const supabase = createAdminClient()

    const { data: log } = await supabase
      .from('time_logs').select('clock_in').eq('id', log_id).single()

    if (!log) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    const { data: rates } = await supabase
      .from('hourly_rates').select('*').eq('worker_id', worker_id)

    const clockIn = new Date(log.clock_in)
    const clockOut = new Date(clock_out)
    const { hours, amount } = calculateEarnings(clockIn, clockOut, rates || [])

    const { error } = await supabase.from('time_logs').update({
      clock_out,
      clock_out_lat,
      clock_out_lng,
      clock_out_notes: clock_out_notes || null,
      status: 'completed',
      is_overtime: is_overtime || false,
      overtime_reason: overtime_reason || null,
      original_clock_out: original_clock_out || null,
      hours_worked: hours,
      amount_earned: amount,
      rate_snapshot: JSON.stringify((rates || []).map((r: {start_time: string; end_time: string; rate_per_hour: number}) => ({
        start_time: r.start_time,
        end_time: r.end_time,
        rate_per_hour: r.rate_per_hour,
      }))),
    }).eq('id', log_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, hours, amount })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
