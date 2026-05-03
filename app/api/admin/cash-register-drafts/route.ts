// app/api/admin/cash-register-drafts/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — listar borradores pendientes
export async function GET(_req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('cash_register_drafts_admin')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ drafts: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PATCH — aprobar o rechazar borrador
export async function PATCH(req: NextRequest) {
  try {
    const { id, action, admin_note } = await req.json()
    if (!id || !['approved', 'rejected'].includes(action))
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const supabase = createAdminClient()

    // Obtener el borrador
    const { data: draft, error: draftErr } = await supabase
      .from('cash_register_drafts')
      .select('*')
      .eq('id', id)
      .single()

    if (draftErr || !draft)
      return NextResponse.json({ error: 'Borrador no encontrado' }, { status: 404 })

    // Marcar como resuelto
    await supabase
      .from('cash_register_drafts')
      .update({ status: action, admin_note: admin_note || null, resolved_at: new Date().toISOString() })
      .eq('id', id)

    // Si aprueba → crear el cierre real en cash_registers
    if (action === 'approved') {
      const n = (v: unknown) => parseFloat(String(v)) || 0
      const { error: insertErr } = await supabase
        .from('cash_registers')
        .insert({
          worker_id:           draft.worker_id,
          shift:               draft.shift,
          register_date:       draft.register_date,
          opening_fund:        draft.opening_fund,
          puve_cash:           draft.puve_cash,
          puve_transfer:       draft.puve_transfer,
          puve_total_reported: draft.puve_total_reported,
          didi_orders:         draft.didi_orders,
          whatsapp_orders:     draft.whatsapp_orders,
          cancelled_orders:    draft.cancelled_orders,
          supplier_payments:   draft.supplier_payments,
          cash_counted:        draft.cash_counted,
          cash_to_owner:       draft.cash_to_owner,
          next_base:           draft.next_base,
          bill_counts:         draft.bill_counts,
          puve_transfers:      draft.puve_transfers,
          didi_cash_total:     draft.didi_cash_total,
          didi_transfer_total: draft.didi_transfer_total,
          whatsapp_total:      draft.whatsapp_total,
          cancelled_total:     draft.cancelled_total,
          supplier_total:      draft.supplier_total,
          total_real_sales:    draft.total_real_sales,
          expected_cash:       draft.expected_cash,
          difference:          draft.difference,
          difference_note:     draft.difference_note,
          difference_approved: 'approved',
        })

      if (insertErr)
        return NextResponse.json({ error: insertErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
