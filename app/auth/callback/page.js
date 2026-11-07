'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState(null)
  const processedRef = useRef(false)

  const returnTo = searchParams.get('returnTo') || null
  const username = searchParams.get('username') || null

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    async function handleExchange() {
      try {
        let accessToken = null

        // 1. Check URL hash (Supabase implicit grant)
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          accessToken = hashParams.get('access_token')
        }

        // 2. Check Supabase client session if not in hash
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!accessToken && sbUrl && sbKey && !String(sbKey).includes('mock')) {
          const supabase = createClient(sbUrl, sbKey)
          const { data } = await supabase.auth.getSession()
          if (data?.session?.access_token) {
            accessToken = data.session.access_token
          }
        }

        if (!accessToken) {
          throw new Error('No authentication token received')
        }

        // 3. Exchange with CreatorStore session endpoint
        const res = await fetch('/api/auth/google/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            returnTo,
            username,
          }),
        })

        const data = await res.json()
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || data?.error || 'Authentication session creation failed')
        }

        const destination = data.target || '/dashboard'
        window.location.href = destination
      } catch (err) {
        console.error('[Auth Callback] Token exchange failed:', err)
        setError(err.message || 'Authentication failed')
        setTimeout(() => {
          router.replace(`/login?error=google_auth_failed&message=${encodeURIComponent(err.message || 'Authentication failed')}`)
        }, 1500)
      }
    }

    handleExchange()
  }, [returnTo, username, router])

  if (error) {
    return (
      <div className="min-h-screen bg-[#F2F5FE] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            !
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Failed</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <p className="text-xs text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F2F5FE] flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#194DF5]" />
        <p className="text-sm font-medium text-gray-600">Completing sign-in...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F2F5FE] flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#194DF5]" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  )
}

