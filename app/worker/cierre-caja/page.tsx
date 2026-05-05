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
  supplier_payments: SupplierItem[]
}

const n = (v: string | number) => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
const SHIFT_LABELS: Record<Shift, string> = { morning: '☀️ Turno Mañana', afternoon: '🌙 Turno Tarde' }
const DRAFT_KEY = 'cricken_cierre_draft_v3'

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
      <div className="bg-yellow-400 text-purple-900 font-bold text-xs text-center py-2 px-2 rounded-t-xl">{title}</div>
      <div className="bg-white/8 border border-white/10 border-t-0 rounded-b-xl flex-1 p-2.5 space-y-1.5">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, color = 'text-white', bold = false }: { label: string; value: number; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className={bold ? 'text-white/80 font-bold' : 'text-white/50'}>{label}</span>
      <span className={`${color} ${bold ? 'font-bold' : 'font-semibold'}`}>{cop(value)}</span>
    </div>
  )
}

function Divider() { return <div className="border-t border-white/15 my-1" /> }

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 1) return <span className="text-emerald-400 font-bold text-xs">✓ Cuadrado</span>
  if (diff > 0) return <span className="text-yellow-400 font-bold text-xs">+{cop(diff)} sobrante</span>
  return <span className="text-red-400 font-bold text-xs">{cop(diff)} faltante</span>
}

const inp = "w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-yellow-400/70 focus:bg-white/15 transition-all"

