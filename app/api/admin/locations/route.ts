import { createAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_LOCATIONS = [
  { id: 'local', name: 'Local Cricken', lat: 6.2466729, lng: -75.5620269, radius_meters: 100, is_active: true },
  { id: 'casa', name: 'Casa (Pruebas)', lat: 6.2388160, lng: -75.5632259, radius_meters: 150, is_active: true },
]

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('locations').select('*').order('id')
    if (error || !data || data.length === 0) {
      // Seed defaults
      await supabase.from('locations').upsert(DEFAULT_LOCATIONS)
      return NextResponse.json({ locations: DEFAULT_LOCATIONS })
    }
    return NextResponse.json({ locations: data })
  } catch {
    return NextResponse.json({ locations: DEFAULT_LOCATIONS })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, is_active } = await req.json()
    const supabase = createAdminClient()
    const { error } = await supabase.from('locations').update({ is_active }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
