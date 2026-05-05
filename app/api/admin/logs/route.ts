import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// Festivos Colombia (se actualiza anualmente)
const FESTIVOS_CO = new Set([
  '2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03',
  '2026-05-01','2026-05-18','2026-06-08','2026-06-15','2026-07-20',
  '2026-08-07','2026-08-17','2026-10-12','2026-11-02','2026-11-16',
  '2026-12-08','2026-12-25',
])

function isSundayOrHoliday(date: Date, bogotaOffsetMs: number): boolean {
  const bogota = new Date(date.getTime() - bogotaOffsetMs)
  if (bogota.getUTCDay() === 0) return true  // domingo
  const yyyy = bogota.getUTCFullYear()
  const mm   = String(bogota.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(bogota.getUTCDate()).padStart(2, '0')
  return FESTIVOS_CO.has(`${yyyy}-${mm}-${dd}`)
}

function calculateEarnings(
  clockIn: Date,
  clockOut: Date,
  rates: Array<{ start_time: string; end_time: string; rate_per_hour: number }>,
  sundayRate: number | null = null
): { hours: number; amount: number } {
  const totalHours = (clockOut.getTime() - clockIn.getTime()) / 3600000
  if (rates.length === 0 && !sundayRate) return { hours: Math.round(totalHours * 100) / 100, amount: 0 }

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

    // Verificar si este día es domingo o festivo en Bogotá
    if (sundayRate && isSundayOrHoliday(dayStartUTC, bogotaOffsetMs)) {
      const dayEnd = new Date(dayStartUTC.getTime() + msPerDay)
      const overlapStart = Math.max(clockIn.getTime(), dayStartUTC.getTime())
      const overlapEnd = Math.min(clockOut.getTime(), dayEnd.getTime())
      if (overlapEnd > overlapStart) {
        amount += ((overlapEnd - overlapStart) / 3600000) * sundayRate
      }
      continue
    }

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
  try {
    const supabase = createAdminClient()
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const worker_id = req.nextUrl.searchParams.get('worker_id')

    let query = supabase.from('time_logs').select('*').order('clock_in', { ascending: false })
    if (from) query = query.gte('clock_in', from)
    if (to) query = query.lte('clock_in', to)
    if (worker_id) query = query.eq('worker_id', worker_id)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ logs: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const supabase = createAdminClient()

    // Get the log first to check if it was paid
    const { data: log } = await supabase
      .from('time_logs').select('*').eq('id', id).single()

    if (!log) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    // If log was paid, adjust the associated payment
    if (log.is_paid && log.payment_id) {
      const { data: payment } = await supabase
        .from('payments').select('*').eq('id', log.payment_id).single()

      if (payment) {
        const newAmount = payment.amount - (log.amount_earned || 0)
        if (newAmount <= 0) {
          // Payment is now $0 — delete it entirely
          await supabase.from('payments').delete().eq('id', log.payment_id)
        } else {
          // Adjust payment amount
          await supabase.from('payments').update({ amount: Math.round(newAmount * 100) / 100 }).eq('id', log.payment_id)
        }
      }
    }

    // Delete the log
    const { error } = await supabase.from('time_logs').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = createAdminClient()
    const clockIn = new Date(body.clock_in)
    const clockOut = body.clock_out ? new Date(body.clock_out) : null
    const { data: rates } = await supabase
      .from('hourly_rates').select('*').eq('worker_id', body.worker_id)

    // Use custom_rates if provided, otherwise use worker rates
    const ratesToUse = (body.custom_rates && body.custom_rates.length > 0)
      ? body.custom_rates
      : (rates || [])

    // Solo calcular earnings si hay clock_out
    // Obtener tarifa dominical del trabajador
    const { data: workerData } = await supabase
      .from('workers').select('sunday_rate').eq('id', body.worker_id).single()
    const sundayRate = workerData?.sunday_rate || null

    const { hours, amount } = clockOut
      ? calculateEarnings(clockIn, clockOut, ratesToUse, sundayRate)
      : { hours: 0, amount: 0 }

    const payload = {
      worker_id: body.worker_id,
      clock_in: body.clock_in,
      clock_out: body.clock_out || null,
      clock_out_notes: body.clock_out_notes || null,
      status: body.status || 'admin_modified',
      hours_worked: clockOut ? hours : null,
      amount_earned: clockOut ? amount : null,
      rate_snapshot: JSON.stringify(ratesToUse.map((r: { start_time: string; end_time: string; rate_per_hour: number }) => ({
        start_time: r.start_time,
        end_time: r.end_time,
        rate_per_hour: r.rate_per_hour,
      }))),
    }
    if (body.id) {
      const { error } = await supabase.from('time_logs').update(payload).eq('id', body.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await supabase.from('time_logs').insert(payload)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, hours, amount })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { worker_id, log_id } = await req.json()
    const supabase = createAdminClient()

    // If log_id provided, only recalculate that specific log
    let query = supabase.from('time_logs').select('*').not('clock_out', 'is', null)
    if (log_id) query = query.eq('id', log_id)
    else if (worker_id) query = query.eq('worker_id', worker_id)
    
    const { data: logs } = await query
    if (!logs || logs.length === 0) return NextResponse.json({ ok: true, updated: 0 })
    
    const { data: allRates } = await supabase.from('hourly_rates').select('*')
    let updated = 0
    
    for (const log of logs) {
      const rates = (allRates || []).filter((r: { worker_id: string }) => r.worker_id === log.worker_id)
      const { data: wData } = await supabase
        .from('workers').select('sunday_rate').eq('id', log.worker_id).single()
      const sunRate = wData?.sunday_rate || null
      const { hours, amount } = calculateEarnings(new Date(log.clock_in), new Date(log.clock_out), rates, sunRate)
      // Save rate_snapshot so edit modal can load original rates
      await supabase.from('time_logs').update({ 
        hours_worked: hours, 
        amount_earned: amount,
        rate_snapshot: JSON.stringify(rates.map((r: { start_time: string; end_time: string; rate_per_hour: number }) => ({
          start_time: r.start_time,
          end_time: r.end_time,
          rate_per_hour: r.rate_per_hour,
        })))
      }).eq('id', log.id)
      updated++
    }
    return NextResponse.json({ ok: true, updated })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
