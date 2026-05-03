'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

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

const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0)
const SHIFT_LABELS = { morning: '☀️ Mañana', afternoon: '🌙 Tarde' }

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 1) return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">✓ Cuadrado</span>
  if (diff > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 font-bold">+{cop(diff)}</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">{cop(diff)}</span>
}

export default function AdminCierreCajaPage() {
  const [registers, setRegisters]     = useState<CashRegister[]>([])
  const [loading, setLoading]         = useState(true)
  const [dateFrom, setDateFrom]       = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]           = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [shiftFilter, setShiftFilter] = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (shiftFilter) params.set('shift', shiftFilter)
    const res  = await fetch('/api/admin/cash-registers?' + params)
    const json = await res.json()
    setRegisters(json.registers || [])
    setLoading(false)
  }, [dateFrom, dateTo, shiftFilter])

  useEffect(() => { loadData() }, [loadData])

  const totals = registers.reduce(
    (acc, r) => ({
      puve:       acc.puve       + (r.puve_total_reported || 0),
      didi:       acc.didi       + r.didi_cash_total + r.didi_transfer_total,
      whatsapp:   acc.whatsapp   + r.whatsapp_total,
      cancelled:  acc.cancelled  + r.cancelled_total,
      suppliers:  acc.suppliers  + r.supplier_total,
      real:       acc.real       + r.total_real_sales,
      diff:       acc.diff       + r.difference,
    }),
    { puve: 0, didi: 0, whatsapp: 0, cancelled: 0, suppliers: 0, real: 0, diff: 0 }
  )

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="page-title">Cierres de Caja</h1>
        <p className="text-muted mt-1">Revisa los cierres enviados por los trabajadores</p>
      </div>

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
            <option value="">Todos</option>
            <option value="morning">☀️ Mañana</option>
            <option value="afternoon">🌙 Tarde</option>
          </select>
        </div>
      </div>

      {/* Resumen del período */}
      {!loading && registers.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total ventas real', value: totals.real,      icon: '📈' },
            { label: 'Total Puve',        value: totals.puve,      icon: '🖥️' },
            { label: 'Didi',              value: totals.didi,      icon: '🛵' },
            { label: 'Diferencia total',  value: totals.diff,      icon: totals.diff === 0 ? '✅' : totals.diff > 0 ? '⬆️' : '⬇️' },
          ].map(s => (
            <div key={s.label} className="card">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-white font-bold text-base">{cop(s.value)}</p>
              <p className="text-muted text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="card text-center py-10"><p className="text-white/40 text-sm">Cargando...</p></div>
      ) : registers.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-white/50 text-sm">No hay cierres en este período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(r => (
            <div key={r.id} className="card cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{r.worker_name}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {format(parseISO(r.register_date), "d MMM yyyy", { locale: es })}
                    {' · '}{SHIFT_LABELS[r.shift]}
                    {r.location_name ? ` · ${r.location_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-white/40 text-xs">Ventas reales</p>
                    <p className="text-white font-bold text-sm">{cop(r.total_real_sales)}</p>
                  </div>
                  <DiffBadge diff={r.difference} />
                  <span className="text-white/30 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                  {/* Grid detalle */}
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ['Base recibida',      r.opening_fund],
                      ['Total ventas Puve',  r.puve_total_reported ?? 0],
                      ['Puve efectivo',      r.puve_cash],
                      ['Transferencias',     r.puve_transfer],
                      ['Didi efectivo',      r.didi_cash_total],
                      ['Didi transf.',       r.didi_transfer_total],
                      ['WhatsApp',           r.whatsapp_total],
                      ['Cancelados (−)',     r.cancelled_total],
                      ['Proveedores (−)',    r.supplier_total],
                      ['Total ventas real',  r.total_real_sales],
                      ['Efectivo esperado',  r.expected_cash],
                      ['Efectivo contado',   r.cash_counted],
                      ['Entregado en sobre', r.cash_to_owner],
                      ['Base sig. día',      r.next_base],
                    ] as [string, number][]).map(([label, value]) => (
                      <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                        <p className="text-white/40 text-xs">{label}</p>
                        <p className="text-white font-bold text-sm">{cop(Number(value))}</p>
                      </div>
                    ))}
                  </div>

                  {r.difference_note && (
                    <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-yellow-300 text-xs font-bold mb-1">Nota de descuadre</p>
                      <p className="text-white/80 text-sm">{r.difference_note}</p>
                    </div>
                  )}

                  <p className="text-white/30 text-xs">
                    Enviado {format(parseISO(r.submitted_at), "d MMM, HH:mm", { locale: es })}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
