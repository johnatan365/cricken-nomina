// lib/webPush.ts — utilidades de CLIENTE para las notificaciones web push.
//
// En el navegador el aviso lo entrega el service worker (/sw.js), que sigue vivo
// aunque la pestana este cerrada. El navegador entrega una "suscripcion" (una URL
// unica mas dos llaves de cifrado); el servidor le manda ahi los avisos, firmados
// con nuestra llave VAPID.
//
// La llave publica VAPID se puede publicar sin problema: solo sirve para que el
// navegador verifique que el aviso viene de nosotros. La privada vive como
// secreto en el servidor (env VAPID_PRIVATE_KEY).
//
// NO ejecuta codigo de browser en el top-level: todo va dentro de funciones.
import { apiFetch } from '@/lib/supabase'

export const VAPID_PUBLIC_KEY =
  'BHHvBYDps_UBWrq-ivkiKaVewxFvY0Bgnr_AvrOtRDAIG4DPtkx6A-kLMNr4RJ4FEptE_ssJsJyqsIm-5-8FfgU'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
}

/** Si el navegador soporta notificaciones web. */
export function isWebPushSupported(): boolean {
  return (
    isBrowser() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/**
 * En iPhone/iPad, Safari solo permite notificaciones si la persona agrego la
 * pagina a la pantalla de inicio. Sirve para explicarle por que no le aparece.
 */
export function needsHomeScreenOnIOS(): boolean {
  if (!isBrowser()) return false
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS se hace pasar por Mac, pero tiene pantalla tactil.
    (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1)
  if (!isIOS) return false
  const standalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  return !standalone
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function webPushPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isWebPushSupported()) return 'unsupported'
  return Notification.permission as 'granted' | 'denied' | 'default'
}

// La llave VAPID viaja en base64url; el navegador la pide como bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Pide el permiso, se suscribe y guarda la suscripcion en el servidor. DEBE
 * llamarse desde un toque de la persona: Safari ignora la peticion si no viene
 * de un gesto suyo. Devuelve un motivo cuando no se pudo, para poder explicarselo.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!isWebPushSupported()) return { ok: false, reason: 'unsupported' }
    if (needsHomeScreenOnIOS()) return { ok: false, reason: 'ios-home-screen' }

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm }

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // cast: en runtime es un Uint8Array válido; TS 5.7 estrechó el tipo de
      // applicationServerKey y no acepta Uint8Array<ArrayBufferLike> directo.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    })

    const res = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    if (!res.ok) return { ok: false, reason: 'save-failed' }

    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
}
