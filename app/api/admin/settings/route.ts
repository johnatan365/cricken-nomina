// app/api/admin/settings/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'global')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ settings: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const body = await req.json()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('settings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', 'global')
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ settings: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
