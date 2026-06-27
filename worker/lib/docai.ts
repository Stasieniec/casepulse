/**
 * Google Document AI helper — service-account JWT auth + process endpoint.
 *
 * All crypto is done with the Web Crypto API (available in Cloudflare Workers).
 *
 * Required env vars (see worker/index.ts Env type):
 *   GCP_SA_KEY           — JSON string of a GCP service-account key file
 *   GCP_DOCAI_PROCESSOR  — full resource name:
 *                          projects/{project_number}/locations/{location}/processors/{processor_id}
 *
 * The access token is cached in a module-level variable and reused until 5
 * minutes before expiry (tokens last 3600s by default).
 */

// ── base64url helpers ────────────────────────────────────────────────────────

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlEncode(buf: ArrayBuffer): string {
  return b64urlEncodeBytes(new Uint8Array(buf))
}

function b64urlEncodeStr(str: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(str))
}

// ── Token cache ──────────────────────────────────────────────────────────────

let _cachedToken: string | null = null
let _tokenExpiresAt = 0 // unix seconds

// ── JWT / OAuth2 ─────────────────────────────────────────────────────────────

/**
 * Mint a Google OAuth2 access token from a service-account key JSON string.
 *
 * Flow:
 *  1. Parse SA JSON → client_email, private_key (PEM PKCS8), token_uri
 *  2. Build a signed RS256 JWT assertion
 *  3. POST to token_uri with grant_type=jwt-bearer → return access_token
 *
 * The token is cached for (expiry - 300) seconds to avoid re-minting on every
 * request.
 */
export async function getGoogleAccessToken(saKeyJson: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (_cachedToken && now < _tokenExpiresAt - 300) {
    return _cachedToken
  }

  // 1. Parse service account JSON
  let sa: { client_email: string; private_key: string; token_uri: string }
  try {
    sa = JSON.parse(saKeyJson)
  } catch {
    throw new Error('GCP_SA_KEY is not valid JSON')
  }
  const { client_email, private_key, token_uri } = sa
  if (!client_email || !private_key || !token_uri) {
    throw new Error(
      'GCP_SA_KEY is missing required fields: client_email, private_key, token_uri',
    )
  }

  // 2. Build JWT header + claims
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: token_uri,
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = b64urlEncodeStr(JSON.stringify(header))
  const claimsB64 = b64urlEncodeStr(JSON.stringify(claims))
  const signingInput = `${headerB64}.${claimsB64}`

  // 3. Import the PEM private key (PKCS8 DER)
  //    Strip PEM armour + newlines → decode to DER bytes → importKey
  const pemBody = private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  // atob is available globally in Workers
  const binaryStr = atob(pemBody)
  const der = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    der[i] = binaryStr.charCodeAt(i)
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  // 4. Sign
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )
  const sigB64 = b64urlEncode(sigBuf)

  const assertion = `${signingInput}.${sigB64}`

  // 5. Exchange assertion for access_token
  const res = await fetch(token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number }
  _cachedToken = json.access_token
  _tokenExpiresAt = now + (json.expires_in ?? 3600)
  return _cachedToken
}

// ── Document AI ───────────────────────────────────────────────────────────────

/**
 * Send a base64-encoded PDF to the Google Document AI process endpoint and
 * return the extracted plain text.
 *
 * `env.GCP_DOCAI_PROCESSOR` must be a full resource name:
 *   projects/{project_number}/locations/{location}/processors/{processor_id}
 *
 * The LOCATION is derived from the resource name (the segment after "locations/").
 */
export async function extractTextFromPdf(
  env: { GCP_SA_KEY?: string; GCP_DOCAI_PROCESSOR?: string },
  pdfBase64: string,
): Promise<string> {
  if (!env.GCP_SA_KEY || !env.GCP_DOCAI_PROCESSOR) {
    throw new Error('Document AI not configured')
  }

  // Derive location from the processor resource name
  //   projects/123456/locations/us/processors/abc → location = "us"
  const locationMatch = env.GCP_DOCAI_PROCESSOR.match(/\/locations\/([^/]+)\//)
  if (!locationMatch) {
    throw new Error(
      `GCP_DOCAI_PROCESSOR does not contain a /locations/<loc>/ segment: ${env.GCP_DOCAI_PROCESSOR}`,
    )
  }
  const location = locationMatch[1]

  const accessToken = await getGoogleAccessToken(env.GCP_SA_KEY)

  const endpoint = `https://${location}-documentai.googleapis.com/v1/${env.GCP_DOCAI_PROCESSOR}:process`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawDocument: {
        content: pdfBase64,
        mimeType: 'application/pdf',
      },
      skipHumanReview: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Document AI process request failed (${res.status}): ${body.slice(0, 400)}`,
    )
  }

  const data = (await res.json()) as { document?: { text?: string } }
  return data.document?.text ?? ''
}
