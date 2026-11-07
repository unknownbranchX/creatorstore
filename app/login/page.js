'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, ArrowRight, Eye, EyeOff, User, Lock, AlertCircle } from 'lucide-react'
import { api } from '@/lib/clientApi'
import { useAuth } from '@/components/auth/AuthContext'
import { startGoogleOAuth } from '@/lib/googleAuthClient'
import { trackLogin } from '@/lib/analytics'
import CreatorStoreBrand from '@/components/brand/CreatorStoreBrand'
import GoogleMark from '@/components/auth/GoogleMark'
import { getRequestedReturnUrl, getPostAuthDestination } from '@/lib/redirectUtils'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedDestination = getRequestedReturnUrl(searchParams)
  const { user, profile, isAuthenticated, loading: authLoading, refresh } = useAuth()
  
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Focus states
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      const target = getPostAuthDestination({ user, profile, requestedDestination })
      router.replace(target)
    }
  }, [authLoading, isAuthenticated, user, profile, requestedDestination, router])

  // Handle OAuth error params
  useEffect(() => {
    const errorParam = searchParams?.get('error')
    const messageParam = searchParams?.get('message')
    if (errorParam) {
      let friendly = 'Google sign-in failed. Please try again.'
      if (errorParam === 'google_cancelled') {
        friendly = 'Google sign-in was cancelled.'
      } else if (errorParam === 'google_unverified' || errorParam === 'unverified_google_email') {
        friendly = 'Your Google email is not verified. Please verify your email with Google first.'
      } else if (errorParam === 'state_mismatch' || errorParam === 'invalid_callback') {
        friendly = 'Sign-in session expired or was invalid. Please try again.'
      } else if (messageParam) {
        friendly = decodeURIComponent(messageParam)
      }
      setErrorMessage(friendly)
      toast.error(friendly)
    }
  }, [searchParams])

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.email.trim() || !form.password || loading) return

    setLoading(true)
    setErrorMessage('')
    setUnverifiedEmail('')

    try {
      await api.post('/auth/login', {
        email: form.email.trim(),
        password: form.password,
      })
      trackLogin('email')
      const me = await refresh()
      toast.success('Welcome back!')

      const target = getPostAuthDestination({
        user: me?.user || user,
        profile: me?.profile || profile,
        requestedDestination,
      })
      router.push(target)
    } catch (err) {
      const msg = err.message || 'Invalid email or password'
      if (msg.toLowerCase().includes('verify your email') || err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(form.email.trim())
        setErrorMessage('Please verify your email address before logging in.')
        toast.error('Please verify your email address before logging in.')
      } else {
        setErrorMessage(msg)
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function onGoogle() {
    if (googleLoading || loading) return
    setGoogleLoading(true)
    setErrorMessage('')
    try {
      await startGoogleOAuth({
        returnTo: requestedDestination,
        action: 'login',
      })
    } catch (err) {
      toast.error(err.message || 'Google sign-in is not available yet')
      setGoogleLoading(false)
    }
  }

  async function handleSendOtp() {
    if (!unverifiedEmail) return
    setSendingOtp(true)
    const otpUrl = requestedDestination
      ? `/verify-email?email=${encodeURIComponent(unverifiedEmail)}&returnTo=${encodeURIComponent(requestedDestination)}`
      : `/verify-email?email=${encodeURIComponent(unverifiedEmail)}`
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('creatorstore_pending_email', unverifiedEmail)
      }
      await api.post('/auth/resend-verification', { email: unverifiedEmail })
      toast.success('6-digit verification code sent to your email.')
      router.push(otpUrl)
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP')
      router.push(otpUrl)
    } finally {
      setSendingOtp(false)
    }
  }

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F2F5FE] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#194DF5]" />
      </div>
    )
  }

  const canSubmit = form.email.trim().length > 0 && form.password.length > 0

  return (
    <main className="min-h-screen w-full bg-[#F2F5FE] text-[#010619] flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 selection:bg-[#194DF5] selection:text-white">
      <div className="w-full max-w-[440px] mx-auto flex flex-col items-center">
        
        {/* 1. Subtle CreatorStore Logo / Brand */}
        <div className="mb-6 sm:mb-8 flex justify-center">
          <CreatorStoreBrand
            href="/"
            theme="light"
            size="md"
            wordmarkClassName="text-lg sm:text-xl tracking-tight font-extrabold text-[#010619]"
          />
        </div>

        {/* 2. Unified #FFFFFF Card Container */}
        <div className="w-full bg-[#FFFFFF] border border-[#D8DFFA] rounded-[20px] shadow-[0_4px_20px_rgba(23,23,23,0.04)] p-6 sm:p-8">
          {/* Heading & Subtitle */}
          <div className="text-center mb-6 space-y-1">
            <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#010619] leading-tight flex items-center justify-center gap-1.5 flex-wrap">
              <span>Welcome back</span>
              <span className="inline-block text-xl sm:text-2xl">👋</span>
            </h1>
            <p className="text-sm font-medium text-[#3A4060]">
              Log in to continue building your CreatorStore.
            </p>
          </div>

          {/* Unverified Email Warning Banner */}
          {unverifiedEmail && (
            <div className="w-full mb-5 p-4 rounded-[14px] bg-[#FFF5DD] border border-[#F59E0B]/30 text-[#010619] text-xs sm:text-sm space-y-3">
              <div>
                <p className="font-bold text-[#F59E0B]">⚠️ Email verification required</p>
                <p className="text-[#3A4060] text-xs mt-0.5">
                  Please verify your email address to complete your account setup and access your store.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp}
                className="w-full h-10 rounded-full bg-[#194DF5] text-white text-xs font-bold hover:bg-[#1441D9] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {sendingOtp ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <span className="inline-flex items-center gap-1">
                    Send verification OTP <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            </div>
          )}

          {/* 3. Login Form */}
          <form onSubmit={onSubmit} className="w-full space-y-3.5">
            
            {/* Field 1: Email or Username */}
            <div className="space-y-1">
              <div
                className={`relative flex items-center h-[48px] px-3.5 rounded-[12px] bg-[#FFFFFF] border transition-all ${
                  emailFocused ? 'border-[#194DF5] ring-2 ring-[#E8EEFF]' : 'border-[#D8DFFA]'
                }`}
              >
                <User className="h-4 w-4 text-[#6B7399] mr-2.5 shrink-0" />
                <input
                  id="email"
                  type="text"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value })
                    if (errorMessage) setErrorMessage('')
                  }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="Email or username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full h-full bg-transparent outline-none text-sm font-medium text-[#010619] placeholder:text-[#6B7399]"
                  required
                  aria-label="Email or username"
                />
              </div>
            </div>

            {/* Field 2: Password */}
            <div className="space-y-1">
              <div
                className={`relative flex items-center h-[48px] px-3.5 rounded-[12px] bg-[#FFFFFF] border transition-all ${
                  passwordFocused ? 'border-[#194DF5] ring-2 ring-[#E8EEFF]' : 'border-[#D8DFFA]'
                }`}
              >
                <Lock className="h-4 w-4 text-[#6B7399] mr-2.5 shrink-0" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value })
                    if (errorMessage) setErrorMessage('')
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full h-full bg-transparent outline-none text-sm font-medium text-[#010619] placeholder:text-[#6B7399]"
                  required
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#6B7399] hover:text-[#010619] cursor-pointer shrink-0 ml-2 transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Inline Error Message */}
            {errorMessage && (
              <div className="flex items-center gap-1.5 text-xs text-[#EF4444] font-medium pl-1 pt-0.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 4. Primary Submit CTA Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className={`w-full h-[48px] rounded-full font-bold text-sm transition-all duration-200 flex items-center justify-center ${
                  canSubmit && !loading
                    ? 'bg-[#194DF5] hover:bg-[#1441D9] text-[#FFFFFF] cursor-pointer active:scale-[0.99]'
                    : 'bg-[#EEF1FB] text-[#6B7399] border border-[#D8DFFA] cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    Log in →
                  </span>
                )}
              </button>
            </div>

            {/* 5. Forgot Password Link */}
            <div className="text-center pt-1">
              <Link
                href="/forgot-password"
                className="text-xs sm:text-sm font-semibold text-[#194DF5] hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
          </form>

          {/* 6. OR Divider */}
          <div className="flex items-center gap-3 my-5 w-full">
            <span className="flex-1 h-px bg-[#D8DFFA]" />
            <span className="text-xs font-semibold text-[#6B7399]">OR</span>
            <span className="flex-1 h-px bg-[#D8DFFA]" />
          </div>

          {/* 7. Google OAuth Button */}
          <button
            type="button"
            onClick={onGoogle}
            disabled={googleLoading || loading}
            className="w-full h-[48px] rounded-full border border-[#D8DFFA] bg-[#FFFFFF] text-sm text-[#010619] font-semibold hover:bg-[#EEF1FB] cursor-pointer disabled:opacity-50 transition-colors flex items-center justify-center gap-2.5"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#010619]" />
            ) : (
              <>
                <GoogleMark /> Continue with Google
              </>
            )}
          </button>
        </div>

        {/* 8. Signup Redirect */}
        <div className="mt-6 text-center text-xs sm:text-sm font-medium text-[#3A4060]">
          Don&apos;t have an account?{' '}
          <Link
            href={requestedDestination ? `/signup?returnTo=${encodeURIComponent(requestedDestination)}` : '/signup'}
            className="text-[#194DF5] hover:underline font-bold"
          >
            Sign up
          </Link>
        </div>

      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F2F5FE] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#194DF5]" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
