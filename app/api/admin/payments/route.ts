import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const supabase = createAdminClient()
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')

    const { data: pendingLogs } = await supabase
      .from('time_logs')
      .select('*')
      .eq('is_paid', false)
      .not('clock_out', 'is', null)
      .order('clock_in')

    let paymentsQuery = supabase
      .from('payments')
      .select('*, workers(*)')
      .order('paid_at', { ascending: false })
      .limit(100)

    if (from) paymentsQuery = paymentsQuery.gte('paid_at', from)
    if (to) paymentsQuery = paymentsQuery.lte('paid_at', to)

    const { data: payments } = await paymentsQuery

    // Traer los time_logs pagados y asociarlos manualmente por payment_id
    const paymentIds = (payments || []).map((p: any) => p.id)
    let paidLogs: any[] = []
    if (paymentIds.length > 0) {
      const { data: logsData } = await supabase
        .from('time_logs')
        .select('*')
        .in('payment_id', paymentIds)
        .order('clock_in')
      paidLogs = logsData || []
    }

    const paymentsWithLogs = (payments || []).map((p: any) => ({
      ...p,
      time_logs: paidLogs.filter((l: any) => l.payment_id === p.id)
    }))

    return NextResponse.json({ pendingLogs: pendingLogs || [], payments: paymentsWithLogs })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const body = await req.json()
    const { worker_id, amount, notes, logIds } = body
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: payment } = await supabase
      .from('payments')
      .insert({ worker_id, amount, notes: notes || null, paid_at: now })
      .select()
      .single()

    await supabase
      .from('time_logs')
      .update({ is_paid: true, paid_at: now, payment_id: payment?.id })
      .in('id', logIds)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    const supabase = createAdminClient()

    // Get payment to find associated logs
    const { data: payment } = await supabase
      .from('payments').select('id').eq('id', id).single()
    if (!payment) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

    // Unmark logs as paid
    await supabase.from('time_logs')
      .update({ is_paid: false, paid_at: null, payment_id: null })
      .eq('payment_id', id)

    // Delete payment
    await supabase.from('payments').delete().eq('id', id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
