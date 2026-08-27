// app/api/admin/base-change-requests/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET — listar solicitudes pendientes (o todas)
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending'

    const supabase = createAdminClient()
    const query = supabase
      .from('base_change_requests_admin')
      .select('*')
      .order('created_at', { ascending: false })

    const { data, error } = status === 'all'
      ? await query
      : await query.eq('status', status)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ requests: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PATCH — aprobar o rechazar
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const { id, status, admin_note } = await req.json()
    if (!id || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Actualizar la solicitud
    const { data: bcr, error: bcrError } = await supabase
      .from('base_change_requests')
      .update({ status, admin_note: admin_note || null, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (bcrError) return NextResponse.json({ error: bcrError.message }, { status: 400 })

    // Actualizar el estado en cash_registers
    await supabase
      .from('cash_registers')
      .update({ base_change_status: status })
      .eq('id', bcr.cash_register_id)

    // Si aprueba → actualizar next_base al valor solicitado
    if (status === 'approved') {
      await supabase
        .from('cash_registers')
        .update({ next_base: bcr.base_requested })
        .eq('id', bcr.cash_register_id)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
