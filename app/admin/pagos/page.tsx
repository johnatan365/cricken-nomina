'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP, formatHours, Worker, TimeLog, Payment } from '@/types'
import { exportPayments } from '@/lib/excel'

type WorkerPending = Worker & {
  pendingLogs: TimeLog[]
  pendingTotal: number
}

export default function PagosPage() {
  const [activeTab, setActiveTab] = useState<'registrar' | 'historial'>('registrar')
  const [workers, setWorkers] = useState<WorkerPending[]>([])
  const [payments, setPayments] = useState<(Payment & { workers: Worker })[]>([])
  const [allWorkers, setAllWorkers] = useState<Worker[]>([])
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set())
  const [paymentNotes, setPaymentNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [histDateFrom, setHistDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [histDateTo, setHistDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const loadData = useCallback(async () => {
    setLoading(true)

    const [wRes, pRes] = await Promise.all([
      fetch('/api/admin/workers'),
      fetch('/api/admin/payments'),
    ])

    const { workers: workersData } = await wRes.json()
    const { pendingLogs, payments: paymentsData } = await pRes.json()

    const ws: Worker[] = workersData || []
    setAllWorkers(ws)
    setPayments(paymentsData || [])

    const workersWithPending: WorkerPending[] = ws.map((w) => {
      const wLogs = (pendingLogs || []).filter((l: TimeLog) => l.worker_id === w.id)
      return {
        ...w,
        pendingLogs: wLogs,
        pendingTotal: wLogs.reduce((a: number, l: TimeLog) => a + (l.amount_earned || 0), 0),
      }
    }).filter((w: WorkerPending) => w.pendingLogs.length > 0)

    setWorkers(workersWithPending)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function toggleLog(logId: string) {
    setSelectedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) next.delete(logId)
      else next.add(logId)
      return next
    })
  }

  function selectAllForWorker(workerId: string) {
    const worker = workers.find((w) => w.id === workerId)
    if (!worker) return
    const allSelected = worker.pendingLogs.every((l) => selectedLogs.has(l.id))
    setSelectedLogs((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        worker.pendingLogs.forEach((l) => next.delete(l.id))
      } else {
        worker.pendingLogs.forEach((l) => next.add(l.id))
      }
      return next
    })
  }

  const selectedTotal = workers
    .flatMap((w) => w.pendingLogs)
    .filter((l) => selectedLogs.has(l.id))
    .reduce((a, l) => a + (l.amount_earned || 0), 0)

  async function registerPayment() {
    if (selectedLogs.size === 0) return
    setSaving(true)

    // Group by worker
    const byWorker: Record<string, { logIds: string[]; amount: number }> = {}
    for (const worker of workers) {
      for (const log of worker.pendingLogs) {
        if (selectedLogs.has(log.id)) {
          if (!byWorker[worker.id]) byWorker[worker.id] = { logIds: [], amount: 0 }
          byWorker[worker.id].logIds.push(log.id)
          byWorker[worker.id].amount += log.amount_earned || 0
        }
      }
    }

    for (const [worker_id, { logIds, amount }] of Object.entries(byWorker)) {
      await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id, amount, notes: paymentNotes.trim() || null, logIds }),
      })
    }

    setStatus({ type: 'success', msg: `Pago de ${formatCOP(selectedTotal)} registrado correctamente` })
    setSelectedLogs(new Set())
    setPaymentNotes('')
    await loadData()
    setSaving(false)
    setTimeout(() => setStatus(null), 4000)
  }

  const filteredPayments = payments.filter((p) => {
    const from = new Date(histDateFrom).getTime()
    const to = new Date(histDateTo + 'T23:59:59').getTime()
    const paid = new Date(p.paid_at).getTime()
    return paid >= from && paid <= to
  })

  const totalPaid = filteredPayments.reduce((a, p) => a + p.amount, 0)

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <h1 className="font-bold text-2xl text-white">Pagos</h1>

      <div className="flex bg-white/10 rounded-2xl p-1 gap-1">
        {(['registrar', 'historial'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/60 hover:text-white'
            }`}>
            {tab === 'registrar' ? 'Registrar Pago' : 'Historial'}
          </button>
        ))}
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

      {loading ? (
        <div className="text-center py-10 text-white/40">Cargando...</div>
      ) : activeTab === 'registrar' ? (
        <div className="space-y-4">
          {workers.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-3xl border border-white/10">
              <p className="text-white/40 text-lg">🎉</p>
              <p className="text-white/40 mt-2">No hay pagos pendientes</p>
            </div>
          ) : (
            <>
              {selectedLogs.size > 0 && (
                <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-yellow-300 font-semibold text-sm">
                      {selectedLogs.size} dia{selectedLogs.size !== 1 ? 's' : ''} seleccionado{selectedLogs.size !== 1 ? 's' : ''}
                    </p>
                    <p className="font-bold text-yellow-300 text-lg">{formatCOP(selectedTotal)}</p>
                  </div>
                  <input type="text" value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Notas del pago (opcional)"
                    className="input-field mb-3" />
                  <button onClick={registerPayment} disabled={saving} className="btn-primary w-full">
                    {saving ? 'Registrando...' : `Pagar ${formatCOP(selectedTotal)}`}
                  </button>
                </div>
              )}

              {workers.map((w) => {
                const allSelected = w.pendingLogs.every((l) => selectedLogs.has(l.id))
                const someSelected = w.pendingLogs.some((l) => selectedLogs.has(l.id))
                return (
                  <div key={w.id} className="bg-white/10 rounded-3xl border border-white/10 overflow-hidden">
                    <div className="p-4 flex items-center justify-between border-b border-white/10">
                      <div className="flex items-center gap-3">
                        <button onClick={() => selectAllForWorker(w.id)}
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            allSelected ? 'bg-yellow-400 border-yellow-400' :
                            someSelected ? 'bg-yellow-400/40 border-yellow-400/60' :
                            'border-white/30'
                          }`}>
                          {(allSelected || someSelected) && <span className="text-purple-900 text-xs font-bold">✓</span>}
                        </button>
                        <div>
                          <p className="font-semibold text-white text-sm">{w.full_name}</p>
                          <p className="text-white/40 text-xs">{w.pendingLogs.length} dias pendientes</p>
                        </div>
                      </div>
                      <p className="font-bold text-orange-300">{formatCOP(w.pendingTotal)}</p>
                    </div>

                    <div className="p-3 space-y-1">
                      {w.pendingLogs.map((log) => (
                        <label key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer">
                          <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            selectedLogs.has(log.id) ? 'bg-yellow-400 border-yellow-400' : 'border-white/30'
                          }`}>
                            {selectedLogs.has(log.id) && <span className="text-purple-900 text-xs font-bold">✓</span>}
                          </div>
                          <input type="checkbox" className="sr-only"
                            checked={selectedLogs.has(log.id)}
                            onChange={() => toggleLog(log.id)} />
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <p className="text-white text-xs font-semibold">
                                {format(parseISO(log.clock_in), 'EEE d MMM', { locale: es })}
                              </p>
                              <p className="text-white/40 text-xs">
                                {format(parseISO(log.clock_in), 'HH:mm')} - {log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '-'}
                                {' - '}{formatHours(log.hours_worked || 0)}
                              </p>
                            </div>
                            <p className="text-yellow-300 text-sm font-semibold">{formatCOP(log.amount_earned || 0)}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white/10 rounded-2xl border border-white/10 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Desde</label>
                <input type="date" value={histDateFrom} onChange={(e) => setHistDateFrom(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label">Hasta</label>
                <input type="date" value={histDateTo} onChange={(e) => setHistDateTo(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-2xl px-4 py-3">
              <p className="text-emerald-300/70 text-xs">Total pagado en periodo</p>
              <p className="font-bold text-emerald-300 text-xl">{formatCOP(totalPaid)}</p>
            </div>
            <button onClick={() => exportPayments(payments)} className="btn-secondary text-xs px-3 py-2">
              Exportar Excel
            </button>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="text-center py-10 text-white/40">No hay pagos en este periodo</div>
          ) : filteredPayments.map((p, i) => (
            <div key={p.id} className="bg-white/10 rounded-2xl border border-white/10 p-4 flex justify-between items-center stagger-item" style={{ animationDelay: `${i * 40}ms` }}>
              <div>
                <p className="font-semibold text-white text-sm">{p.workers?.full_name}</p>
                <p className="text-white/40 text-xs">
                  {format(parseISO(p.paid_at), 'EEEE d MMM yyyy', { locale: es })}
                </p>
                {p.notes && <p className="text-white/40 text-xs mt-0.5">{p.notes}</p>}
              </div>
              <div className="flex items-center gap-3">
                <p className="font-bold text-emerald-300 text-lg">{formatCOP(p.amount)}</p>
                <button onClick={async () => {
                  if (!confirm('Eliminar este pago? Los registros quedarán como pendientes.')) return
                  const res = await fetch('/api/admin/payments?id=' + p.id, { method: 'DELETE' })
                  if (res.ok) {
                    setStatus({ type: 'success', msg: 'Pago eliminado' })
                    await loadData()
                  }
                }} className="text-white/30 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
