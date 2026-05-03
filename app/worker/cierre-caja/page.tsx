'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/types'

type Shift = 'morning' | 'afternoon'
const BILL_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50]
type BillCount     = { denomination: number; quantity: string }
type Transfer      = { amount: string }
type DidiItem      = { order_id: string; cash: string; transfers: Transfer[] }
type WhatsappItem  = { amount: string }
type CancelledItem = { invoice: string; amount: string }
type SupplierItem  = { description: string; amount: string }
type CashRegister  = {
  id: string; shift: Shift; register_date: string
  opening_fund: number; puve_cash: number; puve_transfer: number
  puve_total_reported: number
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
const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
const SHIFT_LABELS: Record<Shift, string> = { morning: '☀️ Turno Mañana', afternoon: '🌙 Turno Tarde' }
const DRAFT_KEY = 'cricken_cierre_draft_v2'

function saveDraft(data: object) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })) } catch {}
}
function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="bg-yellow-400 text-purple-900 font-bold text-xs text-center py-2 px-2 rounded-t-xl whitespace-nowrap">{title}</div>
      <div className="bg-white/8 border border-white/10 border-t-0 rounded-b-xl flex-1 p-2.5 space-y-1.5">
        {children}
      </div>
    </div>
  )
}

function TotalRow({ label, value, color = 'text-yellow-400', border = true }: { label: string; value: number; color?: string; border?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-xs font-bold py-1 ${border ? 'border-t border-white/15 mt-1 pt-2' : ''}`}>
      <span className="text-white/70">{label}</span>
      <span className={color}>{cop(value)}</span>
    </div>
  )
}

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 1) return <span className="text-emerald-400 font-bold">✓ Cuadrado</span>
  if (diff > 0) return <span className="text-yellow-400 font-bold">+{cop(diff)} sobrante</span>
  return <span className="text-red-400 font-bold">{cop(diff)} faltante</span>
}

const inp = "w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-yellow-400/70 focus:bg-white/15 transition-all"

export default function CierreCajaPage() {
  const [worker, setWorker]               = useState<{ id: string; full_name: string } | null>(null)
  const [registers, setRegisters]         = useState<CashRegister[]>([])
  const [suggestedBase, setSuggestedBase] = useState(0)
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [statusMsg, setStatusMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activeTab, setActiveTab]         = useState<'form' | 'historial'>('form')
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(false)

  // Form state
  const [shift, setShift]                       = useState<Shift>('morning')
  const [openingFund, setOpeningFund]           = useState('')
  const [puveTotalReported, setPuveTotalReported] = useState('')
  const [billCounts, setBillCounts]             = useState<BillCount[]>(BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' })))
  const [puveTransfers, setPuveTransfers]       = useState<Transfer[]>([{ amount: '' }])
  const [didiOrders, setDidiOrders]             = useState<DidiItem[]>([])
  const [whatsappOrders, setWhatsappOrders]     = useState<WhatsappItem[]>([])
  const [cancelledOrders, setCancelledOrders]   = useState<CancelledItem[]>([])
  const [supplierPayments, setSupplierPayments] = useState<SupplierItem[]>([])
  const [cashToOwner, setCashToOwner]           = useState('')
  const [differenceNote, setDifferenceNote]     = useState('')

  // Refs para foco con Enter
  const billRefs         = useRef<(HTMLInputElement | null)[]>([])
  const puveTransRefs    = useRef<(HTMLInputElement | null)[]>([])
  const whatsappRefs     = useRef<(HTMLInputElement | null)[]>([])
  const cancelInvRefs    = useRef<(HTMLInputElement | null)[]>([])
  const cancelAmtRefs    = useRef<(HTMLInputElement | null)[]>([])
  const supplierDescRefs = useRef<(HTMLInputElement | null)[]>([])
  const supplierAmtRefs  = useRef<(HTMLInputElement | null)[]>([])
  const didiIdRefs       = useRef<(HTMLInputElement | null)[]>([])
  const didiCashRefs     = useRef<(HTMLInputElement | null)[]>([])

  // Cálculos
  const cashCounted    = billCounts.reduce((s, b) => s + b.denomination * n(b.quantity), 0)
  const puveTransTotal = puveTransfers.reduce((s, t) => s + n(t.amount), 0)
  const didiCash       = didiOrders.reduce((s, o) => s + n(o.cash), 0)
  const didiTransTotal = didiOrders.reduce((s, o) => o.transfers.reduce((ss, t) => ss + n(t.amount), s), 0)
  const whatsappTotal  = whatsappOrders.reduce((s, o) => s + n(o.amount), 0)
  const cancelledTotal = cancelledOrders.reduce((s, o) => s + n(o.amount), 0)
  const supplierTotal  = supplierPayments.reduce((s, o) => s + n(o.amount), 0)
  const totalRealSales = cashCounted + puveTransTotal + didiCash + didiTransTotal + whatsappTotal - cancelledTotal
  const expectedCash   = n(openingFund) + cashCounted + didiCash + whatsappTotal - supplierTotal
  const difference     = cashCounted - expectedCash
  const nextBase       = cashToOwner !== '' ? cashCounted - n(cashToOwner) : null
  const needsNote      = Math.abs(difference) >= 1 && cashCounted > 0

  // Verificación Total Puve reportado vs calculado
  const puveCalculado  = cashCounted + puveTransTotal
  const puveDiff       = puveTotalReported !== '' ? n(puveTotalReported) - puveCalculado : null
  const puveOk         = puveDiff === null || Math.abs(puveDiff) < 1

  // Cargar borrador al montar
  useEffect(() => {
    const draft = loadDraft()
    if (!draft) return
    if (draft.shift)              setShift(draft.shift)
    if (draft.openingFund)        setOpeningFund(draft.openingFund)
    if (draft.puveTotalReported)  setPuveTotalReported(draft.puveTotalReported)
    if (draft.billCounts)         setBillCounts(draft.billCounts)
    if (draft.puveTransfers)      setPuveTransfers(draft.puveTransfers)
    if (draft.didiOrders)         setDidiOrders(draft.didiOrders)
    if (draft.whatsappOrders)     setWhatsappOrders(draft.whatsappOrders)
    if (draft.cancelledOrders)    setCancelledOrders(draft.cancelledOrders)
    if (draft.supplierPayments)   setSupplierPayments(draft.supplierPayments)
    if (draft.cashToOwner)        setCashToOwner(draft.cashToOwner)
    if (draft.differenceNote)     setDifferenceNote(draft.differenceNote)
    setDraftRestored(true)
  }, [])

  // Autosave
  useEffect(() => {
    saveDraft({ shift, openingFund, puveTotalReported, billCounts, puveTransfers, didiOrders, whatsappOrders, cancelledOrders, supplierPayments, cashToOwner, differenceNote })
  }, [shift, openingFund, puveTotalReported, billCounts, puveTransfers, didiOrders, whatsappOrders, cancelledOrders, supplierPayments, cashToOwner, differenceNote])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)
    const res  = await fetch('/api/worker/cash-register?worker_id=' + w.id)
    const json = await res.json()
    setRegisters(json.registers || [])
    if (json.suggestedBase > 0 && !loadDraft()?.openingFund) {
      setSuggestedBase(json.suggestedBase)
      setOpeningFund(String(json.suggestedBase))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'success' | 'error', msg: string) {
    setStatusMsg({ type, msg })
    setTimeout(() => setStatusMsg(null), 6000)
  }

  function resetForm() {
    setShift('morning'); setOpeningFund(''); setPuveTotalReported('')
    setBillCounts(BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' })))
    setPuveTransfers([{ amount: '' }])
    setDidiOrders([]); setWhatsappOrders([])
    setCancelledOrders([]); setSupplierPayments([])
    setCashToOwner(''); setDifferenceNote('')
    setDraftRestored(false); clearDraft()
  }

  // ── Handlers Enter ──────────────────────────────
  function onBillEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    billRefs.current[i + 1]?.focus()
  }
  function onPuveTransEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= puveTransfers.length) {
      setPuveTransfers(prev => { const u = [...prev, { amount: '' }]; setTimeout(() => puveTransRefs.current[i + 1]?.focus(), 30); return u })
    } else { puveTransRefs.current[i + 1]?.focus() }
  }
  function onWhatsappEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= whatsappOrders.length) {
      setWhatsappOrders(prev => { const u = [...prev, { amount: '' }]; setTimeout(() => whatsappRefs.current[i + 1]?.focus(), 30); return u })
    } else { whatsappRefs.current[i + 1]?.focus() }
  }
  function onCancelInvEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); cancelAmtRefs.current[i]?.focus()
  }
  function onCancelAmtEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= cancelledOrders.length) {
      setCancelledOrders(prev => { const u = [...prev, { invoice: '', amount: '' }]; setTimeout(() => cancelInvRefs.current[i + 1]?.focus(), 30); return u })
    } else { cancelInvRefs.current[i + 1]?.focus() }
  }
  function onSupplierDescEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); supplierAmtRefs.current[i]?.focus()
  }
  function onSupplierAmtEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= supplierPayments.length) {
      setSupplierPayments(prev => { const u = [...prev, { description: '', amount: '' }]; setTimeout(() => supplierDescRefs.current[i + 1]?.focus(), 30); return u })
    } else { supplierDescRefs.current[i + 1]?.focus() }
  }
  function onDidiIdEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); didiCashRefs.current[i]?.focus()
  }
  function onDidiCashEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= didiOrders.length) {
      setDidiOrders(prev => { const u = [...prev, { order_id: '', cash: '', transfers: [] }]; setTimeout(() => didiIdRefs.current[i + 1]?.focus(), 30); return u })
    } else { didiIdRefs.current[i + 1]?.focus() }
  }

  async function handleSubmit() {
    if (!worker) return
    if (cashCounted === 0)   { showMsg('error', 'Registra el conteo de billetes'); return }
    if (cashToOwner === '')  { showMsg('error', 'Ingresa cuánto vas a dejar en el sobre'); return }
    if (!puveOk)             { showMsg('error', `El Total Puve no coincide — hay una diferencia de ${cop(Math.abs(puveDiff!))}. Verifica antes de enviar.`); return }
    if (needsNote && !differenceNote.trim()) { showMsg('error', 'Hay un descuadre — escribe una nota'); return }
    setSaving(true)
    const res = await fetch('/api/worker/cash-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: worker.id, shift,
        opening_fund: n(openingFund),
        puve_cash: cashCounted, puve_transfer: puveTransTotal,
        puve_total_reported: n(puveTotalReported),
        didi_orders: didiOrders, whatsapp_orders: whatsappOrders,
        cancelled_orders: cancelledOrders, supplier_payments: supplierPayments,
        cash_counted: cashCounted, cash_to_owner: n(cashToOwner),
        difference_note: differenceNote.trim() || null,
        bill_counts: billCounts, puve_transfers: puveTransfers,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { showMsg('error', json.error || 'Error al guardar'); return }
    showMsg('success', '¡Cierre registrado correctamente!')
    resetForm(); loadData(); setActiveTab('historial')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-white/40 text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-full mx-auto">

      {/* Header con hamburguesa para el sidebar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
            title="Mostrar/ocultar menú"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div>
            <h1 className="page-title">Cierre de Caja</h1>
            <p className="text-muted text-xs mt-0.5">{worker?.full_name}</p>
          </div>
        </div>
        <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
          {(['form', 'historial'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/50 hover:text-white'}`}>
              {tab === 'form' ? '💰 Registrar' : '📋 Historial'}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${statusMsg.type === 'success' ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' : 'bg-red-500/20 border-red-400/30 text-red-300'}`}>
          {statusMsg.msg}
        </div>
      )}

      {activeTab === 'form' && (
        <div className="space-y-4">
          {draftRestored && (
            <div className="rounded-2xl px-4 py-2.5 text-xs font-semibold border bg-purple-500/20 border-purple-400/30 text-purple-200 flex items-center gap-2">
              <span>⚡</span>
              <span>Borrador recuperado — continuás donde lo dejaste.</span>
              <button onClick={resetForm} className="ml-auto text-purple-300 hover:text-white underline">Limpiar</button>
            </div>
          )}

          {/* Turno + Base + Total Puve */}
          <div className="flex flex-wrap items-center gap-4 bg-white/8 border border-white/10 rounded-2xl px-5 py-3">
            <div className="flex gap-2">
              {(['morning', 'afternoon'] as const).map(s => (
                <button key={s} onClick={() => setShift(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${shift === s ? 'bg-yellow-400 text-purple-900 border-yellow-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs font-semibold whitespace-nowrap">Base recibida:</label>
              <input type="number" min="0" value={openingFund} onChange={e => setOpeningFund(e.target.value)}
                className="w-32 bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all" placeholder="0" />
              {suggestedBase > 0 && openingFund === String(suggestedBase) && (
                <span className="text-yellow-400/60 text-xs">✓ anterior</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs font-semibold whitespace-nowrap">Total ventas Puve:</label>
              <input type="number" min="0" value={puveTotalReported} onChange={e => setPuveTotalReported(e.target.value)}
                className={`w-36 bg-white/10 border rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none transition-all ${
                  puveDiff === null ? 'border-white/15 focus:border-yellow-400/60'
                  : puveOk ? 'border-emerald-400/60 bg-emerald-500/10'
                  : 'border-red-400/60 bg-red-500/10'
                }`}
                placeholder="$ total Puve" />
              {puveDiff !== null && (
                <span className={`text-xs font-bold ${puveOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {puveOk ? '✓ Coincide' : `⚠ Dif: ${cop(Math.abs(puveDiff))}`}
                </span>
              )}
            </div>
          </div>

          {/* Grid columnas — overflow scroll horizontal */}
          <div className="overflow-x-auto pb-2">
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(6, minmax(180px, 1fr))', minWidth: '1100px' }}>

              {/* COL 1 — Efectivo */}
              <Col title="Efectivo en Caja">
                <div className="grid grid-cols-3 gap-1 pb-1 border-b border-white/10">
                  <span className="text-white/40 text-xs font-semibold">Billete</span>
                  <span className="text-white/40 text-xs font-semibold text-center">Cant.</span>
                  <span className="text-white/40 text-xs font-semibold text-right">Total</span>
                </div>
                {billCounts.map((b, i) => (
                  <div key={b.denomination} className="grid grid-cols-3 gap-1 items-center">
                    <span className="text-white/70 text-xs">{cop(b.denomination)}</span>
                    <input
                      ref={el => { billRefs.current[i] = el }}
                      type="number" min="0" value={b.quantity}
                      onChange={e => setBillCounts(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      onKeyDown={e => onBillEnter(e, i)}
                      placeholder="0"
                      className="bg-white/10 border border-white/15 rounded-md px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-yellow-400/70 focus:bg-white/15 transition-all w-full"
                    />
                    <span className="text-white text-xs text-right font-semibold">
                      {n(b.quantity) > 0 ? cop(b.denomination * n(b.quantity)) : '—'}
                    </span>
                  </div>
                ))}
                <TotalRow label="Total efectivo" value={cashCounted} color="text-yellow-400" />
              </Col>

              {/* COL 2 — Transferencias */}
              <Col title="Transferencias">
                <p className="text-white/30 text-xs pb-1">↵ Enter para agregar otra</p>
                {puveTransfers.map((t, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <input
                      ref={el => { puveTransRefs.current[i] = el }}
                      type="number" min="0" value={t.amount}
                      onChange={e => setPuveTransfers(prev => prev.map((x, j) => j === i ? { amount: e.target.value } : x))}
                      onKeyDown={e => onPuveTransEnter(e, i)}
                      placeholder="$ valor"
                      className={inp}
                    />
                    {puveTransfers.length > 1 && (
                      <button onClick={() => setPuveTransfers(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs flex-shrink-0 px-1 transition-all">✕</button>
                    )}
                  </div>
                ))}
                <TotalRow label="Total transferencias" value={puveTransTotal} />
              </Col>

              {/* COL 3 — Didi */}
              <Col title="Pedidos Didi">
                <p className="text-white/30 text-xs pb-1">↵ No. → Efectivo → nuevo</p>
                {didiOrders.length === 0 && <p className="text-white/20 text-xs text-center py-2">Sin pedidos Didi</p>}
                {didiOrders.map((o, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-2 space-y-1.5 border border-white/8">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-semibold">Pedido #{i + 1}</span>
                      <button onClick={() => setDidiOrders(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <input ref={el => { didiIdRefs.current[i] = el }} type="text" value={o.order_id} placeholder="No. pedido"
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, order_id: e.target.value } : x))}
                      onKeyDown={e => onDidiIdEnter(e, i)} className={inp} />
                    <input ref={el => { didiCashRefs.current[i] = el }} type="number" min="0" value={o.cash} placeholder="$ efectivo"
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, cash: e.target.value } : x))}
                      onKeyDown={e => onDidiCashEnter(e, i)} className={inp} />
                    {o.transfers.map((t, ti) => (
                      <div key={ti} className="flex gap-1">
                        <input type="number" min="0" value={t.amount} placeholder="$ transf."
                          onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: x.transfers.map((tt, tj) => tj === ti ? { amount: e.target.value } : tt) } : x))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ti === o.transfers.length - 1) setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: [...x.transfers, { amount: '' }] } : x)) } }}
                          className={inp} />
                        <button onClick={() => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: x.transfers.filter((_, tj) => tj !== ti) } : x))}
                          className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: [...x.transfers, { amount: '' }] } : x))}
                      className="w-full text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-md py-0.5 transition-all">+ transf.</button>
                    <div className="flex justify-between text-xs pt-1 border-t border-white/10">
                      <span className="text-white/40">Subtotal</span>
                      <span className="text-white font-semibold">{cop(n(o.cash) + o.transfers.reduce((s, t) => s + n(t.amount), 0))}</span>
                    </div>
                  </div>
                ))}
                <button onClick={() => { setDidiOrders(prev => [...prev, { order_id: '', cash: '', transfers: [] }]); setTimeout(() => didiIdRefs.current[didiOrders.length]?.focus(), 30) }}
                  className="w-full py-1.5 text-xs text-white/30 hover:text-yellow-400/60 border border-dashed border-white/15 rounded-lg transition-all">+ agregar pedido</button>
                {didiOrders.length > 0 && (
                  <>
                    <TotalRow label="Didi efectivo"  value={didiCash}                  border={false} color="text-white" />
                    <TotalRow label="Didi transf."   value={didiTransTotal}            border={false} color="text-white" />
                    <TotalRow label="Total Didi"     value={didiCash + didiTransTotal} />
                  </>
                )}
              </Col>

              {/* COL 4 — WhatsApp */}
              <Col title="WhatsApp">
                <p className="text-white/40 text-xs font-semibold">Pagos en efectivo</p>
                <p className="text-white/25 text-xs">↵ Enter para agregar otro</p>
                {whatsappOrders.map((o, i) => (
                  <div key={i} className="flex gap-1">
                    <input ref={el => { whatsappRefs.current[i] = el }} type="number" min="0" value={o.amount} placeholder="$ valor"
                      onChange={e => setWhatsappOrders(prev => prev.map((x, j) => j === i ? { amount: e.target.value } : x))}
                      onKeyDown={e => onWhatsappEnter(e, i)} className={inp} />
                    <button onClick={() => setWhatsappOrders(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                  </div>
                ))}
                <button onClick={() => { setWhatsappOrders(prev => [...prev, { amount: '' }]); setTimeout(() => whatsappRefs.current[whatsappOrders.length]?.focus(), 30) }}
                  className="w-full py-1 text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-lg transition-all">+ agregar</button>
                {whatsappTotal > 0 && <TotalRow label="Total WhatsApp" value={whatsappTotal} />}

                <div className="border-t border-white/10 pt-2 mt-1">
                  <p className="text-white/40 text-xs font-semibold mb-1">Cancelados / Error Puve</p>
                  <p className="text-white/25 text-xs mb-1">↵ Factura → Valor → nuevo</p>
                  {cancelledOrders.map((o, i) => (
                    <div key={i} className="space-y-1 mb-2">
                      <div className="flex gap-1">
                        <input ref={el => { cancelInvRefs.current[i] = el }} type="text" value={o.invoice} placeholder="No. factura"
                          onChange={e => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, invoice: e.target.value } : x))}
                          onKeyDown={e => onCancelInvEnter(e, i)} className={inp} />
                        <button onClick={() => setCancelledOrders(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                      </div>
                      <input ref={el => { cancelAmtRefs.current[i] = el }} type="number" min="0" value={o.amount} placeholder="$ valor"
                        onChange={e => setCancelledOrders(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        onKeyDown={e => onCancelAmtEnter(e, i)} className={inp} />
                    </div>
                  ))}
                  <button onClick={() => { setCancelledOrders(prev => [...prev, { invoice: '', amount: '' }]); setTimeout(() => cancelInvRefs.current[cancelledOrders.length]?.focus(), 30) }}
                    className="w-full py-1 text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-lg transition-all">+ agregar</button>
                  {cancelledTotal > 0 && <TotalRow label="Cancelados (−)" value={cancelledTotal} color="text-red-400" />}
                </div>
              </Col>

              {/* COL 5 — Proveedores */}
              <Col title="Proveedores">
                <p className="text-white/25 text-xs">↵ Descripción → Valor → nuevo</p>
                {supplierPayments.map((o, i) => (
                  <div key={i} className="space-y-1 mb-2">
                    <div className="flex gap-1">
                      <input ref={el => { supplierDescRefs.current[i] = el }} type="text" value={o.description} placeholder="Descripción"
                        onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                        onKeyDown={e => onSupplierDescEnter(e, i)} className={inp} />
                      <button onClick={() => setSupplierPayments(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                    </div>
                    <input ref={el => { supplierAmtRefs.current[i] = el }} type="number" min="0" value={o.amount} placeholder="$ valor"
                      onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      onKeyDown={e => onSupplierAmtEnter(e, i)} className={inp} />
                  </div>
                ))}
                <button onClick={() => { setSupplierPayments(prev => [...prev, { description: '', amount: '' }]); setTimeout(() => supplierDescRefs.current[supplierPayments.length]?.focus(), 30) }}
                  className="w-full py-1 text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-lg transition-all">+ agregar</button>
                {supplierTotal > 0 && <TotalRow label="Proveedores (−)" value={supplierTotal} color="text-red-400" />}
              </Col>

              {/* COL 6 — Resumen y Cierre */}
              <Col title="Resumen / Cierre">
                <p className="text-yellow-400 text-xs font-bold mb-1">RESUMEN</p>
                {[
                  { label: 'Efectivo contado',   value: cashCounted,              color: 'text-white' },
                  { label: 'Transferencias',      value: puveTransTotal,           color: 'text-white' },
                  { label: 'Didi',               value: didiCash + didiTransTotal, color: 'text-white' },
                  { label: 'WhatsApp',           value: whatsappTotal,            color: 'text-white' },
                  { label: 'Cancelados (−)',      value: cancelledTotal,           color: 'text-red-400' },
                  { label: 'Proveedores (−)',     value: supplierTotal,            color: 'text-red-400' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-white/50">{row.label}</span>
                    <span className={`${row.color} font-semibold`}>{cop(row.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-bold border-t border-white/15 pt-1.5 mt-1">
                  <span className="text-white/80">Total ventas real</span>
                  <span className="text-yellow-400">{cop(totalRealSales)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-white/80">Efectivo esperado</span>
                  <span className="text-white">{cop(expectedCash)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold border-t border-white/15 pt-1.5 mt-1">
                  <span className="text-white/80">Diferencia</span>
                  <DiffBadge diff={difference} />
                </div>

                {/* Verificación Total Puve */}
                {puveDiff !== null && (
                  <div className={`rounded-xl px-2 py-2 text-xs border mt-1 ${puveOk ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-red-500/10 border-red-400/20 text-red-300'}`}>
                    <p className="font-bold mb-0.5">{puveOk ? '✓ Total Puve coincide' : '⚠ Total Puve no coincide'}</p>
                    {!puveOk && <p>Puve dice {cop(n(puveTotalReported))} — calculado {cop(puveCalculado)} — dif. {cop(Math.abs(puveDiff))}</p>}
                  </div>
                )}

                <div className="pt-1">
                  <label className="text-white/40 text-xs font-semibold block mb-1">Entregar en el sobre</label>
                  <input type="number" min="0" value={cashToOwner} onChange={e => setCashToOwner(e.target.value)} placeholder="$ valor"
                    className="w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all" />
                </div>

                {nextBase !== null && (
                  <div className="flex justify-between text-xs bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-2 py-1.5">
                    <span className="text-emerald-300/80 font-bold">Base sig. día</span>
                    <span className="text-emerald-400 font-bold">{cop(nextBase)}</span>
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

                <button onClick={handleSubmit} disabled={saving} className="btn-primary w-full !py-2 !text-sm mt-1">
                  {saving ? 'Guardando...' : '✓ Enviar cierre'}
                </button>
              </Col>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIAL */}
      {activeTab === 'historial' && (
        <div className="space-y-3">
          {registers.length === 0 ? (
            <div className="card text-center py-10"><p className="text-4xl mb-3">🧾</p><p className="text-white/50 text-sm">No hay cierres aún</p></div>
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
                    <p className="text-white font-bold">{cop(r.total_real_sales)}</p>
                  </div>
                  <DiffBadge diff={r.difference} />
                  <span className="text-white/30 text-xs">{expandedId === r.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedId === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-4 gap-3">
                  {([
                    ['Base recibida', r.opening_fund], ['Efectivo contado', r.cash_counted],
                    ['Transferencias', r.puve_transfer], ['Didi efectivo', r.didi_cash_total],
                    ['Didi transf.', r.didi_transfer_total], ['WhatsApp', r.whatsapp_total],
                    ['Cancelados (−)', r.cancelled_total], ['Proveedores (−)', r.supplier_total],
                    ['Total ventas Puve', r.puve_total_reported ?? 0], ['Total ventas real', r.total_real_sales],
                    ['Efectivo esperado', r.expected_cash], ['Entregado en sobre', r.cash_to_owner],
                    ['Base sig. día', r.next_base],
                  ] as [string, number][]).map(([label, value]) => (
                    <div key={label} className="bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/40 text-xs">{label}</p>
                      <p className="text-white font-bold text-sm">{cop(Number(value))}</p>
                    </div>
                  ))}
                  {r.bill_counts?.some(b => n(b.quantity) > 0) && (
                    <div className="col-span-2 bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/40 text-xs font-semibold mb-2">Conteo de billetes</p>
                      <div className="grid grid-cols-4 gap-1">
                        {r.bill_counts.filter(b => n(b.quantity) > 0).map(b => (
                          <div key={b.denomination} className="text-xs flex gap-1">
                            <span className="text-white/50">{cop(b.denomination)}</span>
                            <span className="text-white font-bold">×{b.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.puve_transfers?.some(t => n(t.amount) > 0) && (
                    <div className="col-span-2 bg-white/5 rounded-xl px-3 py-2">
                      <p className="text-white/40 text-xs font-semibold mb-2">Transferencias</p>
                      {r.puve_transfers.filter(t => n(t.amount) > 0).map((t, i) => (
                        <p key={i} className="text-white text-xs">{cop(n(t.amount))}</p>
                      ))}
                    </div>
                  )}
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
