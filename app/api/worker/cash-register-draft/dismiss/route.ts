import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id = searchParams.get('worker_id')
    if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

    const supabase = createAdminClient()
    // Solo eliminar borradores APROBADOS (ya copiados a cash_registers, no se pierde nada).
    // Los 'rejected' NUNCA se borran: deben poder restaurarse desde el panel de admin.
    await supabase
      .from('cash_register_drafts')
      .delete()
      .eq('worker_id', worker_id)
      .eq('status', 'approved')

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
