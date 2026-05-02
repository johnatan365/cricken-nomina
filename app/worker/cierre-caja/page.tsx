'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/types'

type Shift = 'morning' | 'afternoon'

type DidiOrder      = { order_id: string; cash: number; transfer: number }
type WhatsappOrder  = { amount: number }
type CancelledOrder = { invoice: string; amount: number }
type SupplierPayment = { description: string; amount: number }

type CashRegister = {
  id: string
  shift: Shift
  register_date: string
  opening_fund: number
  puve_cash: number
  puve_transfer: number
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
  didi_orders: DidiOrder[]
  whatsapp_orders: WhatsappOrder[]
  cancelled_orders: CancelledOrder[]
  supplier_payments: SupplierPayment[]
}

const SHIFT_LABELS: Record<Shift, string> = {
  morning:   '☀️ Turno Mañana',
  afternoon: '🌙 Turno Tarde',
}

const n = (v: string | number) => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <p className="text-white font-bold text-sm border-b border-white/10 pb-2">{title}</p>
      {children}
    </div>
  )
}

function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full py-2 rounded-xl border border-dashed border-white/20 text-white/40 text-xs font-semibold hover:border-yellow-400/40 hover:text-yellow-400/60 transition-all">
      + Agregar
    </button>
  )
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '0'}
      className="input-field" />
  )
}

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 1) return <span className="text-emerald-400 font-bold text-sm">✓ Cuadrado</span>
  if (diff > 0) return <span className="text-yellow-400 font-bold text-sm">+{formatCOP(diff)} sobrante</span>
  return <span className="text-red-400 font-bold text-sm">{formatCOP(diff)} faltante</span>
}

