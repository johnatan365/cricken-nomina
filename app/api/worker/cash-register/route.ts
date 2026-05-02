// app/api/worker/cash-register/route.ts
import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — historial de cierres del trabajador (últimos 30 días)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const worker_id = searchParams.get('worker_id')
    if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('worker_id', worker_id)
      .order('register_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ registers: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST — enviar cierre de caja
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      worker_id,
      location_id,
      shift,
      register_date,
      opening_fund,
      cash_sales,
      transfer_sales,
      expenses,
      cash_counted,
      difference_note,
    } = body

    // Validaciones básicas
    if (!worker_id || !shift) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }
    if (!['morning', 'afternoon'].includes(shift)) {
      return NextResponse.json({ error: 'Turno inválido' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verificar si ya existe un cierre para este turno/fecha/trabajador
    const { data: existing } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('worker_id', worker_id)
      .eq('shift', shift)
      .eq('register_date', register_date || new Date().toISOString().split('T')[0])
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un cierre de caja para este turno hoy' },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('cash_registers')
      .insert({
        worker_id,
        location_id: location_id || null,
        shift,
        register_date: register_date || new Date().toISOString().split('T')[0],
        opening_fund: Number(opening_fund) || 0,
        cash_sales: Number(cash_sales) || 0,
        transfer_sales: Number(transfer_sales) || 0,
        expenses: Number(expenses) || 0,
        cash_counted: Number(cash_counted) || 0,
        difference_note: difference_note || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, register: data })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
