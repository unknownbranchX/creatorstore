'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

export default function OnboardingRedirect() {
  const router = useRouter()
  const processedRef = useRef(false)

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    async function checkAndExchangeSession() {
      try {
        let accessToken = null
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          accessToken = hashParams.get('access_token')
        }

        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!accessToken && sbUrl && sbKey && !String(sbKey).includes('mock')) {
          const supabase = createClient(sbUrl, sbKey)
          const { data } = await supabase.auth.getSession()
          if (data?.session?.access_token) {
            accessToken = data.session.access_token
          }
        }

        if (accessToken) {
          await fetch('/api/auth/google/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, returnTo: '/onboarding' }),
          })
        }
      } catch (err) {
        console.warn('[OnboardingRedirect] Session bridge notice:', err)
      } finally {
        router.replace('/onboarding')
      }
    }

    checkAndExchangeSession()
  }, [router])

  return (
    <div className="min-h-screen bg-[#1C1C1C] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#194DF5]" />
    </div>
  )
}
