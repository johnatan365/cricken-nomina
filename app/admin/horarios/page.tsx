'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/supabase'
import { DAY_NAMES, Schedule } from '@/types'

export default function HorariosPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('')

  useEffect(() => { loadSchedules() }, [])

  async function loadSchedules() {
    setLoading(true)
    const res = await apiFetch('/api/admin/schedules')
    const { schedules: data } = await res.json()

    const existing = data || []
    const full: Schedule[] = Array.from({ length: 7 }, (_, i) => {
      const found = existing.find((s: Schedule) => s.day_of_week === i)
      return found || {
        id: '',
        day_of_week: i,
        start_time: '10:00',
        end_time: '22:00',
        is_active: false,
      }
    })
    setSchedules(full)
    setLoading(false)
  }

  function updateSchedule(day: number, field: keyof Schedule, value: string | boolean) {
    setSchedules((prev) =>
      prev.map((s) => (s.day_of_week === day ? { ...s, [field]: value } : s))
    )
  }

  async function save() {
    setSaving(true)
    const res = await apiFetch('/api/admin/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedules }),
    })
    if (res.ok) {
      setStatus('Horarios guardados correctamente')
      await loadSchedules()
    } else {
      setStatus('Error al guardar horarios')
    }
    setSaving(false)
    setTimeout(() => setStatus(''), 3000)
  }

  const dayColors = [
    'from-red-500/20', 'from-blue-500/20', 'from-purple-500/20',
    'from-green-500/20', 'from-yellow-500/20', 'from-orange-500/20', 'from-pink-500/20'
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <div>
        <h1 className="font-bold text-2xl text-white">Horarios Laborales</h1>
        <p className="text-white/50 text-sm mt-1">
          Configura el horario de cada dia. Esto define la hora maxima antes de considerar horas extra.
        </p>
      </div>

      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
          status.includes('Error')
            ? 'bg-red-500/15 text-red-300 border border-red-400/20'
            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20'
        }`}>
          {status}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-white/40">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {schedules.map((sched) => (
            <div key={sched.day_of_week}
              className={`bg-gradient-to-r ${dayColors[sched.day_of_week]} to-transparent bg-white/10 rounded-2xl border ${
                sched.is_active ? 'border-white/15' : 'border-white/5 opacity-60'
              } p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sched.is_active}
                      onChange={(e) => updateSchedule(sched.day_of_week, 'is_active', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-white/20 peer-checked:bg-yellow-400 rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                  <p className="font-semibold text-white">{DAY_NAMES[sched.day_of_week]}</p>
                </div>
                {!sched.is_active && <span className="text-white/30 text-xs">Dia libre</span>}
              </div>

              {sched.is_active && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="label">Inicio turno</label>
                    <input
                      type="time"
                      value={sched.start_time.slice(0, 5)}
                      onChange={(e) => updateSchedule(sched.day_of_week, 'start_time', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label">Fin turno (maximo)</label>
                    <input
                      type="time"
                      value={sched.end_time.slice(0, 5)}
                      onChange={(e) => updateSchedule(sched.day_of_week, 'end_time', e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={save} disabled={saving || loading} className="btn-primary w-full py-4">
        {saving ? 'Guardando...' : 'Guardar Horarios'}
      </button>
    </div>
  )
}
