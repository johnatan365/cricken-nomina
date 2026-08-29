import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendPushToAll } from '@/lib/pushServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LABELS: Record<string, string> = { cash: 'Caja', kitchen: 'Cocina' }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const secret = process.env.CRON_SECRET

    // Auth del cron: header Authorization o query param ?key=
    const authHeader = req.headers.get('authorization') || ''
    const okAuth =
      !!secret &&
      (authHeader === `Bearer ${secret}` || searchParams.get('key') === secret)
    if (!okAuth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Modo prueba: manda un push de prueba y sale.
    if (searchParams.get('test') === '1') {
      const result = await sendPushToAll({
        title: 'Cricken',
        body: '🔔 Notificación de prueba — todo funciona.',
        data: { url: '/admin' },
      })
      return NextResponse.json({ ok: true, test: true, ...result })
    }

    // Fecha de HOY en hora Colombia (UTC-5). El pedido de la noche queda con
    // delivery_date = manana, asi que a las 00:00 revisamos delivery_date = hoy.
    const today = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
    const supabase = createAdminClient()

    // Diagnóstico temporal: ?debug=1 muestra los pedidos recientes con su estado.
    if (searchParams.get('debug') === '1') {
      const { data: recent } = await supabase
        .from('kitchen_orders')
        .select('id, order_type, delivery_date, status, whatsapp_sent, items:kitchen_order_items(id)')
        .in('order_type', ['cash', 'kitchen'])
        .order('delivery_date', { ascending: false })
        .limit(12)
      const rows = (recent || []).map((o: any) => ({
        type: o.order_type,
        date: o.delivery_date,
        status: o.status,
        wa_sent: o.whatsapp_sent,
        items: (o.items || []).length,
      }))
      return NextResponse.json({ ok: true, today, rows })
    }

    const missing: string[] = []
    for (const tipo of ['cash', 'kitchen'] as const) {
      const { data } = await supabase
        .from('kitchen_orders')
        .select('id')
        .eq('order_type', tipo)
        .eq('delivery_date', today)
        .limit(1)
      if (!data || data.length === 0) missing.push(LABELS[tipo])
    }

    if (missing.length === 0) {
      return NextResponse.json({ ok: true, missing: [] })
    }

    const body = `⚠️ Falta el pedido de ${missing.join(' y ')} de hoy.`
    const result = await sendPushToAll({
      title: 'Cricken',
      body,
      data: { url: '/admin/pedidos' },
    })

    return NextResponse.json({ ok: true, missing, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
