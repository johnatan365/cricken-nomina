'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function checkSession() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/auth/login')
        return
      }

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cricken00@gmail.com'

      if (user.email === adminEmail) {
        router.replace('/admin')
      } else {
        router.replace('/worker/fichar')
      }
    }

    checkSession()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-white/40 text-sm">Cargando...</div>
    </div>
  )
}
