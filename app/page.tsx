'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Si el enlace de recuperación de contraseña cae aquí (en vez de /auth/reset),
    // no meter a la persona a la app: mandarla a cambiar la contraseña.
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      router.replace('/auth/reset')
      return
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') router.replace('/auth/reset')
    })

    async function checkSession() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/auth/login')
        return
      }

      const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cricken00@gmail.com').trim().toLowerCase()

      if ((user.email || '').trim().toLowerCase() === adminEmail) {
        router.replace('/admin')
      } else {
        router.replace('/worker/fichar')
      }
    }

    checkSession()
    return () => { sub.subscription.unsubscribe() }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-white/40 text-sm">Cargando...</div>
    </div>
  )
}
