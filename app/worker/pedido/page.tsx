'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type Product = { id: string; name: string; sort_order: number }
type OrderItem = { id: string; product_id: string; qty_requested: number; qty_delivered: number | null; observation: string | null; product: Product }
type Order = { id: string; delivery_date: string; status: string; items: OrderItem[] }

export default function PedidoPage() {
  const [worker, setWorker]         = useState<{ id: string; full_name: string } | null>(null)
  const [products, setProducts]     = useState<Product[]>([])
  const [order, setOrder]           = useState<Order | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [deliveries, setDeliveries] = useState<Record<string, string>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [modal, setModal]           = useState<{ type: 'success'|'error'|'confirm'; text: string; onConfirm?: () => void } | null>(null)
  const [tab, setTab]               = useState<'order'|'delivery'>('order')
  const [search, setSearch]         = useState('')
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([])
  const delRefs = useRef<(HTMLInputElement | null)[]>([])

  const showModal = (type: 'success'|'error'|'confirm', text: string, onConfirm?: () => void) =>
    setModal({ type, text, onConfirm })

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)
    const res  = await fetch('/api/worker/kitchen-order?worker_id=' + w.id)
    const json = await res.json()
    setProducts(json.products || [])
    setDeliveryDate(json.deliveryDate)
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
  const itemsWithQty = products.filter(p => (quantities[p.id] || 0) > 0)

  async function submitOrder() {
    if (!worker) return
    if (itemsWithQty.length === 0) { showModal('error', 'Agrega al menos un producto'); return }
    showModal('confirm',
      `¿Enviar pedido con ${itemsWithQty.length} productos para el ${deliveryDate ? format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es }) : deliveryDate}?`,
      async () => {
        setModal(null); setSaving(true)
        const items = products.map(p => ({ product_id: p.id, name: p.name, qty_requested: quantities[p.id] || 0 }))
        const res = await fetch('/api/worker/kitchen-order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: worker.id, items, delivery_date: deliveryDate }),
        })
        const json = await res.json()
        setSaving(false)
        if (!res.ok) { showModal('error', json.error || 'Error al enviar'); return }
        showModal('success', '✅ Pedido enviado correctamente')
        setQuantities({}); loadData()
      }
    )
  }

  async function submitDelivery() {
    if (!order) return
    // Verificar observaciones obligatorias cuando hay diferencia
    for (const item of order.items) {
      const delivered = parseInt(deliveries[item.product_id] || '0') || 0
      if (delivered !== item.qty_requested && !observations[item.product_id]?.trim()) {
        showModal('error', `"${item.product?.name}" tiene diferencia en cantidad — escribe la observación antes de confirmar`)
        return
      }
    }
    setSaving(true)
    const dels = order.items.map((item: OrderItem) => ({
      product_id:  item.product_id,
      qty_delivered: parseInt(deliveries[item.product_id] || '0') || 0,
      observation: observations[item.product_id] || null,
    }))
    const res = await fetch('/api/worker/kitchen-order', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, deliveries: dels }),
    })
    setSaving(false)
    if (res.ok) {
      showModal('success', '✅ Entrega confirmada. Ya puedes hacer un nuevo pedido.')
      setOrder(null); setDeliveries({}); setObservations({}); setTab('order'); loadData()
    } else showModal('error', 'Error al confirmar entrega')
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-white/40 text-sm">Cargando...</p></div>

  return (
    <div className="max-w-lg mx-auto space-y-3 pb-24">
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => modal.type !== 'confirm' && setModal(null)}>
          <div className="w-full max-w-sm rounded-3xl border bg-purple-900 p-6 space-y-4 text-center"
            onClick={e => e.stopPropagation()}
            style={{ borderColor: modal.type === 'success' ? 'rgba(52,211,153,0.3)' : modal.type === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(245,197,24,0.3)' }}>
            <p className="text-4xl">{modal.type === 'success' ? '✅' : modal.type === 'error' ? '❌' : '📤'}</p>
            <p className="text-white font-bold text-sm">{modal.text}</p>
            {modal.type === 'confirm' ? (
              <div className="flex gap-3">
                <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-white/60">Cancelar</button>
                <button onClick={modal.onConfirm} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-yellow-400 text-purple-900">Enviar</button>
              </div>
            ) : (
              <button onClick={() => setModal(null)} className="w-full py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-white">Cerrar</button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-xl">Pedido Cocina</h1>
          <p className="text-muted text-xs">{worker?.full_name} · Entrega {deliveryDate ? format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es }) : '—'}</p>
        </div>
        {order && <span className="text-xs px-3 py-1 rounded-full font-bold bg-yellow-400/20 text-yellow-300">⏳ Pendiente</span>}
      </div>

      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['order', 'delivery'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-yellow-400 text-purple-900' : 'text-white/50'}`}>
            {t === 'order' ? '📋 Pedido' : '📦 Entrega'}
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
              <p className="text-white/50 text-sm">Confirma la entrega cuando llegue el pedido</p>
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
                      className={`w-16 text-center rounded-xl px-2 py-2 text-white text-sm font-bold focus:outline-none transition-all border ${(quantities[p.id] || 0) > 0 ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300' : 'bg-white/10 border-white/15'}`} />
                  </div>
                ))}
                {filteredProducts.length === 0 && <p className="text-white/30 text-sm text-center py-8">Sin resultados</p>}
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
            <>
              <p className="text-white/50 text-xs px-1">Ingresa la cantidad recibida. Si es diferente a lo pedido, escribe la observación.</p>
              <div className="space-y-2">
                {order.items.map((item: OrderItem, i: number) => {
                  const delivered = parseInt(deliveries[item.product_id] || '0') || 0
                  const hasDiff   = deliveries[item.product_id] !== undefined && delivered !== item.qty_requested
                  return (
                    <div key={item.product_id} className={`card space-y-2 ${hasDiff ? 'border-yellow-400/30' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex-1 text-white text-sm">{item.product?.name}</span>
                        <input ref={el => { delRefs.current[i] = el }}
                          type="number" inputMode="numeric" min="0"
                          value={deliveries[item.product_id] || ''}
                          onChange={e => setDeliveries(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); delRefs.current[i + 1]?.focus() } }}
                          placeholder="Cant."
                          className={`w-20 text-center rounded-xl px-2 py-2 text-sm font-bold focus:outline-none transition-all border ${hasDiff ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300' : deliveries[item.product_id] ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' : 'bg-white/10 border-white/15 text-white'}`} />
                      </div>
                      {hasDiff && (
                        <div>
                          <p className="text-yellow-300 text-xs mb-1">⚠ Diferencia detectada — observación obligatoria <span className="text-red-400">*</span></p>
                          <textarea
                            rows={2}
                            value={observations[item.product_id] || ''}
                            onChange={e => setObservations(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                            placeholder="Explica la diferencia (ej: solo llegaron 3 porque faltaba stock)..."
                            className={`w-full bg-white/10 border rounded-xl px-3 py-2 text-white text-xs resize-none focus:outline-none transition-all ${observations[item.product_id]?.trim() ? 'border-emerald-400/40' : 'border-yellow-400/40'}`} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
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
