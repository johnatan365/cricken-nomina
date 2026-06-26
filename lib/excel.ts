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
type OrderItemExport = { product_id?: string; product: { name: string; price: number; supplier: string } | null; qty_requested?: number | null; qty_delivered: number | null; price_override: number | null }
type OrderExport = { id: string; delivery_date: string; status: string; worker: { full_name: string } | null; items: OrderItemExport[] }

function orderTotalExport(items: OrderItemExport[]) {
  return items.reduce((s, i) => {
    const qty   = i.qty_delivered ?? 0
    const price = i.price_override ?? i.product?.price ?? 0
    return s + qty * price
  }, 0)
}

// Construye una hoja pivote: filas = fechas, columnas = productos, celda = "pedido / entregado"
function buildProductsByDaySheet(orders: OrderExport[]) {
  // Fechas únicas ordenadas
  const dates = [...new Set(orders.map(o => o.delivery_date))].sort()

  // Acumular cantidades por producto y fecha
  type Cell = { req: number; del: number }
  const productNames: Record<string, string> = {}
  const productOrder: string[] = [] // mantiene primer orden de aparición
  const data: Record<string, Record<string, Cell>> = {} // productKey -> date -> {req, del}

  for (const o of orders) {
    for (const item of (o.items || [])) {
      if (!item.product) continue
      const key = item.product_id || item.product.name
      if (!productNames[key]) {
        productNames[key] = item.product.name
        productOrder.push(key)
      }
      if (!data[key]) data[key] = {}
      if (!data[key][o.delivery_date]) data[key][o.delivery_date] = { req: 0, del: 0 }
      data[key][o.delivery_date].req += item.qty_requested ?? 0
      data[key][o.delivery_date].del += item.qty_delivered ?? 0
    }
  }

  const fmtDate = (d: string) => {
    try { return format(parseISOLocal(d), 'dd/MM') } catch { return d }
  }

  const header = ['Fecha', ...productOrder.map(key => productNames[key]), 'Total']
  const rows: (string | number)[][] = [header]

  for (const d of dates) {
    const row: (string | number)[] = [fmtDate(d)]
    let totalReq = 0
    let totalDel = 0
    for (const key of productOrder) {
      const cell = data[key][d]
      if (!cell || (cell.req === 0 && cell.del === 0)) {
        row.push('—')
      } else {
        row.push(`${cell.req} / ${cell.del}`)
        totalReq += cell.req
        totalDel += cell.del
      }
    }
    row.push(totalReq === 0 && totalDel === 0 ? '—' : `${totalReq} / ${totalDel}`)
    rows.push(row)
  }

  // Fila de totales por producto al final
  const totalsRow: (string | number)[] = ['Total producto']
  let grandReq = 0
  let grandDel = 0
  for (const key of productOrder) {
    let pReq = 0
    let pDel = 0
    for (const d of dates) {
      const cell = data[key][d]
      if (cell) { pReq += cell.req; pDel += cell.del }
    }
    totalsRow.push(pReq === 0 && pDel === 0 ? '—' : `${pReq} / ${pDel}`)
    grandReq += pReq
    grandDel += pDel
  }
  totalsRow.push(`${grandReq} / ${grandDel}`)
  rows.push(totalsRow)

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, ...productOrder.map(() => ({ wch: 18 })), { wch: 12 }]
  return ws
}

// Parser de fecha "YYYY-MM-DD" sin desfase de zona horaria
function parseISOLocal(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
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

  // Hojas pivote: productos por día (cantidad pedida / entregada)
  const wsCocinaProductos = buildProductsByDaySheet(cocina)
  const wsCajaProductos   = buildProductsByDaySheet(caja)

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
  XLSX.utils.book_append_sheet(wb, wsCocinaProductos, '🍳 Cocina x Producto')
  XLSX.utils.book_append_sheet(wb, wsCaja,    '🗂 Caja')
  XLSX.utils.book_append_sheet(wb, wsCajaProductos,   '🗂 Caja x Producto')
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
