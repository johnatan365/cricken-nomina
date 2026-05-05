'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type Product = { id: string; name: string; sort_order: number }
type OrderItem = { product_id: string; qty_delivered: number | null; product: Product }
type Order = { id: string; delivery_date: string; status: string; items: OrderItem[] }

export default function PedidoPage() {
  const [worker, setWorker]         = useState<{ id: string; full_name: string } | null>(null)
  const [products, setProducts]     = useState<Product[]>([])
  const [order, setOrder]           = useState<Order | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [deliveries, setDeliveries] = useState<Record<string, string>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [modal, setModal]           = useState<{ type: 'success'|'error'|'confirm'; text: string; onConfirm?: () => void } | null>(null)
  const [tab, setTab]               = useState<'order'|'delivery'>('order')
  const [search, setSearch]         = useState('')

  // Refs para Enter en celular
  const qtyRefs  = useRef<(HTMLInputElement | null)[]>([])
  const delRefs  = useRef<(HTMLInputElement | null)[]>([])

  const showModal = (type: 'success'|'error'|'confirm', text: string, onConfirm?: () => void) => {
    setModal({ type, text, onConfirm })
  }

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
      const del: Record<string, string> = {}
      json.order.items?.forEach((item: OrderItem) => {
        if (item.qty_delivered !== null) del[item.product_id] = String(item.qty_delivered)
      })
      setDeliveries(del)
      setTab(json.order.status === 'delivered' ? 'delivery' : 'delivery')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Filtrar productos según búsqueda
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  // Contar productos con cantidad > 0
  const itemsWithQty = products.filter(p => (quantities[p.id] || 0) > 0)

  async function submitOrder() {
    if (!worker) return
    if (itemsWithQty.length === 0) {
      showModal('error', 'Agrega al menos un producto con cantidad')
      return
    }
    showModal('confirm', `¿Enviar pedido con ${itemsWithQty.length} productos para el ${format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es })}?`, async () => {
      setModal(null)
      setSaving(true)
      const items = products.map(p => ({ product_id: p.id, name: p.name, qty_requested: quantities[p.id] || 0 }))
      const res = await fetch('/api/worker/kitchen-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: worker.id, items, delivery_date: deliveryDate }),
      })
      const json = await res.json()
      setSaving(false)
      if (!res.ok) { showModal('error', json.error || 'Error al enviar'); return }
      showModal('success', '✅ Pedido enviado correctamente')
      loadData()
    })
  }

  async function submitDelivery() {
    if (!order) return
    setSaving(true)
    const dels = order.items.map((item: OrderItem) => ({
      product_id: item.product_id,
      qty_delivered: parseInt(deliveries[item.product_id] || '0') || 0,
    }))
    const res = await fetch('/api/worker/kitchen-order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, deliveries: dels }),
    })
    setSaving(false)
    if (res.ok) { showModal('success', '✅ Entrega confirmada'); loadData() }
    else showModal('error', 'Error al confirmar entrega')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-white/40 text-sm">Cargando...</p>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-3 pb-24">
      {/* Modal */}
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-xl">Pedido Cocina</h1>
          <p className="text-muted text-xs">
            {worker?.full_name} · Entrega {deliveryDate ? format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es }) : '—'}
          </p>
        </div>
        {order && (
          <span className={`text-xs px-3 py-1 rounded-full font-bold ${order.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-400/20 text-yellow-300'}`}>
            {order.status === 'delivered' ? '✓ Entregado' : '⏳ Pendiente'}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['order', 'delivery'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-yellow-400 text-purple-900' : 'text-white/50'}`}>
            {t === 'order' ? '📋 Pedido' : '📦 Entrega'}
          </button>
        ))}
      </div>

      {/* ── TAB PEDIDO ── */}
      {tab === 'order' && (
        <>
          {order ? (
            <div className="card text-center py-8 space-y-3">
              <p className="text-4xl">✅</p>
              <p className="text-white font-bold">Pedido enviado</p>
              <p className="text-white/50 text-sm">{itemsWithQty.length} productos para el {format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es })}</p>
              <button onClick={() => setTab('delivery')} className="btn-primary">Ir a confirmar entrega →</button>
            </div>
          ) : (
            <>
              {/* Buscador */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">🔍</span>
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full bg-white/10 border border-white/15 rounded-2xl pl-8 pr-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-yellow-400/50 transition-all"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-lg">✕</button>
                )}
              </div>

              {/* Contador */}
              {itemsWithQty.length > 0 && (
                <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl px-4 py-2 flex items-center justify-between">
                  <span className="text-yellow-300 text-xs font-semibold">{itemsWithQty.length} productos seleccionados</span>
                  <button onClick={() => setQuantities({})} className="text-yellow-400/60 text-xs underline">Limpiar</button>
                </div>
              )}

              {/* Lista productos */}
              <div className="card space-y-0 overflow-hidden p-0">
                {filteredProducts.map((p, i) => (
                  <div key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < filteredProducts.length - 1 ? 'border-b border-white/5' : ''} ${(quantities[p.id] || 0) > 0 ? 'bg-yellow-400/5' : ''}`}>
                    <span className="flex-1 text-white text-sm leading-tight">{p.name}</span>
                    <input
                      ref={el => { qtyRefs.current[i] = el }}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={quantities[p.id] || ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          qtyRefs.current[i + 1]?.focus()
                        }
                      }}
                      placeholder="0"
                      className={`w-16 text-center rounded-xl px-2 py-2 text-white text-sm font-bold focus:outline-none transition-all border ${
                        (quantities[p.id] || 0) > 0
                          ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-300'
                          : 'bg-white/10 border-white/15'
                      }`}
                    />
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-8">No hay productos con ese nombre</p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── TAB ENTREGA ── */}
      {tab === 'delivery' && (
        <>
          {!order ? (
            <div className="card text-center py-8">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-white/50 text-sm">Primero haz el pedido</p>
            </div>
          ) : order.status === 'delivered' ? (
            <div className="card space-y-3">
              <p className="text-white font-bold text-sm">✅ Entrega confirmada</p>
              {order.items.map((item: OrderItem) => (
                <div key={item.product_id} className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-white/70 text-xs flex-1">{item.product?.name}</span>
                  <span className="text-white text-xs font-bold ml-2">Recibido: {item.qty_delivered ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-white/50 text-xs px-1">
                Ingresa la cantidad que llegó de cada producto. Presiona Enter para pasar al siguiente.
              </p>
              <div className="card space-y-0 overflow-hidden p-0">
                {order.items.map((item: OrderItem, i: number) => (
                  <div key={item.product_id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < order.items.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <span className="flex-1 text-white text-sm leading-tight">{item.product?.name}</span>
                    <input
                      ref={el => { delRefs.current[i] = el }}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={deliveries[item.product_id] || ''}
                      onChange={e => setDeliveries(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          delRefs.current[i + 1]?.focus()
                        }
                      }}
                      placeholder="0"
                      className={`w-16 text-center rounded-xl px-2 py-2 text-white text-sm font-bold focus:outline-none transition-all border ${
                        deliveries[item.product_id]
                          ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                          : 'bg-white/10 border-white/15'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Botón fijo abajo */}
      {tab === 'order' && !order && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-purple-950 to-transparent">
          <button onClick={submitOrder} disabled={saving || itemsWithQty.length === 0}
            className={`btn-primary w-full !py-4 !text-base max-w-lg mx-auto block ${itemsWithQty.length === 0 ? 'opacity-40' : ''}`}>
            {saving ? 'Enviando...' : `📤 Enviar pedido${itemsWithQty.length > 0 ? ` (${itemsWithQty.length})` : ''}`}
          </button>
        </div>
      )}

      {tab === 'delivery' && order && order.status !== 'delivered' && (
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
