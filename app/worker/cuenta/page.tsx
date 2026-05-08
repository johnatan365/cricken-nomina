'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function CuentaPage() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{type:'success'|'error'; text:string}|null>(null)

  const handleSave = async () => {
    setMsg(null)
    if (password && password !== confirm) {
      setMsg({ type:'error', text:'Las contraseñas no coinciden.' }); return
    }
    if (password && password.length < 6) {
      setMsg({ type:'error', text:'La contraseña debe tener al menos 6 caracteres.' }); return
    }
    setSaving(true)
    const updates: Record<string, string> = {}
    if (email.trim()) updates.email = email.trim()
    if (password) updates.password = password

    if (Object.keys(updates).length === 0) {
      setMsg({ type:'error', text:'No hay cambios para guardar.' })
      setSaving(false); return
    }

    const { error } = await supabase.auth.updateUser(updates)
    setSaving(false)
    if (error) setMsg({ type:'error', text: error.message })
    else {
      setMsg({ type:'success', text:'✓ Cambios guardados correctamente.' })
      setEmail(''); setPassword(''); setConfirm('')
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      <div>
        <h1 className="page-title text-xl">Mi cuenta</h1>
        <p className="text-muted text-xs">Actualiza tu correo o contraseña de acceso</p>
      </div>

      {msg && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/15 text-red-300 border border-red-500/20'}`}>
          {msg.text}
        </div>
      )}

      <div className="card space-y-4">
        {/* Correo */}
        <div>
          <label className="label">Nuevo correo electrónico</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Dejar vacío para no cambiar"
            className="input-field" />
          <p className="text-white/30 text-xs mt-1">Este correo se usará para iniciar sesión</p>
        </div>

        <div className="border-t border-white/10" />

        {/* Contraseña */}
        <div>
          <label className="label">Nueva contraseña</label>
          <div className="flex gap-2">
            <input type={showPwd ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Dejar vacío para no cambiar"
              className="input-field flex-1" />
            <button onClick={() => setShowPwd(v => !v)}
              className="px-3 py-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 text-xs font-semibold transition-all">
              {showPwd ? '🙈 Ocultar' : '👁 Ver'}
            </button>
          </div>
        </div>

        {/* Confirmar */}
        <div>
          <label className="label">Confirmar contraseña</label>
          <div className="flex gap-2">
            <input type={showConf ? 'text' : 'password'}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              className="input-field flex-1" />
            <button onClick={() => setShowConf(v => !v)}
              className="px-3 py-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 text-xs font-semibold transition-all">
              {showConf ? '🙈 Ocultar' : '👁 Ver'}
            </button>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="btn-primary w-full !py-3">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
