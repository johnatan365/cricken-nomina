'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/types'

type Shift = 'morning' | 'afternoon'

const BILL_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50]

type BillCount = { denomination: number; quantity: string }
type Transfer  = { amount: string }
type DidiItem  = { order_id: string; cash: string; transfers: Transfer[] }
type WhatsappItem   = { amount: string }
type CancelledItem  = { invoice: string; amount: string }
type SupplierItem   = { description: string; amount: string }

type CashRegister = {
  id: string; shift: Shift; register_date: string
  opening_fund: number; puve_cash: number; puve_transfer: number
  didi_cash_total: number; didi_transfer_total: number
  whatsapp_total: number; cancelled_total: number; supplier_total: number
  total_real_sales: number; expected_cash: number
  cash_counted: number; cash_to_owner: number; next_base: number
  difference: number; difference_note: string | null; submitted_at: string
  bill_counts: BillCount[]; puve_transfers: Transfer[]
  didi_orders: DidiItem[]; whatsapp_orders: WhatsappItem[]
  cancelled_orders: CancelledItem[]; supplier_payments: SupplierItem[]
}

const n = (v: string | number) => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
const SHIFT_LABELS: Record<Shift, string> = { morning: '☀️ Turno Mañana', afternoon: '🌙 Turno Tarde' }

function Col({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="bg-yellow-400 text-purple-900 font-bold text-xs text-center py-2 px-3 rounded-t-xl">{title}</div>
      <div className="bg-white/8 border border-white/10 border-t-0 rounded-b-xl flex-1 p-3 space-y-2">
        {children}
      </div>
    </div>
  )
}

function SmallInput({ value, onChange, placeholder, type = 'number', className = '' }:
  { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '0'} min={type === 'number' ? '0' : undefined}
      className={`w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-yellow-400/60 transition-all ${className}`}
    />
  )
}

