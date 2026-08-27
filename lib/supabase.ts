import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client for browser usage (workers)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Fetch para la API protegida: adjunta el token de la sesión actual como
// Authorization: Bearer. Usar en TODAS las llamadas a /api/admin/*.
export async function apiFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers || {})
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}

// Admin client (server-side only, bypasses RLS)
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
