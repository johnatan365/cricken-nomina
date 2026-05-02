'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/types'

type Shift = 'morning' | 'afternoon'

type CashRegister = {
  id: string
  shift: Shift
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

const SHIFT_LABELS: Record<Shift, string> = {
  morning: '☀️ Turno Mañana',
  afternoon: '🌙 Turno Tarde',
}

function formatDiff(diff: number) {
  if (diff === 0) return { label: 'Cuadrado ✓', color: 'text-emerald-400' }
  if (diff > 0)  return { label: `+${formatCOP(diff)} sobrante`, color: 'text-yellow-400' }
  return { label: `${formatCOP(diff)} faltante`, color: 'text-red-400' }
}

export default function CierreCajaPage() {
  const [worker, setWorker] = useState<{ id: string; full_name: string } | null>(null)
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'form' | 'historial'>('form')

  // Formulario
  const [shift, setShift] = useState<Shift>('morning')
  const [openingFund, setOpeningFund] = useState('')
  const [cashSales, setCashSales] = useState('')
  const [transferSales, setTransferSales] = useState('')
  const [expenses, setExpenses] = useState('')
  const [cashCounted, setCashCounted] = useState('')
  const [differenceNote, setDifferenceNote] = useState('')

  // Cálculos en tiempo real
  const num = (v: string) => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
  const totalSales   = num(cashSales) + num(transferSales)
  const expectedCash = num(openingFund) + num(cashSales) - num(expenses)
  const difference   = num(cashCounted) - expectedCash
  const diffInfo     = formatDiff(difference)
  const needsNote    = difference !== 0 && (cashCounted !== '' || num(cashCounted) !== 0)

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

    const res = await fetch('/api/worker/cash-register?worker_id=' + workerData.id)
    const json = await res.json()
    setRegisters(json.registers || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showStatus(type: 'success' | 'error', msg: string) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 5000)
  }

  async function handleSubmit() {
    if (!worker) return
    if (!cashCounted) {
      showStatus('error', 'Ingresa el efectivo contado al cierre')
      return
    }
    if (needsNote && !differenceNote.trim()) {
      showStatus('error', 'Hay un descuadre — escribe una nota explicando la diferencia')
      return
    }

    setSaving(true)
    const res = await fetch('/api/worker/cash-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id:       worker.id,
        shift,
        opening_fund:    num(openingFund),
        cash_sales:      num(cashSales),
        transfer_sales:  num(transferSales),
        expenses:        num(expenses),
        cash_counted:    num(cashCounted),
        difference_note: differenceNote.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      showStatus('error', json.error || 'Error al guardar')
      return
    }

    showStatus('success', '¡Cierre de caja registrado!')
    // Reset form
    setOpeningFund(''); setCashSales(''); setTransferSales('')
    setExpenses(''); setCashCounted(''); setDifferenceNote('')
    loadData()
    setActiveTab('historial')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-white/40 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 animate-fadeIn">

      {/* Header */}
      <div>
        <h1 className="page-title">Cierre de Caja</h1>
        <p className="text-muted mt-1">{worker?.full_name}</p>
      </div>

      {/* Status toast */}
      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${
          status.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
            : 'bg-red-500/20 border-red-400/30 text-red-300'
        }`}>
          {status.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['form', 'historial'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === tab
                ? 'bg-yellow-400 text-purple-900'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {tab === 'form' ? '💰 Registrar cierre' : '📋 Historial'}
          </button>
        ))}
      </div>

      {/* ── FORMULARIO ── */}
      {activeTab === 'form' && (
        <div className="space-y-4">

          {/* Turno */}
          <div className="card">
            <label className="label">Turno</label>
            <div className="flex gap-2">
              {(['morning', 'afternoon'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all ${
                    shift === s
                      ? 'bg-yellow-400 text-purple-900 border-yellow-400'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Montos */}
          <div className="card space-y-4">
            <p className="font-semibold text-white text-sm mb-1">Montos del turno</p>

            <div>
              <label className="label">Fondo inicial (base de caja)</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={openingFund}
                onChange={(e) => setOpeningFund(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Ventas en efectivo</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={cashSales}
                onChange={(e) => setCashSales(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Ventas por transferencia</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={transferSales}
                onChange={(e) => setTransferSales(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Gastos / salidas de caja</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          {/* Conteo físico */}
          <div className="card space-y-3">
            <p className="font-semibold text-white text-sm">Conteo físico al cierre</p>

            <div>
              <label className="label">Efectivo contado</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={cashCounted}
                onChange={(e) => setCashCounted(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Resumen calculado */}
            {(cashCounted || cashSales || openingFund) && (
              <div className="bg-white/5 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>Total ventas</span>
                  <span className="text-white font-semibold">{formatCOP(totalSales)}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Efectivo esperado</span>
                  <span className="text-white font-semibold">{formatCOP(expectedCash)}</span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                  <span className="text-white/80">Diferencia</span>
                  <span className={diffInfo.color}>{diffInfo.label}</span>
                </div>
              </div>
            )}

            {/* Nota de descuadre */}
            {needsNote && (
              <div>
                <label className="label">
                  Nota de descuadre <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explica por qué hay diferencia en la caja..."
                  value={differenceNote}
                  onChange={(e) => setDifferenceNote(e.target.value)}
                  className="input-field resize-none"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? 'Guardando...' : '✓ Enviar cierre de caja'}
          </button>
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {activeTab === 'historial' && (
        <div className="space-y-3">
          {registers.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-4xl mb-3">🧾</p>
              <p className="text-white/50 text-sm">No hay cierres registrados aún</p>
            </div>
          ) : (
            registers.map((r) => {
              const diff = formatDiff(r.difference)
              return (
                <div key={r.id} className="card space-y-3 stagger-item">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {SHIFT_LABELS[r.shift]}
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        {format(parseISO(r.register_date), "d 'de' MMMM, yyyy", { locale: es })}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full bg-white/10 ${diff.color}`}>
                      {diff.label}
                    </span>
                  </div>

                  {/* Detalle */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/50 text-xs">Fondo inicial</p>
                      <p className="text-white font-semibold">{formatCOP(r.opening_fund)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/50 text-xs">Total ventas</p>
                      <p className="text-white font-semibold">{formatCOP(r.total_sales)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/50 text-xs">Gastos</p>
                      <p className="text-white font-semibold">{formatCOP(r.expenses)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/50 text-xs">Efectivo contado</p>
                      <p className="text-white font-semibold">{formatCOP(r.cash_counted)}</p>
                    </div>
                  </div>

                  {/* Nota de descuadre */}
                  {r.difference_note && (
                    <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-yellow-300 text-xs font-semibold mb-0.5">Nota de descuadre</p>
                      <p className="text-white/80 text-xs">{r.difference_note}</p>
                    </div>
                  )}

                  <p className="text-white/30 text-xs">
                    Enviado {format(parseISO(r.submitted_at), "d MMM, HH:mm", { locale: es })}
                  </p>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
