'use client'

function base64ToUint8Array(base64: string): Uint8Array {
  const base64Url = base64.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Url)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials
  )
}

export async function registerBiometric(userId: string, userName: string): Promise<{
  credentialId: string
  publicKey: string
} | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userIdBytes = new TextEncoder().encode(userId)

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Cricken Nómina',
          id: window.location.hostname,
        },
        user: {
          id: userIdBytes,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential

    if (!credential) return null

    const response = credential.response as AuthenticatorAttestationResponse
    const credentialId = uint8ArrayToBase64(new Uint8Array(credential.rawId))
    const publicKey = uint8ArrayToBase64(new Uint8Array(response.attestationObject))

    return { credentialId, publicKey }
  } catch (err) {
    console.error('WebAuthn registration error:', err)
    return null
  }
}

export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: base64ToUint8Array(credentialId).buffer as ArrayBuffer,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential

    return !!assertion
  } catch (err) {
    console.error('WebAuthn verification error:', err)
    return false
  }
}
