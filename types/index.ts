export type Worker = {
  id: string
  auth_user_id: string
  full_name: string
  phone: string
  email: string
  is_active: boolean
  webauthn_credential_id: string | null
  webauthn_public_key: string | null
  created_at: string
  updated_at: string
}

export type Schedule = {
  id: string
  day_of_week: number // 0=Sun, 1=Mon...6=Sat
  start_time: string // "HH:MM"
  end_time: string
  is_active: boolean
}

export type HourlyRate = {
  id: string
  worker_id: string
  start_time: string // "HH:MM"
  end_time: string
  rate_per_hour: number
  created_at: string
}

export type TimeLog = {
  id: string
  worker_id: string
  clock_in: string
  clock_out: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  clock_in_notes: string | null
  clock_out_notes: string | null
  is_overtime: boolean
  overtime_reason: string | null
  original_clock_out: string | null
  status: 'open' | 'completed' | 'admin_modified'
  hours_worked: number | null
  amount_earned: number | null
  is_paid: boolean
  paid_at: string | null
  payment_id: string | null
  created_at: string
  updated_at: string
  // joined
  workers?: Worker
}

export type Payment = {
  id: string
  worker_id: string
  amount: number
  notes: string | null
  paid_at: string
  created_at: string
  workers?: Worker
}

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
