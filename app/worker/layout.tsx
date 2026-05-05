'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const BASE_NAV = [
  { href: '/worker/fichar',    icon: '⏱️', label: 'Fichar' },
  { href: '/worker/historial', icon: '📊', label: 'Mi Historial' },
]
const CASH_NAV    = { href: '/worker/cierre-caja', icon: '🧾', label: 'Cierre de Caja' }
const KITCHEN_NAV = { href: '/worker/pedido', icon: '🛒', label: 'Pedido Cocina' }

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)   // desktop: abierto por defecto
  const [mobileOpen, setMobileOpen]   = useState(false)  // mobile: cerrado por defecto
  const [workerName, setWorkerName]   = useState('')
  const [hasCash, setHasCash]         = useState(false)
  const [hasKitchen, setHasKitchen]   = useState(false)

  useEffect(() => {
    async function loadWorker() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data } = await supabase
        .from('workers')
        .select('full_name, has_cash_register, has_kitchen_access')
        .eq('auth_user_id', user.id)
        .single()
      if (data) {
        setWorkerName(data.full_name)
        setHasCash(data.has_cash_register ?? false)
        setHasKitchen(data.has_kitchen_access ?? false)
      }
    }
    loadWorker()
  }, [router])

  const navItems = [
    ...BASE_NAV,
    ...(hasCash    ? [CASH_NAV]    : []),
    ...(hasKitchen ? [KITCHEN_NAV] : []),
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen flex">

      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar desktop — colapsa con sidebarOpen */}
      <aside className={`
        hidden md:flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden
        bg-gradient-to-b from-purple-900 to-purple-950 border-r border-white/10
        ${sidebarOpen ? 'w-56' : 'w-0 border-0'}
      `}>
        <div className="p-5 border-b border-white/10 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            <div>
              <p className="font-bold text-white text-sm">Cricken</p>
              <p className="text-white/40 text-xs">Nómina</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-b border-white/10 whitespace-nowrap">
          <p className="text-white/40 text-xs uppercase tracking-wider">Trabajador</p>
          <p className="text-white font-semibold text-sm mt-1 truncate">{workerName || '...'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 whitespace-nowrap
                ${pathname === item.href ? 'bg-yellow-400 text-purple-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Sidebar mobile — overlay */}
      <aside className={`
        fixed top-0 left-0 h-full w-56 z-50 flex flex-col
        bg-gradient-to-b from-purple-900 to-purple-950 border-r border-white/10
        transition-transform duration-300 md:hidden
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="font-bold text-white text-sm">Cricken</p>
              <p className="text-white/40 text-xs">Nómina</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-white/40 text-xs uppercase tracking-wider">Trabajador</p>
          <p className="text-white font-semibold text-sm mt-1 truncate">{workerName || '...'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200
                ${pathname === item.href ? 'bg-yellow-400 text-purple-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all">
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar con hamburguesa */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-purple-950/60 sticky top-0 z-30">
          {/* Hamburguesa desktop */}
          <button onClick={() => setSidebarOpen(o => !o)}
            className="hidden md:flex p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          {/* Hamburguesa mobile */}
          <button onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/Logo_Cricken.png" alt="Cricken" className="w-7 h-7 rounded-full object-cover" />
            <span className="font-bold text-white text-sm">Cricken Nómina</span>
          </div>
          <span className="text-white/30 text-xs ml-2">{workerName}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {children}
        </div>
      </main>
    </div>
  )
}
