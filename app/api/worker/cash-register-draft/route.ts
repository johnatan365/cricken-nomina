// app/api/worker/cash-register-draft/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — obtener borrador pendiente del trabajador
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id = searchParams.get('worker_id')
    if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('cash_register_drafts')
      .select('*')
      .eq('worker_id', worker_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ draft: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — guardar borrador (upsert)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      worker_id, shift, register_date,
      opening_fund, puve_cash, puve_transfer, puve_total_reported,
      didi_orders, whatsapp_orders, cancelled_orders, supplier_payments,
      cash_counted, cash_to_owner, bill_counts, puve_transfers,
      didi_cash_total, didi_transfer_total, whatsapp_total,
      cancelled_total, supplier_total, total_real_sales,
      expected_cash, difference, next_base, difference_note,
    } = body

    const supabase = createAdminClient()

    // Upsert — si ya existe borrador para ese turno/fecha, lo actualiza
    const { data, error } = await supabase
      .from('cash_register_drafts')
      .upsert({
        worker_id, shift,
        register_date: register_date || new Date().toISOString().split('T')[0],
        opening_fund:        opening_fund || 0,
        puve_cash:           puve_cash || 0,
        puve_transfer:       puve_transfer || 0,
        puve_total_reported: puve_total_reported || 0,
        didi_orders:         didi_orders || [],
        whatsapp_orders:     whatsapp_orders || [],
        cancelled_orders:    cancelled_orders || [],
        supplier_payments:   supplier_payments || [],
        cash_counted:        cash_counted || 0,
        cash_to_owner:       cash_to_owner || 0,
        bill_counts:         bill_counts || [],
        puve_transfers:      puve_transfers || [],
        didi_cash_total:     didi_cash_total || 0,
        didi_transfer_total: didi_transfer_total || 0,
        whatsapp_total:      whatsapp_total || 0,
        cancelled_total:     cancelled_total || 0,
        supplier_total:      supplier_total || 0,
        total_real_sales:    total_real_sales || 0,
        expected_cash:       expected_cash || 0,
        difference:          difference || 0,
        next_base:           next_base || 0,
        difference_note:     difference_note || null,
        status:              'pending_approval',
        updated_at:          new Date().toISOString(),
      }, {
        onConflict: 'worker_id,shift,register_date',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, draft: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE — marcar borrador como visto (dismiss) después de que el admin lo resolvió
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
