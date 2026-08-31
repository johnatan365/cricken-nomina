import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST — el admin le pone una nueva contraseña a un trabajador que la olvidó.
// Usa la service_role (auth.admin) para cambiarla directo, sin correos.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { worker_id, password } = await req.json()
    if (!worker_id || !password || String(password).trim().length < 6)
      return NextResponse.json({ error: 'Datos inválidos (mínimo 6 caracteres)' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: worker } = await supabase
      .from('workers')
      .select('auth_user_id')
      .eq('id', worker_id)
      .single()

    if (!worker?.auth_user_id)
      return NextResponse.json({ error: 'Ese trabajador no tiene cuenta de acceso' }, { status: 404 })

    const { error } = await supabase.auth.admin.updateUserById(worker.auth_user_id, {
      password: String(password).trim(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
