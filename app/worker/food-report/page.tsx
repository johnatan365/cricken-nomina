'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, apiFetch } from '@/lib/supabase'
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
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: w } = await supabase.from('workers').select('id, full_name').eq('auth_user_id', user.id).single()
    if (!w) return
    setWorker(w)

    const res  = await apiFetch(`/api/admin/food-order-payments?date_from=${dateFrom}&date_to=${dateTo}`)
    const json = await res.json()
    setOrders(json.orders || [])
    setPayments(json.payments || [])
    setLoading(false)
  }, [dateFrom, dateTo])

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

      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Esta quincena', fn: () => {
              const now = new Date()
              const d = now.getDate()
              if (d <= 15) {
                setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`)
                setDateTo(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-15`)
              } else {
                const last = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
                setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-16`)
                setDateTo(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${last}`)
              }
            }},
            { label: 'Últ. quincena', fn: () => {
              const now = new Date()
              const d = now.getDate()
              if (d <= 15) {
                const prev = new Date(now.getFullYear(), now.getMonth(), 0)
                const last = prev.getDate()
                setDateFrom(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-16`)
                setDateTo(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${last}`)
              } else {
                setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`)
                setDateTo(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-15`)
              }
            }},
            { label: 'Este mes', fn: () => {
              const now = new Date()
              const last = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
              setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`)
              setDateTo(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${last}`)
            }},
            { label: 'Mes anterior', fn: () => {
              const now = new Date()
              const prev = new Date(now.getFullYear(), now.getMonth(), 0)
              const last = prev.getDate()
              setDateFrom(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-01`)
              setDateTo(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${last}`)
            }},
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn}
              className="text-xs px-3 py-1.5 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition-all font-semibold">
              {label}
            </button>
          ))}
        </div>
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

    </div>
  )
}
