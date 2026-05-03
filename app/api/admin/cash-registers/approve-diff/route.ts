// app/api/admin/cash-registers/approve-diff/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, admin_note } = await req.json()

    if (!id || !['approved', 'rejected'].includes(status))
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('cash_registers')
      .update({
        difference_approved: status,
        // guardamos la nota del admin en difference_note si rechaza
        ...(status === 'rejected' && admin_note
          ? { difference_note: admin_note }
          : {}),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
