'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady]       = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [show, setShow]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Al llegar desde el enlace del correo, Supabase procesa el token de
    // recuperación y deja una sesión activa (evento PASSWORD_RECOVERY).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setReady(true); setChecking(false) }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecking(false)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  const handleSave = async () => {
    setMsg(null)
    if (password.length < 6) {
      setMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' }); return
    }
    if (password !== confirm) {
      setMsg({ type: 'error', text: 'Las contraseñas no coinciden.' }); return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'success', text: '✓ Contraseña actualizada. Redirigiendo al inicio de sesión...' })
    setTimeout(() => { supabase.auth.signOut().finally(() => router.replace('/auth/login')) }, 1800)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <img src="/Logo_Cricken.png" alt="Cricken" className="w-28 h-28 mx-auto mb-3 rounded-full object-cover" />
        <p className="text-white/50 text-sm mt-1">Cambiar contraseña</p>
      </div>

      <div className="w-full max-w-sm bg-white/10 rounded-3xl border border-white/10 p-6">
        {checking ? (
          <p className="text-white/50 text-sm text-center py-6">Cargando...</p>
        ) : !ready ? (
          <div className="text-center space-y-3">
            <p className="text-4xl">⏳</p>
            <p className="text-white font-bold">Enlace inválido o vencido</p>
            <p className="text-white/50 text-sm">
              El enlace para cambiar la contraseña ya no sirve. Vuelve a pedirlo desde
              "¿Olvidaste tu contraseña?" en el inicio de sesión.
            </p>
            <Link href="/auth/login" className="inline-block mt-2 text-yellow-400 hover:text-yellow-300 font-semibold text-sm">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-bold text-xl text-white">Nueva contraseña</h2>

            {msg && (
              <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/15 text-red-300 border border-red-500/20'}`}>
                {msg.text}
              </div>
            )}

            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input-field"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="label">Confirmar contraseña</label>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                className="input-field"
                autoComplete="new-password"
              />
            </div>

            <button type="button" onClick={() => setShow(v => !v)}
              className="text-white/50 hover:text-white text-xs font-semibold">
              {show ? '🙈 Ocultar contraseñas' : '👁 Ver contraseñas'}
            </button>

            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full mt-1">
              {saving ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
