'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, apiFetch } from '@/lib/supabase'
import { verifyInsideStore } from '@/lib/gps'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP, formatHours } from '@/types'

export default function FicharPage() {
  const [worker, setWorker] = useState<{ id: string; full_name: string } | null>(null)
  const [openLog, setOpenLog] = useState<{ id: string; clock_in: string } | null>(null)
  const [todayLogs, setTodayLogs] = useState<Array<{
    id: string; clock_in: string; clock_out: string | null;
    hours_worked: number | null; amount_earned: number | null; is_overtime: boolean
  }>>([])
  const [schedule, setSchedule] = useState<{ start_time: string; end_time: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null)
  const [notes, setNotes] = useState('')
  const [gpsCache, setGpsCache] = useState<{ lat: number; lng: number } | null>(null)
  const [workerNotConfigured, setWorkerNotConfigured] = useState(false)

  // Early entry modal state
  const [showEarlyEntry, setShowEarlyEntry] = useState(false)
  const [earlyEntryScheduledStart, setEarlyEntryScheduledStart] = useState('')
  const [earlyEntryReason, setEarlyEntryReason] = useState<'corrected' | 'authorized' | null>(null)
  const [earlyEntryCorrectedTime, setEarlyEntryCorrectedTime] = useState('')
  const [earlyEntryOtherReason, setEarlyEntryOtherReason] = useState('')
  const [earlyEntryGps, setEarlyEntryGps] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 })
  const [earlyEntryNow, setEarlyEntryNow] = useState<Date>(new Date())

  // Overtime modal state
  const [showOvertime, setShowOvertime] = useState(false)
  const [overtimeLogId, setOvertimeLogId] = useState('')
  const [overtimeScheduledEnd, setOvertimeScheduledEnd] = useState('')
  const [overtimeReason, setOvertimeReason] = useState<'forgot' | 'other' | null>(null)
  const [correctedTime, setCorrectedTime] = useState('')
  const [otherReason, setOtherReason] = useState('')

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: workerData } = await supabase
      .from('workers')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single()

    if (!workerData) return
    setWorker(workerData)

    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

    // Busca turno abierto via API con service role para evitar problemas de RLS
    // Cubre turnos que cruzan medianoche
    const openLogRes = await fetch('/api/worker/open-log?worker_id=' + workerData.id)
    const openLogData = await openLogRes.json()
    const openLog = openLogData.openLog || null
    setOpenLog(openLog ? { id: openLog.id, clock_in: openLog.clock_in } : null)

    // Para el resumen del día incluye también el turno abierto de ayer si existe
    const queryFrom = openLog
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString()
      : startOfDay

    const { data: logs } = await supabase
      .from('time_logs')
      .select('id, clock_in, clock_out, hours_worked, amount_earned, is_overtime')
      .eq('worker_id', workerData.id)
      .gte('clock_in', queryFrom)
      .lt('clock_in', endOfDay)
      .order('clock_in', { ascending: false })

    setTodayLogs(logs || [])

    const dayOfWeek = today.getDay()
    // Load worker-specific schedule for today
    const schedRes = await apiFetch('/api/admin/worker-schedules?worker_id=' + workerData.id)
    const schedData = await schedRes.json()
    const todaySchedule = (schedData.schedules || []).find(
      (s: { day_of_week: number; is_active: boolean }) => s.day_of_week === dayOfWeek && s.is_active
    )
    setSchedule(todaySchedule || null)

    // Check if worker has rates configured
    const ratesRes = await apiFetch('/api/admin/rates?worker_id=' + workerData.id)
    const ratesData = await ratesRes.json()
    setWorkerNotConfigured(!ratesData.rates || ratesData.rates.length === 0)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showStatus = (type: 'success' | 'error' | 'info', msg: string) => {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 5000)
  }

  async function handleFichar() {
    if (!worker) return
    setLoading(true)
    setStatus(null)

    // GPS check
    // Get active locations from DB
    let activeLocations = undefined
    try {
      const locRes = await apiFetch('/api/admin/locations')
      const locData = await locRes.json()
      activeLocations = locData.locations
    } catch { /* use defaults */ }

    const gpsResult = await verifyInsideStore(activeLocations)
    if (!gpsResult.success) {
      showStatus('error', gpsResult.error || `Estás a ${Math.round(gpsResult.distance)}m. Debes estar en el local para fichar.`)
      setLoading(false)
      return
    }

    // Cache GPS for overtime use
    setGpsCache({ lat: gpsResult.lat, lng: gpsResult.lng })

    // Use SERVER time to prevent clock manipulation
    let now = new Date()
    try {
      const timeRes = await fetch('/api/time')
      const timeData = await timeRes.json()
      now = new Date(timeData.timestamp)
    } catch { /* fallback to client time */ }

    if (!openLog) {
      // Check if clocking in before scheduled start
      if (schedule) {
        const [startH, startM] = schedule.start_time.split(':').map(Number)
        const bogotaOffset = 5 * 60 * 60000
        const nowBogota = new Date(now.getTime() - bogotaOffset)
        const nowMinutes = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes()
        const startMinutes = startH * 60 + startM
        // Only flag if within reasonable range (not overnight shifts)
        if (nowMinutes < startMinutes && startMinutes - nowMinutes < 8 * 60) {
          setEarlyEntryScheduledStart(schedule.start_time.slice(0, 5))
          setEarlyEntryReason(null)
          setEarlyEntryCorrectedTime(schedule.start_time.slice(0, 5))
          setEarlyEntryOtherReason('')
          setEarlyEntryGps({ lat: gpsResult.lat, lng: gpsResult.lng })
          setEarlyEntryNow(now)
          setShowEarlyEntry(true)
          setLoading(false)
          return
        }
      }
      await doClockIn(now, gpsResult.lat, gpsResult.lng, notes.trim())
      return
    }

    // CLOCK OUT — check overtime
    if (schedule) {
      const [endH, endM] = schedule.end_time.split(':').map(Number)
      const bogotaOffset = 5 * 60 * 60000

      // Determine the "work day" from clock_in
      const clockInTime = new Date(openLog.clock_in)
      const clockInBogotaHour = new Date(clockInTime.getTime() - bogotaOffset).getUTCHours()

      // If clock_in is between midnight and 8am, the work day is the PREVIOUS day
      const clockInBogota = new Date(clockInTime.getTime() - bogotaOffset)
      if (clockInBogotaHour < 8) {
        clockInBogota.setUTCDate(clockInBogota.getUTCDate() - 1)
      }
      clockInBogota.setUTCHours(0, 0, 0, 0)
      const dayStartUTC = new Date(clockInBogota.getTime() + bogotaOffset)

      const [startH] = schedule.start_time.split(':').map(Number)
      const startMinutes = startH * 60
      let endMinutes = endH * 60 + endM
      if (endMinutes === 0) endMinutes = 24 * 60
      if (endMinutes <= startMinutes) endMinutes += 24 * 60

      const scheduledEnd = new Date(dayStartUTC.getTime() + endMinutes * 60000)

      if (now > scheduledEnd) {
        // Show overtime modal — don't save yet
        setOvertimeLogId(openLog.id)
        setOvertimeScheduledEnd(schedule.end_time)
        setOvertimeReason(null)
        setCorrectedTime('')
        setOtherReason('')
        setShowOvertime(true)
        setLoading(false)
        return
      }
    }

    // Normal clock out
    await doClockOut(openLog.id, now, gpsResult.lat, gpsResult.lng, false, null, null, null)
    setNotes('')
    await loadData()
    setLoading(false)
  }

  async function doClockOut(
    logId: string,
    clockOutTime: Date,
    lat: number,
    lng: number,
    isOvertime: boolean,
    overtimeReasonVal: string | null,
    originalClockOut: string | null,
    correctedClockOut: string | null = null
  ) {
    // Use API with service role to avoid RLS issues
    const res = await fetch('/api/worker/clockout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log_id: logId,
        worker_id: worker?.id,
        clock_out_lat: lat,
        clock_out_lng: lng,
        clock_out_notes: notes.trim() || null,
        is_overtime: isOvertime,
        overtime_reason: overtimeReasonVal,
        original_clock_out: originalClockOut,
        corrected_clock_out: correctedClockOut,
      }),
    })

    if (!res.ok) {
      showStatus('error', 'Error al registrar salida')
      return
    }

    showStatus('success', `✅ Salida registrada a las ${format(clockOutTime, 'HH:mm')}`)
  }

  async function doClockIn(clockInTime: Date, lat: number, lng: number, notes_val: string, earlyReason?: string) {
    const res = await fetch('/api/worker/clockin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: worker?.id,
        clock_in_lat: lat,
        clock_in_lng: lng,
        clock_in_notes: notes_val || null,
        early_entry_reason: earlyReason || null,
        corrected_clock_in: clockInTime.toISOString(),
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      showStatus('error', 'Error al registrar entrada: ' + (data.error || ''))
    } else {
      showStatus('success', `✅ Entrada registrada a las ${format(clockInTime, 'HH:mm')}`)
      setNotes('')
    }
    await loadData()
    setLoading(false)
  }

  async function handleEarlyEntryConfirm() {
    if (!earlyEntryReason) return

    if (earlyEntryReason === 'corrected') {
      // Use state value or fall back to scheduled start
      const timeToUse = earlyEntryCorrectedTime || earlyEntryScheduledStart
      const [minH, minM] = earlyEntryScheduledStart.split(':').map(Number)
      const [selH, selM] = timeToUse.split(':').map(Number)
      const minMinutes = minH * 60 + minM
      const selMinutes = selH * 60 + selM

      if (selMinutes < minMinutes) {
        showStatus('error', `La hora no puede ser antes de las ${earlyEntryScheduledStart}`)
        return
      }
      // Update state with actual value used
      if (!earlyEntryCorrectedTime) setEarlyEntryCorrectedTime(earlyEntryScheduledStart)
    }

    setLoading(true)
    setShowEarlyEntry(false)
    const { lat, lng } = earlyEntryGps

    if (earlyEntryReason === 'corrected') {
      const finalTime = earlyEntryCorrectedTime || earlyEntryScheduledStart
      const bogotaOffset = 5 * 60 * 60000
      const nowBogota = new Date(earlyEntryNow.getTime() - bogotaOffset)
      const [h, m] = finalTime.split(':').map(Number)
      const correctedBogota = new Date(nowBogota)
      correctedBogota.setUTCHours(h, m, 0, 0)
      const correctedUTC = new Date(correctedBogota.getTime() + bogotaOffset)
      await doClockIn(correctedUTC, lat, lng, notes, `Hora corregida: llegó a las ${format(earlyEntryNow, 'HH:mm')} pero registró ${finalTime}`)
    } else if (earlyEntryReason === 'authorized' && earlyEntryOtherReason.trim()) {
      await doClockIn(earlyEntryNow, lat, lng, notes, `Entrada anticipada autorizada: ${earlyEntryOtherReason.trim()}`)
    }
  }

  async function handleOvertimeConfirm() {
    if (!overtimeReason) return
    setLoading(true)

    const now = new Date()
    const lat = gpsCache?.lat || 0
    const lng = gpsCache?.lng || 0

    if (overtimeReason === 'forgot') {
      const finalTime = correctedTime || overtimeScheduledEnd.slice(0, 5)
      const [maxH, maxM] = overtimeScheduledEnd.slice(0, 5).split(':').map(Number)
      const [selH, selM] = finalTime.split(':').map(Number)
      const maxMinutes = maxH * 60 + maxM
      const selMinutes = selH * 60 + selM

      if (selMinutes > maxMinutes) {
        showStatus('error', `La hora no puede ser después de las ${overtimeScheduledEnd.slice(0, 5)}`)
        setLoading(false)
        return
      }

      const clockInTime = new Date(openLog?.clock_in || now.toISOString())
      const bogotaClockIn = new Date(clockInTime.getTime() - 5 * 60 * 60000)
      const [h, m] = finalTime.split(':').map(Number)
      const correctedBogota = new Date(bogotaClockIn)
      correctedBogota.setUTCHours(h, m, 0, 0)
      if (h < bogotaClockIn.getUTCHours()) correctedBogota.setUTCDate(correctedBogota.getUTCDate() + 1)
      const correctedUTC = new Date(correctedBogota.getTime() + 5 * 60 * 60000)
      await doClockOut(overtimeLogId, now, lat, lng, false, 'forgot_corrected', now.toISOString(), correctedUTC.toISOString())
    } else if (overtimeReason === 'other' && otherReason.trim()) {
      // Authorized overtime with custom reason
      await doClockOut(overtimeLogId, now, lat, lng, true, otherReason.trim(), null, null)
    }

    setShowOvertime(false)
    setOvertimeReason(null)
    setCorrectedTime('')
    setOtherReason('')
    setNotes('')
    await loadData()
    setLoading(false)
  }

  const todayTotal = todayLogs.reduce((acc, l) => ({
    hours: acc.hours + (l.hours_worked || 0),
    earned: acc.earned + (l.amount_earned || 0),
  }), { hours: 0, earned: 0 })

  const now = new Date()
  const dayName = format(now, 'EEEE d \'de\' MMMM', { locale: es })

  return (
    <div className="max-w-md mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <div>
        <p className="text-white/40 text-xs uppercase tracking-wider">
          {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
        </p>
        <h1 className="font-bold text-2xl text-white mt-1">
          {openLog ? '🟢 Trabajando...' : 'Registrar Turno'}
        </h1>
      </div>

      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold animate-[slideUp_0.3s_ease-out] ${
          status.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20' :
          status.type === 'error' ? 'bg-red-500/15 text-red-300 border border-red-400/20' :
          'bg-blue-500/15 text-blue-300 border border-blue-400/20'
        }`}>
          {status.msg}
        </div>
      )}

      {/* Status card */}
      <div className="bg-white/10 rounded-3xl border border-white/10 p-5">
        {openLog ? (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-500/20 border-2 border-emerald-400/30 flex items-center justify-center">
              <span className="text-2xl">🟢</span>
            </div>
            <p className="text-white/60 text-sm">Entrada registrada a las</p>
            <p className="font-bold text-3xl text-white mt-1">
              {format(parseISO(openLog.clock_in), 'HH:mm')}
            </p>
            {schedule && (
              <p className="text-white/40 text-xs mt-2">
                Horario hasta las {schedule.end_time.slice(0, 5)}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center">
              <span className="text-2xl">⏸️</span>
            </div>
            <p className="text-white font-semibold">Sin turno activo</p>
            {schedule && (
              <p className="text-white/40 text-xs mt-2">
                Horario hoy: {schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="label">Observaciones (opcional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Agrega una nota si lo deseas..."
          className="input-field"
          maxLength={200}
        />
      </div>

      {loading && (
        <div className="bg-white/10 rounded-2xl px-4 py-3 text-sm text-white/70 text-center">
          📍 Verificando ubicación...
        </div>
      )}

      {/* Not configured warning */}
      {workerNotConfigured && (
        <div className="bg-orange-500/15 border border-orange-400/30 rounded-2xl p-5 text-center space-y-2">
          <p className="text-2xl">⚠️</p>
          <p className="text-orange-300 font-semibold text-sm">Cuenta no configurada</p>
          <p className="text-orange-300/70 text-xs">Tu cuenta aún no está configurada. Contacta al administrador para poder registrar tus horas.</p>
        </div>
      )}

      {/* Main button */}
      {!workerNotConfigured && (
        <button
          onClick={handleFichar}
          disabled={loading}
          className={`w-full py-4 rounded-3xl font-bold text-lg transition-all duration-200 active:scale-95 disabled:opacity-50 ${
            openLog
              ? 'bg-red-500/80 text-white hover:bg-red-500 border border-red-400/30'
              : 'bg-yellow-400 text-purple-900 hover:bg-yellow-300'
          }`}
        >
          {loading ? 'Verificando...' : openLog ? '🔴 Registrar Salida' : '🟢 Registrar Entrada'}
        </button>
      )}

      {/* Today summary */}
      {todayLogs.length > 0 && (
        <div className="bg-white/10 rounded-3xl border border-white/10 p-5 space-y-3">
          <p className="font-semibold text-white text-sm">Resumen de hoy</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-2xl p-3 text-center">
              <p className="text-white/50 text-xs">Horas</p>
              <p className="font-bold text-white text-lg">{formatHours(todayTotal.hours)}</p>
            </div>
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-3 text-center">
              <p className="text-yellow-300/70 text-xs">Ganado</p>
              <p className="font-bold text-yellow-300 text-lg">{formatCOP(todayTotal.earned)}</p>
            </div>
          </div>
          <div className="space-y-2">
            {todayLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-white/70">
                  <span>⏱️</span>
                  <span>{format(parseISO(log.clock_in), 'HH:mm')}</span>
                  <span className="text-white/30">→</span>
                  <span>{log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '...'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {log.is_overtime && (
                    <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">Extra</span>
                  )}
                  <span className="text-yellow-300 font-semibold">
                    {log.amount_earned ? formatCOP(log.amount_earned) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Early entry modal */}
      {showEarlyEntry && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-5 animate-[slideUp_0.3s_ease-out]">
            <div>
              <h3 className="font-bold text-white text-lg">⚠️ Entrada antes del horario</h3>
              <p className="text-white/60 text-sm mt-1">
                Estás registrando entrada a las <span className="text-yellow-300 font-semibold">{format(earlyEntryNow, 'HH:mm')}</span>, pero tu turno inicia a las <span className="text-yellow-300 font-semibold">{earlyEntryScheduledStart}</span>.
              </p>
              <p className="text-white/50 text-sm mt-1">¿Cuál es el motivo?</p>
            </div>
            <div className="space-y-2">
              <button onClick={() => setEarlyEntryReason('corrected')}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-all text-sm ${
                  earlyEntryReason === 'corrected'
                    ? 'bg-yellow-400/20 border-yellow-400/40 text-white'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}>
                🕐 Corregir hora de entrada
                <p className="text-xs text-white/40 mt-0.5">Ingresa la hora correcta a la que debes iniciar</p>
              </button>
              {earlyEntryReason === 'corrected' && (
                <div className="px-2">
                  <label className="label">Hora correcta de inicio</label>
                  <input type="time"
                    value={earlyEntryCorrectedTime || earlyEntryScheduledStart}
                    min={earlyEntryScheduledStart}
                    onChange={(e) => setEarlyEntryCorrectedTime(e.target.value)}
                    className="input-field" />
                  {(() => {
                    const t = earlyEntryCorrectedTime || earlyEntryScheduledStart
                    const [minH, minM] = earlyEntryScheduledStart.split(':').map(Number)
                    const [selH, selM] = t.split(':').map(Number)
                    const isInvalid = selH * 60 + selM < minH * 60 + minM
                    return isInvalid
                      ? <p className="text-red-400 text-xs mt-1 font-semibold">⚠️ La hora debe ser igual o posterior a las {earlyEntryScheduledStart}</p>
                      : <p className="text-white/30 text-xs mt-1">Hora de inicio del turno: {earlyEntryScheduledStart}</p>
                  })()}
                </div>
              )}
              <button onClick={() => setEarlyEntryReason('authorized')}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-all text-sm ${
                  earlyEntryReason === 'authorized'
                    ? 'bg-yellow-400/20 border-yellow-400/40 text-white'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}>
                ✅ Autorizado por el administrador
                <p className="text-xs text-white/40 mt-0.5">El administrador indicó que debías entrar antes</p>
              </button>
              {earlyEntryReason === 'authorized' && (
                <div className="px-2">
                  <label className="label">Motivo</label>
                  <input type="text" value={earlyEntryOtherReason}
                    onChange={(e) => setEarlyEntryOtherReason(e.target.value)}
                    placeholder="Describe el motivo..."
                    className="input-field" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowEarlyEntry(false); setLoading(false) }}
                className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleEarlyEntryConfirm}
                disabled={(() => {
                  if (!earlyEntryReason) return true
                  if (earlyEntryReason === 'authorized') return !earlyEntryOtherReason.trim()
                  if (earlyEntryReason === 'corrected') {
                    const t = earlyEntryCorrectedTime || earlyEntryScheduledStart
                    const [minH, minM] = earlyEntryScheduledStart.split(':').map(Number)
                    const [selH, selM] = t.split(':').map(Number)
                    return selH * 60 + selM < minH * 60 + minM
                  }
                  return false
                })()}
                className="btn-primary flex-1">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Overtime Modal */}
      {showOvertime && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-4 animate-[slideUp_0.3s_ease-out]">
            <div className="text-center">
              <span className="text-3xl">⚠️</span>
              <h3 className="font-bold text-white text-lg mt-2">Fuera del horario</h3>
              <p className="text-white/60 text-sm mt-1">
                El horario termina a las <strong className="text-white">{overtimeScheduledEnd.slice(0, 5)}</strong>.
                ¿Qué ocurrió?
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => { setOvertimeReason('forgot'); setOtherReason(''); setCorrectedTime(overtimeScheduledEnd.slice(0, 5)) }}
                className={`w-full text-left px-4 py-3 rounded-2xl text-sm transition-all ${
                  overtimeReason === 'forgot'
                    ? 'bg-yellow-400 text-purple-900 font-bold'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}>
                ⏰ Se me olvidó registrar a tiempo
              </button>
              <button
                onClick={() => { setOvertimeReason('other'); setCorrectedTime('') }}
                className={`w-full text-left px-4 py-3 rounded-2xl text-sm transition-all ${
                  overtimeReason === 'other'
                    ? 'bg-yellow-400 text-purple-900 font-bold'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}>
                📝 Otro motivo
              </button>
            </div>

            {overtimeReason === 'forgot' && (
              <div>
                <label className="label">¿A qué hora saliste realmente?</label>
                <input
                  type="time"
                  value={correctedTime || overtimeScheduledEnd.slice(0, 5)}
                  max={overtimeScheduledEnd.slice(0, 5)}
                  onChange={(e) => setCorrectedTime(e.target.value)}
                  className="input-field"
                />
                {(() => {
                  const t = correctedTime || overtimeScheduledEnd.slice(0, 5)
                  const [maxH, maxM] = overtimeScheduledEnd.slice(0, 5).split(':').map(Number)
                  const [selH, selM] = t.split(':').map(Number)
                  const isInvalid = selH * 60 + selM > maxH * 60 + maxM
                  return isInvalid
                    ? <p className="text-red-400 text-xs mt-1 font-semibold">⚠️ La hora debe ser igual o anterior a las {overtimeScheduledEnd.slice(0, 5)}</p>
                    : <p className="text-white/30 text-xs mt-1">Hora máxima del turno: {overtimeScheduledEnd.slice(0, 5)}</p>
                })()}
              </div>
            )}

            {overtimeReason === 'other' && (
              <div>
                <label className="label">¿Cuál es el motivo?</label>
                <input
                  type="text"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="Ej: Reunión con proveedor, entrega de pedido..."
                  className="input-field"
                  maxLength={150}
                />
              </div>
            )}

            {overtimeReason && (
              <button
                onClick={handleOvertimeConfirm}
                disabled={(() => {
                  if (loading) return true
                  if (overtimeReason === 'other') return !otherReason.trim()
                  if (overtimeReason === 'forgot') {
                    const t = correctedTime || overtimeScheduledEnd.slice(0, 5)
                    const [maxH, maxM] = overtimeScheduledEnd.slice(0, 5).split(':').map(Number)
                    const [selH, selM] = t.split(':').map(Number)
                    return selH * 60 + selM > maxH * 60 + maxM
                  }
                  return false
                })()}
                className="btn-primary w-full">
                {loading ? 'Guardando...' : 'Confirmar salida'}
              </button>
            )}

            <button
              onClick={() => { setShowOvertime(false); setOvertimeReason(null) }}
              className="w-full text-white/40 text-sm py-2 hover:text-white/60 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