export default function CierreCajaPage() {
  const [worker, setWorker] = useState<{ id: string; full_name: string } | null>(null)
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [suggestedBase, setSuggestedBase] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'form' | 'historial'>('form')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [shift, setShift] = useState<Shift>('morning')
  const [openingFund, setOpeningFund] = useState('')
  const [puveCash, setPuveCash] = useState('')
  const [puveTransfer, setPuveTransfer] = useState('')
  const [didiOrders, setDidiOrders] = useState<DidiOrder[]>([])
  const [whatsappOrders, setWhatsappOrders] = useState<WhatsappOrder[]>([])
  const [cancelledOrders, setCancelledOrders] = useState<CancelledOrder[]>([])
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([])
  const [cashCounted, setCashCounted] = useState('')
  const [cashToOwner, setCashToOwner] = useState('')
  const [differenceNote, setDifferenceNote] = useState('')

  // Cálculos en tiempo real
  const didiCash     = didiOrders.reduce((s, o) => s + n(o.cash), 0)
  const didiTransfer = didiOrders.reduce((s, o) => s + n(o.transfer), 0)
  const whatsappTotal = whatsappOrders.reduce((s, o) => s + n(o.amount), 0)
  const cancelledTotal = cancelledOrders.reduce((s, o) => s + n(o.amount), 0)
  const supplierTotal = supplierPayments.reduce((s, o) => s + n(o.amount), 0)

  const totalRealSales =
    n(puveCash) + n(puveTransfer) +
    didiCash + didiTransfer +
    whatsappTotal -
    cancelledTotal

  const expectedCash =
    n(openingFund) +
    n(puveCash) +
    didiCash +
    whatsappTotal -
    supplierTotal

  const difference = cashCounted !== '' ? n(cashCounted) - expectedCash : null
  const nextBase   = cashCounted !== '' && cashToOwner !== ''
    ? n(cashCounted) - n(cashToOwner)
    : null

  const needsNote = difference !== null && Math.abs(difference) >= 1

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: workerData } = await supabase
      .from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!workerData) return
    setWorker(workerData)

    const res = await fetch('/api/worker/cash-register?worker_id=' + workerData.id)
    const json = await res.json()
    setRegisters(json.registers || [])
    if (json.suggestedBase && json.suggestedBase > 0) {
      setSuggestedBase(json.suggestedBase)
      setOpeningFund(String(json.suggestedBase))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showStatus(type: 'success' | 'error', msg: string) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 5000)
  }

  function resetForm() {
    setPuveCash(''); setPuveTransfer('')
    setDidiOrders([]); setWhatsappOrders([])
    setCancelledOrders([]); setSupplierPayments([])
    setCashCounted(''); setCashToOwner(''); setDifferenceNote('')
  }

  async function handleSubmit() {
    if (!worker) return
    if (cashCounted === '') { showStatus('error', 'Ingresa el efectivo contado'); return }
    if (cashToOwner === '') { showStatus('error', 'Ingresa cuánto le entregas al dueño'); return }
    if (needsNote && !differenceNote.trim()) {
      showStatus('error', 'Hay un descuadre — escribe una nota explicando la diferencia')
      return
    }
    setSaving(true)
    const res = await fetch('/api/worker/cash-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: worker.id,
        shift,
        opening_fund:      n(openingFund),
        puve_cash:         n(puveCash),
        puve_transfer:     n(puveTransfer),
        didi_orders:       didiOrders,
        whatsapp_orders:   whatsappOrders,
        cancelled_orders:  cancelledOrders,
        supplier_payments: supplierPayments,
        cash_counted:      n(cashCounted),
        cash_to_owner:     n(cashToOwner),
        difference_note:   differenceNote.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { showStatus('error', json.error || 'Error al guardar'); return }
    showStatus('success', '¡Cierre registrado correctamente!')
    resetForm()
    loadData()
    setActiveTab('historial')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-white/40 text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="page-title">Cierre de Caja</h1>
        <p className="text-muted mt-1">{worker?.full_name}</p>
      </div>

      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${
          status.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
            : 'bg-red-500/20 border-red-400/30 text-red-300'
        }`}>{status.msg}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['form', 'historial'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/50 hover:text-white'
            }`}>
            {tab === 'form' ? '💰 Registrar' : '📋 Historial'}
          </button>
        ))}
      </div>

      {/* ── FORMULARIO ── */}
      {activeTab === 'form' && (
        <div className="space-y-4">

          {/* Turno */}
          <SectionCard title="Turno">
            <div className="flex gap-2">
              {(['morning', 'afternoon'] as const).map((s) => (
                <button key={s} onClick={() => setShift(s)}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold border transition-all ${
                    shift === s
                      ? 'bg-yellow-400 text-purple-900 border-yellow-400'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}>
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Base recibida */}
          <SectionCard title="Base recibida">
            {suggestedBase > 0 && openingFund === String(suggestedBase) && (
              <p className="text-yellow-400/70 text-xs">✓ Pre-cargada del cierre anterior: {formatCOP(suggestedBase)}</p>
            )}
            <div>
              <label className="label">Efectivo recibido al iniciar turno</label>
              <NumberInput value={openingFund} onChange={setOpeningFund} />
            </div>
          </SectionCard>

          {/* Ventas Puve */}
          <SectionCard title="Ventas Puve (sistema)">
            <div>
              <label className="label">Efectivo</label>
              <NumberInput value={puveCash} onChange={setPuveCash} />
            </div>
            <div>
              <label className="label">Transferencia</label>
              <NumberInput value={puveTransfer} onChange={setPuveTransfer} />
            </div>
            {(n(puveCash) + n(puveTransfer)) > 0 && (
              <p className="text-white/40 text-xs text-right">
                Total Puve: <span className="text-white font-semibold">{formatCOP(n(puveCash) + n(puveTransfer))}</span>
              </p>
            )}
          </SectionCard>

          {/* Pedidos Didi */}
          <SectionCard title="Pedidos Didi">
            <p className="text-white/40 text-xs">Pedidos que pagaron en el local pero no quedan en Puve</p>
            {didiOrders.map((o, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/60 text-xs font-semibold">Pedido #{i + 1}</p>
                  <button onClick={() => setDidiOrders(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                    Eliminar
                  </button>
                </div>
                <div>
                  <label className="label">No. de pedido Didi</label>
                  <input type="text" value={o.order_id} placeholder="Ej: 1234567"
                    onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, order_id: e.target.value } : x))}
                    className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Efectivo</label>
                    <input type="number" min="0" value={o.cash || ''}
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, cash: n(e.target.value) } : x))}
                      placeholder="0" className="input-field" />
                  </div>
                  <div>
                    <label className="label">Transferencia</label>
                    <input type="number" min="0" value={o.transfer || ''}
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfer: n(e.target.value) } : x))}
                      placeholder="0" className="input-field" />
                  </div>
                </div>
                <p className="text-white/40 text-xs text-right">
                  Total: <span className="text-white font-semibold">{formatCOP((n(String(o.cash)) + n(String(o.transfer))))}</span>
                </p>
              </div>
            ))}
            {didiOrders.length > 0 && (
              <p className="text-white/50 text-xs text-right">
                Total Didi: <span className="text-yellow-400 font-bold">{formatCOP(didiCash + didiTransfer)}</span>
              </p>
            )}
            <AddRowButton onClick={() => setDidiOrders(prev => [...prev, { order_id: '', cash: 0, transfer: 0 }])} />
          </SectionCard>

          {/* Pedidos WhatsApp */}
          <SectionCard title="Pedidos WhatsApp">
            <p className="text-white/40 text-xs">Pagaron en el local en efectivo, no subidos a Puve</p>
            {whatsappOrders.map((o, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/60 text-xs font-semibold">Pedido #{i + 1}</p>
                  <button onClick={() => setWhatsappOrders(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                    Eliminar
                  </button>
                </div>
                <div>
                  <label className="label">Valor</label>
                  <input type="number" min="0" value={o.amount || ''}
                    onChange={e => setWhatsappOrders(prev => prev.map((x, j) => j === i ? { amount: n(e.target.value) } : x))}
                    placeholder="0" className="input-field" />
                </div>
              </div>
            ))}
            {whatsappOrders.length > 0 && (
              <p className="text-white/50 text-xs text-right">
                Total WhatsApp: <span className="text-yellow-400 font-bold">{formatCOP(whatsappTotal)}</span>
              </p>
            )}
            <AddRowButton onClick={() => setWhatsappOrders(prev => [...prev, { amount: 0 }])} />
          </SectionCard>

          {/* Pedidos cancelados / error Puve */}
          <SectionCard title="Cancelados / Error Puve">
            <p className="text-white/40 text-xs">Pedidos subidos por error o cancelados — se restan del total</p>
            {cancelledOrders.map((o, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/60 text-xs font-semibold">Ítem #{i + 1}</p>
                  <button onClick={() => setCancelledOrders(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                    Eliminar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">No. Factura Puve</label>
                    <input type="text" value={o.invoice} placeholder="Ej: F-001"
                      onChange={e => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, invoice: e.target.value } : x))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="label">Valor</label>
                    <input type="number" min="0" value={o.amount || ''}
                      onChange={e => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, amount: n(e.target.value) } : x))}
                      placeholder="0" className="input-field" />
                  </div>
                </div>
              </div>
            ))}
            {cancelledOrders.length > 0 && (
              <p className="text-white/50 text-xs text-right">
                Total a restar: <span className="text-red-400 font-bold">-{formatCOP(cancelledTotal)}</span>
              </p>
            )}
            <AddRowButton onClick={() => setCancelledOrders(prev => [...prev, { invoice: '', amount: 0 }])} />
          </SectionCard>

          {/* Pagos a proveedores */}
          <SectionCard title="Pagos a proveedores">
            <p className="text-white/40 text-xs">Salidas de efectivo de la caja</p>
            {supplierPayments.map((o, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/60 text-xs font-semibold">Pago #{i + 1}</p>
                  <button onClick={() => setSupplierPayments(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">
                    Eliminar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Descripción</label>
                    <input type="text" value={o.description} placeholder="Ej: Aceite"
                      onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="label">Valor</label>
                    <input type="number" min="0" value={o.amount || ''}
                      onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, amount: n(e.target.value) } : x))}
                      placeholder="0" className="input-field" />
                  </div>
                </div>
              </div>
            ))}
            {supplierPayments.length > 0 && (
              <p className="text-white/50 text-xs text-right">
                Total proveedores: <span className="text-red-400 font-bold">-{formatCOP(supplierTotal)}</span>
              </p>
            )}
            <AddRowButton onClick={() => setSupplierPayments(prev => [...prev, { description: '', amount: 0 }])} />
          </SectionCard>

          {/* Resumen automático */}
          <div className="card bg-white/5 space-y-2">
            <p className="text-white font-bold text-sm mb-3">Resumen de ventas</p>
            {[
              { label: 'Ventas Puve', value: n(puveCash) + n(puveTransfer), color: 'text-white' },
              { label: 'Didi', value: didiCash + didiTransfer, color: 'text-white' },
              { label: 'WhatsApp', value: whatsappTotal, color: 'text-white' },
              { label: 'Cancelados (−)', value: -cancelledTotal, color: 'text-red-400' },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className="text-white/50">{row.label}</span>
                <span className={row.color + ' font-semibold'}>{formatCOP(Math.abs(row.value))}{row.value < 0 ? ' −' : ''}</span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
              <span className="text-white/80">Total real ventas</span>
              <span className="text-yellow-400">{formatCOP(totalRealSales)}</span>
            </div>
          </div>

          {/* Conteo físico y entrega */}
          <SectionCard title="Conteo y entrega">
            <div>
              <label className="label">Efectivo contado en caja</label>
              <NumberInput value={cashCounted} onChange={setCashCounted} />
            </div>
            <div>
              <label className="label">Efectivo a entregar al dueño</label>
              <NumberInput value={cashToOwner} onChange={setCashToOwner} />
            </div>

            {cashCounted !== '' && (
              <div className="bg-white/5 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>Efectivo esperado</span>
                  <span className="text-white font-semibold">{formatCOP(expectedCash)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-white/10 pt-2">
                  <span className="text-white/80">Diferencia</span>
                  <DiffBadge diff={difference ?? 0} />
                </div>
                {nextBase !== null && (
                  <div className="flex justify-between text-white/60 border-t border-white/10 pt-2">
                    <span>Base siguiente día</span>
                    <span className="text-emerald-400 font-bold">{formatCOP(nextBase)}</span>
                  </div>
                )}
              </div>
            )}

            {needsNote && (
              <div>
                <label className="label">Nota de descuadre <span className="text-red-400">*</span></label>
                <textarea rows={3} value={differenceNote} onChange={e => setDifferenceNote(e.target.value)}
                  placeholder="Explica la diferencia..."
                  className="input-field resize-none" />
              </div>
            )}
          </SectionCard>

          <button onClick={handleSubmit} disabled={saving} className="btn-primary w-full">
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
          ) : registers.map((r) => (
            <div key={r.id} className="card space-y-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">{SHIFT_LABELS[r.shift]}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {format(parseISO(r.register_date), "d 'de' MMMM, yyyy", { locale: es })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm">{formatCOP(r.total_real_sales)}</span>
                  <DiffBadge diff={r.difference} />
                  <span className="text-white/30 text-xs">{expandedId === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Base recibida',    value: r.opening_fund },
                      { label: 'Puve efectivo',     value: r.puve_cash },
                      { label: 'Puve transferencia',value: r.puve_transfer },
                      { label: 'Didi efectivo',     value: r.didi_cash_total },
                      { label: 'Didi transf.',      value: r.didi_transfer_total },
                      { label: 'WhatsApp',          value: r.whatsapp_total },
                      { label: 'Cancelados (−)',     value: r.cancelled_total },
                      { label: 'Proveedores (−)',    value: r.supplier_total },
                      { label: 'Efectivo esperado', value: r.expected_cash },
                      { label: 'Efectivo contado',  value: r.cash_counted },
                      { label: 'Entregado al dueño',value: r.cash_to_owner },
                      { label: 'Base sig. día',     value: r.next_base },
                    ].map(item => (
                      <div key={item.label} className="bg-white/5 rounded-xl px-3 py-2">
                        <p className="text-white/40 text-xs">{item.label}</p>
                        <p className="text-white font-semibold text-sm">{formatCOP(item.value)}</p>
                      </div>
                    ))}
                  </div>

                  {r.didi_orders?.length > 0 && (
                    <div>
                      <p className="text-white/40 text-xs font-semibold mb-1">Pedidos Didi</p>
                      {r.didi_orders.map((o, i) => (
                        <div key={i} className="bg-white/5 rounded-xl px-3 py-2 mb-1 text-xs">
                          <span className="text-white/60">#{o.order_id} — </span>
                          <span className="text-white">Ef: {formatCOP(o.cash)} / Tr: {formatCOP(o.transfer)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.cancelled_orders?.length > 0 && (
                    <div>
                      <p className="text-white/40 text-xs font-semibold mb-1">Cancelados</p>
                      {r.cancelled_orders.map((o, i) => (
                        <div key={i} className="bg-white/5 rounded-xl px-3 py-2 mb-1 text-xs">
                          <span className="text-white/60">Factura {o.invoice} — </span>
                          <span className="text-red-400">{formatCOP(o.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.supplier_payments?.length > 0 && (
                    <div>
                      <p className="text-white/40 text-xs font-semibold mb-1">Proveedores</p>
                      {r.supplier_payments.map((o, i) => (
                        <div key={i} className="bg-white/5 rounded-xl px-3 py-2 mb-1 text-xs">
                          <span className="text-white/60">{o.description} — </span>
                          <span className="text-red-400">{formatCOP(o.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.difference_note && (
                    <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-yellow-300 text-xs font-semibold mb-0.5">Nota de descuadre</p>
                      <p className="text-white/80 text-xs">{r.difference_note}</p>
                    </div>
                  )}

                  <p className="text-white/25 text-xs">
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
