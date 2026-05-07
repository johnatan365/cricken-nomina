'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type Product = { id: string; name: string; price: number; sort_order: number; supplier: string }
type OrderItem = { id: string; product_id: string; qty_requested: number; qty_delivered: number | null; observation: string | null; product: Product }
type Order = { id: string; delivery_date: string; status: string; items: OrderItem[]; worker_name?: string }

const DRAFT_KEY = 'pedido_draft_food'

export default function PedidoFoodPage() {
  const [worker, setWorker]             = useState<{ id: string; full_name: string } | null>(null)
  const [products, setProducts]         = useState<Product[]>([])
  const [order, setOrder]               = useState<Order | null>(null)
  const [quantities, setQuantities]     = useState<Record<string, number>>({})
  const [deliveries, setDeliveries]     = useState<Record<string, string>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [confirmDate, setConfirmDate]     = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [tab, setTab]                   = useState<'order'|'delivery'>('order')
  const [modal, setModal]               = useState<{ type: 'success'|'error'|'confirm'; text: string; onConfirm?: () => void } | null>(null)
  const [draftLoaded, setDraftLoaded]   = useState(false)
  const [search, setSearch]             = useState('')
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([])
  const delRefs = useRef<(HTMLInputElement | null)[]>([])

  // Restaurar draft primero
  useEffect(() => {
    try {
      const qty = localStorage.getItem(DRAFT_KEY + '_qty')
      const del = localStorage.getItem(DRAFT_KEY + '_del')
      const obs = localStorage.getItem(DRAFT_KEY + '_obs')
      if (qty) setQuantities(JSON.parse(qty))
      if (del) setDeliveries(JSON.parse(del))
      if (obs) setObservations(JSON.parse(obs))
    } catch {}
    setDraftLoaded(true)
  }, [])

  // Autosave después de draft cargado
  useEffect(() => {
    if (!draftLoaded) return
    if (Object.keys(quantities).length > 0) localStorage.setItem(DRAFT_KEY + '_qty', JSON.stringify(quantities))
    else localStorage.removeItem(DRAFT_KEY + '_qty')
  }, [quantities, draftLoaded])

  useEffect(() => {
    if (!draftLoaded) return
    if (Object.keys(deliveries).length > 0) localStorage.setItem(DRAFT_KEY + '_del', JSON.stringify(deliveries))
    else localStorage.removeItem(DRAFT_KEY + '_del')
  }, [deliveries, draftLoaded])

  useEffect(() => {
    if (!draftLoaded) return
    if (Object.keys(observations).length > 0) localStorage.setItem(DRAFT_KEY + '_obs', JSON.stringify(observations))
    else localStorage.removeItem(DRAFT_KEY + '_obs')
  }, [observations, draftLoaded])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)

    const res  = await fetch('/api/worker/kitchen-order?worker_id=' + w.id + '&order_type=food')
    const json = await res.json()
    setProducts(json.products || [])

    if (json.order) {
      setOrder(json.order)
      setTab('delivery')
    } else {
      setOrder(null)
      setTab('order')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const itemsWithQty     = products.filter(p => (quantities[p.id] || 0) > 0)
  const orderedProductIds = new Set((order?.items || []).map(i => i.product_id))
  const orderedQtyMap     = Object.fromEntries((order?.items || []).map(i => [i.product_id, i.qty_requested]))

  async function submitOrder() {
    if (!worker) return
    if (itemsWithQty.length === 0) { setModal({ type: 'error', text: 'Agrega al menos un producto' }); return }
    setModal({ type: 'confirm', text: `¿Enviar pedido con ${itemsWithQty.length} productos?`,
      onConfirm: async () => {
        setModal(null); setSaving(true)
        const items = products.map(p => ({ product_id: p.id, name: p.name, qty_requested: quantities[p.id] || 0 }))
        const res = await fetch('/api/worker/kitchen-order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: worker.id, items, delivery_date: deliveryDate, order_type: 'food' }),
        })
        const json = await res.json()
        setSaving(false)
        if (!res.ok) { setModal({ type: 'error', text: json.error || 'Error al enviar' }); return }
        // Copiar mensaje al portapapeles para pegarlo en el grupo de WhatsApp
        if (json.waMessage) {
          try {
            await navigator.clipboard.writeText(json.waMessage)
          } catch {}
        }
        localStorage.removeItem(DRAFT_KEY + '_qty')
        setQuantities({})
        await loadData()
        setTab('delivery')
        setModal({ type: 'success', text: '✅ Pedido enviado.\n\n📋 El mensaje fue copiado al portapapeles. Pégalo en el grupo Pedidos Food de WhatsApp.', onConfirm: () => setModal(null) })
      }
    })
  }

  async function submitDelivery() {
    if (!order) return
    // Validar solo productos que fueron pedidos (orderedProductIds)
    for (const pid of Array.from(orderedProductIds)) {
      const delivered = parseFloat(deliveries[pid] || '')
      const requested = orderedQtyMap[pid]
      const filled    = deliveries[pid] !== undefined && deliveries[pid] !== ''
      if (!filled) {
        const name = products.find(p => p.id === pid)?.name || pid
        setModal({ type: 'error', text: `Debes registrar la cantidad de "${name}". Si no llegó, ingresa 0.` })
        return
      }
      if (delivered !== requested && !observations[pid]?.trim()) {
        const name = products.find(p => p.id === pid)?.name || ''
        setModal({ type: 'error', text: `"${name}": se pidieron ${requested} y registraste ${delivered}. Escribe la observación.` })
        return
      }
    }

    setSaving(true)
    const allPids = new Set([...Array.from(orderedProductIds), ...products.filter(p => parseFloat(deliveries[p.id] || '0') > 0).map(p => p.id)])
    const dels = Array.from(allPids).map(pid => ({
      product_id: pid,
      qty_delivered: parseFloat(deliveries[pid] || '0') || 0,
      observation: observations[pid] || null,
    }))

    const res = await fetch('/api/worker/kitchen-order', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, deliveries: dels, delivered_by: worker?.id, confirm_date: confirmDate }),
    })
    setSaving(false)
    if (res.ok) {
      localStorage.removeItem(DRAFT_KEY + '_del')
      localStorage.removeItem(DRAFT_KEY + '_obs')
      setOrder(null); setDeliveries({}); setObservations({}); setTab('order'); loadData()
      setModal({ type: 'success', text: '✅ Entrega confirmada. Ya puedes hacer otro pedido.', onConfirm: () => setModal(null) })
    } else setModal({ type: 'error', text: 'Error al confirmar entrega' })
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-white/40 text-sm">Cargando...</p></div>

  return (
    <div className="max-w-lg mx-auto space-y-3 pb-24">
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => modal.type !== 'confirm' && setModal(null)}>
          <div className="w-full max-w-sm rounded-3xl border bg-purple-900 p-6 space-y-4 text-center"
            onClick={e => e.stopPropagation()}
            style={{ borderColor: modal.type === 'success' ? 'rgba(52,211,153,0.3)' : modal.type === 'confirm' ? 'rgba(245,197,24,0.3)' : 'rgba(248,113,113,0.3)' }}>
            <p className="text-4xl">{modal.type === 'success' ? '✅' : modal.type === 'confirm' ? '📤' : '❌'}</p>
            <p className="text-white font-bold text-sm">{modal.text}</p>
            {modal.type === 'confirm' ? (
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-white/60">Cancelar</button>
                <button onClick={modal.onConfirm} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-yellow-400 text-purple-900">Enviar</button>
              </div>
            ) : (
              <button onClick={() => modal.onConfirm ? modal.onConfirm() : setModal(null)} className="w-full py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-white">Entendido</button>
            )}
          </div>
        </div>
      )}

      <div>
        <h1 className="page-title text-xl">Food Tracker</h1>
        <p className="text-muted text-xs">{worker?.full_name}</p>
      </div>

      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['order', 'delivery'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-yellow-400 text-purple-900' : 'text-white/50'}`}>
            {t === 'order' ? '📋 Hacer pedido' : '📦 Confirmar entrega'}
          </button>
        ))}
      </div>

      {/* TAB PEDIDO */}
      {tab === 'order' && (
        <>
          {order ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-4xl">✅</p>
              <p className="text-white font-bold">Pedido enviado</p>
              <p className="text-white/50 text-sm">Confirma la entrega cuando llegue</p>
              <button onClick={() => setTab('delivery')} className="btn-primary">Confirmar entrega →</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full bg-white/10 border border-white/15 rounded-2xl pl-8 pr-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-yellow-400/50 transition-all" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-lg">✕</button>}
              </div>

              {itemsWithQty.length > 0 && (
                <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-2 flex items-center justify-between">
                  <span className="text-yellow-300 text-xs font-semibold">{itemsWithQty.length} productos seleccionados</span>
                  <button onClick={() => setQuantities({})} className="text-yellow-400/60 text-xs underline">Limpiar</button>
                </div>
              )}

              <div className="card space-y-0 overflow-hidden p-0">
                {filteredProducts.map((p, i) => (
                  <div key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < filteredProducts.length - 1 ? 'border-b border-white/5' : ''} ${(quantities[p.id] || 0) > 0 ? 'bg-yellow-400/5' : ''}`}>
                    <span className="flex-1 text-white text-sm leading-tight">{p.name}</span>
                    <input ref={el => { qtyRefs.current[i] = el }}
                      type="number" inputMode="numeric" min="0"
                      value={quantities[p.id] || ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); qtyRefs.current[i + 1]?.focus() } }}
                      placeholder="0"
                      className={`w-16 text-center rounded-xl px-2 py-2 text-sm font-bold focus:outline-none transition-all border ${(quantities[p.id] || 0) > 0 ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300' : 'bg-white/10 border-white/15 text-white'}`} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* TAB ENTREGA */}
      {tab === 'delivery' && (
        <>
          {!order ? (
            <div className="card text-center py-8"><p className="text-3xl mb-2">📋</p><p className="text-white/50 text-sm">Primero haz el pedido</p></div>
          ) : (
            <div className="space-y-2">
              <div className="card">
                <label className="label">¿En qué fecha te lo entregaron?</label>
                <input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)}
                  className="input-field" />
              </div>
              <p className="text-white/50 text-xs px-1">Ingresa la cantidad recibida de cada producto.</p>
              {products.map((p, i: number) => {
                const item      = order.items.find((it: OrderItem) => it.product_id === p.id)
                const pid       = p.id
                const delivered = parseFloat(deliveries[pid] || '0') || 0
                const hasDiff   = deliveries[pid] !== undefined && item !== undefined && delivered !== item.qty_requested
                return (
                  <div key={pid} className={`card space-y-2 border ${hasDiff ? 'border-yellow-400/30' : 'border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex-1 text-white text-sm">{p.name}</span>
                      <input ref={el => { delRefs.current[i] = el }}
                        type="number" inputMode="numeric" min="0"
                        value={deliveries[item.product_id] ?? ''}
                        onChange={e => setDeliveries(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); delRefs.current[i + 1]?.focus() } }}
                        placeholder="Cant."
                        className="w-20 text-center rounded-xl px-2 py-2 text-sm font-bold focus:outline-none transition-all border bg-white/10 border-white/15 text-white" />
                    </div>
                    {hasDiff && (
                      <div>
                        <p className="text-yellow-300 text-xs mb-1">⚠ Diferencia — observación obligatoria <span className="text-red-400">*</span></p>
                        <textarea rows={2} value={observations[item.product_id] || ''}
                          onChange={e => setObservations(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                          placeholder="Explica la diferencia..."
                          className={`w-full bg-white/10 border rounded-xl px-3 py-2 text-white text-xs resize-none focus:outline-none transition-all ${observations[item.product_id]?.trim() ? 'border-emerald-400/40' : 'border-yellow-400/40'}`} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'order' && !order && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-purple-950 to-transparent">
          <button onClick={submitOrder} disabled={saving || itemsWithQty.length === 0}
            className={`btn-primary w-full !py-4 !text-base max-w-lg mx-auto block ${itemsWithQty.length === 0 ? 'opacity-40' : ''}`}>
            {saving ? 'Enviando...' : `📤 Enviar pedido${itemsWithQty.length > 0 ? ` (${itemsWithQty.length})` : ''}`}
          </button>
        </div>
      )}

      {tab === 'delivery' && order && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-purple-950 to-transparent">
          <button onClick={submitDelivery} disabled={saving}
            className="btn-primary w-full !py-4 !text-base max-w-lg mx-auto block">
            {saving ? 'Guardando...' : '✅ Confirmar entrega'}
          </button>
        </div>
      )}
    </div>
  )
}
