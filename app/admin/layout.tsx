'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/admin', icon: '📊', label: 'Nomina', exact: true },
  { href: '/admin/trabajadores', icon: '👥', label: 'Trabajadores' },
  { href: '/admin/pagos', icon: '💰', label: 'Pagos' },
  { href: '/admin/ubicaciones', icon: '📍', label: 'Ubicaciones' },
  { href: '/admin/cierre-caja', icon: '🧾', label: 'Caja' },
  { href: '/admin/pedidos', icon: '🛒', label: 'Pedidos' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cricken00@gmail.com'
      if (!user || user.email !== adminEmail) {
        router.replace('/auth/login')
        return
      }
      setChecking(false)
    }
    checkAdmin()
  }, [router])

  const isActive = (item: typeof navItems[0]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Verificando acceso...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-60 z-50 transition-transform duration-300
        bg-gradient-to-b from-purple-950 to-black border-r border-white/10
        flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:relative md:flex-shrink-0
      `}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="font-bold text-white text-sm">Cricken</p>
              <p className="text-yellow-400/70 text-xs font-semibold">Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
                isActive(item)
                  ? 'bg-yellow-400 text-purple-900'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}>
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <span>🚪</span> Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-purple-950/80">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl bg-white/10 text-white">
            ☰
          </button>
          <img src="/Logo_Cricken.png" alt="Cricken" className="w-7 h-7 rounded-full object-cover" />
          <span className="font-bold text-white text-sm">Admin Cricken</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
