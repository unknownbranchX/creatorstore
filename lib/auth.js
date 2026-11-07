import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export const SESSION_COOKIE = 'creatorzero_session'

// ---- Password hashing (bcrypt) ----
export function hashPassword(password) {
  if (!password) throw new Error('Password is required for hashing')
  return bcrypt.hashSync(String(password), 10)
}

export function verifyPassword(password, stored) {
  if (!password || !stored || typeof stored !== 'string') return false
  if (stored === '[SUPABASE_AUTH]' || stored === '[GOOGLE_OAUTH]' || stored.startsWith('[GOOGLE_OAUTH]') || stored.trim() === '') return false

  // Standard bcrypt hash ($2a$, $2b$, $2y$)
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return bcrypt.compareSync(String(password), stored)
  }

  // Legacy scrypt support (salt:derived) for backward compatibility
  if (stored.includes(':')) {
    try {
      const [salt, hash] = stored.split(':')
      const derived = crypto.scryptSync(String(password), salt, 64).toString('hex')
      const a = Buffer.from(hash, 'hex')
      const b = Buffer.from(derived, 'hex')
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  return false
}

export function validatePassword(password) {
  const str = String(password || '')
  if (str.length < 6) {
    return 'Password must be at least 6 characters long'
  }
  if (!/[a-zA-Z]/.test(str)) {
    return 'Password must include at least one letter'
  }
  if (!/[0-9]/.test(str)) {
    return 'Password must include at least one number'
  }
  if (!/[^a-zA-Z0-9]/.test(str)) {
    return 'Password must include at least one special character'
  }
  return null
}

// ---- Minimal HMAC-SHA256 JWT (no external dep) ----
function b64url(input) {
  return Buffer.from(input).toString('base64url')
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj))
}

// ---- Known Insecure / Development Secrets ----
const KNOWN_DEV_SECRETS = new Set([
  'dev-secret',
  'development',
  'secret',
  'changeme',
  'jwt-secret',
  '123456',
  'default-secret',
  'test-secret',
  'password',
])

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error('FATAL: JWT_SECRET must be configured in production.')
    }
    const trimmed = secret.trim()
    if (trimmed.length < 32) {
      throw new Error('FATAL: JWT_SECRET must be at least 32 characters long in production.')
    }
    if (KNOWN_DEV_SECRETS.has(trimmed.toLowerCase())) {
      throw new Error('FATAL: Insecure or development JWT_SECRET cannot be used in production.')
    }
    return trimmed
  }

  // Development / Test environment fallback
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return 'dev-secret'
  }
  return secret.trim()
}

export function signToken(payload, { expiresInSec = 60 * 60 * 24 * 7 } = {}) {
  const secret = getJwtSecret()
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + expiresInSec }
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token) {
  const secret = getJwtSecret()
  try {
    if (!token) return null
    const [h, p, sig] = token.split('.')
    if (!h || !p || !sig) return null
    const data = `${h}.${p}`
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// Purpose-scoped signed tokens (e.g. protected downloads)
export function signPurpose(payload, purpose, expiresInSec = 60 * 60 * 24) {
  return signToken({ ...payload, purpose }, { expiresInSec })
}
export function verifyPurpose(token, purpose) {
  const p = verifyToken(token)
  if (!p || p.purpose !== purpose) return null
  return p
}

// ---- Cryptographically Secure One-Time Tokens & OTPs ----
export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex')
}
export function generateOtp() {
  // Generates an exact 6-digit integer from 100000 to 999999 without modulo bias
  return crypto.randomInt(100000, 1000000).toString()
}
export function hashToken(token) {
  if (!token) return ''
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

