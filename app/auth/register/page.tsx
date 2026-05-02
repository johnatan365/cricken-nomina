'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      setError('Ingresa un número de celular válido (10 dígitos)')
      return
    }

    setLoading(true)

    // Create auth user
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (signUpError) {
      setError(signUpError.message === 'User already registered'
        ? 'Este correo ya está registrado'
        : 'Error al crear la cuenta: ' + signUpError.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('Error inesperado al crear la cuenta')
      setLoading(false)
      return
    }

    // Create worker profile
    const { error: profileError } = await supabase.from('workers').insert({
      auth_user_id: data.user.id,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim().toLowerCase(),
    })

    if (profileError) {
      setError('Error al crear el perfil: ' + profileError.message)
      setLoading(false)
      return
    }

    router.push('/worker/fichar')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      {/* Logo */}
      <div className="mb-6 text-center">
        <img src="/Logo_Cricken.png" alt="Cricken" className="w-24 h-24 mx-auto mb-3 rounded-full object-cover" />
        <p className="text-white/50 text-sm">Sistema de Nómina</p>
      </div>

      <div className="w-full max-w-sm bg-white/10 rounded-3xl border border-white/10 p-6">
        <h2 className="font-bold text-xl text-white mb-6">Crear cuenta</h2>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="label">Nombre completo</label>
            <input
              type="text"
              value={form.fullName}
              onChange={handleChange('fullName')}
              placeholder="Ej: María García López"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="label">Número de celular</label>
            <input
              type="tel"
              value={form.phone}
              onChange={handleChange('phone')}
              placeholder="3001234567"
              className="input-field"
              required
              maxLength={10}
            />
          </div>

          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              placeholder="tu@correo.com"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange('password')}
                placeholder="Mínimo 6 caracteres"
                className="input-field pr-12"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-1"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirmar contraseña</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={handleChange('confirmPassword')}
                placeholder="Repite tu contraseña"
                className="input-field pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-1"
              >
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/15 border border-red-400/30 rounded-2xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Creando cuenta...' : 'Registrarme'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-white/50 text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link href="/auth/login" className="text-yellow-400 hover:text-yellow-300 font-semibold">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
