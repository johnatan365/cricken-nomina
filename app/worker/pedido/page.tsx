'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type Product = { id: string; name: string; sort_order: number }
type OrderItem = { product_id: string; qty_delivered: number | null; product: Product }
type Order = { id: string; delivery_date: string; status: string; items: OrderItem[] }

export default function PedidoPage() {
  const [worker, setWorker]       = useState<{ id: string; full_name: string } | null>(null)
  const [products, setProducts]   = useState<Product[]>([])
  const [order, setOrder]         = useState<Order | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [deliveries, setDeliveries] = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [tab, setTab]             = useState<'order' | 'delivery'>('order')

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
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
      // Pre-cargar cantidades del pedido existente
      const qty: Record<string, number> = {}
      const del: Record<string, string> = {}
      json.order.items?.forEach((item: OrderItem) => {
        qty[item.product_id] = 0
        if (item.qty_delivered !== null) del[item.product_id] = String(item.qty_delivered)
      })
      setQuantities(qty)
      setDeliveries(del)
      if (json.order.status === 'pending') setTab('delivery')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function submitOrder() {
    if (!worker) return
    const items = products.map(p => ({ product_id: p.id, name: p.name, qty_requested: quantities[p.id] || 0 }))
    const hasItems = items.some(i => i.qty_requested > 0)
    if (!hasItems) { showMsg('error', 'Agrega al menos un producto con cantidad'); return }
    setSaving(true)
    const res = await fetch('/api/worker/kitchen-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: worker.id, items, delivery_date: deliveryDate }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { showMsg('error', json.error || 'Error al enviar'); return }
    showMsg('success', '✅ Pedido enviado — WhatsApp notificado')
    loadData()
    setTab('delivery')
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
    if (res.ok) { showMsg('success', '✅ Entrega confirmada'); loadData() }
    else showMsg('error', 'Error al confirmar')
  }

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-white/40">Cargando...</p></div>

  const orderedItems = order?.items || []
  const totalRequested = Object.values(quantities).reduce((s, v) => s + v, 0)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="page-title">Pedido de Cocina</h1>
        <p className="text-muted text-xs mt-0.5">
          {worker?.full_name} · Entrega: {deliveryDate ? format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es }) : '—'}
        </p>
      </div>

      {msg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${msg.type === 'success' ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' : 'bg-red-500/20 border-red-400/30 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['order', 'delivery'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-yellow-400 text-purple-900' : 'text-white/50 hover:text-white'}`}>
            {t === 'order' ? '📋 Hacer pedido' : '📦 Confirmar entrega'}
          </button>
        ))}
      </div>

      {/* TAB: Hacer pedido */}
      {tab === 'order' && (
        <div className="space-y-2">
          {order && order.status !== 'cancelled' ? (
            <div className="card text-center py-6">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-white font-bold">Pedido ya enviado</p>
              <p className="text-white/50 text-sm mt-1">El pedido para el {format(parseISO(deliveryDate), "d 'de' MMMM", { locale: es })} ya fue enviado.</p>
              <button onClick={() => setTab('delivery')} className="btn-primary mt-4">Ver entrega</button>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="grid grid-cols-3 gap-2 pb-2 border-b border-white/10 text-white/40 text-xs font-semibold">
                  <span className="col-span-2">Producto</span>
                  <span className="text-center">Cantidad</span>
                </div>
                {products.map(p => (
                  <div key={p.id} className="grid grid-cols-3 gap-2 items-center py-2 border-b border-white/5">
                    <span className="col-span-2 text-white text-xs">{p.name}</span>
                    <input
                      type="number" min="0"
                      value={quantities[p.id] || ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                      className="bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-yellow-400/60 transition-all w-full"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-2">
                <p className="text-white/40 text-xs">{totalRequested} unidades en total</p>
              </div>
              <button onClick={submitOrder} disabled={saving || totalRequested === 0}
                className="btn-primary w-full">
                {saving ? 'Enviando...' : `📤 Enviar pedido (${totalRequested} productos)`}
              </button>
            </>
          )}
        </div>
      )}

      {/* TAB: Confirmar entrega */}
      {tab === 'delivery' && (
        <div className="space-y-2">
          {!order ? (
            <div className="card text-center py-6">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-white/50 text-sm">Primero haz el pedido</p>
            </div>
          ) : order.status === 'delivered' ? (
            <div className="card text-center py-6">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-white font-bold">Entrega confirmada</p>
              <div className="mt-4 text-left space-y-2">
                {orderedItems.map((item: OrderItem) => (
                  <div key={item.product_id} className="flex justify-between text-sm">
                    <span className="text-white/70">{item.product?.name}</span>
                    <span className="text-white font-semibold">Recibido: {item.qty_delivered ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="text-white/50 text-xs px-1">Ingresa la cantidad que llegó de cada producto pedido:</p>
              <div className="card">
                <div className="grid grid-cols-3 gap-2 pb-2 border-b border-white/10 text-white/40 text-xs font-semibold">
                  <span className="col-span-1">Producto</span>
                  <span className="text-center">Pedido</span>
                  <span className="text-center">Entregado</span>
                </div>
                {orderedItems.map((item: OrderItem) => (
                  <div key={item.product_id} className="grid grid-cols-3 gap-2 items-center py-2 border-b border-white/5">
                    <span className="text-white text-xs">{item.product?.name}</span>
                    <span className="text-white/60 text-xs text-center">—</span>
                    <input
                      type="number" min="0"
                      value={deliveries[item.product_id] || ''}
                      onChange={e => setDeliveries(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                      placeholder="0"
                      className="bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-yellow-400/60 transition-all w-full"
                    />
                  </div>
                ))}
              </div>
              <button onClick={submitDelivery} disabled={saving} className="btn-primary w-full">
                {saving ? 'Guardando...' : '✅ Confirmar entrega'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
