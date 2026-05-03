// app/api/admin/cash-registers/edit-base/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  try {
    const { id, next_base } = await req.json()
    if (!id || next_base === undefined)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('cash_registers')
      .update({ next_base: parseFloat(next_base) })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
