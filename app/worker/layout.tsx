'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Nav base — siempre visible
const BASE_NAV = [
  { href: '/worker/fichar',   icon: '⏱️', label: 'Fichar' },
  { href: '/worker/historial', icon: '📊', label: 'Mi Historial' },
]

// Nav adicional si el trabajador maneja caja
const CASH_NAV = { href: '/worker/cierre-caja', icon: '🧾', label: 'Cierre de Caja' }

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [workerName, setWorkerName]   = useState('')
  const [hasCash, setHasCash]         = useState(false)

  useEffect(() => {
    async function loadWorker() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data } = await supabase
        .from('workers')
        .select('full_name, has_cash_register')
        .eq('auth_user_id', user.id)
        .single()

      if (data) {
        setWorkerName(data.full_name)
        setHasCash(data.has_cash_register ?? false)
      }
    }
    loadWorker()
  }, [router])

  const navItems = hasCash ? [...BASE_NAV, CASH_NAV] : BASE_NAV

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 z-50 transition-transform duration-300
        bg-gradient-to-b from-purple-900 to-purple-950 border-r border-white/10
        flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:relative md:flex-shrink-0
      `}>
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="font-bold text-white text-sm">Cricken</p>
              <p className="text-white/40 text-xs">Nómina</p>
            </div>
          </div>
        </div>

        {/* Worker name */}
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-white/40 text-xs uppercase tracking-wider">Trabajador</p>
          <p className="text-white font-semibold text-sm mt-1 truncate">{workerName || '...'}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                ${pathname === item.href
                  ? 'bg-yellow-400 text-purple-900'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
                }
              `}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-purple-900/50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl bg-white/10 text-white"
          >
            <span className="text-lg">☰</span>
          </button>
          <div className="flex items-center gap-2">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-7 h-7 rounded-full object-cover" />
            <span className="font-bold text-white text-sm">Cricken Nomina</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
