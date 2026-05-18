import * as XLSX from 'xlsx'
import { TimeLog, Worker, Payment, formatCOP, formatHours } from '@/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function exportWorkerHistory(logs: TimeLog[], workerName: string) {
  const data = logs.map((log) => ({
    Fecha: format(new Date(log.clock_in), 'dd/MM/yyyy', { locale: es }),
    'Hora Entrada': format(new Date(log.clock_in), 'HH:mm'),
    'Hora Salida': log.clock_out ? format(new Date(log.clock_out), 'HH:mm') : '—',
    'Horas Trabajadas': log.hours_worked ? formatHours(log.hours_worked) : '—',
    'Valor Ganado': log.amount_earned ? formatCOP(log.amount_earned) : '—',
    Estado: log.is_paid ? 'Pagado' : 'Pendiente',
    'Nota Entrada': log.clock_in_notes || '',
    'Nota Salida': log.clock_out_notes || '',
    'Horas Extra': log.is_overtime ? 'Sí' : 'No',
    'Razón Extra': log.overtime_reason || '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Historial')

  // Style column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 18 },
    { wch: 16 }, { wch: 10 }, { wch: 25 }, { wch: 25 },
    { wch: 12 }, { wch: 25 },
  ]

  XLSX.writeFile(wb, `Historial_${workerName.replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}

export function exportAdminReport(logs: TimeLog[], workers: Worker[]) {
  // Summary per worker
  const summary = workers.map((w) => {
    const workerLogs = logs.filter((l) => l.worker_id === w.id && l.clock_out)
    const totalHours = workerLogs.reduce((acc, l) => acc + (l.hours_worked || 0), 0)
    const totalEarned = workerLogs.reduce((acc, l) => acc + (l.amount_earned || 0), 0)
    const pendingEarned = workerLogs
      .filter((l) => !l.is_paid)
      .reduce((acc, l) => acc + (l.amount_earned || 0), 0)

    return {
      Trabajador: w.full_name,
      Celular: w.phone,
      'Total Horas': formatHours(totalHours),
      'Total Ganado': formatCOP(totalEarned),
      'Pendiente de Pago': formatCOP(pendingEarned),
      'Días Trabajados': workerLogs.length,
    }
  })

  // Detailed log
  const detail = logs
    .filter((l) => l.clock_out)
    .map((log) => {
      const worker = workers.find((w) => w.id === log.worker_id)
      return {
        Trabajador: worker?.full_name || '—',
        Fecha: format(new Date(log.clock_in), 'dd/MM/yyyy', { locale: es }),
        'Hora Entrada': format(new Date(log.clock_in), 'HH:mm'),
        'Hora Salida': log.clock_out ? format(new Date(log.clock_out), 'HH:mm') : '—',
        'Horas Trabajadas': log.hours_worked ? formatHours(log.hours_worked) : '—',
        'Valor Ganado': log.amount_earned ? formatCOP(log.amount_earned) : '—',
        Pagado: log.is_paid ? 'Sí' : 'No',
        'Fecha Pago': log.paid_at ? format(new Date(log.paid_at), 'dd/MM/yyyy') : '—',
        Observaciones: log.clock_out_notes || '',
      }
    })

  const wb = XLSX.utils.book_new()
  const wsSummary = XLSX.utils.json_to_sheet(summary)
  const wsDetail = XLSX.utils.json_to_sheet(detail)

  wsSummary['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 }]
  wsDetail['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 13 }, { wch: 30 }]

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle')

  XLSX.writeFile(wb, `Nomina_Cricken_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}

// ── Tipos para pedidos ──
type OrderItemExport = { product: { name: string; price: number; supplier: string } | null; qty_delivered: number | null; price_override: number | null }
type OrderExport = { id: string; delivery_date: string; status: string; worker: { full_name: string } | null; items: OrderItemExport[] }

function orderTotalExport(items: OrderItemExport[]) {
  return items.reduce((s, i) => {
    const qty   = i.qty_delivered ?? 0
    const price = i.price_override ?? i.product?.price ?? 0
    return s + qty * price
  }, 0)
}

export function exportPedidosReport(
  cocina: OrderExport[],
  caja: OrderExport[],
  food: OrderExport[],
  dateFrom: string,
  dateTo: string
) {
  const wb = XLSX.utils.book_new()

  function buildSheet(orders: OrderExport[]) {
    const rows: (string | number)[][] = [
      ['Fecha entrega', 'Trabajador', 'Estado', 'Total pedido'],
    ]
    let subtotal = 0
    for (const o of orders) {
      const isDelivered = o.status === 'delivered'
      const total = isDelivered ? orderTotalExport(o.items || []) : null
      if (total !== null) subtotal += total
      rows.push([
        o.delivery_date,
        o.worker?.full_name ?? '—',
        isDelivered ? 'Entregado' : 'Pendiente',
        total !== null ? total : '—',
      ])
    }
    rows.push(['TOTAL', '', '', subtotal])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 18 }]
    return { ws, subtotal }
  }

  const { ws: wsCocina, subtotal: totCocina } = buildSheet(cocina)
  const { ws: wsCaja,   subtotal: totCaja   } = buildSheet(caja)
  const { ws: wsFood,   subtotal: totFood   } = buildSheet(food)

  // Hoja Resumen
  const resumen: (string | number)[][] = [
    ['Módulo', 'Pedidos entregados', 'Total'],
    ['Cocina', cocina.filter(o => o.status === 'delivered').length, totCocina],
    ['Caja',   caja.filter(o => o.status === 'delivered').length,   totCaja],
    ['Food',   food.filter(o => o.status === 'delivered').length,   totFood],
    [],
    ['TOTAL GENERAL', '', totCocina + totCaja + totFood],
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 18 }]

  XLSX.utils.book_append_sheet(wb, wsResumen, '📊 Resumen')
  XLSX.utils.book_append_sheet(wb, wsCocina,  '🍳 Cocina')
  XLSX.utils.book_append_sheet(wb, wsCaja,    '🗂 Caja')
  XLSX.utils.book_append_sheet(wb, wsFood,    '🍔 Food')

  const filename = `Informe_Pedidos_${dateFrom}_${dateTo}.xlsx`
  XLSX.writeFile(wb, filename)
}

export function exportPayments(payments: Payment[]) {
  const data = payments.map((p) => ({
    Trabajador: p.workers?.full_name || '—',
    Monto: formatCOP(p.amount),
    Fecha: format(new Date(p.paid_at), 'dd/MM/yyyy', { locale: es }),
    Notas: p.notes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos')
  ws['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 12 }, { wch: 30 }]

  XLSX.writeFile(wb, `Pagos_Cricken_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}