export default function CierreCajaPage() {
  const [worker, setWorker]               = useState<{ id: string; full_name: string } | null>(null)
  const [registers, setRegisters]         = useState<CashRegister[]>([])
  const [suggestedBase, setSuggestedBase] = useState(0)
  const [loading, setLoading]             = useState(true)
  const [dataLoaded, setDataLoaded]       = useState(false)
  const [saving, setSaving]               = useState(false)
  const [statusMsg, setStatusMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [activeTab, setActiveTab]         = useState<'form' | 'historial'>('form')
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [draftRestored, setDraftRestored]   = useState(false)
  const [baseIsLocked, setBaseIsLocked]     = useState(false)  // true si viene de cierre anterior
  const [showBaseModal, setShowBaseModal]   = useState(false) // modal al tocar base bloqueada
  const [adminResponse, setAdminResponse]   = useState<{status: 'approved' | 'rejected'; note: string | null} | null>(null)

  // Form
  const [shift, setShift]                       = useState<Shift>('morning')
  const [openingFund, setOpeningFund]           = useState('')
  const [puveTotalReported, setPuveTotalReported] = useState('')
  const [billCounts, setBillCounts]             = useState<BillCount[]>(BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' })))
  const [puveTransfers, setPuveTransfers]       = useState<Transfer[]>([{ amount: '' }])
  const [didiOrders, setDidiOrders]             = useState<DidiItem[]>([])
  const [whatsappOrders, setWhatsappOrders]     = useState<WhatsappItem[]>([])
  const [supplierPayments, setSupplierPayments] = useState<SupplierItem[]>([])
  const [cashToOwner, setCashToOwner]           = useState('')
  const [differenceNote, setDifferenceNote]     = useState('')
  const [hasPendingBase, setHasPendingBase]     = useState(false)    // si el último tiene solicitud pendiente
  const [hasPendingDiff, setHasPendingDiff]     = useState(false)    // si hay descuadre pendiente de aprobación
  const [pendingDraft, setPendingDraft]         = useState<{id: string; difference: number; status: string} | null>(null)

  // Refs Enter
  const billRefs         = useRef<(HTMLInputElement | null)[]>([])
  const puveTransRefs    = useRef<(HTMLInputElement | null)[]>([])
  const whatsappRefs     = useRef<(HTMLInputElement | null)[]>([])
  const supplierDescRefs = useRef<(HTMLInputElement | null)[]>([])
  const supplierAmtRefs  = useRef<(HTMLInputElement | null)[]>([])
  const didiIdRefs       = useRef<(HTMLInputElement | null)[]>([])
  const didiCashRefs     = useRef<(HTMLInputElement | null)[]>([])

  // ── CÁLCULOS ──────────────────────────────────────────────
  const cashCounted    = billCounts.reduce((s, b) => s + b.denomination * n(b.quantity), 0)
  const puveTransTotal = puveTransfers.reduce((s, t) => s + n(t.amount), 0)
  const didiCash       = didiOrders.reduce((s, o) => s + n(o.cash), 0)
  const didiTransTotal = didiOrders.reduce((s, o) => o.transfers.reduce((ss, t) => ss + n(t.amount), s), 0)
  const whatsappTotal  = whatsappOrders.reduce((s, o) => s + n(o.amount), 0)
  const cancelledTotal = 0
  const supplierTotal  = supplierPayments.reduce((s, o) => s + n(o.amount), 0)

  // Puve efectivo = Total Puve reportado - Transferencias Puve
  const puveReported   = n(puveTotalReported)
  const puveEfectivo   = puveReported > 0 ? puveReported - puveTransTotal : 0

  // Efectivo esperado = Base + Puve efectivo + Didi efectivo + WhatsApp - Proveedores
  const expectedCash   = n(openingFund) + puveEfectivo + didiCash + whatsappTotal - supplierTotal

  // Diferencia = Efectivo contado - Efectivo esperado
  const difference     = cashCounted - expectedCash

  // Total ventas real = Total Puve + Didi (ef+transf) + WhatsApp - Cancelados
  const totalRealSales = puveReported + didiCash + didiTransTotal + whatsappTotal - cancelledTotal

  // Verificación Puve: puveEfectivo debería coincidir con cashCounted - base - didiCash - whatsapp + supplierTotal
  const puveEfectivoCalculado = cashCounted - n(openingFund) - didiCash - whatsappTotal + supplierTotal
  const puveDiff = puveReported > 0 ? puveReported - (puveTransTotal + puveEfectivoCalculado) : null
  const puveOk   = puveDiff === null || Math.abs(puveDiff) < 1

  // cashToOwner ahora es la BASE que deja en caja
  // El sobre = efectivo contado - base que deja
  const nextBase       = cashToOwner !== '' ? n(cashToOwner) : null
  const cashToEnvelope = cashToOwner !== '' ? cashCounted - n(cashToOwner) : null
  // needsNote solo cuando la diferencia requiere aprobación
  const needsNote = cashCounted > 0 && (
    (difference < 0 && Math.abs(difference) >= 2000) ||
    (difference > 0 && difference >= 10000)
  )

  // Cargar borrador — solo cuando los datos del servidor ya cargaron y baseIsLocked está definido
  useEffect(() => {
    if (!dataLoaded) return  // esperar que loadData() termine y baseIsLocked esté correcto
    const d = loadDraft()
    if (!d) return
    // Hay datos reales si cualquier campo tiene valor
    const hasReal = !!(
      d.puveTotalReported ||
      d.cashToOwner ||
      d.differenceNote ||
      d.billCounts?.some((b: {quantity: string}) => b.quantity && b.quantity !== '0') ||
      d.didiOrders?.length > 0 ||
      d.whatsappOrders?.length > 0 ||
      d.supplierPayments?.length > 0
    )
    if (!hasReal) { clearDraft(); return }
    if (d.shift)              setShift(d.shift)
    // openingFund solo si primer turno (no bloqueado)
    if (d.openingFund && !baseIsLocked) setOpeningFund(d.openingFund)
    if (d.puveTotalReported)  setPuveTotalReported(d.puveTotalReported)
    if (d.billCounts)         setBillCounts(d.billCounts)
    if (d.puveTransfers)      setPuveTransfers(d.puveTransfers)
    if (d.didiOrders)         setDidiOrders(d.didiOrders)
    if (d.whatsappOrders)     setWhatsappOrders(d.whatsappOrders)
    if (d.supplierPayments)   setSupplierPayments(d.supplierPayments)
    if (d.cashToOwner)        setCashToOwner(d.cashToOwner)
    if (d.differenceNote)     setDifferenceNote(d.differenceNote)
    setDraftRestored(true)
  }, [dataLoaded])

  // Autosave
  useEffect(() => {
    saveDraft({ shift, openingFund, puveTotalReported, billCounts, puveTransfers, didiOrders, whatsappOrders, supplierPayments, cashToOwner, differenceNote })
  }, [shift, openingFund, puveTotalReported, billCounts, puveTransfers, didiOrders, whatsappOrders, supplierPayments, cashToOwner, differenceNote])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)
    const res  = await fetch('/api/worker/cash-register?worker_id=' + w.id)
    const json = await res.json()
    setRegisters(json.registers || [])
    setHasPendingBase(json.hasPendingBaseRequest || false)
    setHasPendingDiff(json.hasPendingDifference || false)
    // Verificar estado del borrador
    const draftRes  = await fetch('/api/worker/cash-register-draft?worker_id=' + w.id)
    const draftJson = await draftRes.json()
    const draft = draftJson.draft

    if (draft?.status === 'pending_approval') {
      setPendingDraft(draft)
      setHasPendingDiff(true)
    } else if (draft?.status === 'approved') {
      // Admin aprobó → mostrar modal y limpiar
      setAdminResponse({ status: 'approved', note: draft.admin_note })
      setPendingDraft(null)
      setHasPendingDiff(false)
    } else if (draft?.status === 'rejected') {
      // Admin rechazó → mostrar modal pero mantener datos
      setAdminResponse({ status: 'rejected', note: draft.admin_note })
      setPendingDraft(null)
      setHasPendingDiff(false)
    } else {
      setPendingDraft(null)
      setHasPendingDiff(false)
    }
    // Base SIEMPRE del servidor — tiene prioridad absoluta
    if (json.suggestedBase > 0) {
      setSuggestedBase(json.suggestedBase)
      setOpeningFund(String(json.suggestedBase))
      setBaseIsLocked(true)   // siempre bloqueada si hay cierre anterior
    } else {
      setBaseIsLocked(false)  // primer turno — puede ingresar manualmente
    }
    setLoading(false)
    setDataLoaded(true)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'success' | 'error', msg: string) {
    setStatusMsg({ type, msg })
    setTimeout(() => setStatusMsg(null), 6000)
  }

  function dismissAdminResponse() {
    if (adminResponse?.status === 'approved') {
      resetForm()
      // Marcar el borrador como visto — llamar API para eliminarlo
      if (worker) {
        fetch('/api/worker/cash-register-draft/dismiss?worker_id=' + worker.id, { method: 'DELETE' })
      }
    }
    setAdminResponse(null)
  }

  function resetForm() {
    setShift('morning'); setPuveTotalReported('')
    setBillCounts(BILL_DENOMINATIONS.map(d => ({ denomination: d, quantity: '' })))
    setPuveTransfers([{ amount: '' }])
    setDidiOrders([]); setWhatsappOrders([])
    setCashToOwner(''); setDifferenceNote('')
    setDraftRestored(false); clearDraft()
    // Recargar base del servidor — NO tocar baseIsLocked manualmente
    loadData()
  }

  // ── Handlers Enter ──
  function onBillEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); billRefs.current[i + 1]?.focus()
  }
  function onPuveTransEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= puveTransfers.length) {
      setPuveTransfers(prev => { const u = [...prev, { amount: '' }]; setTimeout(() => puveTransRefs.current[i + 1]?.focus(), 30); return u })
    } else puveTransRefs.current[i + 1]?.focus()
  }
  function onWhatsappEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= whatsappOrders.length) {
      setWhatsappOrders(prev => { const u = [...prev, { amount: '' }]; setTimeout(() => whatsappRefs.current[i + 1]?.focus(), 30); return u })
    } else whatsappRefs.current[i + 1]?.focus()
  }

  function onSupplierDescEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); supplierAmtRefs.current[i]?.focus()
  }
  function onSupplierAmtEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= supplierPayments.length) {
      setSupplierPayments(prev => { const u = [...prev, { description: '', amount: '' }]; setTimeout(() => supplierDescRefs.current[i + 1]?.focus(), 30); return u })
    } else supplierDescRefs.current[i + 1]?.focus()
  }
  function onDidiIdEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault(); didiCashRefs.current[i]?.focus()
  }
  function onDidiCashEnter(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return; e.preventDefault()
    if (i + 1 >= didiOrders.length) {
      setDidiOrders(prev => { const u = [...prev, { order_id: '', cash: '', transfers: [] }]; setTimeout(() => didiIdRefs.current[i + 1]?.focus(), 30); return u })
    } else didiIdRefs.current[i + 1]?.focus()
  }

  async function handleSubmit() {
    if (!worker) return

    // Bloqueo duro — no puede enviar si hay borrador pendiente
    if (hasPendingDiff) {
      showMsg('error', 'Tienes un cierre con descuadre pendiente de aprobación del admin.')
      return
    }
    if (cashCounted === 0)  { showMsg('error', 'Registra el conteo de billetes'); return }
    if (!puveTotalReported) { showMsg('error', 'Ingresa el Total ventas Puve'); return }
    if (cashToOwner === '') { showMsg('error', 'Ingresa la base que dejas en caja'); return }

    // Requiere aprobación si: faltante >= $2.000 o sobrante >= $10.000
    const hasDiff = (difference < 0 && Math.abs(difference) >= 2000) ||
                    (difference > 0 && difference >= 10000)
    if (hasDiff && !differenceNote.trim()) {
      showMsg('error', 'Hay un descuadre — la nota es obligatoria')
      return
    }

    setSaving(true)

    const payload = {
      worker_id:           worker.id,
      shift,
      register_date:       new Date().toISOString().split('T')[0],
      opening_fund:        n(openingFund),
      puve_cash:           puveEfectivo,
      puve_transfer:       puveTransTotal,
      puve_total_reported: puveReported,
      didi_orders:         didiOrders,
      whatsapp_orders:     whatsappOrders,
      cancelled_orders:    [],
      supplier_payments:   supplierPayments,
      cash_counted:        cashCounted,
      cash_to_owner:       n(cashToOwner),
      difference_note:     differenceNote.trim() || null,
      bill_counts:         billCounts,
      puve_transfers:      puveTransfers,
      // Totales para el borrador
      didi_cash_total:     didiCash,
      didi_transfer_total: didiTransTotal,
      whatsapp_total:      whatsappTotal,
      cancelled_total:     cancelledTotal,
      supplier_total:      supplierTotal,
      total_real_sales:    totalRealSales,
      expected_cash:       expectedCash,
      difference,
      next_base:           nextBase ?? 0,
      // Con descuadre → va como borrador
      isDraft:             hasDiff,
    }

    const res  = await fetch('/api/worker/cash-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) { showMsg('error', json.error || 'Error al guardar'); return }

    if (hasDiff) {
      showMsg('success', '⏳ Enviado al admin para aprobación. No puedes registrar otro hasta que sea revisado.')
      setPendingDraft(json.draft)
      setHasPendingDiff(true)
    } else {
      showMsg('success', '✓ Cierre registrado correctamente')
      resetForm(); loadData(); setActiveTab('historial')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-white/40 text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="space-y-3 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Cierre de Caja</h1>
          <p className="text-muted text-xs mt-0.5">{worker?.full_name}</p>
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

      {/* Modal de mensajes */}
      {statusMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setStatusMsg(null)}>
          <div className={`w-full max-w-sm mx-4 rounded-3xl border p-6 space-y-4 text-center ${
            statusMsg.type === 'success'
              ? 'bg-purple-900 border-emerald-400/30'
              : 'bg-purple-900 border-red-400/30'
          }`} onClick={e => e.stopPropagation()}>
            <p className="text-3xl">{statusMsg.type === 'success' ? '✅' : '❌'}</p>
            <p className={`font-bold text-sm ${statusMsg.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
              {statusMsg.msg}
            </p>
            <button onClick={() => setStatusMsg(null)}
              className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-400/30 hover:bg-red-500/30'
              }`}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {activeTab === 'form' && (
        <div className="space-y-3">
          {/* Banner de cierre pendiente — siempre visible cuando hay borrador */}
          {pendingDraft && (
            <div className="rounded-2xl px-4 py-3 border bg-orange-500/15 border-orange-400/30 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">⏳</span>
              <div>
                <p className="text-orange-300 font-bold text-sm">Cierre en espera de aprobación</p>
                <p className="text-orange-400/70 text-xs">
                  Descuadre de <span className="font-bold text-orange-300">{cop(Math.abs(pendingDraft.difference))}</span> — el admin debe revisarlo antes de que puedas registrar otro cierre.
                </p>
              </div>
            </div>
          )}

          {/* Modal base bloqueada */}
          {showBaseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setShowBaseModal(false)}>
              <div className="w-full max-w-sm mx-4 rounded-3xl border border-yellow-400/30 bg-purple-900 p-6 space-y-4 text-center"
                onClick={e => e.stopPropagation()}>
                <p className="text-3xl">🔒</p>
                <p className="text-white font-bold text-sm">Base bloqueada</p>
                <p className="text-white/60 text-xs leading-relaxed">
                  Esta base fue transferida automáticamente del cierre anterior y no puede ser modificada.<br /><br />
                  Si hay un error, contacta al administrador para que la corrija desde el panel de cierres.
                </p>
                <button onClick={() => setShowBaseModal(false)}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-all">
                  Entendido
                </button>
              </div>
            </div>
          )}

          {/* Modal respuesta del admin */}
          {adminResponse && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className={`w-full max-w-sm mx-4 rounded-3xl border p-6 space-y-4 ${
                adminResponse.status === 'approved'
                  ? 'bg-purple-900 border-emerald-400/30'
                  : 'bg-purple-900 border-red-400/30'
              }`}>
                <div className="text-center space-y-2">
                  <p className="text-4xl">{adminResponse.status === 'approved' ? '✅' : '❌'}</p>
                  <p className={`font-bold text-lg ${adminResponse.status === 'approved' ? 'text-emerald-300' : 'text-red-300'}`}>
                    {adminResponse.status === 'approved' ? 'Cierre aprobado' : 'Cierre rechazado'}
                  </p>
                  <p className="text-white/60 text-sm">
                    {adminResponse.status === 'approved'
                      ? 'El admin revisó y aprobó tu cierre. Puedes registrar el siguiente turno.'
                      : 'El admin rechazó tu cierre. Revisa los datos y vuelve a enviarlo.'}
                  </p>
                  {adminResponse.note && (
                    <div className="bg-white/10 rounded-2xl px-4 py-3 text-left">
                      <p className="text-white/40 text-xs font-semibold mb-1">Nota del admin</p>
                      <p className="text-white text-sm">{adminResponse.note}</p>
                    </div>
                  )}
                </div>
                <button onClick={dismissAdminResponse} className="btn-primary w-full">
                  {adminResponse.status === 'approved' ? 'Entendido — limpiar formulario' : 'Entendido — corregir cierre'}
                </button>
              </div>
            </div>
          )}

          {draftRestored && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-sm mx-4 rounded-3xl border border-purple-400/30 bg-purple-900 p-6 space-y-4 text-center">
                <p className="text-3xl">⚡</p>
                <p className="text-white font-bold text-sm">Borrador recuperado</p>
                <p className="text-white/60 text-xs">Continuás donde lo dejaste antes del corte.</p>
                <div className="flex gap-3">
                  <button onClick={resetForm}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/10 text-white/60 hover:bg-white/20 transition-all">
                    Limpiar y empezar de nuevo
                  </button>
                  <button onClick={() => setDraftRestored(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-yellow-400 text-purple-900 transition-all">
                    Continuar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Barra superior: turno + base + total puve */}
          <div className="flex flex-wrap items-center gap-3 bg-white/8 border border-white/10 rounded-2xl px-4 py-3">
            <div className="flex gap-2">
              {(['morning', 'afternoon'] as const).map(s => (
                <button key={s} onClick={() => setShift(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${shift === s ? 'bg-yellow-400 text-purple-900 border-yellow-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
                  {SHIFT_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs font-semibold whitespace-nowrap">Base recibida:</label>
              {baseIsLocked ? (
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-emerald-400 text-sm font-bold cursor-not-allowed">
                    {cop(n(openingFund))}
                  </div>
                  <span className="text-emerald-400/60 text-xs">🔒 del cierre anterior</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={openingFund} onChange={e => setOpeningFund(e.target.value)}
                    className="w-32 bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all" placeholder="0" />
                  <span className="text-white/30 text-xs">Primer turno</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs font-semibold whitespace-nowrap">Total ventas Puve:</label>
              <input type="number" min="0" value={puveTotalReported} onChange={e => setPuveTotalReported(e.target.value)}
                className={`w-36 bg-white/10 border rounded-lg px-3 py-1.5 text-white text-sm font-bold focus:outline-none transition-all ${
                  puveDiff === null ? 'border-white/15 focus:border-yellow-400/60'
                  : puveOk ? 'border-emerald-400/60 bg-emerald-500/10'
                  : 'border-red-400/60 bg-red-500/10'}`}
                placeholder="$ total Puve" />
              {puveDiff !== null && (
                <span className={`text-xs font-bold whitespace-nowrap ${puveOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {puveOk ? '✓ Coincide' : `⚠ Dif: ${cop(Math.abs(puveDiff))}`}
                </span>
              )}
            </div>
            {/* Puve efectivo calculado — informativo */}
            {puveReported > 0 && (
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-1.5">
                <span className="text-white/40 text-xs">Puve efectivo:</span>
                <span className="text-white font-bold text-xs">{cop(puveEfectivo)}</span>
              </div>
            )}
          </div>

          {/* Grid 6 columnas con scroll horizontal */}
          <div className="overflow-x-auto pb-2">
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', minWidth: '1000px' }}>

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
                      onKeyDown={e => onBillEnter(e, i)} placeholder="0"
                      className="bg-white/10 border border-white/15 rounded-md px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-yellow-400/70 transition-all w-full" />
                    <span className="text-white text-xs text-right font-semibold">
                      {n(b.quantity) > 0 ? cop(b.denomination * n(b.quantity)) : '—'}
                    </span>
                  </div>
                ))}
                <div className="border-t border-white/15 mt-1 pt-2">
                  <Row label="Total efectivo" value={cashCounted} color="text-yellow-400" bold />
                </div>
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
                      onKeyDown={e => onPuveTransEnter(e, i)} placeholder="$ valor" className={inp} />
                    {puveTransfers.length > 1 && (
                      <button onClick={() => setPuveTransfers(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                    )}
                  </div>
                ))}
                <div className="border-t border-white/15 mt-1 pt-2">
                  <Row label="Total transferencias" value={puveTransTotal} color="text-yellow-400" bold />
                </div>
              </Col>

              {/* COL 3 — Didi + WhatsApp */}
              <Col title="Didi / WhatsApp">
                <p className="text-white/40 text-xs font-semibold">Pedidos Didi</p>
                <p className="text-white/30 text-xs pb-1">↵ No. → Efectivo → nuevo</p>
                {didiOrders.length === 0 && <p className="text-white/20 text-xs text-center py-2">Sin pedidos Didi</p>}
                {didiOrders.map((o, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-2 space-y-1.5 border border-white/8">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-semibold">Pedido #{i + 1}</span>
                      <button onClick={() => setDidiOrders(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <input ref={el => { didiIdRefs.current[i] = el }} type="text" value={o.order_id}
                      placeholder="No. pedido" className={inp}
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, order_id: e.target.value } : x))}
                      onKeyDown={e => onDidiIdEnter(e, i)} />
                    <input ref={el => { didiCashRefs.current[i] = el }} type="number" min="0" value={o.cash}
                      placeholder="$ efectivo" className={inp}
                      onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, cash: e.target.value } : x))}
                      onKeyDown={e => onDidiCashEnter(e, i)} />
                    {o.transfers.map((t, ti) => (
                      <div key={ti} className="flex gap-1">
                        <input type="number" min="0" value={t.amount} placeholder="$ transf." className={inp}
                          onChange={e => setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: x.transfers.map((tt, tj) => tj === ti ? { amount: e.target.value } : tt) } : x))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ti === o.transfers.length - 1) setDidiOrders(prev => prev.map((x, j) => j === i ? { ...x, transfers: [...x.transfers, { amount: '' }] } : x)) } }} />
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
                  <div className="border-t border-white/15 mt-1 pt-2 space-y-1">
                    <Row label="Didi efectivo (entra a caja)" value={didiCash} color="text-white" />
                    <Row label="Didi transferencia"           value={didiTransTotal} color="text-white" />
                    <Row label="Total Didi"                   value={didiCash + didiTransTotal} color="text-yellow-400" bold />
                  </div>
                )}

                {/* WhatsApp */}
                <Divider />
                <p className="text-white/40 text-xs font-semibold">Pedidos WhatsApp</p>
                <p className="text-white/25 text-xs">Efectivo · ↵ para agregar otro</p>
                {whatsappOrders.map((o, i) => (
                  <div key={i} className="flex gap-1">
                    <input ref={el => { whatsappRefs.current[i] = el }} type="number" min="0" value={o.amount}
                      placeholder="$ valor" className={inp}
                      onChange={e => setWhatsappOrders(prev => prev.map((x, j) => j === i ? { amount: e.target.value } : x))}
                      onKeyDown={e => onWhatsappEnter(e, i)} />
                    <button onClick={() => setWhatsappOrders(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                  </div>
                ))}
                <button onClick={() => { setWhatsappOrders(prev => [...prev, { amount: '' }]); setTimeout(() => whatsappRefs.current[whatsappOrders.length]?.focus(), 30) }}
                  className="w-full py-1 text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-lg transition-all">+ agregar</button>
                {whatsappTotal > 0 && (
                  <div className="border-t border-white/15 mt-1 pt-1">
                    <Row label="Total WhatsApp" value={whatsappTotal} color="text-yellow-400" bold />
                  </div>
                )}
              </Col>

              {/* COL 5 — Proveedores */}
              <Col title="Proveedores">
                <p className="text-white/30 text-xs">↵ Descripción → Valor → nuevo</p>
                <p className="text-white/25 text-xs pb-1">Salen del efectivo de caja</p>
                {supplierPayments.map((o, i) => (
                  <div key={i} className="space-y-1 mb-1">
                    <div className="flex gap-1">
                      <input ref={el => { supplierDescRefs.current[i] = el }} type="text" value={o.description}
                        placeholder="Descripción" className={inp}
                        onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                        onKeyDown={e => onSupplierDescEnter(e, i)} />
                      <button onClick={() => setSupplierPayments(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400/40 hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
                    </div>
                    <input ref={el => { supplierAmtRefs.current[i] = el }} type="number" min="0" value={o.amount}
                      placeholder="$ valor" className={inp}
                      onChange={e => setSupplierPayments(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      onKeyDown={e => onSupplierAmtEnter(e, i)} />
                  </div>
                ))}
                <button onClick={() => { setSupplierPayments(prev => [...prev, { description: '', amount: '' }]); setTimeout(() => supplierDescRefs.current[supplierPayments.length]?.focus(), 30) }}
                  className="w-full py-1 text-xs text-white/25 hover:text-yellow-400/50 border border-dashed border-white/10 rounded-lg transition-all">+ agregar</button>
                {supplierTotal > 0 && (
                  <div className="border-t border-white/15 mt-1 pt-1">
                    <Row label="Total proveedores (−)" value={supplierTotal} color="text-red-400" bold />
                  </div>
                )}
              </Col>

              {/* COL 6 — Resumen y Cierre */}
              <Col title="Resumen / Cierre">
                <p className="text-yellow-400 text-xs font-bold">RESUMEN</p>

                {/* Desglose Puve */}
                <div className="bg-white/5 rounded-lg p-2 space-y-1">
                  <p className="text-white/40 text-xs font-semibold mb-1">Puve</p>
                  <Row label="Efectivo Puve"     value={puveEfectivo}   color="text-white" />
                  <Row label="Transferencias"    value={puveTransTotal} color="text-white" />
                  <Row label="Total ventas Puve" value={puveReported}   color="text-yellow-400" bold />
                </div>

                <Divider />
                <Row label="+ Didi efectivo"   value={didiCash}       color="text-white" />
                <Row label="+ Didi transf."    value={didiTransTotal} color="text-white" />
                <Row label="+ WhatsApp"        value={whatsappTotal}  color="text-white" />
                <Divider />
                <Row label="Total ventas real" value={totalRealSales} color="text-yellow-400" bold />

                <Divider />
                {/* Verificación caja */}
                <div className="bg-white/5 rounded-lg p-2 space-y-1">
                  <p className="text-white/40 text-xs font-semibold mb-1">Verificación caja</p>
                  <Row label="Base recibida"     value={n(openingFund)} color="text-white" />
                  <Row label="+ Puve efectivo"   value={puveEfectivo}   color="text-white" />
                  <Row label="+ Didi efectivo"   value={didiCash}       color="text-white" />
                  <Row label="+ WhatsApp"        value={whatsappTotal}  color="text-white" />
                  <Row label="− Proveedores"     value={supplierTotal}  color="text-red-400" />
                  <Row label="Efectivo esperado" value={expectedCash}   color="text-white" bold />
                  <Row label="Efectivo contado"  value={cashCounted}    color="text-white" bold />
                  <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-white/10">
                    <span className="text-white/80">Diferencia</span>
                    <DiffBadge diff={difference} />
                  </div>
                </div>

                {/* Alerta Puve */}
                {puveDiff !== null && (
                  <div className={`rounded-xl px-2 py-2 text-xs border ${puveOk ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-red-500/10 border-red-400/20 text-red-300'}`}>
                    {puveOk
                      ? '✓ Total Puve coincide con efectivo + transferencias'
                      : `⚠ Total Puve no coincide — diferencia ${cop(Math.abs(puveDiff))}`}
                  </div>
                )}

                {/* Base que deja en caja */}
                <div>
                  <label className="text-white/40 text-xs font-semibold block mb-1">Base que deja en caja</label>
                  <input type="number" min="0" value={cashToOwner} onChange={e => setCashToOwner(e.target.value)}
                    placeholder="$ valor"
                    className="w-full bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-sm font-bold focus:outline-none focus:border-yellow-400/60 transition-all" />
                </div>

                {/* Sobre y base — calculados automáticamente */}
                {nextBase !== null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm bg-yellow-400/15 border border-yellow-400/30 rounded-xl px-3 py-2.5">
                      <span className="text-yellow-300 font-bold">📨 Meter en el sobre</span>
                      <span className="text-yellow-400 font-bold text-base">{cop(Math.max(0, cashToEnvelope ?? 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-2 py-1.5">
                      <span className="text-emerald-300/80 font-bold">✓ Base sig. día</span>
                      <span className="text-emerald-400 font-bold">{cop(nextBase)}</span>
                    </div>
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

                <button onClick={handleSubmit} disabled={saving || hasPendingDiff} className={`btn-primary w-full !py-2 !text-sm ${hasPendingDiff ? "opacity-40 cursor-not-allowed" : ""}`}>
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
                    ['Base recibida',       r.opening_fund],
                    ['Efectivo contado',    r.cash_counted],
                    ['Total ventas Puve',   r.puve_total_reported ?? 0],
                    ['Puve efectivo',       r.puve_cash],
                    ['Transferencias',      r.puve_transfer],
                    ['Didi efectivo',       r.didi_cash_total],
                    ['Didi transf.',        r.didi_transfer_total],
                    ['WhatsApp',            r.whatsapp_total],
                    ['Proveedores (−)',     r.supplier_total],
                    ['Total ventas real',   r.total_real_sales],
                    ['Efectivo esperado',   r.expected_cash],
                    ['Entregado en sobre',  r.cash_to_owner],
                    ['Base sig. día',       r.next_base],
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
