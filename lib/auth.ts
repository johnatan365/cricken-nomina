// lib/auth.ts — guardias de autenticación para los endpoints /api/admin/*
// Server-only. El token del usuario llega en el header Authorization: Bearer <jwt>
// (lo adjunta apiFetch en el cliente). Se valida contra Supabase.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from './supabase'

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cricken00@gmail.com')
  .trim()
  .toLowerCase()

async function getUserFromReq(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const supabase = createAdminClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

// Exige cualquier usuario autenticado (admin o trabajador).
// Devuelve null si está OK, o una respuesta 401 si no.
export async function requireUser(req: NextRequest): Promise<NextResponse | null> {
  const user = await getUserFromReq(req)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return null
}

// Exige que el usuario autenticado sea el administrador.
// Devuelve null si está OK, o 401/403 si no.
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const user = await getUserFromReq(req)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((user.email || '').trim().toLowerCase() !== ADMIN_EMAIL)
    return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 })
  return null
}
