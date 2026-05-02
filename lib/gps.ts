export type Location = {
  id: string
  name: string
  lat: number
  lng: number
  radius_meters: number
  is_active: boolean
}

export const DEFAULT_LOCATIONS: Location[] = [
  {
    id: 'local',
    name: 'Local Cricken',
    lat: 6.2466729,
    lng: -75.5620269,
    radius_meters: 100,
    is_active: true,
  },
  {
    id: 'casa',
    name: 'Casa (Pruebas)',
    lat: 6.2388160,
    lng: -75.5632259,
    radius_meters: 150,
    is_active: true,
  },
]

export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })
}

export async function verifyInsideStore(locations?: Location[]): Promise<{
  success: boolean
  lat: number
  lng: number
  distance: number
  locationName?: string
  error?: string
}> {
  try {
    const position = await getCurrentPosition()
    const lat = position.coords.latitude
    const lng = position.coords.longitude
    const activeLocations = (locations || DEFAULT_LOCATIONS).filter((l) => l.is_active)

    for (const loc of activeLocations) {
      const distance = getDistanceMeters(lat, lng, loc.lat, loc.lng)
      if (distance <= loc.radius_meters) {
        return { success: true, lat, lng, distance, locationName: loc.name }
      }
    }

    let closestDistance = Infinity
    let closestName = ''
    for (const loc of activeLocations) {
      const distance = getDistanceMeters(lat, lng, loc.lat, loc.lng)
      if (distance < closestDistance) {
        closestDistance = distance
        closestName = loc.name
      }
    }

    return {
      success: false,
      lat,
      lng,
      distance: closestDistance,
      error: `Estás a ${Math.round(closestDistance)}m de ${closestName}. Debes estar en una ubicación autorizada para fichar.`,
    }
  } catch (err: unknown) {
    const error = err as GeolocationPositionError
    let message = 'No se pudo obtener tu ubicación'
    if (error.code === 1) message = 'Debes permitir el acceso a tu ubicación'
    if (error.code === 2) message = 'No se pudo determinar tu ubicación'
    if (error.code === 3) message = 'Tiempo agotado obteniendo ubicación'
    return { success: false, lat: 0, lng: 0, distance: 0, error: message }
  }
}