function TotalRow({ label, value, color = 'text-yellow-400', border = true }:
  { label: string; value: number; color?: string; border?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-xs font-bold py-1 ${border ? 'border-t border-white/15 mt-1 pt-2' : ''}`}>
      <span className="text-white/70">{label}</span>
      <span className={color}>{formatCOP(value)}</span>
    </div>
  )
}

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 1) return <span className="text-emerald-400 font-bold">✓ Cuadrado</span>
  if (diff > 0) return <span className="text-yellow-400 font-bold">+{formatCOP(diff)} sobrante</span>
  return <span className="text-red-400 font-bold">{formatCOP(diff)} faltante</span>
}

export default function CierreCajaPage() {
  const [worker, setWorker] = useState<{ id: string; full_name: string } | null>(null)
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [suggestedBase, setSuggestedBase] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'form' | 'historial'>('form')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form
  const [shift, setShift] = useState<Shift>('morning')
  const [openingFund, setOpeningFund] = useState('')
  const [billCounts, setBillCounts] = useState<BillCount[]>(
    BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' }))
  )
  const [puveTransfers, setPuveTransfers] = useState<Transfer[]>([{ amount: '' }])
  const [didiOrders, setDidiOrders] = useState<DidiItem[]>([])
  const [whatsappOrders, setWhatsappOrders] = useState<WhatsappItem[]>([])
  const [cancelledOrders, setCancelledOrders] = useState<CancelledItem[]>([])
  const [supplierPayments, setSupplierPayments] = useState<SupplierItem[]>([])
  const [cashToOwner, setCashToOwner] = useState('')
  const [differenceNote, setDifferenceNote] = useState('')

  // Cálculos
  const cashCounted     = billCounts.reduce((s, b) => s + b.denomination * n(b.quantity), 0)
  const puveCash        = cashCounted  // el efectivo ES el conteo de billetes
  const puveTransTotal  = puveTransfers.reduce((s, t) => s + n(t.amount), 0)
  const didiCash        = didiOrders.reduce((s, o) => s + n(o.cash), 0)
  const didiTransTotal  = didiOrders.reduce((s, o) => o.transfers.reduce((ss, t) => ss + n(t.amount), s), 0)
  const whatsappTotal   = whatsappOrders.reduce((s, o) => s + n(o.amount), 0)
  const cancelledTotal  = cancelledOrders.reduce((s, o) => s + n(o.amount), 0)
  const supplierTotal   = supplierPayments.reduce((s, o) => s + n(o.amount), 0)

  const totalRealSales  = puveTransTotal + didiCash + didiTransTotal + whatsappTotal - cancelledTotal
    + cashCounted  // efectivo Puve = billetes contados
  const expectedCash    = n(openingFund) + cashCounted + didiCash + whatsappTotal - supplierTotal
  const difference      = cashCounted - expectedCash
  const nextBase        = cashToOwner !== '' ? cashCounted - n(cashToOwner) : null
  const needsNote       = Math.abs(difference) >= 1 && cashCounted > 0

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)
    const res = await fetch('/api/worker/cash-register?worker_id=' + w.id)
    const json = await res.json()
    setRegisters(json.registers || [])
    if (json.suggestedBase > 0) {
      setSuggestedBase(json.suggestedBase)
      setOpeningFund(String(json.suggestedBase))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'success' | 'error', msg: string) {
    setStatusMsg({ type, msg })
    setTimeout(() => setStatusMsg(null), 5000)
  }

  function resetForm() {
    setBillCounts(BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' })))
    setPuveTransfers([{ amount: '' }])
    setDidiOrders([]); setWhatsappOrders([])
    setCancelledOrders([]); setSupplierPayments([])
    setCashToOwner(''); setDifferenceNote('')
  }

  async function handleSubmit() {
    if (!worker) return
    if (cashCounted === 0) { showMsg('error', 'Registra el conteo de billetes'); return }
    if (cashToOwner === '') { showMsg('error', 'Ingresa cuánto le entregas al dueño'); return }
    if (needsNote && !differenceNote.trim()) {
      showMsg('error', 'Hay un descuadre — escribe una nota'); return
    }
    setSaving(true)
    const res = await fetch('/api/worker/cash-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: worker.id, shift,
        opening_fund:    n(openingFund),
        puve_cash:       cashCounted,
        puve_transfer:   puveTransTotal,
        didi_orders:     didiOrders,
        whatsapp_orders: whatsappOrders,
        cancelled_orders: cancelledOrders,
        supplier_payments: supplierPayments,
        cash_counted:    cashCounted,
        cash_to_owner:   n(cashToOwner),
        difference_note: differenceNote.trim() || null,
        bill_counts:     billCounts,
        puve_transfers:  puveTransfers,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { showMsg('error', json.error || 'Error al guardar'); return }
    showMsg('success', '¡Cierre registrado!')
    resetForm(); loadData(); setActiveTab('historial')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-white/40 text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Cierre de Caja</h1>
          <p className="text-muted mt-0.5">{worker?.full_name}</p>
        </div>
        <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
          {(['form', 'historial'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/50 hover:text-white'
              }`}>
              {tab === 'form' ? '💰 Nuevo cierre' : '📋 Historial'}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${
          statusMsg.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
            : 'bg-red-500/20 border-red-400/30 text-red-300'
        }`}>{statusMsg.msg}</div>
      )}

      {/* ── FORMULARIO ── */}
      {activeTab === 'form' && (
        <div className="space-y-4">

          {/* Turno + Base */}
          <div className="flex items-center gap-4 bg-white/8 border border-white/10 rounded-2xl px-5 py-3">
            <div className="flex gap-2">
              {(['morning', 'afternoon'] as const).map(s => (
                <button key={s} onClick={() => setShift(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                    shift === s ? 'bg-yellow-400 text-purple-900 border-yellow-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}>{SHIFT_LABELS[s]}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-4">
              <label className="text-white/50 text-xs font-semibold whitespace-nowrap">Base recibida:</label>
              <input type="number" min="0" value={openingFund} onChange={e => setOpeningFund(e.target.value)}
                className="w-36 bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all"
                placeholder="0" />
              {suggestedBase > 0 && openingFund === String(suggestedBase) && (
                <span className="text-yellow-400/60 text-xs">✓ del cierre anterior</span>
              )}
            </div>
          </div>

          {/* Grid principal — 5 columnas */}
          <div className="grid grid-cols-5 gap-3 items-start">

            {/* COL 1: Efectivo en caja (billetes) */}
            <Col title="Efectivo en Caja">
              <div className="grid grid-cols-3 gap-1 mb-1">
                <span className="text-white/40 text-xs font-semibold">Billete</span>
                <span className="text-white/40 text-xs font-semibold text-center">Cant.</span>
                <span className="text-white/40 text-xs font-semibold text-right">Total</span>
              </div>
              {billCounts.map((b, i) => (
                <div key={b.denomination} className="grid grid-cols-3 gap-1 items-center">
                  <span className="text-white/70 text-xs">${(b.denomination / 1000).toFixed(0)}k</span>
                  <input
                    type="number" min="0" value={b.quantity}
                    onChange={e => setBillCounts(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                    className="bg-white/10 border border-white/15 rounded-md px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-yellow-400/60 w-full"
                    placeholder="0"
                  />
                  <span className="text-white text-xs text-right font-semibold">
                    {n(b.quantity) > 0 ? formatCOP(b.denomination * n(b.quantity)) : '—'}
                  </span>
                </div>
              ))}
              <TotalRow label="Total efectivo" value={cashCounted} color="text-yellow-400" />
            </Col>

            {/* COL 2: Transferencias Puve */}
            <Col title="Transferencias Puve">
              {puveTransfers.map((t, i) => (
                <SmallInput key={i} type="number" value={t.amount}
                  onChange={v => setPuveTransfers(prev => prev.map((x, j) => j === i ? { amount: v } : x))}
                  placeholder="$ valor" />
              ))}
              <button onClick={() => setPuveTransfers(prev => [...prev, { amount: '' }])}
                className="w-full py-1 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 hover:border-yellow-400/30 rounded-lg transition-all">
                + agregar
              </button>
              <TotalRow label="Total transf. Puve" value={puveTransTotal} />
            </Col>

            {/* COL 3: Didi */}
            <Col title="Pedidos Didi">
              {didiOrders.length === 0 && (
                <p className="text-white/25 text-xs text-center py-2">Sin pedidos Didi</p>
              )}
              {didiOrders.map((o, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-xs">Pedido #{i + 1}</span>
                    <button onClick={() => setDidiOrders(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/50 hover:text-red-400 text-xs">✕</button>
                  </div>
                  <SmallInput type="text" value={o.order_id} placeholder="No. pedido"
                    onChange={v => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, order_id: v } : x))} />
                  <SmallInput type="number" value={o.cash} placeholder="$ efectivo"
                    onChange={v => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, cash: v } : x))} />
                  <div className="space-y-1">
                    {o.transfers.map((t, ti) => (
                      <div key={ti} className="flex gap-1">
                        <SmallInput type="number" value={t.amount} placeholder="$ transf."
                          onChange={v => setDidiOrders(prev => prev.map((x, j) => j === i
                            ? { ...x, transfers: x.transfers.map((tt, tj) => tj === ti ? { amount: v } : tt) }
                            : x))} />
                        <button onClick={() => setDidiOrders(prev => prev.map((x, j) => j === i
                          ? { ...x, transfers: x.transfers.filter((_, tj) => tj !== ti) } : x))}
                          className="text-red-400/40 hover:text-red-400 text-xs px-1">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setDidiOrders(prev => prev.map((x, j) => j === i
                      ? { ...x, transfers: [...x.transfers, { amount: '' }] } : x))}
                      className="w-full text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-md py-0.5 transition-all">
                      + transf.
                    </button>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t border-white/10">
                    <span className="text-white/40">Subtotal</span>
                    <span className="text-white font-semibold">
                      {formatCOP(n(o.cash) + o.transfers.reduce((s, t) => s + n(t.amount), 0))}
                    </span>
                  </div>
                </div>
              ))}
              <button onClick={() => setDidiOrders(prev => [...prev, { order_id: '', cash: '', transfers: [] }])}
                className="w-full py-1 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 hover:border-yellow-400/30 rounded-lg transition-all">
                + agregar pedido
              </button>
              {didiOrders.length > 0 && (
                <>
                  <TotalRow label="Didi efectivo" value={didiCash} border={false} color="text-white" />
                  <TotalRow label="Didi transf." value={didiTransTotal} border={false} color="text-white" />
                  <TotalRow label="Total Didi" value={didiCash + didiTransTotal} />
                </>
              )}
            </Col>

            {/* COL 4: WhatsApp + Cancelados */}
            <Col title="WhatsApp / Cancelados">
              <p className="text-white/40 text-xs font-semibold">Pedidos WhatsApp (efectivo)</p>
              {whatsappOrders.map((o, i) => (
                <div key={i} className="flex gap-1">
                  <SmallInput type="number" value={o.amount} placeholder="$ valor"
                    onChange={v => setWhatsappOrders(prev => prev.map((x, j) => j === i ? { amount: v } : x))} />
                  <button onClick={() => setWhatsappOrders(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400/40 hover:text-red-400 text-xs px-1">✕</button>
                </div>
              ))}
              <button onClick={() => setWhatsappOrders(prev => [...prev, { amount: '' }])}
                className="w-full py-1 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 hover:border-yellow-400/30 rounded-lg transition-all">
                + agregar
              </button>
              {whatsappTotal > 0 && <TotalRow label="Total WhatsApp" value={whatsappTotal} />}

              <div className="border-t border-white/10 pt-2 mt-2">
                <p className="text-white/40 text-xs font-semibold mb-2">Cancelados / Error Puve</p>
                {cancelledOrders.map((o, i) => (
                  <div key={i} className="space-y-1 mb-2">
                    <div className="flex gap-1">
                      <SmallInput type="text" value={o.invoice} placeholder="No. factura"
                        onChange={v => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, invoice: v } : x))} />
                      <button onClick={() => setCancelledOrders(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs px-1">✕</button>
                    </div>
                    <SmallInput type="number" value={o.amount} placeholder="$ valor"
                      onChange={v => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} />
                  </div>
                ))}
                <button onClick={() => setCancelledOrders(prev => [...prev, { invoice: '', amount: '' }])}
                  className="w-full py-1 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 hover:border-yellow-400/30 rounded-lg transition-all">
                  + agregar
                </button>
                {cancelledTotal > 0 && <TotalRow label="Total cancelados (−)" value={cancelledTotal} color="text-red-400" />}
              </div>
            </Col>

            {/* COL 5: Proveedores + Resumen */}
            <Col title="Proveedores / Cierre">
              <p className="text-white/40 text-xs font-semibold">Pagos a proveedores</p>
              {supplierPayments.map((o, i) => (
                <div key={i} className="space-y-1 mb-2">
                  <div className="flex gap-1">
                    <SmallInput type="text" value={o.description} placeholder="Descripción"
                      onChange={v => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, description: v } : x))} />
                    <button onClick={() => setSupplierPayments(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/40 hover:text-red-400 text-xs px-1">✕</button>
                  </div>
                  <SmallInput type="number" value={o.amount} placeholder="$ valor"
                    onChange={v => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} />
                </div>
              ))}
              <button onClick={() => setSupplierPayments(prev => [...prev, { description: '', amount: '' }])}
                className="w-full py-1 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 hover:border-yellow-400/30 rounded-lg transition-all">
                + agregar
              </button>
              {supplierTotal > 0 && <TotalRow label="Total proveedores (−)" value={supplierTotal} color="text-red-400" />}

              {/* Resumen cierre */}
              <div className="border-t border-white/10 pt-3 mt-2 space-y-1.5">
                <p className="text-yellow-400 text-xs font-bold mb-2">RESUMEN CIERRE</p>
                <div className="flex justify-between text-xs"><span className="text-white/50">Total ventas real</span><span className="text-white font-bold">{formatCOP(totalRealSales)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-white/50">Efectivo contado</span><span className="text-white font-bold">{formatCOP(cashCounted)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-white/50">Efectivo esperado</span><span className="text-white font-bold">{formatCOP(expectedCash)}</span></div>
                <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                  <span className="text-white/70 font-bold">Diferencia</span>
                  <DiffBadge diff={difference} />
                </div>

                <div className="pt-2">
                  <label className="text-white/40 text-xs font-semibold block mb-1">Entregar al dueño</label>
                  <input type="number" min="0" value={cashToOwner} onChange={e => setCashToOwner(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all" />
                </div>

                {nextBase !== null && (
                  <div className="flex justify-between text-xs bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-2 py-1.5">
                    <span className="text-emerald-300/80 font-bold">Base sig. día</span>
                    <span className="text-emerald-400 font-bold">{formatCOP(nextBase)}</span>
                  </div>
                )}

                {needsNote && (
                  <div>
                    <label className="text-white/40 text-xs font-semibold block mb-1">Nota descuadre <span className="text-red-400">*</span></label>
                    <textarea rows={2} value={differenceNote} onChange={e => setDifferenceNote(e.target.value)}
                      placeholder="Explica la diferencia..."
                      className="w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-yellow-400/60 resize-none transition-all" />
                  </div>
                )}

                <button onClick={handleSubmit} disabled={saving}
                  className="btn-primary w-full mt-2 !py-2 !text-sm">
                  {saving ? 'Guardando...' : '✓ Enviar cierre'}
                </button>
              </div>
            </Col>
          </div>
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
          ) : registers.map(r => (
            <div key={r.id} className="card cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">{SHIFT_LABELS[r.shift]}</p>
                  <p className="text-muted text-xs mt-0.5">{format(parseISO(r.register_date), "d 'de' MMMM, yyyy", { locale: es })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-white/40 text-xs">Ventas reales</p>
                    <p className="text-white font-bold">{formatCOP(r.total_real_sales)}</p>
                  </div>
                  <DiffBadge diff={r.difference} />
                  <span className="text-white/30 text-xs">{expandedId === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-4 gap-3 text-xs">
                  {[
                    ['Base recibida', r.opening_fund],
                    ['Efectivo contado', r.cash_counted],
                    ['Puve transferencias', r.puve_transfer],
                    ['Didi efectivo', r.didi_cash_total],
                    ['Didi transferencias', r.didi_transfer_total],
                    ['WhatsApp', r.whatsapp_total],
                    ['Cancelados (−)', r.cancelled_total],
                    ['Proveedores (−)', r.supplier_total],
                    ['Efectivo esperado', r.expected_cash],
                    ['Entregado al dueño', r.cash_to_owner],
                    ['Base sig. día', r.next_base],
                    ['Diferencia', r.difference],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/40 text-xs">{label}</p>
                      <p className="text-white font-bold">{formatCOP(Number(value))}</p>
                    </div>
                  ))}
                  {r.difference_note && (
                    <div className="col-span-4 bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
                      <p className="text-yellow-300 text-xs font-bold mb-1">Nota de descuadre</p>
                      <p className="text-white/80 text-xs">{r.difference_note}</p>
                    </div>
                  )}
                  <p className="col-span-4 text-white/25 text-xs">Enviado {format(parseISO(r.submitted_at), "d MMM, HH:mm", { locale: es })}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
