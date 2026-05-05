'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCOP, Worker, HourlyRate } from '@/types'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type WorkerSchedule = {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

type WorkerWithRates = Worker & { rates: HourlyRate[]; schedules: WorkerSchedule[]; has_cash_register: boolean; sunday_rate: number | null; has_kitchen_access: boolean; has_cash_order_access: boolean }

export default function TrabajadoresPage() {
  const [workers, setWorkers] = useState<WorkerWithRates[]>([])
  const [selected, setSelected] = useState<WorkerWithRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tarifas' | 'horario'>('tarifas')
  const [rateModal, setRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState<HourlyRate | null>(null)
  const [rateForm, setRateForm] = useState({ start_time: '08:00', end_time: '17:00', rate_per_hour: '' })
  const [saving, setSaving] = useState(false)
  const [editWorkerModal, setEditWorkerModal] = useState(false)
  const [editWorkerForm, setEditWorkerForm] = useState({ full_name: '', phone: '', email: '' })
  const [schedules, setSchedules] = useState<WorkerSchedule[]>([])
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 4000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [wRes, rRes] = await Promise.all([
      fetch('/api/admin/workers'),
      fetch('/api/admin/rates'),
    ])
    const wData = await wRes.json()
    const rData = await rRes.json()

    const workersData: Worker[] = wData.workers || []
    const ratesData: HourlyRate[] = rData.rates || []

    const ws = workersData.map((w) => ({
      ...w,
      has_cash_register: (w as WorkerWithRates).has_cash_register ?? false,
      sunday_rate: (w as WorkerWithRates).sunday_rate ?? null,
      has_kitchen_access: (w as WorkerWithRates).has_kitchen_access ?? false,
      has_cash_order_access: (w as WorkerWithRates).has_cash_order_access ?? false,
      rates: ratesData.filter((r) => r.worker_id === w.id).sort((a, b) => a.start_time.localeCompare(b.start_time)),
      schedules: [],
    }))
    setWorkers(ws)
    if (selected) {
      const updated = ws.find((w) => w.id === selected.id)
      if (updated) setSelected(updated)
    }
    setLoading(false)
  }, [selected])

  useEffect(() => { loadData() }, [])

  async function selectWorker(w: WorkerWithRates) {
    setSelected(w)
    setActiveTab('tarifas')
    const res = await fetch('/api/admin/worker-schedules?worker_id=' + w.id)
    const { schedules: existing } = await res.json()
    const full: WorkerSchedule[] = Array.from({ length: 7 }, (_, i) => {
      const found = (existing || []).find((s: WorkerSchedule) => s.day_of_week === i)
      return found || { day_of_week: i, start_time: '10:00', end_time: '22:00', is_active: false }
    })
    setSchedules(full)
  }

  async function saveSchedules() {
    if (!selected) return
    setSavingSchedule(true)
    const res = await fetch('/api/admin/worker-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: selected.id, schedules }),
    })
    if (res.ok) showStatus('success', 'Horario guardado correctamente')
    else showStatus('error', 'Error al guardar horario')
    setSavingSchedule(false)
  }

  async function toggleActive(worker: WorkerWithRates) {
    await fetch('/api/admin/workers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: worker.id, is_active: !worker.is_active }),
    })
    await loadData()
  }

  async function toggleKitchen(worker: WorkerWithRates) {
    const newVal = !worker.has_kitchen_access
    await fetch('/api/admin/workers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: worker.id, has_kitchen_access: newVal }),
    })
    setWorkers(prev => prev.map(w => w.id === worker.id ? { ...w, has_kitchen_access: newVal } : w))
    setSelected(prev => prev ? { ...prev, has_kitchen_access: newVal } : prev)
    showStatus('success', newVal ? 'Acceso a pedidos activado' : 'Acceso a pedidos desactivado')
  }

  async function toggleCash(worker: WorkerWithRates) {
    const newVal = !worker.has_cash_register
    await fetch('/api/admin/workers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: worker.id, has_cash_register: newVal }),
    })
    setWorkers((prev) =>
      prev.map((w) => w.id === worker.id ? { ...w, has_cash_register: newVal } : w)
    )
    setSelected((prev) => prev ? { ...prev, has_cash_register: newVal } : prev)
    showStatus('success', newVal ? 'Acceso a caja activado' : 'Acceso a caja desactivado')
  }

  async function deleteWorker(worker: WorkerWithRates) {
    if (!confirm(`Eliminar a ${worker.full_name}? Se borraran todos sus registros y pagos.`)) return
    const res = await fetch('/api/admin/workers?id=' + worker.id, { method: 'DELETE' })
    if (!res.ok) showStatus('error', 'Error al eliminar trabajador')
    else { showStatus('success', 'Trabajador eliminado'); setSelected(null); await loadData() }
  }

  function openEditWorker(worker: WorkerWithRates) {
    setEditWorkerForm({ full_name: worker.full_name, phone: worker.phone, email: worker.email })
    setEditWorkerModal(true)
  }

  async function saveWorker() {
    if (!selected) return
    setSaving(true)
    const res = await fetch('/api/admin/workers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, ...editWorkerForm }),
    })
    if (res.ok) { showStatus('success', 'Datos actualizados'); setEditWorkerModal(false) }
    else showStatus('error', 'Error al guardar')
    await loadData()
    setSaving(false)
  }

  function openAddRate() { setEditingRate(null); setRateForm({ start_time: '08:00', end_time: '17:00', rate_per_hour: '' }); setRateModal(true) }
  function openEditRate(rate: HourlyRate) {
    setEditingRate(rate)
    setRateForm({ start_time: rate.start_time.slice(0, 5), end_time: rate.end_time.slice(0, 5), rate_per_hour: rate.rate_per_hour.toString() })
    setRateModal(true)
  }

  async function saveRate() {
    if (!selected) return
    setSaving(true)
    if (editingRate) await fetch('/api/admin/rates?id=' + editingRate.id, { method: 'DELETE' })
    const res = await fetch('/api/admin/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: selected.id, start_time: rateForm.start_time + ':00', end_time: rateForm.end_time + ':00', rate_per_hour: parseFloat(rateForm.rate_per_hour) }),
    })
    if (res.ok) { showStatus('success', editingRate ? 'Tarifa actualizada' : 'Tarifa agregada'); setRateModal(false); setEditingRate(null) }
    else showStatus('error', 'Error al guardar tarifa')
    await loadData()
    setSaving(false)
  }

  async function deleteRate(rateId: string) {
    await fetch('/api/admin/rates?id=' + rateId, { method: 'DELETE' })
    showStatus('success', 'Tarifa eliminada')
    await loadData()
  }

  const filteredWorkers = workers.filter(w =>
    statusFilter === 'all' ? true : statusFilter === 'active' ? w.is_active : !w.is_active
  )

  const isConfigured = (w: WorkerWithRates) => w.rates.length > 0

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <h1 className="font-bold text-2xl text-white">Trabajadores</h1>

      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${status.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20' : 'bg-red-500/15 text-red-300 border border-red-400/20'}`}>
          {status.msg}
        </div>
      )}

      {loading ? <div className="text-center py-10 text-white/40">Cargando...</div> : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex gap-1 bg-white/10 rounded-xl p-1">
              {(['active', 'inactive', 'all'] as const).map((f) => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-all ${statusFilter === f ? 'bg-yellow-400 text-purple-900' : 'text-white/60 hover:text-white'}`}>
                  {f === 'active' ? 'Activos' : f === 'inactive' ? 'Inactivos' : 'Todos'}
                </button>
              ))}
            </div>
            <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">{filteredWorkers.length} trabajadores</p>
            {filteredWorkers.map((w) => (
              <button key={w.id} onClick={() => selectWorker(w)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${selected?.id === w.id ? 'bg-yellow-400/20 border-yellow-400/40' : 'bg-white/10 border-white/10 hover:bg-white/15'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${w.is_active ? 'bg-purple-500/40 text-white' : 'bg-white/10 text-white/40'}`}>
                      {w.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${w.is_active ? 'text-white' : 'text-white/40'}`}>{w.full_name}</p>
                      <p className="text-white/40 text-xs">{w.phone}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${w.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/30'}`}>
                      {w.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {!isConfigured(w) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">⚠️ Sin config</span>
                    )}
                    {w.has_cash_register && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300">🧾 Caja</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="bg-white/10 rounded-3xl border border-white/10 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-white text-lg">{selected.full_name}</h2>
                  <p className="text-white/50 text-sm">{selected.email}</p>
                  <p className="text-white/50 text-sm">{selected.phone}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button onClick={() => openEditWorker(selected)} className="text-xs bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-xl hover:bg-white/20 transition-all">Editar</button>
                  <button onClick={() => toggleActive(selected)} className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${selected.is_active ? 'bg-red-500/20 text-red-300 border-red-400/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'}`}>
                    {selected.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => deleteWorker(selected)} className="text-xs bg-red-600/30 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-xl hover:bg-red-600/50 transition-all">Eliminar</button>
                </div>
              </div>

              {/* Tarifa dominical / festivos por trabajador */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <p className="text-white text-sm font-semibold">🌅 Tarifa dom./festivos</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {selected.sunday_rate ? `$${selected.sunday_rate.toLocaleString('es-CO')}/hr` : 'Sin tarifa especial — usa tarifas normales'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" step="500"
                    defaultValue={selected.sunday_rate || ''}
                    placeholder="$ /hr"
                    id={`sunday-rate-${selected.id}`}
                    className="w-28 bg-white/10 border border-white/15 rounded-xl px-2 py-1.5 text-white text-xs font-bold focus:outline-none focus:border-yellow-400/60 transition-all"
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById(`sunday-rate-${selected.id}`) as HTMLInputElement
                      const val = parseFloat(input.value) || null
                      const res = await fetch('/api/admin/workers', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selected.id, sunday_rate: val }),
                      })
                      if (res.ok) { showStatus('success', val ? `Tarifa dom. guardada: $${val.toLocaleString('es-CO')}/hr` : 'Tarifa dominical eliminada'); await loadData() }
                      else showStatus('error', 'Error al guardar')
                    }}
                    className="text-xs bg-yellow-400/20 text-yellow-300 px-3 py-1.5 rounded-xl hover:bg-yellow-400/30 transition-all font-semibold"
                  >
                    Guardar
                  </button>
                </div>
              </div>

              {/* Toggle pedidos cocina */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <p className="text-white text-sm font-semibold">🛒 Pedido Cocina</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {selected.has_kitchen_access ? 'Puede hacer pedidos de cocina' : 'Sin acceso a pedidos de cocina'}
                  </p>
                </div>
                <button onClick={() => toggleKitchen(selected)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${selected.has_kitchen_access ? 'bg-yellow-400' : 'bg-white/20'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${selected.has_kitchen_access ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Toggle pedido caja */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <p className="text-white text-sm font-semibold">🗂 Pedido Caja</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {selected.has_cash_order_access ? 'Puede hacer pedidos de caja' : 'Sin acceso a pedidos de caja'}
                  </p>
                </div>
                <button onClick={async () => {
                  const newVal = !selected.has_cash_order_access
                  await fetch('/api/admin/workers', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: selected.id, has_cash_order_access: newVal }),
                  })
                  setWorkers(prev => prev.map(w => w.id === selected.id ? { ...w, has_cash_order_access: newVal } : w))
                  setSelected((prev: WorkerWithRates) => prev ? { ...prev, has_cash_order_access: newVal } : prev)
                  showStatus('success', newVal ? 'Acceso a pedido caja activado' : 'Acceso a pedido caja desactivado')
                }}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${selected.has_cash_order_access ? 'bg-yellow-400' : 'bg-white/20'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${selected.has_cash_order_access ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Toggle cierre de caja */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
                <div>
                  <p className="text-white text-sm font-semibold">🧾 Cierre de caja</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {selected.has_cash_register
                      ? 'Este trabajador puede registrar el cierre'
                      : 'Sin acceso al cierre de caja'}
                  </p>
                </div>
                <button
                  onClick={() => toggleCash(selected)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${selected.has_cash_register ? 'bg-yellow-400' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${selected.has_cash_register ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-white/10 rounded-xl p-1">
                {(['tarifas', 'horario'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-xs py-2 rounded-lg font-semibold transition-all ${activeTab === tab ? 'bg-yellow-400 text-purple-900' : 'text-white/60 hover:text-white'}`}>
                    {tab === 'tarifas' ? '💰 Tarifas' : '🗓 Horario'}
                  </button>
                ))}
              </div>

              {activeTab === 'tarifas' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Tarifas por hora</p>
                    <button onClick={openAddRate} className="text-xs bg-yellow-400/20 text-yellow-300 px-3 py-1.5 rounded-xl hover:bg-yellow-400/30 transition-all">+ Agregar</button>
                  </div>
                  {selected.rates.length === 0 ? (
                    <p className="text-white/30 text-sm text-center py-4">Sin tarifas configuradas.</p>
                  ) : selected.rates.map((rate) => (
                    <div key={rate.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-semibold">{rate.start_time.slice(0, 5)} a {rate.end_time.slice(0, 5)}</p>
                        <p className="text-yellow-300 text-sm font-bold">{formatCOP(rate.rate_per_hour)}/hr</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditRate(rate)} className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-all">Editar</button>
                        <button onClick={() => deleteRate(rate.id)} className="text-white/30 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-400/10 transition-all">Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'horario' && (
                <div className="space-y-3">
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Horario laboral</p>
                  {schedules.map((sched) => (
                    <div key={sched.day_of_week} className={`bg-white/5 rounded-2xl p-3 border ${sched.is_active ? 'border-white/10' : 'border-white/5 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={sched.is_active}
                              onChange={(e) => setSchedules(prev => prev.map((s, i) => i === sched.day_of_week ? { ...s, is_active: e.target.checked } : s))}
                              className="sr-only peer" />
                            <div className="w-9 h-5 bg-white/20 peer-checked:bg-yellow-400 rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                          </label>
                          <p className="text-white text-sm font-semibold">{DAY_NAMES[sched.day_of_week]}</p>
                        </div>
                        {!sched.is_active && <span className="text-white/30 text-xs">Día libre</span>}
                      </div>
                      {sched.is_active && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label">Inicio</label>
                            <input type="time" value={sched.start_time.slice(0, 5)}
                              onChange={(e) => setSchedules(prev => prev.map((s, i) => i === sched.day_of_week ? { ...s, start_time: e.target.value } : s))}
                              className="input-field" />
                          </div>
                          <div>
                            <label className="label">Fin</label>
                            <input type="time" value={sched.end_time.slice(0, 5)}
                              onChange={(e) => setSchedules(prev => prev.map((s, i) => i === sched.day_of_week ? { ...s, end_time: e.target.value } : s))}
                              className="input-field" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={saveSchedules} disabled={savingSchedule} className="btn-primary w-full">
                    {savingSchedule ? 'Guardando...' : 'Guardar horario'}
                  </button>
                </div>
              )}

              <div className="border-t border-white/10 pt-3">
                <p className="text-white/40 text-xs">Registrado: {new Date(selected.created_at).toLocaleDateString('es-CO')}</p>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 rounded-3xl border border-white/10 p-5 flex items-center justify-center">
              <p className="text-white/30 text-sm">Selecciona un trabajador</p>
            </div>
          )}
        </div>
      )}

      {/* Edit worker modal */}
      {editWorkerModal && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-4">
            <h3 className="font-bold text-white text-lg">Editar trabajador</h3>
            <div><label className="label">Nombre</label><input type="text" value={editWorkerForm.full_name} onChange={(e) => setEditWorkerForm(p => ({ ...p, full_name: e.target.value }))} className="input-field" /></div>
            <div><label className="label">Celular</label><input type="tel" value={editWorkerForm.phone} onChange={(e) => setEditWorkerForm(p => ({ ...p, phone: e.target.value }))} className="input-field" /></div>
            <div><label className="label">Correo</label><input type="email" value={editWorkerForm.email} onChange={(e) => setEditWorkerForm(p => ({ ...p, email: e.target.value }))} className="input-field" /></div>
            <div className="flex gap-3">
              <button onClick={() => setEditWorkerModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveWorker} disabled={saving} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Rate modal */}
      {rateModal && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-auto bg-purple-900 rounded-3xl border border-white/15 p-6 space-y-4">
            <h3 className="font-bold text-white text-lg">{editingRate ? 'Editar tarifa' : 'Nueva tarifa'} — {selected.full_name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Desde</label><input type="time" value={rateForm.start_time} onChange={(e) => setRateForm(p => ({ ...p, start_time: e.target.value }))} className="input-field" /></div>
              <div><label className="label">Hasta</label><input type="time" value={rateForm.end_time} onChange={(e) => setRateForm(p => ({ ...p, end_time: e.target.value }))} className="input-field" /></div>
            </div>
            <div><label className="label">Valor por hora (COP)</label><input type="number" value={rateForm.rate_per_hour} placeholder="Ej: 7000" onChange={(e) => setRateForm(p => ({ ...p, rate_per_hour: e.target.value }))} className="input-field" min="0" step="500" /></div>
            <div className="flex gap-3">
              <button onClick={() => { setRateModal(false); setEditingRate(null) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveRate} disabled={saving || !rateForm.rate_per_hour} className="btn-primary flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
