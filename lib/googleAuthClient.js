'use client'

import { createClient } from '@supabase/supabase-js'

/**
 * Initiates the Google OAuth flow.
 * Tries Native Google OAuth 2.0 via /api/auth/google first (with CSRF protection and signed state).
 * Falls back to Supabase Auth bridge if Native Google OAuth is not configured and Supabase keys exist.
 *
 * @param {Object} options
 * @param {string} [options.returnTo] - Safe redirect destination after auth
 * @param {string} [options.username] - Optional pending username chosen during signup
 * @param {'login'|'signup'} [options.action='login'] - Whether initiated from login or signup
 * @param {'CREATOR'|'CUSTOMER'} [options.role='CREATOR'] - Role to assign if new user
 */
export async function startGoogleOAuth({ returnTo, username, action = 'login', role = 'CREATOR' } = {}) {
  const params = new URLSearchParams()
  if (returnTo) params.set('returnTo', returnTo)
  if (username) params.set('username', username)
  if (action) params.set('action', action)
  if (role) params.set('role', role)
  params.set('format', 'json')

  // 1. Try Native Google OAuth endpoint
  let nativeUnavailable = false
  try {
    const res = await fetch(`/api/auth/google?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (res.ok) {
      const data = await res.json()
      if (data?.url && data.mode === 'native') {
        window.location.href = data.url
        return
      }
    } else {
      nativeUnavailable = true
    }
  } catch (err) {
    nativeUnavailable = true
    console.warn('[googleAuthClient] Native Google OAuth endpoint check failed, checking fallback:', err)
  }

  // 2. Supabase Auth fallback bridge
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (sbUrl && sbKey && !String(sbKey).includes('mock')) {
    const supabase = createClient(sbUrl, sbKey)
    const callbackPath = returnTo
      ? `/auth/callback?returnTo=${encodeURIComponent(returnTo)}${username ? `&username=${encodeURIComponent(username)}` : ''}`
      : `/auth/callback${username ? `?username=${encodeURIComponent(username)}` : ''}`
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${callbackPath}`,
      },
    })
    if (error) throw error
    if (data?.url) {
      window.location.href = data.url
      return
    }
  }

  throw new Error('Google sign-in is not configured yet. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
}
