'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

type DifferenceRequest = {
  id: string
  worker_name: string
  shift: 'morning' | 'afternoon'
  register_date: string
  difference: number
  difference_note: string | null
  total_real_sales: number
  expected_cash: number
  cash_counted: number
  status: string
  created_at: string
}

type BaseChangeRequest = {
  id: string
  cash_register_id: string
  worker_name: string
  shift: 'morning' | 'afternoon'
  register_date: string
  base_calculated: number
  base_requested: number
  difference: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  created_at: string
}

type CashRegister = {
  id: string
  worker_name: string
  location_name: string | null
  shift: 'morning' | 'afternoon'
  register_date: string
  opening_fund: number
  puve_cash: number
  puve_transfer: number
  puve_total_reported: number
  didi_cash_total: number
  didi_transfer_total: number
  whatsapp_total: number
  cancelled_total: number
  supplier_total: number
  total_real_sales: number
  expected_cash: number
  cash_counted: number
  cash_to_owner: number
  next_base: number
  difference: number
  difference_note: string | null
  submitted_at: string
}

const cop = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0)

const SHIFT_LABELS = { morning: '☀️ Mañana', afternoon: '🌙 Tarde' }

export default function AdminCierreCajaPage() {
  const [registers, setRegisters]     = useState<CashRegister[]>([])
  const [loading, setLoading]         = useState(true)
  const [dateFrom, setDateFrom]       = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]           = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [shiftFilter, setShiftFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const expandedRef = useRef<string | null>(null)
  const toggleExpanded = (id: string) => {
    const next = expandedRef.current === id ? null : id
    expandedRef.current = next
    setExpanded(next)
  }
  const [onlyIssues, setOnlyIssues]   = useState(false)
  const [baseRequests, setBaseRequests] = useState<BaseChangeRequest[]>([])
  const [processingId, setProcessingId]   = useState<string | null>(null)
  const editingBaseRef                    = useRef<Record<string, string>>({})
  const [editingBaseVersion, setEditingBaseVersion] = useState(0)  // solo para forzar render
  const [savingBase, setSavingBase]       = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  // Helper para leer editingBase en el render
  const editingBase = editingBaseRef.current
  const [adminNotes, setAdminNotes]         = useState<Record<string, string>>({})
  const [diffRequests, setDiffRequests]     = useState<DifferenceRequest[]>([])
  const [diffNotes, setDiffNotes]           = useState<Record<string, string>>({})
  const [processingDiffId, setProcessingDiffId] = useState<string | null>(null)

  const loadData = useCallback(async (keepExpanded = false) => {
    if (!keepExpanded) setLoading(true)
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (shiftFilter)  params.set('shift', shiftFilter)
    if (workerFilter) params.set('worker_id', workerFilter)
    const res  = await fetch('/api/admin/cash-registers?' + params)
    const json = await res.json()
    setRegisters(json.registers || [])
    if (!keepExpanded) setLoading(false)
  }, [dateFrom, dateTo, shiftFilter, workerFilter])

  const loadDiffRequests = useCallback(async () => {
    const res  = await fetch('/api/admin/cash-register-drafts')
    const json = await res.json()
    setDiffRequests(json.drafts || [])
  }, [])

  useEffect(() => { loadDiffRequests() }, [loadDiffRequests])

  async function resolveDiff(id: string, action: 'approved' | 'rejected') {
    setProcessingDiffId(id)
    await fetch('/api/admin/cash-register-drafts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, admin_note: diffNotes[id] || null }),
    })
    setProcessingDiffId(null)
    loadDiffRequests()
    loadData()  // recargar para mostrar el cierre aprobado en la lista
  }

  const loadBaseRequests = useCallback(async () => {
    const res  = await fetch('/api/admin/base-change-requests?status=pending')
    const json = await res.json()
    setBaseRequests(json.requests || [])
  }, [])

  useEffect(() => { loadBaseRequests() }, [loadBaseRequests])

  async function deleteRegister(id: string) {
    if (!confirm('¿Eliminar este cierre? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    await fetch('/api/admin/cash-registers?id=' + id, { method: 'DELETE' })
    setDeletingId(null)
    setExpanded(null)
    expandedRef.current = null
    loadData()
  }

  async function saveBase(registerId: string) {
    const newBase = editingBase[registerId]
    if (!newBase) return
    const savedExpanded = expandedRef.current
    setSavingBase(registerId)
    const res = await fetch('/api/admin/cash-registers/edit-base', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: registerId, next_base: parseFloat(newBase) }),
    })
    setSavingBase(null)
    if (res.ok) {
      setRegisters(prev => prev.map(r =>
        r.id === registerId ? { ...r, next_base: parseFloat(newBase) } : r
      ))
      delete editingBaseRef.current[registerId]
      setEditingBaseVersion(v => v + 1)
      // Restaurar expanded
      expandedRef.current = savedExpanded
      setExpanded(savedExpanded)
    }
  }

  async function resolveRequest(id: string, status: 'approved' | 'rejected') {
    setProcessingId(id)
    await fetch('/api/admin/base-change-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, admin_note: adminNotes[id] || null }),
    })
    setProcessingId(null)
    loadBaseRequests()
    loadData()
  }

  useEffect(() => { loadData() }, [loadData])

  const displayed = onlyIssues
    ? registers.filter(r => Math.abs(r.difference) >= 1)
    : registers

  const withIssues = registers.filter(r => Math.abs(r.difference) >= 1).length

  const totals = registers.reduce(
    (acc, r) => ({
      real:      acc.real      + r.total_real_sales,
      puve:      acc.puve      + (r.puve_total_reported || 0),
      didi:      acc.didi      + r.didi_cash_total + r.didi_transfer_total,
      suppliers: acc.suppliers + r.supplier_total,
      diff:      acc.diff      + r.difference,
    }),
    { real: 0, puve: 0, didi: 0, suppliers: 0, diff: 0 }
  )

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="page-title">Cierres de Caja</h1>
        <p className="text-muted mt-1">Cierres enviados por los trabajadores</p>
      </div>

      {/* Panel borradores pendientes de aprobación */}
      {diffRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏳</span>
            <p className="text-white font-bold text-sm">
              {diffRequests.length} cierre{diffRequests.length > 1 ? 's' : ''} con descuadre esperando tu aprobación
            </p>
          </div>
          <p className="text-white/40 text-xs">El trabajador está bloqueado y no puede registrar más cierres hasta que apruebes o rechaces.</p>
          {diffRequests.map((req: DifferenceRequest) => (
            <div key={req.id} className="rounded-2xl border border-orange-400/30 bg-orange-500/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-bold text-sm">{req.worker_name}</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {SHIFT_LABELS[req.shift]} · {format(parseISO(req.register_date), "d MMM yyyy", { locale: es })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold border ${
                  req.difference > 0
                    ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30'
                    : 'bg-red-500/20 text-red-300 border-red-400/30'
                }`}>
                  {req.difference > 0 ? '+' : ''}{cop(req.difference)}
                </span>
              </div>
              {/* Resumen del cierre */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  ['Total ventas', req.total_real_sales],
                  ['Efectivo esperado', req.expected_cash],
                  ['Efectivo contado', req.cash_counted],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-white/5 rounded-xl px-3 py-2">
                    <p className="text-white/40">{label}</p>
                    <p className="text-white font-bold">{cop(Number(value))}</p>
                  </div>
                ))}
              </div>
              {req.difference_note && (
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40 text-xs mb-1">Nota del trabajador</p>
                  <p className="text-white text-sm">{req.difference_note}</p>
                </div>
              )}
              <div>
                <label className="text-white/40 text-xs block mb-1">Tu nota (opcional)</label>
                <input type="text" value={diffNotes[req.id] || ''}
                  onChange={e => setDiffNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                  placeholder="Ej: Aprobado, hay cambio de turno..."
                  className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-all" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => resolveDiff(req.id, 'approved')}
                  disabled={processingDiffId === req.id}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                  ✓ Aprobar y registrar cierre
                </button>
                <button
                  onClick={() => resolveDiff(req.id, 'rejected')}
                  disabled={processingDiffId === req.id}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30 transition-all disabled:opacity-50">
                  ✕ Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Panel solicitudes de cambio de base */}
      {baseRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔐</span>
            <p className="text-white font-bold text-sm">{baseRequests.length} solicitud{baseRequests.length > 1 ? 'es' : ''} de cambio de base pendiente{baseRequests.length > 1 ? 's' : ''}</p>
          </div>
          {baseRequests.map(req => (
            <div key={req.id} className="rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-bold text-sm">{req.worker_name}</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {SHIFT_LABELS[req.shift]} · {format(parseISO(req.register_date), "d MMM yyyy", { locale: es })}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-400/20 text-yellow-300 font-bold">⏳ Pendiente</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40">Base calculada</p>
                  <p className="text-white font-bold">{cop(req.base_calculated)}</p>
                </div>
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40">Base solicitada</p>
                  <p className="text-yellow-400 font-bold">{cop(req.base_requested)}</p>
                </div>
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <p className="text-white/40">Diferencia</p>
                  <p className={`font-bold ${req.difference > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {req.difference > 0 ? '+' : ''}{cop(req.difference)}
                  </p>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2">
                <p className="text-white/40 text-xs mb-1">Motivo del trabajador</p>
                <p className="text-white text-sm">{req.reason}</p>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Nota del admin (opcional)</label>
                <input type="text" value={adminNotes[req.id] || ''}
                  onChange={e => setAdminNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                  placeholder="Ej: Aprobado, hay cambio de turno..."
                  className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-all" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => resolveRequest(req.id, 'approved')}
                  disabled={processingId === req.id}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => resolveRequest(req.id, 'rejected')}
                  disabled={processingId === req.id}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30 transition-all disabled:opacity-50">
                  ✕ Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerta descuadres — solo si hay borradores pendientes de aprobación */}
      {diffRequests.length > 0 && (
        <div className="rounded-2xl px-4 py-3 border bg-red-500/15 border-red-400/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-red-300 font-bold text-sm">
                {diffRequests.length} cierre{diffRequests.length > 1 ? 's' : ''} con descuadre esperando tu aprobación
              </p>
              <p className="text-red-400/70 text-xs">El trabajador está bloqueado hasta que apruebes cada uno</p>
            </div>
          </div>
          <button
            onClick={() => setOnlyIssues(o => !o)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
              onlyIssues
                ? 'bg-red-400 text-white'
                : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            }`}>
            {onlyIssues ? 'Ver todos' : 'Ver solo descuadres'}
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="card grid grid-cols-3 gap-3">
        <div>
          <label className="label">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label">Turno</label>
          <select value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="input-field">
            <option value="">Todos los turnos</option>
            <option value="morning">☀️ Mañana</option>
            <option value="afternoon">🌙 Tarde</option>
          </select>
        </div>
      </div>

      {/* Resumen período */}
      {!loading && registers.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total ventas real', value: totals.real,      icon: '📈', color: 'text-white' },
            { label: 'Total Puve',        value: totals.puve,      icon: '🖥️', color: 'text-white' },
            { label: 'Didi',              value: totals.didi,      icon: '🛵', color: 'text-white' },
            {
              label: 'Diferencia total',
              value: totals.diff,
              icon: totals.diff === 0 ? '✅' : '⚠️',
              color: Math.abs(totals.diff) < 1 ? 'text-emerald-400' : totals.diff > 0 ? 'text-yellow-400' : 'text-red-400'
            },
          ].map(s => (
            <div key={s.label} className="card">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className={`font-bold text-base ${s.color}`}>{cop(s.value)}</p>
              <p className="text-muted text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista cierres */}
      {loading ? (
        <div className="card text-center py-10"><p className="text-white/40 text-sm">Cargando...</p></div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-white/50 text-sm">No hay cierres en este período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(r => {
            const hasIssue = Math.abs(r.difference) >= 1
            return (
              <div key={r.id}
                className={`card cursor-pointer transition-all ${hasIssue ? 'border-red-400/40 bg-red-500/5' : ''}`}
                onClick={() => toggleExpanded(r.id)}>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    {/* Avatar trabajador */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      hasIssue ? 'bg-red-500/30 text-red-300' : 'bg-purple-500/40 text-white'
                    }`}>
                      {r.worker_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      {/* 2 — Nombre del trabajador bien visible */}
                      <p className="text-white font-bold text-sm truncate">{r.worker_name}</p>
                      <p className="text-muted text-xs mt-0.5">
                        {format(parseISO(r.register_date), "d MMM yyyy", { locale: es })}
                        {' · '}{SHIFT_LABELS[r.shift]}
                        {r.location_name ? ` · ${r.location_name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-white/40 text-xs">Ventas reales</p>
                      <p className="text-white font-bold text-sm">{cop(r.total_real_sales)}</p>
                    </div>
                    {/* 4 — Badge diferencia en rojo si hay descuadre */}
                    {hasIssue ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs px-2 py-1 rounded-full bg-red-500/25 text-red-300 font-bold border border-red-400/30">
                          ⚠ {r.difference > 0 ? '+' : ''}{cop(r.difference)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        ✓ Cuadrado
                      </span>
                    )}
                    <span className="text-white/30 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Detalle expandido */}
                {expanded === r.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        ['Base recibida',      r.opening_fund],
                        ['Total ventas Puve',  r.puve_total_reported ?? 0],
                        ['Puve efectivo',      r.puve_cash],
                        ['Transferencias',     r.puve_transfer],
                        ['Didi efectivo',      r.didi_cash_total],
                        ['Didi transf.',       r.didi_transfer_total],
                        ['WhatsApp',           r.whatsapp_total],
                        ['Proveedores (−)',    r.supplier_total],
                        ['Total ventas real',  r.total_real_sales],
                        ['Efectivo esperado',  r.expected_cash],
                        ['Efectivo contado',   r.cash_counted],
                        ['Entregado en sobre', r.cash_to_owner],
                      ] as [string, number][]).map(([label, value]) => (
                        <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                          <p className="text-white/40 text-xs">{label}</p>
                          <p className="text-white font-bold text-sm">{cop(Number(value))}</p>
                        </div>
                      ))}
                    </div>

                    {/* Editor base siguiente día — solo admin */}
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-400/20 rounded-2xl px-4 py-3">
                      <div className="flex-1">
                        <p className="text-emerald-300 text-sm font-bold">Base siguiente día</p>
                        <p className="text-white/40 text-xs mt-0.5">Solo el admin puede modificar este valor</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0"
                          value={editingBase[r.id] ?? r.next_base}
                          onChange={e => editingBaseRef.current = { ...editingBaseRef.current, [r.id]: e.target.value }; setEditingBaseVersion(v => v + 1)}
                          className="w-36 bg-white/10 border border-emerald-400/30 rounded-xl px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-emerald-400/60 transition-all"
                        />
                        {editingBase[r.id] !== undefined && String(editingBase[r.id]) !== String(r.next_base) && (
                          <button
                            onClick={() => saveBase(r.id)}
                            disabled={savingBase === r.id}
                            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                            {savingBase === r.id ? '...' : 'Guardar'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Botón eliminar */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => deleteRegister(r.id)}
                        disabled={deletingId === r.id}
                        className="text-xs font-bold px-4 py-2 rounded-xl bg-red-500/15 text-red-300 border border-red-400/25 hover:bg-red-500/25 transition-all disabled:opacity-50">
                        {deletingId === r.id ? 'Eliminando...' : '🗑 Eliminar cierre'}
                      </button>
                    </div>

                    {/* Nota de descuadre */}
                    {r.difference_note && (
                      <div className={`rounded-xl px-4 py-3 border ${
                        hasIssue
                          ? 'bg-red-500/10 border-red-400/30'
                          : 'bg-yellow-400/10 border-yellow-400/20'
                      }`}>
                        <p className={`text-xs font-bold mb-1 ${hasIssue ? 'text-red-300' : 'text-yellow-300'}`}>
                          {hasIssue ? '⚠ Nota de descuadre' : 'Nota'}
                        </p>
                        <p className="text-white/80 text-sm">{r.difference_note}</p>
                      </div>
                    )}

                    <p className="text-white/25 text-xs">
                      Enviado {format(parseISO(r.submitted_at), "d MMM, HH:mm", { locale: es })}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
