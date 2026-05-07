'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0)

type Order = { id: string; delivery_date: string; status: string; total: number; items: any[] }
type Payment = { id: string; amount: number; paid_at: string; date_from: string; date_to: string; notes: string }

export default function FoodReportPage() {
  const [worker, setWorker]       = useState<{ id: string; full_name: string } | null>(null)
  const [orders, setOrders]       = useState<Order[]>([])
  const [payments, setPayments]   = useState<Payment[]>([])
  const [loading, setLoading]     = useState(true)
  const [month, setMonth]         = useState(() => new Date().toISOString().slice(0, 7))

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)

    const dateFrom = `${month}-01`
    const lastDay  = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate()
    const dateTo   = `${month}-${lastDay}`

    // Pedidos entregados del mes
    const res = await fetch(`/api/admin/kitchen-orders?order_type=food&date_from=${dateFrom}&date_to=${dateTo}`)
    const json = await res.json()
    const delivered = (json.orders || []).filter((o: any) => o.status === 'delivered')
    const ordersWithTotal = delivered.map((o: any) => ({
      ...o,
      total: (o.items || []).reduce((s: number, i: any) => s + (i.qty_delivered ?? 0) * (i.price_override ?? i.product?.price ?? 0), 0)
    }))
    setOrders(ordersWithTotal)

    // Usar food-order-payments para estado por pedido
    const pRes = await fetch(`/api/admin/food-order-payments?date_from=${dateFrom}&date_to=${dateTo}`)
    const pJson = await pRes.json()
    setPayments(pJson.payments || [])

    setLoading(false)
  }, [month])

  useEffect(() => { loadData() }, [loadData])

  const totalOrders   = orders.reduce((s: number, o: any) => s + (o.total || 0), 0)
  const totalPaid     = orders.filter((o: any) => o.isPaid).reduce((s: number, o: any) => s + (o.total || 0), 0)
  const totalPending  = Math.max(0, totalOrders - totalPaid)

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-white/40 text-sm">Cargando...</p></div>

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      <div>
        <h1 className="page-title text-xl">Mi cuenta — Food Tracker</h1>
        <p className="text-muted text-xs">{worker?.full_name}</p>
      </div>

      <div>
        <label className="label">Mes</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input-field" />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-white/40 text-xs">Total pedidos</p>
          <p className="text-white font-bold text-sm">{cop(totalOrders)}</p>
        </div>
        <div className="card text-center">
          <p className="text-white/40 text-xs">Pagado</p>
          <p className="text-emerald-400 font-bold text-sm">{cop(totalPaid)}</p>
        </div>
        <div className="card text-center">
          <p className="text-white/40 text-xs">Pendiente</p>
          <p className="text-red-300 font-bold text-sm">{cop(totalPending)}</p>
        </div>
      </div>

      {/* Pedidos */}
      <div>
        <p className="text-white font-bold text-sm mb-2">Pedidos entregados</p>
        {orders.length === 0 ? (
          <div className="card text-center py-6"><p className="text-white/40 text-sm">Sin pedidos entregados este mes</p></div>
        ) : orders.map((o: any) => (
          <div key={o.id} className="card flex items-center justify-between mb-2">
            <div>
              <p className="text-white font-bold text-sm">{format(parseISO(o.delivery_date), "d 'de' MMMM", { locale: es })}</p>
              <p className="text-white/40 text-xs">{o.items?.length || 0} productos</p>
            </div>
            <div className="text-right">
              <p className="text-yellow-400 font-bold">{cop(o.total)}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${o.isPaid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                {o.isPaid ? '✓ Pagado' : '⏳ Pendiente'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagos */}
      <div>
        <p className="text-white font-bold text-sm mb-2">Pagos registrados</p>
        {payments.length === 0 ? (
          <div className="card text-center py-6"><p className="text-white/40 text-sm">Sin pagos registrados este mes</p></div>
        ) : payments.map(p => (
          <div key={p.id} className="card flex items-center justify-between mb-2">
            <div>
              <p className="text-white font-bold text-sm">{cop(p.amount)}</p>
              <p className="text-white/40 text-xs">{format(parseISO(p.paid_at), "d MMM", { locale: es })}
                {p.notes ? ` · ${p.notes}` : ''}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">✓ Pagado</span>
          </div>
        ))}
      </div>
    </div>
  )
}
