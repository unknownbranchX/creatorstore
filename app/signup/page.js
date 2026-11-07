'use client'

import { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Loader2,
  Check,
  X,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react'
import { api } from '@/lib/clientApi'
import { validatePassword } from '@/lib/auth'
import { normalizeSlug, isReservedSlug } from '@/lib/slug'
import { useAuth } from '@/components/auth/AuthContext'
import { startGoogleOAuth } from '@/lib/googleAuthClient'
import { getRequestedReturnUrl, getPostAuthDestination } from '@/lib/redirectUtils'
import {
  trackSignupStarted,
  trackUsernameChecked,
  trackUsernameAvailable,
  trackSignUp,
  trackSignupCompleted,
} from '@/lib/analytics'
import {
  CreatorStoreLogo,
  CreatorStoreMark,
} from '@/components/brand/CreatorStoreBrand'
import GoogleMark from '@/components/auth/GoogleMark'
import CountrySelect from '@/components/ui/CountrySelect'
import { isValidCountryCode } from '@/lib/countries'

const PENDING_USERNAME_KEY = 'creatorstore_pending_username'
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedDestination = getRequestedReturnUrl(searchParams)
  const { user, isAuthenticated, loading: authLoading, profile } = useAuth()

  // Steps: 1 = Claim username, 2 = Account creation
  const [step, setStep] = useState(1)

  // Step 1: Username & availability
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState('idle') // 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved' | 'error'
  const [usernameError, setUsernameError] = useState('')
  const [isVerifyingBeforeStep2, setIsVerifyingBeforeStep2] = useState(false)
  const checkTimeoutRef = useRef(null)
  const inputRef = useRef(null)

  // Step 2: Email, Password & Country
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Track signup funnel start
  useEffect(() => {
    trackSignupStarted()
  }, [])

  // Read initial username and step from query or storage
  useEffect(() => {
    try {
      const qUser = normalizeSlug(searchParams?.get('username') || '')
      const qStep = searchParams?.get('step')
      const stored = normalizeSlug(
        sessionStorage.getItem(PENDING_USERNAME_KEY) ||
        localStorage.getItem(PENDING_USERNAME_KEY) ||
        ''
      )
      const initial = qUser || stored
      if (initial) {
        setUsername(initial)
        checkAvailability(initial)
        if (qStep === '2' && initial.length >= 3 && !isReservedSlug(initial)) {
          setStep(2)
        }
      }
    } catch { /* ignore */ }
  }, [searchParams])

  // Handle browser popstate / back button
  useEffect(() => {
    function handlePopState() {
      const currentStep = new URLSearchParams(window.location.search).get('step')
      if (currentStep === '2') {
        setStep(2)
      } else {
        setStep(1)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Auto-focus username input on Step 1 mount
  useEffect(() => {
    if (step === 1 && inputRef.current) {
      inputRef.current.focus()
    }
  }, [step])

  // Redirect if already authenticated
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return
    const target = getPostAuthDestination({ user, profile, requestedDestination })
    router.replace(target)
  }, [authLoading, isAuthenticated, user, profile, requestedDestination, router])

  // Handle OAuth error params
  useEffect(() => {
    const errorParam = searchParams?.get('error')
    const messageParam = searchParams?.get('message')
    if (errorParam) {
      let friendly = 'Google signup failed. Please try again.'
      if (errorParam === 'google_cancelled') {
        friendly = 'Google sign-in was cancelled.'
      } else if (errorParam === 'google_unverified' || errorParam === 'unverified_google_email') {
        friendly = 'Your Google email is not verified. Please verify your email with Google first.'
      } else if (errorParam === 'state_mismatch' || errorParam === 'invalid_callback') {
        friendly = 'Sign-in session expired or was invalid. Please try again.'
      } else if (messageParam) {
        friendly = decodeURIComponent(messageParam)
      }
      setSubmitError(friendly)
      toast.error(friendly)
    }
  }, [searchParams])

  // Debounced username availability checker
  const checkAvailability = useCallback((slug) => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)

    if (!slug) {
      setUsernameStatus('idle')
      setUsernameError('')
      return
    }

    if (slug.length < 3) {
      setUsernameStatus('invalid')
      setUsernameError('Must be at least 3 characters')
      return
    }

    if (!/^[a-z0-9_-]+$/.test(slug)) {
      setUsernameStatus('invalid')
      setUsernameError('Use letters, numbers, hyphens or underscores only')
      return
    }

    if (isReservedSlug(slug)) {
      setUsernameStatus('reserved')
      setUsernameError('This username is reserved')
      return
    }

    setUsernameStatus('checking')
    setUsernameError('')

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/store/username/check?u=${encodeURIComponent(slug)}`)
        const isAvail = Boolean(res?.available)
        trackUsernameChecked(isAvail)
        if (isAvail) {
          trackUsernameAvailable()
          setUsernameStatus('available')
          setUsernameError('')
        } else {
          setUsernameStatus('taken')
          setUsernameError(res?.error || 'This username is already taken.')
        }
      } catch (err) {
        setUsernameStatus('error')
        setUsernameError('Unable to check availability. Please try again.')
      }
    }, 320)
  }, [])

  function handleUsernameChange(e) {
    const raw = e.target.value
    // Strip spaces immediately and normalize
    const clean = normalizeSlug(raw)
    setUsername(clean)
    try {
      sessionStorage.setItem(PENDING_USERNAME_KEY, clean)
      localStorage.setItem(PENDING_USERNAME_KEY, clean)
    } catch { /* ignore */ }
    checkAvailability(clean)
  }

  // Requirement checklist validations
  const isAvailable = usernameStatus === 'available'
  const isValidChars = username.length > 0 && /^[a-z0-9_-]+$/.test(username)
  const isValidLength = username.length >= 3 && username.length <= 30
  const isNotReserved = username.length > 0 && !isReservedSlug(username)
  const canContinueStep1 = isAvailable && isValidChars && isValidLength && isNotReserved

  // Continue to Step 2
  async function handleContinueToStep2() {
    if (!canContinueStep1 || isVerifyingBeforeStep2) return

    setIsVerifyingBeforeStep2(true)
    try {
      // Final live verification
      const res = await api.get(`/store/username/check?u=${encodeURIComponent(username)}`)
      if (!res?.available) {
        setUsernameStatus('taken')
        setUsernameError(res?.error || 'This username is already taken.')
        setIsVerifyingBeforeStep2(false)
        return
      }

      try {
        sessionStorage.setItem(PENDING_USERNAME_KEY, username)
        localStorage.setItem(PENDING_USERNAME_KEY, username)
      } catch { /* ignore */ }

      // Update URL silently for browser back/forward support
      const nextUrl = `/signup?step=2&username=${encodeURIComponent(username)}`
      window.history.pushState({ step: 2, username }, '', nextUrl)
      setStep(2)
      setSubmitError('')
    } catch {
      toast.error('Unable to verify username. Please try again.')
    } finally {
      setIsVerifyingBeforeStep2(false)
    }
  }

  // Back to Step 1
  function handleBackToStep1() {
    const prevUrl = `/signup?step=1&username=${encodeURIComponent(username)}`
    window.history.pushState({ step: 1, username }, '', prevUrl)
    setStep(1)
    setSubmitError('')
  }

  // Step 2 Form validity
  const emailValid = EMAIL_REGEX.test(email.trim())
  const pwdErr = validatePassword(password)
  const countryValid = isValidCountryCode(country)
  const canSubmitStep2 = emailValid && !pwdErr && countryValid && !loading && !googleLoading

  // Email Signup submission
  async function onEmailSignup(e) {
    e.preventDefault()
    if (!canSubmitStep2) return

    setLoading(true)
    setSubmitError('')

    try {
      const cleanEmail = email.trim().toLowerCase()
      const cleanUsername = username.trim().toLowerCase()
      const cleanCountry = country.trim().toUpperCase()

      // Final pre-flight availability check to prevent race condition
      const checkRes = await api.get(`/store/username/check?u=${encodeURIComponent(cleanUsername)}`)
      if (!checkRes?.available) {
        setSubmitError(`The username "${cleanUsername}" was just taken by someone else. Please choose another username.`)
        toast.error('Username no longer available')
        setLoading(false)
        return
      }

      await api.post('/auth/signup', {
        email: cleanEmail,
        password,
        name: cleanUsername,
        username: cleanUsername,
        slug: cleanUsername,
        storeName: cleanUsername,
        country: cleanCountry,
        accountType: 'CREATOR',
        role: 'CREATOR',
      })

      // Track successful account creation
      trackSignUp('email')
      trackSignupCompleted('email')

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('creatorstore_pending_email', cleanEmail)
        sessionStorage.setItem(PENDING_USERNAME_KEY, cleanUsername)
        localStorage.setItem(PENDING_USERNAME_KEY, cleanUsername)
      }

      toast.success('Account created! Please check your email to verify your account.')
      const verifyUrl = requestedDestination
        ? `/verify-email?email=${encodeURIComponent(cleanEmail)}&returnTo=${encodeURIComponent(requestedDestination)}`
        : `/verify-email?email=${encodeURIComponent(cleanEmail)}`
      router.push(verifyUrl)
    } catch (err) {
      const msg = err.message || 'Signup failed. Please try again.'
      setSubmitError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Google OAuth Signup
  async function onGoogleSignup() {
    if (googleLoading || loading) return
    setGoogleLoading(true)
    setSubmitError('')
    try {
      if (typeof window !== 'undefined' && username) {
        sessionStorage.setItem(PENDING_USERNAME_KEY, username)
        localStorage.setItem(PENDING_USERNAME_KEY, username)
      }
      await startGoogleOAuth({
        returnTo: requestedDestination,
        username: username || undefined,
        action: 'signup',
        role: 'CREATOR',
      })
    } catch (err) {
      const msg = err.message || 'Google sign-in is not configured yet'
      setSubmitError(msg)
      toast.error(msg)
      setGoogleLoading(false)
    }
  }

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF4B1F]" />
      </div>
    )
  }

  return (
    <main className="min-h-screen w-full bg-[#000000] text-[#F5F5F5] flex flex-col justify-between selection:bg-[#FF4B1F] selection:text-white relative overflow-hidden font-sans">
      
      {/* Scoped CSS to override any light mode user agent / globals input styling */}
      <style jsx global>{`
        .cs-signup-input,
        .cs-signup-input:hover,
        .cs-signup-input:focus,
        .cs-signup-input:active {
          background-color: #141416 !important;
          background: #141416 !important;
          color: #FFFFFF !important;
          border-color: #2E2E33 !important;
          color-scheme: dark !important;
        }
        .cs-signup-input:focus {
          border-color: #FFFFFF !important;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25) !important;
        }
        .cs-signup-input-err,
        .cs-signup-input-err:hover,
        .cs-signup-input-err:focus {
          border-color: #EF4444 !important;
        }
        .cs-username-field,
        .cs-username-field:hover,
        .cs-username-field:focus,
        .cs-username-field:active {
          background-color: transparent !important;
          background: transparent !important;
          color: #FFFFFF !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          color-scheme: dark !important;
        }
      `}</style>

      {/* ==============================================================
          TOP NAVIGATION BAR
         ============================================================== */}
      <header className="w-full px-6 sm:px-10 lg:px-14 py-6 sm:py-8 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          {step === 2 ? (
            <button
              type="button"
              onClick={handleBackToStep1}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#18181A] hover:bg-[#242428] border border-[#2E2E32] text-xs font-semibold text-[#A1A1AA] hover:text-white transition-all cursor-pointer shadow-xs"
              aria-label="Back to step 1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <CreatorStoreLogo
              size="md"
              theme="dark"
              href="/"
            />
          )}
        </div>

        {/* Existing account quick link */}
        <div className="text-xs sm:text-sm text-[#A1A1AA]">
          Already have an account?{' '}
          <Link
            href={requestedDestination ? `/login?returnTo=${encodeURIComponent(requestedDestination)}` : '/login'}
            className="text-white hover:text-[#FF4B1F] underline underline-offset-4 font-semibold transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/* ==============================================================
          MAIN CONTENT AREA (STEP 1 & STEP 2 WITH SUBTLE TRANSITION)
         ============================================================== */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-6 sm:py-10 z-10 w-full">
        <AnimatePresence mode="wait">
          
          {/* ────────────────────────────────────────────────────────────
              STEP 1: CLAIM YOUR CREATORSTORE URL (Inspired by Ref 1)
             ──────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-xl mx-auto space-y-7 sm:space-y-8"
            >
              {/* CreatorStore Brand Icon Accent */}
              <div className="flex items-center gap-2">
                <CreatorStoreMark size="sm" color="brand" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#71717A]">
                  Step 1 of 2 · Storefront Handle
                </span>
              </div>

              {/* Editorial Headings */}
              <div className="space-y-2.5">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white leading-[1.12]">
                  Claim your CreatorStore
                </h1>
                <p className="text-sm sm:text-base text-[#A1A1AA] leading-relaxed max-w-lg">
                  Choose your unique storefront URL and start building your creator business.
                </p>
              </div>

              {/* URL Handle Input Section (Inspired by Ref 1) */}
              <div className="space-y-3 pt-2">
                {/* Domain portion above input (Ref 1 style) */}
                <div className="text-sm font-mono text-[#71717A] select-none">
                  creatorstore.store/
                </div>

                {/* Main Username Input Row */}
                <div className="relative flex items-center pb-2.5 border-b-2 border-[#2E2E32] focus-within:border-white transition-colors">
                  <input
                    ref={inputRef}
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canContinueStep1) {
                        e.preventDefault()
                        handleContinueToStep2()
                      }
                    }}
                    placeholder="yourname"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="cs-username-field min-w-0 flex-1 text-2xl sm:text-3xl lg:text-4xl font-bold text-white placeholder:text-[#333338] outline-none tracking-tight"
                    aria-label="CreatorStore username"
                  />

                  {/* Status Indicator / Enter Trigger Pill */}
                  <div className="ml-3 shrink-0 flex items-center gap-2">
                    {usernameStatus === 'checking' && (
                      <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA] font-mono">
                        <Loader2 className="w-4 h-4 animate-spin text-[#FF4B1F]" />
                        <span className="hidden sm:inline">Checking...</span>
                      </div>
                    )}
                    {canContinueStep1 && (
                      <button
                        type="button"
                        onClick={handleContinueToStep2}
                        disabled={isVerifyingBeforeStep2}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181B] hover:bg-[#27272E] border border-white/10 text-xs font-mono text-[#D4D4D8] hover:text-white transition-all cursor-pointer shadow-xs active:scale-95"
                        title="Press enter to continue"
                      >
                        <span>[ enter</span>
                        <CornerDownLeft className="w-3 h-3 text-[#FF4B1F]" />
                        <span>]</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-link below username field (Ref 1 style) */}
                <div className="pt-1 flex items-center justify-between text-xs font-medium">
                  <span className="text-[#71717A]">
                    Already have an account?{' '}
                    <Link
                      href={requestedDestination ? `/login?returnTo=${encodeURIComponent(requestedDestination)}` : '/login'}
                      className="text-white underline underline-offset-4 hover:text-[#FF4B1F] transition-colors"
                    >
                      Login
                    </Link>
                  </span>

                  {/* Real-time status note */}
                  <div>
                    {usernameStatus === 'available' && (
                      <span className="text-[#22C55E] flex items-center gap-1 font-semibold text-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Available</span>
                      </span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="text-[#EF4444] font-medium text-xs">
                        {usernameError || 'Taken'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Requirement Checklist (Inspired by Ref 1) */}
              <div className="space-y-2.5 pt-4 text-xs font-mono tracking-wide uppercase">
                <div className={`flex items-center gap-2.5 transition-colors ${
                  isAvailable ? 'text-[#22C55E]' : usernameStatus === 'taken' ? 'text-[#EF4444]' : 'text-[#71717A]'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isAvailable ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#242426] text-[#71717A]'
                  }`}>
                    {isAvailable ? '✓' : '•'}
                  </span>
                  <span>Site address is available to claim</span>
                </div>

                <div className={`flex items-center gap-2.5 transition-colors ${
                  isValidChars ? 'text-[#22C55E]' : username && !isValidChars ? 'text-[#EF4444]' : 'text-[#71717A]'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isValidChars ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#242426] text-[#71717A]'
                  }`}>
                    {isValidChars ? '✓' : '•'}
                  </span>
                  <span>Contain letters and numbers only</span>
                </div>

                <div className={`flex items-center gap-2.5 transition-colors ${
                  isValidLength ? 'text-[#22C55E]' : username && !isValidLength ? 'text-[#EF4444]' : 'text-[#71717A]'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isValidLength ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#242426] text-[#71717A]'
                  }`}>
                    {isValidLength ? '✓' : '•'}
                  </span>
                  <span>Must be between 3 and 30 characters long</span>
                </div>

                <div className={`flex items-center gap-2.5 transition-colors ${
                  isNotReserved ? 'text-[#22C55E]' : username && !isNotReserved ? 'text-[#EF4444]' : 'text-[#71717A]'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isNotReserved ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#242426] text-[#71717A]'
                  }`}>
                    {isNotReserved ? '✓' : '•'}
                  </span>
                  <span>Must not be a reserved route name</span>
                </div>
              </div>

              {/* Primary Action Button */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleContinueToStep2}
                  disabled={!canContinueStep1 || isVerifyingBeforeStep2}
                  className={`w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    canContinueStep1 && !isVerifyingBeforeStep2
                      ? 'bg-white hover:bg-[#EAEAEA] text-black shadow-lg cursor-pointer active:scale-[0.99]'
                      : 'bg-[#18181A] text-[#52525B] border border-[#27272A] cursor-not-allowed'
                  }`}
                >
                  {isVerifyingBeforeStep2 ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Continue</span>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ────────────────────────────────────────────────────────────
              STEP 2: ACCOUNT CREATION (Inspired by Ref 2)
             ──────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-[420px] mx-auto"
            >
              {/* Centered Solid Surface Card (Ref 2 Style) */}
              <div className="bg-[#101012] border border-[#242428] rounded-[24px] sm:rounded-[28px] p-6 sm:p-8 shadow-[0_16px_56px_rgba(0,0,0,0.6)] space-y-6">
                
                {/* Header Lockup: CreatorStore Mark + Dynamic URL Claiming Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CreatorStoreMark size="md" color="brand" />
                    <button
                      type="button"
                      onClick={handleBackToStep1}
                      className="text-xs text-[#71717A] hover:text-white transition-colors cursor-pointer"
                    >
                      Change handle
                    </button>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                      <span className="break-all">creatorstore.store/{username}</span>{' '}
                      <span className="text-[#22C55E] whitespace-nowrap font-medium text-sm sm:text-base">is available</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-[#A1A1AA] leading-normal">
                      Create your account to claim this storefront.
                    </p>
                  </div>
                </div>

                {/* Social Signup Option: Google */}
                <div>
                  <button
                    type="button"
                    onClick={onGoogleSignup}
                    disabled={googleLoading || loading}
                    className="w-full h-11 sm:h-12 rounded-xl bg-[#1C1C20] hover:bg-[#25252A] border border-[#2E2E33] text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Continue with Google"
                  >
                    {googleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <>
                        <GoogleMark className="w-4 h-4 shrink-0" />
                        <span>Continue with Google</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Lightweight Divider */}
                <div className="relative flex items-center justify-center">
                  <div className="border-t border-[#242428] w-full" />
                  <span className="bg-[#101012] px-3 text-[11px] font-mono text-[#71717A] uppercase tracking-wider select-none shrink-0">
                    OR
                  </span>
                </div>

                {/* Email + Password Form */}
                <form onSubmit={onEmailSignup} className="space-y-4">
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#D4D4D8]">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setSubmitError('')
                      }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      className={`cs-signup-input w-full h-11 px-3.5 rounded-xl text-sm placeholder:text-[#52525B] outline-none transition-all ${
                        email && !emailValid ? 'cs-signup-input-err' : ''
                      }`}
                      required
                      aria-label="Email address"
                    />
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#D4D4D8]">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setSubmitError('')
                        }}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        placeholder="Enter your password"
                        autoComplete="new-password"
                        className={`cs-signup-input w-full h-11 px-3.5 pr-10 rounded-xl text-sm placeholder:text-[#52525B] outline-none transition-all ${
                          password && pwdErr ? 'cs-signup-input-err' : ''
                        }`}
                        required
                        aria-label="Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 text-[#71717A] hover:text-white transition-colors cursor-pointer p-1"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Inline password validation helper */}
                    {password && pwdErr && (
                      <p className="text-[11px] text-[#EF4444] font-medium leading-tight pt-0.5">
                        {pwdErr}
                      </p>
                    )}
                  </div>

                  {/* Country Selector */}
                  <CountrySelect
                    value={country}
                    onChange={(val) => {
                      setCountry(val)
                      setSubmitError('')
                    }}
                    label="Country"
                    required
                    placeholder="Select your country..."
                  />

                  {/* Submit Error Banner */}
                  {submitError && (
                    <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-tight">{submitError}</span>
                    </div>
                  )}

                  {/* Submit CTA */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!canSubmitStep2}
                      className={`w-full h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                        canSubmitStep2
                          ? 'bg-white hover:bg-[#EAEAEA] text-black shadow-md cursor-pointer active:scale-[0.99]'
                          : 'bg-[#1C1C20] text-[#71717A] border border-[#27272A] cursor-not-allowed'
                      }`}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Creating account...</span>
                        </>
                      ) : (
                        <span>Continue with email</span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Login link */}
                <div className="text-center text-xs text-[#71717A]">
                  Already have an account?{' '}
                  <Link
                    href={requestedDestination ? `/login?returnTo=${encodeURIComponent(requestedDestination)}` : '/login'}
                    className="text-white hover:underline font-medium"
                  >
                    Log in
                  </Link>
                </div>

                {/* Terms & Privacy */}
                <p className="text-[11px] text-[#71717A] text-center leading-relaxed">
                  By clicking &quot;Continue with email&quot; or &quot;Continue with Google&quot;, you agree to the platform{' '}
                  <Link href="/terms" className="text-[#A1A1AA] hover:text-white underline underline-offset-2">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-[#A1A1AA] hover:text-white underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </p>

              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ==============================================================
          BOTTOM SUBTLE BRAND FOOTER NOTE
         ============================================================== */}
      <footer className="w-full px-6 py-5 text-center text-xs text-[#52525B] select-none z-10">
        <span>© {new Date().getFullYear()} CreatorStore · Built for modern digital creators</span>
      </footer>

    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#000000] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF4B1F]" />
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  )
}
