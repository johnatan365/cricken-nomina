// Fechas de pedidos Food: cuándo se hizo el pedido y cuándo se confirmó la entrega.
// Todo se muestra en hora de Bogotá.

const TZ = 'America/Bogota'

// "vie 30 oct · 3:41 p. m."
export function fmtOrderDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const day = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  const time = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d)
  return `${day.replace(/[.,]/g, '').replace(/ de /g, ' ')} · ${time}`
}

// "30/10/2026 15:41" para el Excel
export function fmtOrderDateTimeExcel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const p = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`
}

// Día calendario en Bogotá (YYYY-MM-DD)
function bogotaDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

// "El mismo día" / "1 día después" / "3 días después"
export function confirmLag(orderedAt: string | null | undefined, confirmedAt: string | null | undefined): string | null {
  if (!orderedAt || !confirmedAt) return null
  const a = Date.parse(bogotaDay(orderedAt)), b = Date.parse(bogotaDay(confirmedAt))
  const days = Math.round((b - a) / 86400000)
  if (isNaN(days) || days < 0) return null
  if (days === 0) return 'El mismo día'
  return days === 1 ? '1 día después' : `${days} días después`
}
