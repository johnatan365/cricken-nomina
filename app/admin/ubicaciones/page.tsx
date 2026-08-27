'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/supabase'

type Location = {
  id: string
  name: string
  lat: number
  lng: number
  radius_meters: number
  is_active: boolean
}

export default function UbicacionesPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    apiFetch('/api/admin/locations')
      .then((r) => r.json())
      .then(({ locations }) => { setLocations(locations || []); setLoading(false) })
  }, [])

  async function toggle(id: string) {
    const loc = locations.find((l) => l.id === id)
    if (!loc) return
    const newActive = !loc.is_active
    setLocations((prev) => prev.map((l) => l.id === id ? { ...l, is_active: newActive } : l))

    const res = await apiFetch('/api/admin/locations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: newActive }),
    })

    if (res.ok) {
      setStatus(newActive ? `${loc.name} activada` : `${loc.name} desactivada`)
      setTimeout(() => setStatus(''), 3000)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <div>
        <h1 className="font-bold text-2xl text-white">Ubicaciones</h1>
        <p className="text-white/50 text-sm mt-1">
          Controla desde que ubicaciones pueden fichar los trabajadores.
        </p>
      </div>

      {status && (
        <div className="bg-emerald-500/20 border border-emerald-400/20 rounded-2xl px-4 py-3 text-emerald-300 text-sm">
          {status}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-white/40">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <div key={loc.id} className={`bg-white/10 rounded-2xl border p-5 transition-all ${
              loc.is_active ? 'border-emerald-400/30' : 'border-white/10 opacity-60'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{loc.id === 'local' ? '🏪' : '🏠'}</span>
                    <p className="font-semibold text-white">{loc.name}</p>
                    {loc.id === 'casa' && (
                      <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-400/20 px-2 py-0.5 rounded-full">
                        Solo pruebas
                      </span>
                    )}
                  </div>
                  <p className="text-white/40 text-xs font-mono">{loc.lat}, {loc.lng}</p>
                  <p className="text-white/40 text-xs mt-1">Radio: {loc.radius_meters}m</p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input type="checkbox" checked={loc.is_active} onChange={() => toggle(loc.id)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-white/20 peer-checked:bg-emerald-500 rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
              </div>

              {!loc.is_active && (
                <p className="text-white/30 text-xs mt-3">
                  Los trabajadores no podran fichar desde esta ubicacion
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
