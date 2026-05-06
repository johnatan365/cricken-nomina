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
  const [activeTab, setActiveTab] = useState<'registrar' | 'historial' | 'proveedores'>('registrar')
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

  // Estados proveedores
  const [suppLoading, setSuppLoading]   = useState(false)
  const [suppDateFrom, setSuppDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [suppDateTo, setSuppDateTo]     = useState(() => new Date().toISOString().split('T')[0])
  const [suppDebts, setSuppDebts]       = useState<Record<string, {kitchen: number; cash: number}>>({})
  const [suppPayments, setSuppPayments] = useState<any[]>([])
  const [suppPayModal, setSuppPayModal] = useState<{supplier: string; orderType: 'kitchen'|'cash'|'all'; amount: number} | null>(null)
  const [suppPayNotes, setSuppPayNotes] = useState('')
  const [suppSaving, setSuppSaving]     = useState(false)
  const [histMonth, setHistMonth]       = useState(() => new Date().toISOString().slice(0,7))

  const loadSupplierData = useCallback(async () => {
    setSuppLoading(true)
    // Calcular deudas por proveedor desde kitchen_orders entregados
    const { data: orders } = await fetch(
      `/api/admin/kitchen-orders?date_from=${suppDateFrom}&date_to=${suppDateTo}&order_type=kitchen`
    ).then(r => r.json()).then(j => ({ data: j.orders || [] }))

    const { data: cashOrders } = await fetch(
      `/api/admin/kitchen-orders?date_from=${suppDateFrom}&date_to=${suppDateTo}&order_type=cash`
    ).then(r => r.json()).then(j => ({ data: j.orders || [] }))

    const debts: Record<string, {kitchen: number; cash: number}> = {}

    const calcTotal = (orders: any[], type: 'kitchen'|'cash') => {
      orders.filter((o: any) => o.status === 'delivered').forEach((o: any) => {
        ;(o.items || []).forEach((item: any) => {
          const supplier = item.product?.supplier || 'Otro'
          if (!debts[supplier]) debts[supplier] = { kitchen: 0, cash: 0 }
          const qty   = item.qty_delivered ?? 0
          const price = item.price_override ?? item.product?.price ?? 0
          debts[supplier][type] += qty * price
        })
      })
    }

    calcTotal(orders, 'kitchen')
    calcTotal(cashOrders, 'cash')
    setSuppDebts(debts)

    // Historial de pagos
    const { payments } = await fetch(`/api/admin/supplier-payments?month=${histMonth}`)
      .then(r => r.json())
    setSuppPayments(payments || [])
    setSuppLoading(false)
  }, [suppDateFrom, suppDateTo, histMonth])

  useEffect(() => {
    if (activeTab === 'proveedores') loadSupplierData()
  }, [activeTab, loadSupplierData])

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
      {/* ── TAB PROVEEDORES ── */}
      {activeTab === 'proveedores' && (
        <div className="space-y-4">
          {/* Modal pagar */}
          {suppPayModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
              onClick={() => setSuppPayModal(null)}>
              <div className="w-full max-w-sm bg-purple-900 rounded-3xl border border-white/20 p-5 space-y-4"
                onClick={e => e.stopPropagation()}>
                <p className="text-white font-bold">Registrar pago — {suppPayModal.supplier}</p>
                <div>
                  <label className="label">Monto a pagar</label>
                  <input type="number" className="input-field"
                    value={suppPayModal.amount}
                    onChange={e => setSuppPayModal(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0 } : prev)} />
                </div>
                <div>
                  <label className="label">Notas (opcional)</label>
                  <input type="text" className="input-field" placeholder="ej: semana 1-6 mayo"
                    value={suppPayNotes} onChange={e => setSuppPayNotes(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setSuppPayModal(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-white/60">Cancelar</button>
                  <button disabled={suppSaving} onClick={async () => {
                    setSuppSaving(true)
                    await fetch('/api/admin/supplier-payments', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        supplier: suppPayModal.supplier,
                        amount: suppPayModal.amount,
                        date_from: suppDateFrom,
                        date_to: suppDateTo,
                        order_type: suppPayModal.orderType,
                        notes: suppPayNotes,
                      })
                    })
                    setSuppPayModal(null); setSuppPayNotes(''); setSuppSaving(false)
                    loadSupplierData()
                  }} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-yellow-400 text-purple-900">
                    {suppSaving ? 'Guardando...' : 'Confirmar pago'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="card grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Desde</label><input type="date" value={suppDateFrom} onChange={e => setSuppDateFrom(e.target.value)} className="input-field" /></div>
            <div><label className="label">Hasta</label><input type="date" value={suppDateTo} onChange={e => setSuppDateTo(e.target.value)} className="input-field" /></div>
          </div>

          {/* Resumen totales */}
          <div className="grid grid-cols-3 gap-3">
            {['Total pendiente', 'Cocina', 'Caja'].map((label, i) => {
              const total = Object.values(suppDebts).reduce((s, d) => s + (i === 0 ? d.kitchen + d.cash : i === 1 ? d.kitchen : d.cash), 0)
              return (
                <div key={label} className="card text-center">
                  <p className="text-white/40 text-xs">{label}</p>
                  <p className="text-red-300 font-bold text-sm">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(total)}</p>
                </div>
              )
            })}
          </div>

          {/* Deudas por proveedor */}
          {suppLoading ? <div className="card text-center py-8"><p className="text-white/40">Cargando...</p></div>
          : Object.keys(suppDebts).length === 0 ? <div className="card text-center py-8"><p className="text-white/40">No hay pedidos entregados en este período</p></div>
          : Object.entries(suppDebts).map(([supplier, debt]) => (
            <div key={supplier} className="card space-y-3">
              <p className="text-white font-bold text-sm">{supplier}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40 text-xs">Cocina</p>
                  <p className="text-white font-bold">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(debt.kitchen)}</p>
                </div>
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40 text-xs">Caja</p>
                  <p className="text-white font-bold">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(debt.cash)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <div>
                  <p className="text-white/40 text-xs">Total</p>
                  <p className="text-red-300 font-bold">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(debt.kitchen + debt.cash)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSuppPayModal({ supplier, orderType: 'all', amount: debt.kitchen + debt.cash })}
                    className="btn-primary text-xs py-1.5 px-3">Pagar todo</button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSuppPayModal({ supplier, orderType: 'kitchen', amount: debt.kitchen })}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
                  Solo cocina
                </button>
                <button onClick={() => setSuppPayModal({ supplier, orderType: 'cash', amount: debt.cash })}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
                  Solo caja
                </button>
              </div>
            </div>
          ))}

          {/* Historial */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white font-bold text-sm">Historial de pagos</p>
              <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)}
                className="input-field !py-1 !px-2 text-xs w-auto" />
            </div>
            {suppPayments.length === 0 ? (
              <div className="card text-center py-4"><p className="text-white/40 text-sm">Sin pagos en este mes</p></div>
            ) : suppPayments.map((p: any) => (
              <div key={p.id} className="card flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm">{p.supplier}</p>
                  <p className="text-white/40 text-xs">
                    {p.order_type === 'kitchen' ? 'Cocina' : p.order_type === 'cash' ? 'Caja' : 'Cocina + Caja'} ·{' '}
                    {p.date_from} → {p.date_to}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-emerald-400 font-bold">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(p.amount)}</p>
                  <button onClick={async () => {
                    if (!confirm('¿Eliminar este pago?')) return
                    await fetch('/api/admin/supplier-payments?id=' + p.id, { method: 'DELETE' })
                    loadSupplierData()
                  }} className="text-red-400/50 hover:text-red-400 text-xs">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
