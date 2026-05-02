'use client'

import { supabase } from './supabase'

export async function captureSelfie(): Promise<string | null> {
  return new Promise((resolve) => {
    // Create video element
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')

    container.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.95);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 20px; padding: 20px;
    `

    video.style.cssText = `
      width: 100%; max-width: 340px;
      border-radius: 16px;
      transform: scaleX(-1);
      border: 3px solid rgba(250,204,21,0.5);
    `

    const title = document.createElement('p')
    title.textContent = '📸 Tómate una selfie para confirmar'
    title.style.cssText = 'color: white; font-size: 16px; font-weight: 600; text-align: center;'

    const hint = document.createElement('p')
    hint.textContent = 'Mira a la cámara y presiona el botón'
    hint.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 13px; text-align: center; margin-top: -10px;'

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; gap: 12px; width: 100%; max-width: 340px;'

    const captureBtn = document.createElement('button')
    captureBtn.textContent = '📷 Tomar foto'
    captureBtn.style.cssText = `
      flex: 1; background: #facc15; color: #581c87;
      font-weight: 700; font-size: 16px;
      padding: 14px; border-radius: 16px; border: none; cursor: pointer;
    `

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.style.cssText = `
      background: rgba(255,255,255,0.1); color: white;
      font-size: 14px; padding: 14px 16px;
      border-radius: 16px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;
    `

    btnRow.appendChild(captureBtn)
    btnRow.appendChild(cancelBtn)
    container.appendChild(title)
    container.appendChild(hint)
    container.appendChild(video)
    container.appendChild(btnRow)
    document.body.appendChild(container)

    let stream: MediaStream | null = null

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } }
    }).then((s) => {
      stream = s
      video.srcObject = s
      video.play()
    }).catch(() => {
      document.body.removeChild(container)
      resolve(null)
    })

    function cleanup() {
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (document.body.contains(container)) document.body.removeChild(container)
    }

    captureBtn.onclick = () => {
      canvas.width = 300
      canvas.height = 300
      const ctx = canvas.getContext('2d')!
      // Mirror the image
      ctx.translate(300, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, 300, 300)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5) // 50% quality = ~10KB
      cleanup()
      resolve(dataUrl)
    }

    cancelBtn.onclick = () => {
      cleanup()
      resolve(null)
    }
  })
}

export async function uploadSelfie(
  dataUrl: string,
  workerId: string,
  type: 'in' | 'out'
): Promise<string | null> {
  try {
    const base64 = dataUrl.split(',')[1]
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([array], { type: 'image/jpeg' })

    const fileName = `${workerId}/${type}_${Date.now()}.jpg`

    const { error } = await supabase.storage
      .from('selfies')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })

    if (error) {
      console.error('Upload selfie error:', error)
      return null
    }

    return fileName
  } catch (err) {
    console.error('Selfie upload error:', err)
    return null
  }
}

export async function getSelfieUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('selfies')
    .createSignedUrl(path, 3600) // 1 hour
  return data?.signedUrl || null
}
