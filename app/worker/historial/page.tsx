'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP, formatHours, TimeLog } from '@/types'
import { exportWorkerHistory } from '@/lib/excel'

function getQuincenas() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  // Esta quincena
  const day = now.getDate()
  const q1From = new Date(y, m, 1)
  const q1To = new Date(y, m, 15)
  const q2From = new Date(y, m, 16)
  const q2To = endOfMonth(now)
  const thisFrom = day <= 15 ? q1From : q2From
  const thisTo = day <= 15 ? q1To : q2To

  // Última quincena
  let lastFrom: Date, lastTo: Date
  if (day <= 15) {
    // Estamos en 1ra quincena → última fue 2da quincena del mes anterior
    lastFrom = new Date(y, m - 1, 16)
    lastTo = endOfMonth(new Date(y, m - 1, 1))
  } else {
    // Estamos en 2da quincena → última fue 1ra quincena de este mes
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

export default function HistorialPage() {
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; paid_at: string; notes: string | null }>>([])
  const [worker, setWorker] = useState<{ id: string; full_name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'horas' | 'pagos'>('horas')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: workerData } = await supabase
      .from('workers')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single()
    if (!workerData) return
    setWorker(workerData)

    const fromISO = new Date(dateFrom).toISOString()
    const toISO = new Date(dateTo + 'T23:59:59').toISOString()

    const { data: logsData } = await supabase
      .from('time_logs')
      .select('*')
      .eq('worker_id', workerData.id)
      .gte('clock_in', fromISO)
      .lte('clock_in', toISO)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })

    setLogs(logsData || [])

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, amount, paid_at, notes')
      .eq('worker_id', workerData.id)
      .gte('paid_at', fromISO)
      .lte('paid_at', toISO)
      .order('paid_at', { ascending: false })

    setPayments(paymentsData || [])
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totals = logs.reduce((acc, l) => ({
    hours: acc.hours + (l.hours_worked || 0),
    earned: acc.earned + (l.amount_earned || 0),
    paid: acc.paid + (l.is_paid ? (l.amount_earned || 0) : 0),
    pending: acc.pending + (!l.is_paid ? (l.amount_earned || 0) : 0),
  }), { hours: 0, earned: 0, paid: 0, pending: 0 })

  const totalPayments = payments.reduce((acc, p) => acc + p.amount, 0)

  function handleExport() {
    if (!worker) return
    exportWorkerHistory(logs, worker.full_name)
  }

  const q = getQuincenas()

  const shortcuts = [
    { label: 'Esta quincena', from: q.thisFrom, to: q.thisTo },
    { label: 'Últ. quincena', from: q.lastFrom, to: q.lastTo },
    { label: 'Este mes', from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
    { label: 'Mes anterior', from: format(startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1)), 'yyyy-MM-dd'), to: format(endOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 1)), 'yyyy-MM-dd') },
  ]

  return (
    <div className="max-w-md mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-white">Mi Historial</h1>
        <button onClick={handleExport} className="btn-secondary text-xs px-3 py-2">
          📥 Excel
        </button>
      </div>

      {/* Date filters */}
      <div className="bg-white/10 rounded-3xl border border-white/10 p-4 space-y-3">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Filtrar por fechas</p>
        <div>
          <label className="label">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="input-field" style={{maxWidth:'100%',boxSizing:'border-box'}} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="input-field" style={{maxWidth:'100%',boxSizing:'border-box'}} />
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((p) => (
            <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition-all">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/10 rounded-2xl border border-white/10 p-4 text-center">
          <p className="text-white/50 text-xs">Horas trabajadas</p>
          <p className="font-bold text-white text-xl mt-1">{formatHours(totals.hours)}</p>
        </div>
        <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4 text-center">
          <p className="text-yellow-300/70 text-xs">Total ganado</p>
          <p className="font-bold text-yellow-300 text-xl mt-1">{formatCOP(totals.earned)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-2xl p-4 text-center">
          <p className="text-emerald-300/70 text-xs">Pagado</p>
          <p className="font-bold text-emerald-300 text-lg mt-1">{formatCOP(totals.paid)}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-400/20 rounded-2xl p-4 text-center">
          <p className="text-orange-300/70 text-xs">Pendiente</p>
          <p className="font-bold text-orange-300 text-lg mt-1">{formatCOP(totals.pending)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white/10 rounded-2xl p-1 gap-1">
        {(['horas', 'pagos'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/60 hover:text-white'
            }`}>
            {tab === 'horas' ? '⏱️ Horas' : '💰 Pagos'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-10 text-white/40">Cargando...</div>
      ) : activeTab === 'horas' ? (
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-white/40">No hay registros en este período</div>
          ) : logs.map((log, i) => (
            <div key={log.id} className={`bg-white/10 rounded-2xl border border-white/10 p-4 stagger-item`} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-white text-sm">
                    {format(parseISO(log.clock_in), 'EEEE d MMM', { locale: es })}
                  </p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {format(parseISO(log.clock_in), 'HH:mm')} →{' '}
                    {log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '...'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-yellow-300">{formatCOP(log.amount_earned || 0)}</p>
                  <p className="text-white/40 text-xs">{formatHours(log.hours_worked || 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  log.is_paid
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-orange-500/20 text-orange-300'
                }`}>
                  {log.is_paid ? '✓ Pagado' : 'Pendiente'}
                </span>
                {log.is_overtime && (
                  <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">
                    Hora extra
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4 text-center">
            <p className="text-yellow-300/70 text-xs">Total recibido en el período</p>
            <p className="font-bold text-yellow-300 text-2xl mt-1">{formatCOP(totalPayments)}</p>
          </div>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-white/40">No hay pagos en este período</div>
          ) : payments.map((p, i) => (
            <div key={p.id} className="bg-white/10 rounded-2xl border border-white/10 p-4 flex justify-between items-center stagger-item" style={{ animationDelay: `${i * 50}ms` }}>
              <div>
                <p className="text-white font-semibold text-sm">
                  {format(parseISO(p.paid_at), 'EEEE d MMM', { locale: es })}
                </p>
                {p.notes && <p className="text-white/40 text-xs mt-0.5">{p.notes}</p>}
              </div>
              <p className="font-bold text-emerald-300">{formatCOP(p.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
