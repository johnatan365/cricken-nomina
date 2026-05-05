'use client'
import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

type Product = { id: string; name: string; price: number; supplier: string; is_active: boolean }
type OrderItem = { id: string; product_id: string; qty_requested: number; qty_delivered: number | null; product: Product }
type Order = { id: string; delivery_date: string; status: string; whatsapp_sent: boolean; worker: { full_name: string }; items: OrderItem[] }

const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0)

export default function AdminPedidosPage() {
  const [orders, setOrders]       = useState<Order[]>([])
  const [products, setProducts]   = useState<Product[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'orders'|'products'>('orders')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [msg, setMsg]             = useState<{ type: 'success'|'error'; text: string } | null>(null)
  const [dateFrom, setDateFrom]   = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]       = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [editingItem, setEditingItem] = useState<Record<string, {qty_requested?: string; qty_delivered?: string; price?: string}>>({})
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [newProduct, setNewProduct] = useState({ name: '', price: '', supplier: 'Brisas' })
  const [savingProduct, setSavingProduct] = useState(false)

  const showMsg = (type: 'success'|'error', text: string) => {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 4000)
  }

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (supplierFilter !== 'all') params.set('supplier', supplierFilter)
    const res  = await fetch('/api/admin/kitchen-orders?' + params)
    const json = await res.json()
    setOrders(json.orders || [])
    setLoading(false)
  }, [dateFrom, dateTo, supplierFilter])

  const loadProducts = useCallback(async () => {
    const res  = await fetch('/api/admin/kitchen-products')
    const json = await res.json()
    setProducts(json.products || [])
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => { loadProducts() }, [loadProducts])

  const suppliers = [...new Set(products.map(p => p.supplier))].sort()

  async function saveItemEdit(itemId: string, orderId: string) {
    const edit = editingItem[itemId]
    if (!edit) return
    const update: Record<string, number> = {}
    if (edit.qty_requested !== undefined) update.qty_requested = parseInt(edit.qty_requested) || 0
    if (edit.qty_delivered !== undefined) update.qty_delivered = parseInt(edit.qty_delivered) || 0
    await fetch('/api/admin/kitchen-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'item', item_id: itemId, ...update }),
    })
    const newEditing = { ...editingItem }
    delete newEditing[itemId]
    setEditingItem(newEditing)
    showMsg('success', 'Guardado')
    loadOrders()
  }

  async function savePriceEdit(productId: string, newPrice: number, orderDate: string) {
    await fetch('/api/admin/kitchen-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'price', product_id: productId, new_price: newPrice, order_date: orderDate }),
    })
    showMsg('success', 'Precio actualizado')
    loadOrders(); loadProducts()
  }

  async function deleteOrder(id: string) {
    if (!confirm('¿Eliminar este pedido?')) return
    await fetch('/api/admin/kitchen-orders?id=' + id, { method: 'DELETE' })
    showMsg('success', 'Pedido eliminado')
    loadOrders()
  }

  async function saveProduct() {
    setSavingProduct(true)
    if (editingProduct) {
      await fetch('/api/admin/kitchen-products', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingProduct.id, name: editingProduct.name, price: editingProduct.price, supplier: editingProduct.supplier }),
      })
      showMsg('success', 'Producto actualizado'); setEditingProduct(null)
    } else {
      const res = await fetch('/api/admin/kitchen-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProduct.name, price: parseFloat(newProduct.price) || 0, supplier: newProduct.supplier }),
      })
      if (res.ok) { showMsg('success', 'Producto agregado'); setNewProduct({ name: '', price: '', supplier: 'Brisas' }) }
      else showMsg('error', 'Error al agregar')
    }
    setSavingProduct(false); loadProducts()
  }

  async function deleteProduct(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    await fetch('/api/admin/kitchen-products?id=' + id, { method: 'DELETE' })
    showMsg('success', 'Producto eliminado'); loadProducts()
  }

  function groupBySupplier(items: OrderItem[]) {
    const groups: Record<string, OrderItem[]> = {}
    items.forEach(item => {
      const sup = item.product?.supplier || 'Otro'
      if (!groups[sup]) groups[sup] = []
      groups[sup].push(item)
    })
    return groups
  }

  function orderTotal(items: OrderItem[]) {
    return items.reduce((s, i) => {
      const qty = i.qty_delivered ?? i.qty_requested
      const price = editingItem[i.id]?.price !== undefined
        ? parseFloat(editingItem[i.id].price || '0') || 0
        : (i.product?.price || 0)
      return s + qty * price
    }, 0)
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="page-title">Pedidos de Cocina</h1>
        <p className="text-muted mt-1">Gestión de pedidos e inventario</p>
      </div>

      {msg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${msg.type === 'success' ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300' : 'bg-red-500/20 border-red-400/30 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      <div className="flex gap-2 bg-white/5 rounded-2xl p-1">
        {(['orders', 'products'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === t ? 'bg-yellow-400 text-purple-900' : 'text-white/50'}`}>
            {t === 'orders' ? '📦 Pedidos' : '🛒 Productos'}
          </button>
        ))}
      </div>

      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="card grid grid-cols-3 gap-3">
            <div><label className="label">Desde</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field" /></div>
            <div><label className="label">Hasta</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field" /></div>
            <div><label className="label">Proveedor</label>
              <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="input-field">
                <option value="all">Todos</option>
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {loading ? <div className="card text-center py-10"><p className="text-white/40">Cargando...</p></div>
          : orders.length === 0 ? <div className="card text-center py-10"><p className="text-3xl mb-2">📋</p><p className="text-white/50">No hay pedidos</p></div>
          : orders.map(order => {
            const groups = groupBySupplier(order.items || [])
            const total  = orderTotal(order.items || [])
            return (
              <div key={order.id} className="card">
                <div className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                  <div>
                    <p className="text-white font-bold text-sm">
                      {format(parseISO(order.delivery_date), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                    <p className="text-muted text-xs mt-0.5">
                      {order.worker?.full_name} ·{' '}
                      <span className={order.status === 'delivered' ? 'text-emerald-400' : 'text-yellow-400'}>
                        {order.status === 'delivered' ? '✓ Entregado' : '⏳ Pendiente'}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-white/40 text-xs">Total</p>
                      <p className="text-yellow-400 font-bold">{cop(total)}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteOrder(order.id) }}
                      className="text-red-400/40 hover:text-red-400 text-xs px-2 transition-all">🗑</button>
                    <span className="text-white/30 text-xs">{expanded === order.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded === order.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                    {Object.entries(groups).map(([supplier, items]) => {
                      const supplierTotal = items.reduce((s, i) => {
                        const qty = i.qty_delivered ?? i.qty_requested
                        const price = editingItem[i.id]?.price !== undefined
                          ? parseFloat(editingItem[i.id].price || '0') || 0
                          : (i.product?.price || 0)
                        return s + qty * price
                      }, 0)
                      return (
                        <div key={supplier}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider">{supplier}</p>
                            <p className="text-yellow-400 text-xs font-bold">{cop(supplierTotal)}</p>
                          </div>

                          {/* Header columnas */}
                          <div className="grid grid-cols-6 gap-2 text-xs text-white/30 font-semibold px-3 mb-1">
                            <span className="col-span-2">Producto</span>
                            <span className="text-center">Pedido</span>
                            <span className="text-center">Entregado</span>
                            <span className="text-right">Precio</span>
                            <span className="text-right">Total</span>
                          </div>

                          <div className="space-y-1">
                            {items.map(item => {
                              const edit = editingItem[item.id] || {}
                              const qty = item.qty_delivered ?? item.qty_requested
                              const price = edit.price !== undefined
                                ? parseFloat(edit.price) || 0
                                : (item.product?.price || 0)
                              const isDirty = Object.keys(edit).length > 0
                              return (
                                <div key={item.id} className="grid grid-cols-6 gap-2 items-center bg-white/5 rounded-xl px-3 py-2">
                                  <span className="col-span-2 text-white text-xs">{item.product?.name}</span>

                                  {/* Pedido */}
                                  <input type="number" min="0"
                                    value={edit.qty_requested ?? item.qty_requested}
                                    onChange={e => setEditingItem(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty_requested: e.target.value } }))}
                                    className="w-full text-center bg-white/10 border border-white/15 rounded-lg px-1 py-1 text-white text-xs focus:outline-none focus:border-yellow-400/60" />

                                  {/* Entregado */}
                                  <input type="number" min="0"
                                    value={edit.qty_delivered ?? (item.qty_delivered ?? '')}
                                    onChange={e => setEditingItem(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty_delivered: e.target.value } }))}
                                    placeholder="—"
                                    className="w-full text-center bg-white/10 border border-white/15 rounded-lg px-1 py-1 text-emerald-300 text-xs focus:outline-none focus:border-emerald-400/60" />

                                  {/* Precio */}
                                  <input type="number" min="0"
                                    value={edit.price ?? item.product?.price ?? ''}
                                    onChange={e => setEditingItem(prev => ({ ...prev, [item.id]: { ...prev[item.id], price: e.target.value } }))}
                                    className="w-full text-right bg-white/10 border border-white/15 rounded-lg px-1 py-1 text-white text-xs focus:outline-none focus:border-yellow-400/60" />

                                  {/* Total */}
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-white text-xs font-semibold">{cop(qty * price)}</span>
                                    {isDirty && (
                                      <button onClick={() => {
                                        saveItemEdit(item.id, order.id)
                                        if (edit.price !== undefined) savePriceEdit(item.product_id, parseFloat(edit.price) || 0, order.delivery_date)
                                      }} className="text-yellow-400 text-xs ml-1 hover:text-yellow-300">💾</button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    <div className="flex justify-between font-bold border-t border-white/15 pt-3">
                      <span className="text-white">Total pedido</span>
                      <span className="text-yellow-400 text-lg">{cop(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <p className="text-white font-bold text-sm">{editingProduct ? '✏️ Editar producto' : '➕ Nuevo producto'}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="label">Nombre</label>
                <input type="text" value={editingProduct ? editingProduct.name : newProduct.name}
                  onChange={e => editingProduct ? setEditingProduct({...editingProduct, name: e.target.value}) : setNewProduct(p => ({...p, name: e.target.value}))}
                  className="input-field" placeholder="Nombre del producto" />
              </div>
              <div>
                <label className="label">Precio</label>
                <input type="number" min="0" value={editingProduct ? editingProduct.price : newProduct.price}
                  onChange={e => editingProduct ? setEditingProduct({...editingProduct, price: parseFloat(e.target.value)}) : setNewProduct(p => ({...p, price: e.target.value}))}
                  className="input-field" placeholder="$ precio" />
              </div>
              <div>
                <label className="label">Proveedor</label>
                <input type="text" value={editingProduct ? editingProduct.supplier : newProduct.supplier}
                  onChange={e => editingProduct ? setEditingProduct({...editingProduct, supplier: e.target.value}) : setNewProduct(p => ({...p, supplier: e.target.value}))}
                  className="input-field" placeholder="Proveedor" />
              </div>
            </div>
            <div className="flex gap-2">
              {editingProduct && <button onClick={() => setEditingProduct(null)} className="btn-secondary flex-1">Cancelar</button>}
              <button onClick={saveProduct} disabled={savingProduct} className="btn-primary flex-1">
                {savingProduct ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Agregar producto'}
              </button>
            </div>
          </div>

          <div className="card space-y-0">
            <div className="grid grid-cols-4 gap-2 pb-2 border-b border-white/10 text-white/40 text-xs font-semibold">
              <span className="col-span-2">Producto</span><span>Proveedor</span><span className="text-right">Precio</span>
            </div>
            {products.map(p => (
              <div key={p.id} className="grid grid-cols-4 gap-2 items-center py-2.5 border-b border-white/5">
                <span className="col-span-2 text-white text-xs">{p.name}</span>
                <span className="text-white/60 text-xs">{p.supplier}</span>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-white text-xs font-semibold">{p.price > 0 ? cop(p.price) : '—'}</span>
                  <button onClick={() => setEditingProduct(p)} className="text-white/30 hover:text-yellow-400 text-xs px-1.5 py-0.5 rounded transition-all">✏</button>
                  <button onClick={() => deleteProduct(p.id)} className="text-white/30 hover:text-red-400 text-xs px-1.5 py-0.5 rounded transition-all">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
