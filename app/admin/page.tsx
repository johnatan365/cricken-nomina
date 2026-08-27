'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, apiFetch } from '@/lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth, endOfDay } from 'date-fns'

function getQuincenas() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  const q1From = new Date(y, m, 1)
  const q1To = new Date(y, m, 15)
  const q2From = new Date(y, m, 16)
  const q2To = endOfMonth(now)
  const thisFrom = day <= 15 ? q1From : q2From
  const thisTo = day <= 15 ? q1To : q2To
  let lastFrom: Date, lastTo: Date
  if (day <= 15) {
    lastFrom = new Date(y, m - 1, 16)
    lastTo = endOfMonth(new Date(y, m - 1, 1))
  } else {
    lastFrom = new Date(y, m, 1)
    lastTo = new Date(y, m, 15)
  }
  return {
    thisFrom: format(thisFrom, 'yyyy-MM-dd'),
    thisTo: format(thisTo, 'yyyy-MM-dd'),
    lastFrom: format(lastFrom, 'yyyy-MM-dd'),
    lastTo: format(lastTo, 'yyyy-MM-dd'),
  }
}
import { es } from 'date-fns/locale'
import { formatCOP, formatHours, Worker, TimeLog, HourlyRate } from '@/types'
import { exportAdminReport } from '@/lib/excel'

type WorkerWithLogs = Worker & {
  logs: TimeLog[]
  totalHours: number
  totalEarned: number
  pendingAmount: number
}

