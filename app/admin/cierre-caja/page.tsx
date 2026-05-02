'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/types'

type CashRegister = {
  id: string
  worker_name: string
  location_name: string | null
  shift: 'morning' | 'afternoon'
  register_date: string
  opening_fund: number
  cash_sales: number
  transfer_sales: number
  expenses: number
  cash_counted: number
  total_sales: number
  expected_cash: number
  difference: number
  difference_note: string | null
  submitted_at: string
}

const SHIFT_LABELS = {
  morning:   '☀️ Mañana',
  afternoon: '🌙 Tarde',
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0)
    return <span className="badge-green text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">Cuadrado ✓</span>
  if (diff > 0)
    return <span className="text-xs px-2 py-1 rounded-full bg-yellow-400/20 text-yellow-300 font-bold">+{formatCOP(diff)}</span>
  return <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300 font-bold">{formatCOP(diff)}</span>
}

export default function AdminCierreCajaPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [shiftFilter, setShiftFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

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

  // Totales del período filtrado
  const totals = registers.reduce(
    (acc, r) => ({
      sales:      acc.sales     + r.total_sales,
      cash_sales: acc.cash_sales + r.cash_sales,
      transfers:  acc.transfers  + r.transfer_sales,
      expenses:   acc.expenses   + r.expenses,
      diff:       acc.diff       + r.difference,
    }),
    { sales: 0, cash_sales: 0, transfers: 0, expenses: 0, diff: 0 }
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="page-title">Cierres de Caja</h1>
        <p className="text-muted mt-1">Revisa los cierres enviados por los trabajadores</p>
      </div>

      {/* Filtros */}
      <div className="card grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Desde</label>
          <input type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field" />
        </div>
        <div>
          <label className="label">Turno</label>
          <select value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="input-field">
            <option value="">Todos</option>
            <option value="morning">☀️ Mañana</option>
            <option value="afternoon">🌙 Tarde</option>
          </select>
        </div>
      </div>

      {/* Resumen del período */}
      {!loading && registers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total ventas',       value: formatCOP(totals.sales),      icon: '📈' },
            { label: 'Efectivo',           value: formatCOP(totals.cash_sales), icon: '💵' },
            { label: 'Transferencias',     value: formatCOP(totals.transfers),  icon: '🏦' },
            { label: 'Diferencia total',   value: formatCOP(totals.diff),       icon: totals.diff === 0 ? '✅' : totals.diff > 0 ? '⬆️' : '⬇️' },
          ].map((s) => (
            <div key={s.label} className="card">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-white font-bold text-base">{s.value}</p>
              <p className="text-muted text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="card text-center py-10">
          <p className="text-white/40 text-sm">Cargando...</p>
        </div>
      ) : registers.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-white/50 text-sm">No hay cierres en este período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map((r) => (
            <div key={r.id} className="card stagger-item cursor-pointer"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}>

              {/* Fila resumen */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{r.worker_name}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {format(parseISO(r.register_date), "d MMM yyyy", { locale: es })}
                    {' · '}{SHIFT_LABELS[r.shift]}
                    {r.location_name ? ` · ${r.location_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-white font-bold text-sm">{formatCOP(r.total_sales)}</span>
                  <DiffBadge diff={r.difference} />
                  <span className="text-white/30 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Detalle expandido */}
              {expanded === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Fondo inicial',      value: formatCOP(r.opening_fund) },
                      { label: 'Ventas efectivo',     value: formatCOP(r.cash_sales) },
                      { label: 'Ventas transferencia',value: formatCOP(r.transfer_sales) },
                      { label: 'Gastos',              value: formatCOP(r.expenses) },
                      { label: 'Efectivo esperado',   value: formatCOP(r.expected_cash) },
                      { label: 'Efectivo contado',    value: formatCOP(r.cash_counted) },
                    ].map((item) => (
                      <div key={item.label} className="bg-white/5 rounded-xl px-3 py-2">
                        <p className="text-white/40 text-xs">{item.label}</p>
                        <p className="text-white font-semibold text-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {r.difference_note && (
                    <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-yellow-300 text-xs font-semibold mb-0.5">Nota de descuadre</p>
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
