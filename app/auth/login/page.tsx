'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Normalizar el correo (ignorar mayúsculas y espacios) — evita que el
    // teclado del móvil lo capitalice y mande al admin a la vista de usuario
    const cleanEmail = email.trim().toLowerCase()
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cricken00@gmail.com').trim().toLowerCase()
    if (cleanEmail === adminEmail) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (signInError) {
        setError('Credenciales incorrectas')
        setLoading(false)
        return
      }
      router.push('/admin')
      return
    }

    // Worker login
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (signInError) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    if (data.user) {
      router.push('/worker/fichar')
    }
    setLoading(false)
  }

  const handleForgot = async () => {
    setError('')
    setResetMsg('')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setError('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".')
      return
    }
    setResetLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setResetLoading(false)
    if (resetError) {
      setError('No se pudo enviar el correo. Intenta de nuevo en un momento.')
      return
    }
    setResetMsg('📩 Te enviamos un correo a ' + cleanEmail + ' con un enlace para cambiar tu contraseña. Revisa tu bandeja de entrada y también la carpeta de spam.')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      {/* Logo area */}
      <div className="mb-8 text-center">
        <img src="/Logo_Cricken.png" alt="Cricken" className="w-28 h-28 mx-auto mb-3 rounded-full object-cover" />
        <p className="text-white/50 text-sm mt-1">Sistema de Nómina</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/10 rounded-3xl border border-white/10 p-6">
        <h2 className="font-bold text-xl text-white mb-6">Iniciar Sesión</h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="input-field"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field pr-12"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="text-right -mt-1">
            <button type="button" onClick={handleForgot} disabled={resetLoading}
              className="text-yellow-400/90 hover:text-yellow-300 text-xs font-semibold disabled:opacity-50">
              {resetLoading ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/15 border border-red-400/30 rounded-2xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {resetMsg && (
            <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-2xl px-4 py-3 text-emerald-200 text-sm">
              {resetMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-white/50 text-sm">
            ¿No tienes cuenta?{' '}
            <Link href="/auth/register" className="text-yellow-400 hover:text-yellow-300 font-semibold">
              Regístrate
            </Link>
          </p>
        </div>
      </div>

      <p className="text-white/20 text-xs mt-8">Cricken Delicias Coreanas © 2024</p>
    </div>
  )
}