export default function AdminNominaPage() {
  const [workers, setWorkers] = useState<WorkerWithLogs[]>([])
  const [allLogs, setAllLogs] = useState<TimeLog[]>([])
  const [allWorkers, setAllWorkers] = useState<Worker[]>([])
  const [workerStatusFilter, setWorkerStatusFilter] = useState<'active' | 'inactive' | 'all' | 'working' | 'worked'>('active')
  const [selectedWorker, setSelectedWorker] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(true)
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<{ show: boolean; log: TimeLog | null; workerId: string }>({ show: false, log: null, workerId: '' })
  const [closeModal, setCloseModal] = useState<{ show: boolean; log: TimeLog | null; defaultTime: string }>({ show: false, log: null, defaultTime: '' })
  const [closeTime, setCloseTime] = useState('')
  const [closingTurn, setClosingTurn] = useState(false)
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', notes: '' })
  const [editRanges, setEditRanges] = useState<Array<{start_time: string; end_time: string; rate_per_hour: string}>>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 4000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    // Add Bogota offset (UTC-5) to ensure correct date range
    const fromISO = new Date(dateFrom + 'T00:00:00-05:00').toISOString()
    const toISO = new Date(dateTo + 'T23:59:59-05:00').toISOString()

    const [wRes, lRes] = await Promise.all([
      apiFetch('/api/admin/workers'),
      apiFetch(`/api/admin/logs?from=${fromISO}&to=${toISO}`),
    ])
    const { workers: workersData } = await wRes.json()
    const { logs: logsData } = await lRes.json()

    const ws = workersData || []
    const ls = logsData || []
    setAllWorkers(ws)
    setAllLogs(ls)

    const workersWithLogs: WorkerWithLogs[] = ws.map((w: Worker) => {
      const wLogs = ls.filter((l: TimeLog) => l.worker_id === w.id)
      const totalHours = wLogs.reduce((a: number, l: TimeLog) => a + (l.hours_worked || 0), 0)
      const totalEarned = wLogs.reduce((a: number, l: TimeLog) => a + (l.amount_earned || 0), 0)
      const pendingAmount = wLogs.filter((l: TimeLog) => !l.is_paid).reduce((a: number, l: TimeLog) => a + (l.amount_earned || 0), 0)
      return { ...w, logs: wLogs, totalHours, totalEarned, pendingAmount }
    })

    setWorkers(workersWithLogs)
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  const statusFiltered = workerStatusFilter === 'all'
    ? workers
    : workerStatusFilter === 'active'
    ? workers.filter((w) => w.is_active)
    : workerStatusFilter === 'working'
    ? workers.filter((w) => w.logs.some((l) => !l.clock_out))
    : workerStatusFilter === 'worked'
    ? workers.filter((w) => w.totalHours > 0)
    : workers.filter((w) => !w.is_active)

  const filteredWorkers = selectedWorker === 'all'
    ? statusFiltered
    : statusFiltered.filter((w) => w.id === selectedWorker)

  const grandTotals = filteredWorkers.reduce((acc, w) => ({
    hours: acc.hours + w.totalHours,
    earned: acc.earned + w.totalEarned,
    pending: acc.pending + w.pendingAmount,
  }), { hours: 0, earned: 0, pending: 0 })

  function openAddLog(workerId: string) {
    const now = new Date()
    const offset = now.getTimezoneOffset()
    const local = new Date(now.getTime() - offset * 60000)
    const dateStr = local.toISOString().slice(0, 10)
    setEditForm({
      clock_in: dateStr + 'T10:00',
      clock_out: dateStr + 'T22:00',
      notes: '',
    })
    setEditRanges([])
    setEditModal({ show: true, log: null, workerId })
  }

  async function openEditLog(log: TimeLog) {
    const toLocal = (iso: string) => {
      const d = new Date(iso)
      const offset = d.getTimezoneOffset()
      const local = new Date(d.getTime() - offset * 60000)
      return local.toISOString().slice(0, 16)
    }
    // Use rate_snapshot from log (rates at time of clock-out), fallback to current rates
    let ranges: Array<{start_time: string; end_time: string; rate_per_hour: string}> = []
    try {
      if ((log as TimeLog & { rate_snapshot?: string }).rate_snapshot) {
        const snapshot = JSON.parse((log as TimeLog & { rate_snapshot?: string }).rate_snapshot!)
        ranges = snapshot.map((r: HourlyRate) => ({
          start_time: r.start_time.slice(0, 5),
          end_time: r.end_time.slice(0, 5),
          rate_per_hour: r.rate_per_hour.toString(),
        }))
      } else {
        const res = await apiFetch('/api/admin/rates?worker_id=' + log.worker_id)
        const { rates } = await res.json()
        ranges = (rates || []).map((r: HourlyRate) => ({
          start_time: r.start_time.slice(0, 5),
          end_time: r.end_time.slice(0, 5),
          rate_per_hour: r.rate_per_hour.toString(),
        }))
      }
    } catch { ranges = [] }
    setEditRanges(ranges)
    setEditForm({
      clock_in: toLocal(log.clock_in),
      clock_out: log.clock_out ? toLocal(log.clock_out) : '',
      notes: log.clock_out_notes || '',
    })
    setEditModal({ show: true, log, workerId: log.worker_id })
  }

  async function saveLog() {
    setSaving(true)
    // datetime-local input gives local time, new Date() converts to UTC automatically
    const payload = {
      id: editModal.log?.id,
      worker_id: editModal.workerId,
      clock_in: new Date(editForm.clock_in).toISOString(),
      clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : null,
      clock_out_notes: editForm.notes || null,
      status: editForm.clock_out ? 'admin_modified' : 'open',
      custom_rates: editRanges.length > 0 ? editRanges.map(r => ({
        start_time: r.start_time + ':00',
        end_time: r.end_time + ':00',
        rate_per_hour: parseFloat(r.rate_per_hour) || 0,
      })) : null,
    }

    const res = await apiFetch('/api/admin/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      showStatus('error', 'Error al guardar registro')
    } else {
      showStatus('success', 'Registro guardado')
      setEditModal({ show: false, log: null, workerId: '' })
    }
    await loadData()
    setSaving(false)
  }

  async function deleteLog(logId: string) {
    if (!confirm('Eliminar este registro? Esta accion no se puede deshacer.')) return
    const res = await apiFetch('/api/admin/logs?id=' + logId, { method: 'DELETE' })
    if (!res.ok) {
      showStatus('error', 'Error al eliminar registro')
    } else {
      showStatus('success', 'Registro eliminado')
      await loadData()
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-bold text-2xl text-white">Nomina</h1>
        <button onClick={() => exportAdminReport(allLogs, allWorkers)} className="btn-secondary text-xs px-3 py-2">
          Exportar Excel
        </button>
      </div>

      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
          status.type === 'success'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20'
            : 'bg-red-500/15 text-red-300 border border-red-400/20'
        }`}>
          {status.msg}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/10 rounded-3xl border border-white/10 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select
                value={workerStatusFilter}
                onChange={(e) => { setWorkerStatusFilter(e.target.value as 'active' | 'inactive' | 'all' | 'working' | 'worked'); setSelectedWorker('all') }}
                className="input-field"
                style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <option value="active" style={{ backgroundColor: '#3D1260', color: 'white' }}>Activos</option>
                <option value="working" style={{ backgroundColor: '#3D1260', color: 'white' }}>🟢 En turno</option>
                <option value="worked" style={{ backgroundColor: '#3D1260', color: 'white' }}>📅 Trabajaron</option>
                <option value="inactive" style={{ backgroundColor: '#3D1260', color: 'white' }}>Desactivados</option>
                <option value="all" style={{ backgroundColor: '#3D1260', color: 'white' }}>Todos</option>
              </select>
            </div>
            <div>
              <label className="label">Trabajador</label>
              <select
                value={selectedWorker}
                onChange={(e) => setSelectedWorker(e.target.value)}
                className="input-field"
                style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <option value="all" style={{ backgroundColor: '#3D1260', color: 'white' }}>Todos</option>
                {allWorkers
                  .filter((w: Worker) => workerStatusFilter === 'all' ? true : workerStatusFilter === 'active' ? w.is_active : workerStatusFilter === 'working' ? true : !w.is_active)
                  .map((w: Worker) => (
                    <option key={w.id} value={w.id} style={{ backgroundColor: '#3D1260', color: 'white' }}>{w.full_name}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const q = getQuincenas()
            return [
              { label: 'Esta quincena', from: q.thisFrom, to: q.thisTo },
              { label: 'Últ. quincena', from: q.lastFrom, to: q.lastTo },
              { label: 'Este mes', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
              { label: 'Mes anterior', from: format(startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1)), 'yyyy-MM-dd'), to: format(endOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1)), 'yyyy-MM-dd') },
            ]
          })().map((p) => (
            <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition-all">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white/10 rounded-2xl border border-white/10 p-4 text-center">
          <p className="text-white/50 text-xs">Horas totales</p>
          <p className="font-bold text-white text-lg mt-1">{formatHours(grandTotals.hours)}</p>
        </div>
        <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4 text-center">
          <p className="text-yellow-300/70 text-xs">Total ganado</p>
          <p className="font-bold text-yellow-300 text-lg mt-1">{formatCOP(grandTotals.earned)}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-400/20 rounded-2xl p-4 text-center">
          <p className="text-orange-300/70 text-xs">Por pagar</p>
          <p className="font-bold text-orange-300 text-lg mt-1">{formatCOP(grandTotals.pending)}</p>
        </div>
      </div>

      {/* Workers list */}
      {loading ? (
        <div className="text-center py-10 text-white/40">Cargando...</div>
      ) : filteredWorkers.length === 0 ? (
        <div className="text-center py-10 text-white/40">No hay registros en este periodo</div>
      ) : (
        <div className="space-y-3">
          {filteredWorkers.map((w) => (
            <div key={w.id} className="bg-white/10 rounded-3xl border border-white/10 overflow-hidden">
              <button
                onClick={() => setExpandedWorker(expandedWorker === w.id ? null : w.id)}
                className="w-full p-5 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/30 border border-purple-400/30 flex items-center justify-center font-bold text-white">
                    {w.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{w.full_name}</p>
                    <p className="text-white/40 text-xs">{w.logs.length} dias - {formatHours(w.totalHours)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-yellow-300">{formatCOP(w.totalEarned)}</p>
                  {w.pendingAmount > 0 && (
                    <p className="text-orange-300 text-xs">{formatCOP(w.pendingAmount)} pendiente</p>
                  )}
                </div>
              </button>

              {expandedWorker === w.id && (
                <div className="border-t border-white/10 p-4 space-y-2">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Registros</p>
                    <button onClick={() => openAddLog(w.id)}
                      className="text-xs bg-yellow-400/20 text-yellow-300 px-3 py-1.5 rounded-xl hover:bg-yellow-400/30 transition-all">
                      + Agregar
                    </button>
                  </div>

                  {w.logs.length === 0 ? (
                    <p className="text-white/30 text-sm text-center py-4">Sin registros en este periodo</p>
                  ) : w.logs.map((log) => (
                    <div key={log.id} className={`rounded-2xl px-4 py-3 space-y-2 ${!log.clock_out ? 'bg-emerald-500/10 border border-emerald-400/20' : 'bg-white/5'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white text-sm font-semibold">
                              {format(parseISO(log.clock_in), 'EEE d MMM', { locale: es })}
                            </p>
                            {!log.clock_out && (
                              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">🟢 En turno</span>
                            )}
                          </div>
                          <p className="text-white/40 text-xs">
                            {format(parseISO(log.clock_in), 'HH:mm')} {'->'}{' '}
                            {log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '...'}
                            {log.hours_worked ? ` - ${formatHours(log.hours_worked)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.clock_out ? (
                            <>
                              <div className="text-right">
                                <p className="text-yellow-300 font-semibold text-sm">{formatCOP(log.amount_earned || 0)}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  log.is_paid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'
                                }`}>
                                  {log.is_paid ? 'Pagado' : 'Pend.'}
                                </span>
                              </div>
                              <button onClick={() => openEditLog(log)}
                                className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-all">
                                Editar
                              </button>
                              <button onClick={() => deleteLog(log.id)}
                                className="text-red-400/50 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                                Eliminar
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="text-emerald-300/60 text-xs">En curso...</p>
                              <button onClick={() => openEditLog(log)}
                                className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-all">
                                Editar
                              </button>
                              <button onClick={async () => {
                                const bogotaOffset = 5 * 60 * 60000
                                const clockInBogota = new Date(new Date(log.clock_in).getTime() - bogotaOffset)
                                const dayOfWeek = clockInBogota.getUTCDay()
                                let defaultTime = '22:00'
                                try {
                                  const schedRes = await apiFetch('/api/admin/worker-schedules?worker_id=' + log.worker_id)
                                  const { schedules } = await schedRes.json()
                                  const daySched = (schedules || []).find((s: { day_of_week: number; is_active: boolean; end_time: string }) => s.day_of_week === dayOfWeek && s.is_active)
                                  if (daySched) defaultTime = daySched.end_time.slice(0, 5)
                                } catch { /* use default */ }
                                setCloseTime(defaultTime)
                                setCloseModal({ show: true, log, defaultTime })
                              }} className="text-orange-300/70 hover:text-orange-300 text-xs border border-orange-400/20 px-2 py-1 rounded-lg hover:bg-orange-400/10 transition-all">
                                Cerrar turno
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Notes and overtime */}
                      {(log.clock_in_notes || log.clock_out_notes || log.is_overtime || log.overtime_reason) && (
                        <div className="border-t border-white/10 pt-2 space-y-1">
                          {log.clock_in_notes && (
                            <p className="text-white/50 text-xs">
                              <span className="text-white/30">Nota entrada: </span>{log.clock_in_notes}
                            </p>
                          )}
                          {log.clock_out_notes && (
                            <p className="text-white/50 text-xs">
                              <span className="text-white/30">Nota salida: </span>{log.clock_out_notes}
                            </p>
                          )}
                          {log.is_overtime && log.overtime_reason && (
                            <p className="text-orange-300/80 text-xs">
                              <span className="text-orange-300/50">Hora extra: </span>{log.overtime_reason}
                            </p>
                          )}
                          {!log.is_overtime && log.overtime_reason === 'forgot_corrected' && (
                            <p className="text-blue-300/80 text-xs">Hora corregida por el trabajador</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit/Add Modal */}
      {editModal.show && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-4 animate-[slideUp_0.3s_ease-out] max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-white text-lg">
              {editModal.log ? 'Editar registro' : 'Agregar registro'}
            </h3>
            <div>
              <label className="label">Hora de entrada</label>
              <input type="datetime-local" value={editForm.clock_in}
                onChange={(e) => setEditForm((p) => ({ ...p, clock_in: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="label">Hora de salida</label>
              <input type="datetime-local" value={editForm.clock_out}
                onChange={(e) => setEditForm((p) => ({ ...p, clock_out: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="label">Observaciones</label>
              <input type="text" value={editForm.notes} placeholder="Opcional"
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                className="input-field" />
            </div>

            {/* Editable rate ranges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label" style={{marginBottom:0}}>Tarifas para este registro</label>
                <button type="button" onClick={() => setEditRanges(p => [...p, { start_time: '08:00', end_time: '18:00', rate_per_hour: '' }])}
                  className="text-xs bg-yellow-400/20 text-yellow-300 px-2 py-1 rounded-lg hover:bg-yellow-400/30 transition-all">
                  + Agregar rango
                </button>
              </div>
              {editRanges.length === 0 && (
                <p className="text-white/30 text-xs py-2">Sin tarifas — se usaran las tarifas actuales del trabajador</p>
              )}
              <div className="space-y-2">
                {editRanges.map((range, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Desde</label>
                        <input type="time" value={range.start_time}
                          onChange={(e) => setEditRanges(p => p.map((r, j) => j === i ? {...r, start_time: e.target.value} : r))}
                          className="input-field" />
                      </div>
                      <div>
                        <label className="label">Hasta</label>
                        <input type="time" value={range.end_time}
                          onChange={(e) => setEditRanges(p => p.map((r, j) => j === i ? {...r, end_time: e.target.value} : r))}
                          className="input-field" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="label">Valor/hora (COP)</label>
                        <input type="number" value={range.rate_per_hour} placeholder="Ej: 8000"
                          onChange={(e) => setEditRanges(p => p.map((r, j) => j === i ? {...r, rate_per_hour: e.target.value} : r))}
                          className="input-field" min="0" step="500" />
                      </div>
                      <button type="button" onClick={() => setEditRanges(p => p.filter((_, j) => j !== i))}
                        className="text-red-400/60 hover:text-red-400 text-xs mt-4 px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditModal({ show: false, log: null, workerId: '' })} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={saveLog} disabled={saving || !editForm.clock_in} className="btn-primary flex-1">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    {/* Close turn modal */}
    {closeModal.show && closeModal.log && (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-4">
          <h3 className="font-bold text-white text-lg">Cerrar turno</h3>
          <p className="text-white/60 text-sm">
            Entrada registrada a las <span className="text-yellow-300 font-semibold">
              {format(parseISO(closeModal.log.clock_in), 'HH:mm')} del {format(parseISO(closeModal.log.clock_in), "d 'de' MMMM", { locale: es })}
            </span>
          </p>
          <div>
            <label className="label">Hora de salida</label>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="input-field"
            />
            <p className="text-white/30 text-xs mt-1">
              Hora de fin del turno: {closeModal.defaultTime}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setCloseModal({ show: false, log: null, defaultTime: '' })}
              className="btn-secondary flex-1">Cancelar</button>
            <button
              disabled={!closeTime || closingTurn}
              onClick={async () => {
                if (!closeModal.log) return
                setClosingTurn(true)
                // Build the clock_out datetime using clock_in date + selected time in Bogota
                const bogotaOffset = 5 * 60 * 60000
                const clockInBogota = new Date(new Date(closeModal.log.clock_in).getTime() - bogotaOffset)
                const [h, m] = closeTime.split(':').map(Number)
                const clockOutBogota = new Date(clockInBogota)
                clockOutBogota.setUTCHours(h, m, 0, 0)
                // If close time is earlier than open time (next day), add 1 day
                if (clockOutBogota.getTime() <= new Date(closeModal.log.clock_in).getTime() - bogotaOffset) {
                  clockOutBogota.setUTCDate(clockOutBogota.getUTCDate() + 1)
                }
                const clockOutUTC = new Date(clockOutBogota.getTime() + bogotaOffset)
                await fetch('/api/worker/clockout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    log_id: closeModal.log.id,
                    worker_id: closeModal.log.worker_id,
                    clock_out_lat: 0,
                    clock_out_lng: 0,
                    clock_out_notes: 'Cerrado por admin',
                    corrected_clock_out: clockOutUTC.toISOString(),
                  }),
                })
                setCloseModal({ show: false, log: null, defaultTime: '' })
                setClosingTurn(false)
                await loadData()
              }}
              className="btn-primary flex-1">
              {closingTurn ? 'Cerrando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  )
}
