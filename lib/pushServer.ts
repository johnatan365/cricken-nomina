// lib/pushServer.ts — helper de SERVIDOR para las notificaciones web push.
// Server-only: usa el cliente service_role y la llave privada VAPID.
//
// Las suscripciones se guardan en Supabase Storage (bucket privado 'internal',
// archivo push-subscriptions.json) en vez de una tabla, para no tocar el schema.
import * as webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/webPush'

const BUCKET = 'internal'
const FILE = 'push-subscriptions.json'

type StoredSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  [k: string]: any
}

// Crea el bucket privado si no existe. Ignora el error de "ya existe".
async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    // Ignorar: si ya existe, createBucket falla y no pasa nada.
  }
}

export async function getSubscriptions(): Promise<StoredSubscription[]> {
  try {
    const supabase = createAdminClient()
    await ensureBucket(supabase)
    const { data } = await supabase.storage.from(BUCKET).download(FILE)
    if (data) {
      const text = await data.text()
      return JSON.parse(text)
    }
    return []
  } catch {
    return []
  }
}

async function saveAll(subs: StoredSubscription[]): Promise<void> {
  const supabase = createAdminClient()
  await ensureBucket(supabase)
  await supabase.storage
    .from(BUCKET)
    .upload(FILE, Buffer.from(JSON.stringify(subs)), {
      contentType: 'application/json',
      upsert: true,
    })
}

export async function addSubscription(sub: StoredSubscription): Promise<void> {
  const subs = await getSubscriptions()
  const idx = subs.findIndex((s) => s.endpoint === sub.endpoint)
  if (idx >= 0) subs[idx] = sub
  else subs.push(sub)
  await saveAll(subs)
}

export async function sendPushToAll(payload: {
  title: string
  body: string
  data?: any
}): Promise<{ sent: number; removed: number }> {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:cricken00@gmail.com',
    VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY!
  )

  const subs = await getSubscriptions()
  const dead = new Set<string>()
  let sent = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as any, JSON.stringify(payload))
      sent++
    } catch (e: any) {
      // 404/410 = la suscripcion ya no existe en el navegador; hay que borrarla.
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(sub.endpoint)
    }
  }

  let removed = 0
  if (dead.size > 0) {
    const alive = subs.filter((s) => !dead.has(s.endpoint))
    removed = subs.length - alive.length
    await saveAll(alive)
  }

  return { sent, removed }
}
