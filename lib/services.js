import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from './prisma.js'
import { supabase, supabaseAdmin, ensureBucket, resolveDigitalProductStoragePath } from './supabase.js'
import {
  hashPassword, verifyPassword, validatePassword, signToken, verifyToken, signPurpose, verifyPurpose,
  generateSecureToken, generateOtp, hashToken,
} from './auth.js'
import { sanitizeText, sanitizeUrl, sanitizeHtml, getAppUrl } from './utils.js'
import { getPaymentProvider, getRazorpayMode, isPlaceholderRazorpayId, allowRazorpayMockFallbacks } from './payments.js'
import { generateUniqueStoreSlug, slugify as generateSlug, normalizeSlug, isReservedSlug } from './slug.js'
import {
  emailService, getEmailService, purchaseConfirmationEmail, productDeliveryEmail,
  passwordResetEmail, emailVerificationEmail, coachingBookingConfirmationEmail,
  webinarRegistrationEmail, webinarCancellationEmail,
  membershipActivatedEmail, membershipCancelledEmail,
  customServiceRequestEmail, customServiceDeliveredEmail,
} from './email.js'
export { emailService, getEmailService }
import {
  usersRepo, profilesRepo, storesRepo, storeSectionsRepo, productsRepo, customersRepo,

  ordersRepo, entitlementsRepo, productAccessTokensRepo, analyticsRepo, razorpayEventsRepo, razorpayAccountRepo,
  payoutProfilesRepo, payoutAuditRepo, paymentsRepo, transfersRepo, refundsRepo, webhookEventsRepo,
  earningsLedgerRepo, creatorSubscriptionsRepo, checkoutFieldsRepo,
  coursesRepo, modulesRepo, lessonsRepo, courseProgressRepo, certificatesRepo, coachingRepo, communityRepo, communityResourcesRepo, webinarRepo, membershipRepo, membershipPostsRepo, membershipTiersRepo, customServiceRepo, externalLinkRepo,

  leadsRepo, couponsRepo, emailRepo, customerTagsRepo, onboardingRepo,
  instagramRepo, automationsRepo, automationEventsRepo, otpVerificationsRepo, subscriptionAuditLogsRepo,
  supportTicketsRepo, bundlesRepo, formsRepo,
} from './repos.js'
import { HELP_CATEGORIES, HELP_ARTICLES } from './helpContent.js'
import {
  PLAN_IDS, PLAN_FEATURES, SUBSCRIPTION_PRICING, getSubscriptionPricing, validatePricingConfig, normalizePlanId, getPlanConfig, hasEntitlement, getEntitlementLimit,
} from './plans.js'
import {
  entitlementService, getEffectiveSubscription, getPlanEntitlements, requireEntitlement, mapProviderPlanToInternalPlan,
  hasEntitlement as checkEntitlementForUserOrPlan,
} from './entitlement-service.js'
import {
  BILLING_REGIONS, BILLING_PROVIDERS, normalizeRegion, resolveBillingConfig,
} from './billing/config.js'
import { isValidCountryCode, normalizeCountryCode, getCountryName } from './countries.js'
import {
  getSubscriptionProviderForCountry,
  getSubscriptionProviderForUser,
  getBillingRegionForCountry,
  requireUserCountry,
  getProductPaymentProviderForCountry,
  PRODUCT_PAYMENT_PROVIDERS,
} from './billing/provider-selection.js'
import { dodoProvider, isDodoConfigured, getDodoBaseUrl, getPendingPaymentTTLMinutes, getPendingPaymentTTLMs } from './dodo.js'
import { identifyProductPlan } from './subscription-reconciliation.js'
import { withPaymentLock, withBoundedBackoff } from './payment-lifecycle.js'
import {
  razorpaySubscriptionLifecycleService,
  getRazorpayPendingSubscriptionTimeoutMinutes,
  getRazorpayGracePeriodDays,
} from './razorpay-subscription-lifecycle.js'
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  normalizeCurrency,
  getCurrencyConfig,
  getExchangeRate,
  convertCurrency,
  validateMinimumAmount,
  previewDodoPrice,
  fromMinorUnits,
  toMinorUnits,
} from './currencies.js'
import {
  localDateTimeToUtc,
  getDateInTimezone,
  formatInTimezone,
  getDatePartsInTimezone,
} from './calendarUtils.js'

// In-memory per-creator mutex for concurrency-safe checkout operations
const creatorCheckoutLocks = new Map()

async function withCreatorLock(creatorId, fn) {
  if (!creatorId) return fn()
  while (creatorCheckoutLocks.has(creatorId)) {
    try {
      await creatorCheckoutLocks.get(creatorId)
    } catch (e) {}
  }
  let resolveLock
  const lockPromise = new Promise((resolve) => {
    resolveLock = resolve
  })
  creatorCheckoutLocks.set(creatorId, lockPromise)
  try {
    return await withPaymentLock(`creator_checkout_${creatorId}`, fn)
  } finally {
    creatorCheckoutLocks.delete(creatorId)
    resolveLock()
  }
}

// In-memory per-creator mutex for concurrency-safe booking slot reservations
const creatorBookingLocks = new Map()

async function withBookingLock(creatorId, fn) {
  if (!creatorId) return fn()
  while (creatorBookingLocks.has(creatorId)) {
    try {
      await creatorBookingLocks.get(creatorId)
    } catch (e) {}
  }
  let resolveLock
  const lockPromise = new Promise((resolve) => {
    resolveLock = resolve
  })
  creatorBookingLocks.set(creatorId, lockPromise)
  try {
    return await fn()
  } finally {
    creatorBookingLocks.delete(creatorId)
    resolveLock()
  }
}

const RESERVED = new Set(['admin', 'api', 'dashboard', 'login', 'signup', 'settings', 'support', 'help', 'pricing', 'checkout', 'blog', 'about', 'terms', 'privacy', 'community', 'account', 'learn', 'onboarding', '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'www', 'app', 'static'])

export function validateUsername(username) {
  const u = normalizeSlug(username)
  if (!/^[a-z0-9_-]{3,30}$/.test(u)) return { ok: false, error: 'Username must be 3-30 chars: letters, numbers, - or _' }
  if (RESERVED.has(u) || isReservedSlug(u)) return { ok: false, error: 'This username is reserved' }
  return { ok: true, username: u }
}

export function slugify(str) {
  return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product'
}

const DEFAULT_THEME = { primaryColor: '#4D7CFF', buttonRadius: 12, buttonStyle: 'solid', font: 'Manrope', background: '#ffffff', cardStyle: 'shadow' }
function defaultSections() {
  return []
}

function validateCustomUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim()
  try {
    const parsed = new URL(trimmed)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== 'https:' && protocol !== 'http:') return null

    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '::1'
    ) {
      return null
    }

    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
      return null
    }

    return parsed.toString()
  } catch (e) {
    return null
  }
}

export const attributionService = {
  generateAttributionToken({ creatorId, automationId, productId, customUrl }) {
    if (!creatorId || !automationId) return null
    try {
      const payload = { c: creatorId, a: automationId }
      if (productId) payload.p = productId
      if (customUrl) payload.u = customUrl
      const jsonStr = JSON.stringify(payload)
      const b64 = Buffer.from(jsonStr).toString('base64url')
      return `ref_${b64}`
    } catch {
      return signPurpose({ creatorId, automationId, productId: productId || null, customUrl: customUrl || null }, 'automation_attribution', 30 * 24 * 60 * 60)
    }
  },
  verifyAttributionToken(token) {
    if (!token) return null
    if (token.startsWith('ref_')) {
      try {
        const jsonStr = Buffer.from(token.slice(4), 'base64url').toString('utf8')
        const p = JSON.parse(jsonStr)
        if (p && p.c && p.a) {
          return { creatorId: p.c, automationId: p.a, productId: p.p || null, customUrl: p.u || null }
        }
      } catch (e) {
        // Fall through to legacy JWT check
      }
    }
    const payload = verifyPurpose(token, 'automation_attribution')
    if (!payload || !payload.creatorId || !payload.automationId) return null
    return payload
  }
}

// Track OTP attempts & rate limits in memory
const failedOtpAttempts = new Map() // email -> { count: number, lastAttempt: number }
const resendTimestamps = new Map() // email -> number (timestamp)

// ---------------- Auth ----------------
export const authService = {
  async signup({ email, password, name, storeName, accountType, role, username, slug, phone, country }) {
    const lower = String(email || '').toLowerCase().trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower)) throw httpError(400, 'Enter a valid email')
    const pwdError = validatePassword(password)
    if (pwdError) throw httpError(400, pwdError)

    if (!country || !String(country).trim()) {
      throw httpError(400, 'Country is required. Please select your country.')
    }
    const cleanCountry = normalizeCountryCode(country)
    if (!cleanCountry || !isValidCountryCode(cleanCountry)) {
      throw httpError(400, 'Invalid country. Please select a valid country.')
    }

    const existing = await usersRepo.findByEmail(lower)
    if (existing) throw httpError(409, 'An account with this email already exists')

    const rawRole = String(accountType || role || '').toUpperCase()
    const userRole = rawRole === 'CUSTOMER' ? 'CUSTOMER' : 'CREATOR'

    const cleanName = sanitizeText(name || '')
    const cleanPhone = sanitizeText(phone || '')
    const cleanStoreName = sanitizeText(storeName || name || '')

    const userId = uuidv4()
    const passwordHash = hashPassword(password)

    const rawOtp = generateOtp()
    const verifyHash = hashToken(rawOtp)
    const verifyExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    const user = {
      id: userId,
      email: lower,
      passwordHash: passwordHash,
      role: userRole,
      country: cleanCountry,
      emailVerified: false,
      verificationTokenHash: verifyHash,
      verificationTokenExpires: verifyExpires,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await usersRepo.create(user)
    await otpVerificationsRepo.upsert({
      identifier: lower,
      purpose: 'EMAIL_VERIFICATION',
      otpHash: verifyHash,
      expiresAt: verifyExpires,
      resendAvailableAt: new Date(Date.now() + 60 * 1000),
      maxAttempts: 5,
    }).catch(e => console.error('otpVerificationsRepo.upsert error on signup:', e))

    const initialStatus = userRole === 'CREATOR' ? 'USERNAME' : 'COMPLETED'

    await profilesRepo.upsert(user.id, {
      name: cleanName,
      phone: cleanPhone,
      country: cleanCountry,
      bio: '',
      category: '',
      avatarUrl: '',
      socialLinks: {},
      onboardingStatus: initialStatus,
      onboardingComplete: userRole === 'CUSTOMER',
    })

    if (userRole === 'CREATOR') {
      const explicitUsername = username || slug
      let storeSlug
      if (explicitUsername) {
        const v = validateUsername(explicitUsername)
        if (!v.ok) throw httpError(400, v.error)
        const isTaken = await storesRepo.usernameTaken(v.username, null)
        if (isTaken) throw httpError(409, 'This username is already taken. Please pick another.')
        storeSlug = v.username
      } else {
        storeSlug = await generateUniqueStoreSlug(
          cleanStoreName || cleanName,
          user.id,
          (candidate, uid) => storesRepo.usernameTaken(candidate, uid)
        )
      }

      await storesRepo.upsertStore(user.id, {
        id: uuidv4(),
        creatorId: user.id,
        storeName: cleanStoreName || cleanName || 'Creator Store',
        username: storeSlug,
        slug: storeSlug,
        published: false,
        theme: DEFAULT_THEME,
        sections: defaultSections(),
        seo: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await creatorSubscriptionsRepo.upsert(user.id, {
        status: 'INACTIVE',
        plan: 'UNSUBSCRIBED',
        billingCycle: 'MONTHLY',
        price: 0,
        currency: 'USD',
      })
    }

    try {
      await emailService.sendVerificationEmail({ to: lower, name: cleanName, otp: rawOtp })
    } catch (e) { console.error('Verification email error', e) }

    return {
      ok: true,
      requiresVerification: true,
      email: lower,
      message: 'Account created. Please check your email for your 6-digit verification code.',
      user: publicUser(user),
    }
  },
  async login({ email, password }) {
    const lower = String(email || '').toLowerCase().trim()
    if (!lower || !password) throw httpError(401, 'Invalid email or password')

    let dbUser = await usersRepo.findByEmail(lower)
    if (!dbUser) {
      const cleanSlug = lower.replace(/^@/, '')
      const store = await storesRepo.getBySlug(cleanSlug)
      if (store?.creatorId) {
        dbUser = await usersRepo.findById(store.creatorId)
      }
    }
    if (!dbUser) {
      throw httpError(401, 'Invalid email or password')
    }

    if (dbUser.passwordHash === '[SUPABASE_AUTH]') {
      throw httpError(401, 'Your account was previously authenticated with Supabase Auth. Please use "Forgot Password" to set a new password.')
    }

    if (!verifyPassword(password, dbUser.passwordHash)) {
      throw httpError(401, 'Invalid email or password')
    }

    if (dbUser.emailVerified === false) {
      throw httpError(403, 'Please verify your email address before logging in.', 'EMAIL_NOT_VERIFIED')
    }

    const token = signToken({ userId: dbUser.id, role: dbUser.role })
    return { token, user: publicUser(dbUser) }
  },
  async userFromToken(token) {
    const payload = verifyToken(token)
    if (!payload) return null
    const user = await usersRepo.findById(payload.userId)
    if (!user) return null
    return publicUser(user)
  },
  async resendVerification({ email }) {
    const lower = String(email || '').toLowerCase().trim()
    if (!lower || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower)) throw httpError(400, 'Enter a valid email')
    const user = await usersRepo.findByEmail(lower)
    if (!user) {
      return { ok: true, message: 'If an account exists with that email, a verification code has been sent.' }
    }
    if (user.emailVerified === true) {
      return { ok: true, alreadyVerified: true, message: 'Your email is already verified. Please log in.' }
    }

    // Rate limiting: 60-second cooldown via persistent shared storage
    const now = new Date()
    const existingOtp = await otpVerificationsRepo.get(lower, 'EMAIL_VERIFICATION').catch(() => null)
    if (existingOtp?.resendAvailableAt && new Date(existingOtp.resendAvailableAt) > now) {
      const remainingSeconds = Math.max(1, Math.ceil((new Date(existingOtp.resendAvailableAt).getTime() - now.getTime()) / 1000))
      throw httpError(429, `Please wait ${remainingSeconds}s before requesting another code.`)
    }

    const rawOtp = generateOtp()
    const verifyHash = hashToken(rawOtp)
    const verifyExpires = new Date(now.getTime() + 10 * 60 * 1000) // 10 minutes
    const resendAvailableAt = new Date(now.getTime() + 60 * 1000) // 60 seconds

    await usersRepo.setVerificationToken(user.id, verifyHash, verifyExpires)
    await otpVerificationsRepo.upsert({
      identifier: lower,
      purpose: 'EMAIL_VERIFICATION',
      otpHash: verifyHash,
      expiresAt: verifyExpires,
      resendAvailableAt,
      maxAttempts: 5,
    })

    try {
      const profile = await profilesRepo.getByCreator(user.id).catch(() => null)
      await emailService.sendVerificationEmail({ to: lower, name: profile?.name || '', otp: rawOtp })
    } catch (e) { console.error('Resend verification email error', e) }
    return { ok: true, message: 'Verification code sent.' }
  },
  async forgotPassword({ email }) {
    const lower = String(email || '').toLowerCase().trim()
    const user = await usersRepo.findByEmail(lower)
    if (user) {
      const rawToken = generateSecureToken()
      const tokenHash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      await usersRepo.setResetToken(user.id, tokenHash, expiresAt)
      try {
        const resetUrl = getAppUrl(`/reset-password?token=${rawToken}`)
        const profile = await profilesRepo.getByCreator(user.id).catch(() => null)
        await emailService.sendPasswordResetEmail({ to: lower, name: profile?.name || '', resetUrl })
      } catch (e) { console.error('Forgot password email error', e) }
    }
    return { ok: true, message: 'If an account exists with that email, a password reset link has been sent.' }
  },
  async resetPassword({ token, newPassword }) {
    if (!token) throw httpError(400, 'Reset token is required')
    const pwdError = validatePassword(newPassword)
    if (pwdError) throw httpError(400, pwdError)
    const tokenHash = hashToken(token)
    const user = await usersRepo.findByResetToken(tokenHash)
    if (!user) throw httpError(400, 'Invalid or expired password reset token')
    const newHash = hashPassword(newPassword)
    await usersRepo.updatePasswordAndClearReset(user.id, newHash)
    try {
      const profile = await profilesRepo.getByCreator(user.id).catch(() => null)
      await emailService.sendPasswordChangedEmail({ to: user.email, name: profile?.name || '' })
    } catch (e) { console.error('Password changed email error', e) }
    return { ok: true, message: 'Password has been reset successfully.' }
  },
  async verifyEmail({ email, otp, token }) {
    const lower = String(email || '').toLowerCase().trim()
    const rawOtp = String(otp || token || '').trim()

    if (!lower) {
      throw httpError(400, 'Email address is required')
    }

    const user = await usersRepo.findByEmail(lower)
    if (!user) {
      throw httpError(400, 'Invalid verification code. Please check the code and try again.')
    }

    // SEC-001: For an already-verified account:
    // Return a safe informational response, NEVER issue a session token or set a session cookie.
    // Require standard password-based login to establish an authenticated session.
    if (user.emailVerified === true) {
      return {
        ok: true,
        alreadyVerified: true,
        user: publicUser(user),
        message: 'Your email is already verified. Please log in with your password.',
      }
    }

    if (!rawOtp || !/^\d{6}$/.test(rawOtp)) {
      throw httpError(400, 'Invalid verification code. Please check the code and try again.')
    }

    const now = new Date()
    const otpRecord = await otpVerificationsRepo.get(lower, 'EMAIL_VERIFICATION').catch(() => null)
    const tokenHashInDb = otpRecord?.otpHash || user.verificationTokenHash
    const tokenExpiresInDb = otpRecord?.expiresAt || user.verificationTokenExpires

    if (!tokenHashInDb || (otpRecord && otpRecord.consumedAt)) {
      throw httpError(400, 'Invalid verification code. Please check the code and try again.')
    }

    if (!tokenExpiresInDb || new Date(tokenExpiresInDb).getTime() < now.getTime()) {
      throw httpError(400, 'This verification code has expired. Please request a new code.')
    }

    // SEC-002: Check attempt limits (max 5 failed attempts) using atomic shared storage
    const currentAttempts = otpRecord ? otpRecord.attempts : 0
    if (currentAttempts >= 5) {
      await usersRepo.setVerificationToken(user.id, null, null)
      await otpVerificationsRepo.invalidate(lower, 'EMAIL_VERIFICATION').catch(() => null)
      throw httpError(400, 'Too many incorrect attempts. Please request a new code.')
    }

    const submittedHash = hashToken(rawOtp)
    const bufSubmitted = Buffer.from(submittedHash)
    const bufExpected = Buffer.from(tokenHashInDb)
    const isMatch = (bufSubmitted.length === bufExpected.length && crypto.timingSafeEqual(bufSubmitted, bufExpected))

    if (!isMatch) {
      let updatedAttempts = currentAttempts + 1
      try {
        const res = await otpVerificationsRepo.recordFailedAttempt(lower, 'EMAIL_VERIFICATION')
        if (res) updatedAttempts = res.attempts
      } catch (e) {
        throw httpError(500, 'Verification attempt could not be processed securely. Please try again.')
      }

      if (updatedAttempts >= 5) {
        await usersRepo.setVerificationToken(user.id, null, null)
        await otpVerificationsRepo.invalidate(lower, 'EMAIL_VERIFICATION').catch(() => null)
        throw httpError(400, 'Too many incorrect attempts. Please request a new code.')
      }
      throw httpError(400, 'Invalid verification code. Please check the code and try again.')
    }

    // Valid OTP: invalidate token and verify email
    await otpVerificationsRepo.consume(lower, 'EMAIL_VERIFICATION').catch(() => null)
    await usersRepo.verifyEmail(user.id)
    const updatedUser = await usersRepo.findById(user.id)
    const sessionToken = signToken({ userId: user.id, role: user.role })

    return {
      ok: true,
      token: sessionToken,
      user: publicUser(updatedUser || user),
      message: 'Email verified successfully!',
    }
  },
}
function publicUser(u) { return { id: u.id, email: u.email, role: u.role, country: u.country || null, emailVerified: !!u.emailVerified } }

// ---------------- Me / Profile / Store ----------------
export const meService = {
  async getCreatorSetupStatus(creatorId, preloaded = null) {
    if (!creatorId) return null

    let profile = preloaded?.profile
    let store = preloaded?.store
    let productsCount = preloaded?.productsCount
    let payoutProfile = preloaded?.payoutProfile

    if (!profile || store === undefined || productsCount === undefined || payoutProfile === undefined) {
      const [fetchedProfile, fetchedStore, fetchedProductsCount, fetchedPayoutProfile] = await Promise.all([
        profile !== undefined ? Promise.resolve(profile) : profilesRepo.getByCreator(creatorId).catch(() => null),
        store !== undefined ? Promise.resolve(store) : storesRepo.getByCreator(creatorId, { includeSections: false }).catch(() => null),
        productsCount !== undefined ? Promise.resolve(productsCount) : prisma.product.count({ where: { creatorId, NOT: { status: 'ARCHIVED' } } }).catch(() => 0),
        payoutProfile !== undefined ? Promise.resolve(payoutProfile) : payoutProfilesRepo.getByCreator(creatorId).catch(() => null),
      ])
      if (profile === undefined) profile = fetchedProfile
      if (store === undefined) store = fetchedStore
      if (productsCount === undefined) productsCount = fetchedProductsCount
      if (payoutProfile === undefined) payoutProfile = fetchedPayoutProfile
    }

    const theme = store?.theme || {}
    const avatar = String(theme.avatarUrl || store?.avatarUrl || profile?.avatarUrl || '').trim()
    const isProfileImageDone = avatar.length > 0 && !avatar.includes('placeholder')

    const isProductDone = (productsCount || 0) > 0

    const isPayPal = payoutProfile?.payoutMethod === 'PAYPAL' || payoutProfile?.provider === 'MANUAL_PAYPAL' || Boolean(payoutProfile?.paypalEmail)
    const isUpi = !isPayPal && (payoutProfile?.payoutMethod === 'UPI' ||
      payoutProfile?.businessType === 'UPI' ||
      payoutProfile?.provider === 'MANUAL_UPI' ||
      (payoutProfile?.upiId && !payoutProfile?.accountNumber) ||
      (payoutProfile?.razorpayAccountId && String(payoutProfile.razorpayAccountId).includes('@')))
    const payoutMethod = isPayPal ? 'PAYPAL' : (isUpi ? 'UPI' : (payoutProfile?.payoutMethod === 'ACCOUNT' ? 'ACCOUNT' : 'BANK_ACCOUNT'))

    const hasPayoutDetails = isPayPal
      ? Boolean(payoutProfile?.paypalEmail && String(payoutProfile.paypalEmail).includes('@'))
      : (payoutMethod === 'UPI'
        ? Boolean(payoutProfile?.upiId && String(payoutProfile.upiId).includes('@') && payoutProfile.upiId.trim().length > 3)
        : Boolean(
            payoutProfile?.accountHolderName &&
            (payoutProfile?.bankName || payoutProfile?.bankLast4) &&
            (payoutProfile?.accountNumber || payoutProfile?.bankLast4 || payoutProfile?.razorpayAccountId) &&
            (payoutProfile?.ifsc || payoutProfile?.ifscCode)
          ))

    const isPayoutStatusValid = Boolean(
      payoutProfile &&
      payoutProfile.status !== 'NOT_CONFIGURED' &&
      payoutProfile.status !== 'FAILED' &&
      ['ACTIVE', 'VERIFIED', 'PENDING'].includes(payoutProfile.status || 'PENDING')
    )

    const isPayoutDone = Boolean(payoutProfile && hasPayoutDetails && isPayoutStatusValid)

    const items = [
      {
        id: 'profile-image',
        title: 'Add profile image',
        label: 'Add profile image',
        description: 'A photo helps people recognize you.',
        completed: isProfileImageDone,
        actionType: 'navigate',
        route: '/dashboard/settings?focus=avatar',
      },
      {
        id: 'first-product',
        title: 'Add a product',
        label: 'Add a product',
        description: 'Create a digital product, course, or service to sell.',
        completed: isProductDone,
        actionType: 'product-wizard',
        route: isProductDone ? '/dashboard/products' : '/dashboard/products?create=true',
      },
      {
        id: 'payout-details',
        title: 'Set up payout details',
        label: 'Set up payout details',
        description: 'Add your bank or UPI details to receive payouts.',
        completed: isPayoutDone,
        actionType: 'navigate',
        route: isPayoutDone ? '/dashboard/settings/payments' : '/dashboard/payments/setup',
      },
    ]

    const completed = items.filter((t) => t.completed).length
    const total = items.length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    const allDone = completed === total
    const nextIncomplete = items.find((t) => !t.completed) || null

    return {
      items,
      completed,
      total,
      percentage,
      allDone,
      nextRoute: nextIncomplete?.route || (isProductDone ? '/dashboard/products' : '/dashboard/store'),
      storeSlug: store?.slug || store?.username || profile?.username || '',
    }
  },
  async getMe(creatorId, options = {}) {
    const existingUser = options.user || null

    const [profile, store, subscription, productsCount, payoutProfile, resolvedUser] = await Promise.all([
      profilesRepo.getByCreator(creatorId).catch(() => null),
      storesRepo.getByCreator(creatorId, { includeSections: false }).catch(() => null),
      creatorSubscriptionService.getStatus(creatorId, existingUser).catch(() => null),
      prisma.product.count({ where: { creatorId, NOT: { status: 'ARCHIVED' } } }).catch(() => 0),
      payoutProfilesRepo.getByCreator(creatorId).catch(() => null),
      existingUser ? Promise.resolve(existingUser) : usersRepo.findById(creatorId).catch(() => null),
    ])

    if (profile && store) {
      profile.username = store.username || store.slug || profile.username || null
    }
    if (profile && !profile.country && resolvedUser?.country) {
      profile.country = resolvedUser.country
    }
    if (store) {
      store.username = store.username || store.slug || null
    }
    const setupStatus = await this.getCreatorSetupStatus(creatorId, {
      profile,
      store,
      productsCount,
      payoutProfile,
    }).catch(() => null)
    return { profile, store, subscription, setupStatus }
  },
  async updateProfile(creatorId, patch) {
    const allowed = pick(patch, ['name', 'phone', 'bio', 'category', 'avatarUrl', 'socialLinks', 'onboardingComplete', 'onboardingStatus', 'country'])
    if (allowed.name !== undefined) allowed.name = sanitizeText(allowed.name)
    if (allowed.phone !== undefined) allowed.phone = sanitizeText(allowed.phone)
    if (allowed.bio !== undefined) allowed.bio = sanitizeText(allowed.bio)
    if (allowed.category !== undefined) allowed.category = sanitizeText(allowed.category)
    if (allowed.avatarUrl !== undefined) allowed.avatarUrl = sanitizeUrl(allowed.avatarUrl)
    if (allowed.onboardingStatus !== undefined) allowed.onboardingStatus = sanitizeText(allowed.onboardingStatus)
    if (allowed.country !== undefined) {
      const cleanCountry = normalizeCountryCode(allowed.country)
      if (!cleanCountry || !isValidCountryCode(cleanCountry)) {
        throw httpError(400, 'Invalid country code. Please provide a valid ISO 3166-1 alpha-2 code.')
      }
      allowed.country = cleanCountry
      await usersRepo.update(creatorId, { country: cleanCountry })
    }
    if (allowed.socialLinks && typeof allowed.socialLinks === 'object') {
      const cleanLinks = {}
      for (const [k, v] of Object.entries(allowed.socialLinks)) {
        if (v) cleanLinks[sanitizeText(k)] = sanitizeText(v)
      }
      allowed.socialLinks = cleanLinks
    }
    const updated = await profilesRepo.upsert(creatorId, allowed)

    const storePatch = {}
    if (allowed.avatarUrl !== undefined) storePatch.avatarUrl = allowed.avatarUrl
    if (allowed.bio !== undefined) storePatch.bio = allowed.bio
    if (allowed.socialLinks !== undefined) storePatch.socialLinks = allowed.socialLinks

    if (patch.username !== undefined || patch.slug !== undefined) {
      const requestedSlug = String(patch.slug || patch.username).toLowerCase().replace(/[^a-z0-9_-]/g, '').trim()
      if (requestedSlug) {
        const existing = await storesRepo.getByCreator(creatorId)
        if (existing && (requestedSlug !== existing.username && requestedSlug !== existing.slug)) {
          const v = validateUsername(requestedSlug)
          if (!v.ok) throw httpError(400, v.error)
          const taken = await storesRepo.usernameTaken(requestedSlug, creatorId)
          if (taken) throw httpError(409, 'Username is taken')
          storePatch.username = requestedSlug
          storePatch.slug = requestedSlug
        }
      }
    }

    if (Object.keys(storePatch).length > 0) {
      const updatedStore = await storesRepo.update(creatorId, storePatch).catch(() => null)
      if (updatedStore && updated) {
        updated.username = updatedStore.username || updatedStore.slug || updated.username
      }
    }

    if (allowed.onboardingComplete === true) {
      await storeService.publish(creatorId).catch((e) => {
        console.error('Failed to publish store after onboarding complete:', e)
      })
    }

    return updated
  },
}

const storePageLocks = new Map()
export async function withStorePageLock(creatorId, fn) {
  if (!creatorId) return fn()
  while (storePageLocks.has(creatorId)) {
    await storePageLocks.get(creatorId)
  }
  let unlock
  const lockPromise = new Promise(resolve => { unlock = resolve })
  storePageLocks.set(creatorId, lockPromise)
  try {
    return await fn()
  } finally {
    storePageLocks.delete(creatorId)
    unlock()
  }
}

export const storeService = {
  async getOrCreate(creatorId, defaultStoreName) {
    const [existingStore, sections, sub] = await Promise.all([
      storesRepo.getByCreator(creatorId, { includeSections: false }).catch(() => null),
      storeSectionsRepo.getForCreator(creatorId).catch(() => []),
      creatorSubscriptionService.getStatus(creatorId).catch(() => null),
    ])

    let store = existingStore
    if (!store) {
      const [profile, user] = await Promise.all([
        profilesRepo.getByCreator(creatorId).catch(() => null),
        usersRepo.findById(creatorId).catch(() => null),
      ])
      const baseName = defaultStoreName || profile?.name || user?.email?.split('@')[0] || 'Creator Store'
      const storeSlug = await generateUniqueStoreSlug(baseName, creatorId, (c, id) => storesRepo.usernameTaken(c, id))
      store = await storesRepo.upsertStore(creatorId, {
        id: uuidv4(),
        creatorId,
        storeName: baseName,
        username: storeSlug,
        slug: storeSlug,
        published: false,
        theme: DEFAULT_THEME,
        seo: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    const pages = Array.isArray(store?.pages) ? store.pages : []

    // Enforce automatic store turn off when trial is expired without active paid subscription
    if (store && store.published) {
      const isPaid = sub && sub.status === 'ACTIVE' && !sub.isTrial
      const isTrialActive = Boolean(sub && sub.isTrial && !sub.isTrialExpired && (sub.status === 'TRIALING' || sub.trialStatus === 'ACTIVE'))
      const isEntitled = (isPaid || isTrialActive) && Boolean(sub?.entitlements?.storefront ?? sub?.entitlements?.canPublish)
      if (!isEntitled) {
        await storesRepo.setPublished(creatorId, false).catch(() => null)
        store.published = false
      }
    }

    return { ...store, sections: sections || [], pages }
  },

  async checkUsername(creatorId, username) {
    const v = validateUsername(username)
    if (!v.ok) return { available: false, isCurrent: false, username: null, error: v.error }

    const requested = v.username

    // Case A: Username belongs to the current authenticated user
    let isCurrent = false
    if (creatorId) {
      const userStore = await storesRepo.getByCreator(creatorId).catch(() => null)
      if (userStore) {
        const currentUsername = (userStore.username || '').toLowerCase().trim()
        const currentSlug = (userStore.slug || '').toLowerCase().trim()
        if (currentUsername === requested || currentSlug === requested) {
          isCurrent = true
        }
      }
    }

    if (isCurrent) {
      return {
        available: true,
        isCurrent: true,
        username: requested,
        message: 'Your current username',
        error: null,
      }
    }

    // Case B: Username belongs to another user
    const taken = await storesRepo.usernameTaken(requested, creatorId)
    if (taken) {
      return {
        available: false,
        isCurrent: false,
        username: requested,
        error: 'This username is already taken. Please pick another.',
      }
    }

    // Case C: Username is genuinely unclaimed
    return {
      available: true,
      isCurrent: false,
      username: requested,
      message: 'Username is available',
      error: null,
    }
  },

  async setUsername(creatorId, username) {
    const v = validateUsername(username)
    if (!v.ok) throw httpError(400, v.error)
    const taken = await storesRepo.usernameTaken(v.username, creatorId)
    if (taken) throw httpError(409, 'This username is already taken. Please pick another.')
    await this.getOrCreate(creatorId)
    try {
      return await storesRepo.update(creatorId, { username: v.username, slug: v.username })
    } catch (e) {
      if (e?.code === 'P2002' || String(e?.message).includes('Unique constraint') || String(e?.message).includes('duplicate key')) {
        throw httpError(409, 'This username is already taken. Please pick another.')
      }
      throw e
    }
  },

  async update(creatorId, patch) {
    if (!creatorId) throw httpError(400, 'Creator ID is required')
    const existing = await this.getOrCreate(creatorId)
    const updatePayload = {}

    if (patch.storeName !== undefined) {
      const cleanName = sanitizeText(patch.storeName)
      updatePayload.storeName = cleanName
      if (!existing.published && !existing.username && !existing.slug) {
        const newSlug = await generateUniqueStoreSlug(cleanName, creatorId, (c, id) => storesRepo.usernameTaken(c, id))
        updatePayload.slug = newSlug
        updatePayload.username = newSlug
      }
    }

    if (patch.username !== undefined || patch.slug !== undefined) {
      const requestedSlug = String(patch.slug || patch.username).toLowerCase().replace(/[^a-z0-9_-]/g, '').trim()
      if (requestedSlug && requestedSlug !== existing.slug && requestedSlug !== existing.username) {
        const v = validateUsername(requestedSlug)
        if (!v.ok) throw httpError(400, v.error)
        const taken = await storesRepo.usernameTaken(requestedSlug, creatorId)
        if (taken) throw httpError(409, 'Store URL / username is taken')
        updatePayload.username = requestedSlug
        updatePayload.slug = requestedSlug
      }
    }

    if (patch.avatarUrl !== undefined) {
      updatePayload.avatarUrl = patch.avatarUrl ? sanitizeUrl(patch.avatarUrl) : null
    }
    if (patch.bio !== undefined) {
      updatePayload.bio = sanitizeText(patch.bio)
    }

    if (patch.theme && typeof patch.theme === 'object') {
      if (patch.theme.showFooterBranding === false) {
        await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
      }
      updatePayload.theme = { ...(existing?.theme || DEFAULT_THEME), ...patch.theme }
    } else if (patch.storeName !== undefined) {
      updatePayload.theme = { ...(existing?.theme || DEFAULT_THEME), headerTitle: sanitizeText(patch.storeName) }
    }

    if (patch.sections && Array.isArray(patch.sections)) {
      if (patch.sections.length > (existing?.sections?.length || 0)) {
        await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'store_sections')
      }

      // Enforce product/course ownership & deduplication for collection items
      const creatorProds = await productsRepo.listByCreator(creatorId)
      const creatorCourses = await coursesRepo.list(creatorId).catch(() => [])
      const validProductIds = new Set(creatorProds.map((p) => String(p.id)))
      const validCourseIds = new Set(creatorCourses.flatMap((c) => [c.id ? String(c.id) : null, c.productId ? String(c.productId) : null]).filter(Boolean))
      const VALID_COLLECTION_LAYOUTS = ['list', 'grid', 'carousel', 'showcase']

      updatePayload.sections = patch.sections.map((sec) => {
        const cleanProps = {}
        if (sec.props && typeof sec.props === 'object') {
          for (const [k, v] of Object.entries(sec.props)) {
            if (typeof v === 'string') {
              cleanProps[k] = k.toLowerCase().includes('url') ? sanitizeUrl(v) : sanitizeText(v)
            } else if (k === 'items' && Array.isArray(v) && (sec.type === 'collection' || sec.type === 'product_collection')) {
              const seenIds = new Set()
              cleanProps[k] = v.map((item) => {
                if (!item || typeof item !== 'object') return null
                const itemType = item.type || (item.productId ? 'product' : (item.courseId ? 'course' : 'link'))
                if (itemType === 'product') {
                  const pId = String(item.productId || item.id || '')
                  if (!pId || !validProductIds.has(pId)) return null
                  if (seenIds.has(pId)) return null
                  seenIds.add(pId)
                  return {
                    id: item.id || uuidv4(),
                    type: 'product',
                    productId: pId,
                  }
                }
                if (itemType === 'course') {
                  const cId = String(item.courseId || item.productId || item.id || '')
                  if (!cId || (!validCourseIds.has(cId) && !validProductIds.has(cId))) return null
                  if (seenIds.has(cId)) return null
                  seenIds.add(cId)
                  return {
                    id: item.id || uuidv4(),
                    type: 'course',
                    courseId: cId,
                    productId: cId,
                  }
                }
                if (itemType === 'link') {
                  return {
                    id: item.id || uuidv4(),
                    type: 'link',
                    title: sanitizeText(item.title || 'External Link'),
                    url: sanitizeUrl(item.url || ''),
                  }
                }
                return null
              }).filter(Boolean)
            } else {
              cleanProps[k] = v
            }
          }

          if (sec.type === 'collection' || sec.type === 'product_collection') {
            const rawLayout = cleanProps.layout || cleanProps.displayMode || 'list'
            const canonicalLayout = VALID_COLLECTION_LAYOUTS.includes(rawLayout) ? rawLayout : 'list'
            cleanProps.layout = canonicalLayout
            cleanProps.displayMode = canonicalLayout
            if (!Array.isArray(cleanProps.items)) cleanProps.items = []
          }

          if (sec.type === 'product' && cleanProps.productId) {
            if (!validProductIds.has(String(cleanProps.productId))) {
              cleanProps.productId = null
            }
          }
          if (sec.type === 'course' && cleanProps.courseId) {
            if (!validCourseIds.has(String(cleanProps.courseId)) && !validProductIds.has(String(cleanProps.courseId))) {
              cleanProps.courseId = null
            }
          }
        }
        return { ...sec, props: cleanProps }
      })
    }

    if (patch.pages !== undefined && Array.isArray(patch.pages)) {
      const plan = await creatorSubscriptionService.getStatus(creatorId)
      const planConfig = getPlanConfig(plan.planId, plan.status)
      const maxPages = planConfig.entitlements?.storePagesLimit ?? (plan.planId === 'PRO' ? Infinity : 3)
      if (maxPages !== Infinity && patch.pages.length > maxPages) {
        const err = httpError(403, `Your Creator plan allows up to ${maxPages} storefront pages. Upgrade to Pro to create unlimited storefront pages.`)
        err.code = 'PAGE_LIMIT_REACHED'
        err.currentCount = patch.pages.length
        err.limit = maxPages
        err.plan = plan.planId
        throw err
      }
      updatePayload.pages = patch.pages
    }

    if (patch.seo && typeof patch.seo === 'object') {
      updatePayload.seo = { ...(existing?.seo || {}), ...patch.seo }
    }

    return storesRepo.update(creatorId, updatePayload)
  },

  // ---------- Page management ----------

  async assertCanCreateStorePage(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'store_pages')
    const sub = await creatorSubscriptionService.getStatus(creatorId)
    const planConfig = getPlanConfig(sub.planId, sub.status)
    const maxPages = planConfig.entitlements?.storePagesLimit ?? (sub.planId === 'PRO' ? Infinity : 3)

    if (maxPages === Infinity) {
      return { allowed: true, limit: Infinity, currentCount: 0, plan: sub.planId }
    }

    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const hasHome = pages.some(p => p.isDefault)
    const currentCount = pages.length === 0 ? 1 : (hasHome ? pages.length : pages.length + 1)

    if (currentCount >= maxPages) {
      const err = httpError(403, `Your Creator plan allows up to ${maxPages} storefront pages. Upgrade to Pro to create unlimited storefront pages.`)
      err.code = 'PAGE_LIMIT_REACHED'
      err.currentCount = currentCount
      err.limit = maxPages
      err.plan = sub.planId
      throw err
    }

    return { allowed: true, limit: maxPages, currentCount, plan: sub.planId }
  },

  async listPages(creatorId) {
    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    // Always ensure the default Home page is present
    if (pages.length === 0 || !pages.some(p => p.isDefault)) {
      const homePage = { id: 'home', name: 'Home', slug: 'home', isDefault: true, position: 0 }
      const merged = [homePage, ...pages.filter(p => !p.isDefault)]
      await storesRepo.update(creatorId, { pages: merged })
      return merged
    }
    return [...pages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  },

  async createPage(creatorId, nameOrPayload) {
    const payload = typeof nameOrPayload === 'string' ? { name: nameOrPayload } : nameOrPayload
    return this.addPage(creatorId, payload)
  },

  async addPage(creatorId, { name }) {
    return withStorePageLock(creatorId, async () => {
      if (!name || !name.trim()) throw httpError(400, 'Page name is required')

    // 1. Enforce page limit based on subscription plan
    await this.assertCanCreateStorePage(creatorId)

    const cleanName = sanitizeText(name.trim()).slice(0, 50)
    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const hasHome = pages.some(p => p.isDefault)
    const basePages = hasHome ? pages : [{ id: 'home', name: 'Home', slug: 'home', isDefault: true, position: 0 }, ...pages]

    // 2. Re-verify after read to protect against race conditions
    const plan = await creatorSubscriptionService.getStatus(creatorId)
    const planConfig = getPlanConfig(plan.planId, plan.status)
    const maxPages = planConfig.entitlements?.storePagesLimit ?? (plan.planId === 'PRO' ? Infinity : 3)
    if (maxPages !== Infinity && basePages.length >= maxPages) {
      const err = httpError(403, `Your Creator plan allows up to ${maxPages} storefront pages. Upgrade to Pro to create unlimited storefront pages.`)
      err.code = 'PAGE_LIMIT_REACHED'
      err.currentCount = basePages.length
      err.limit = maxPages
      err.plan = plan.planId
      throw err
    }

    // Generate unique slug from name
    let slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page'
    const existingSlugs = new Set(basePages.map(p => p.slug))
    let candidateSlug = slug
    let counter = 2
    while (existingSlugs.has(candidateSlug)) candidateSlug = `${slug}-${counter++}`

    const nameLower = cleanName.toLowerCase()
    if (basePages.some(p => p.name.toLowerCase() === nameLower)) throw httpError(409, 'A page with this name already exists')

    const newPage = { id: uuidv4(), name: cleanName, slug: candidateSlug, isDefault: false, position: basePages.length }
    const updatedPages = [...basePages, newPage]
    await storesRepo.update(creatorId, { pages: updatedPages })
    return { page: newPage, pages: updatedPages }
    })
  },

  async duplicatePage(creatorId, pageId) {
    return withStorePageLock(creatorId, async () => {
      if (!pageId) throw httpError(400, 'Page ID is required')

    // 1. Enforce page limit based on subscription plan
    await this.assertCanCreateStorePage(creatorId)

    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const hasHome = pages.some(p => p.isDefault)
    const basePages = hasHome ? pages : [{ id: 'home', name: 'Home', slug: 'home', isDefault: true, position: 0 }, ...pages]

    const targetPage = basePages.find(p => p.id === pageId)
    if (!targetPage) throw httpError(404, 'Page not found')

    // 2. Re-verify limit after read
    const plan = await creatorSubscriptionService.getStatus(creatorId)
    const planConfig = getPlanConfig(plan.planId, plan.status)
    const maxPages = planConfig.entitlements?.storePagesLimit ?? (plan.planId === 'PRO' ? Infinity : 3)
    if (maxPages !== Infinity && basePages.length >= maxPages) {
      const err = httpError(403, `Your Creator plan allows up to ${maxPages} storefront pages. Upgrade to Pro to create unlimited storefront pages.`)
      err.code = 'PAGE_LIMIT_REACHED'
      err.currentCount = basePages.length
      err.limit = maxPages
      err.plan = plan.planId
      throw err
    }

    const cleanName = `${targetPage.name} (Copy)`.slice(0, 50)
    let slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page-copy'
    const existingSlugs = new Set(basePages.map(p => p.slug))
    let counter = 2
    let candidateSlug = slug
    while (existingSlugs.has(candidateSlug)) candidateSlug = `${slug}-${counter++}`

    const newPageId = uuidv4()
    const newPage = { id: newPageId, name: cleanName, slug: candidateSlug, isDefault: false, position: basePages.length }
    const updatedPages = [...basePages, newPage]

    // Duplicate sections for this page
    const existingSections = await storeSectionsRepo.getForCreator(creatorId)
    const pageSections = existingSections.filter(s => s.pageId === pageId || (!s.pageId && targetPage.isDefault))
    for (const s of pageSections) {
      await storeSectionsRepo.create(creatorId, {
        type: s.type,
        pageId: newPageId,
        position: s.position,
        props: s.props,
        visible: s.visible,
      })
    }

    await storesRepo.update(creatorId, { pages: updatedPages })
    return { page: newPage, pages: updatedPages }
    })
  },

  async renamePage(creatorId, pageId, { name }) {
    if (!name || !name.trim()) throw httpError(400, 'Page name is required')
    const cleanName = sanitizeText(name.trim()).slice(0, 50)
    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const idx = pages.findIndex(p => p.id === pageId)
    if (idx === -1) throw httpError(404, 'Page not found')
    if (pages[idx].isDefault) throw httpError(400, 'Cannot rename the default Home page')
    const nameLower = cleanName.toLowerCase()
    if (pages.some((p, i) => i !== idx && p.name.toLowerCase() === nameLower)) throw httpError(409, 'A page with this name already exists')
    pages[idx] = { ...pages[idx], name: cleanName }
    await storesRepo.update(creatorId, { pages })
    return { page: pages[idx], pages }
  },

  async deletePage(creatorId, pageId) {
    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const page = pages.find(p => p.id === pageId)
    if (!page) throw httpError(404, 'Page not found')
    if (page.isDefault) throw httpError(400, 'Cannot delete the default Home page')
    await storeSectionsRepo.deleteSectionsForPage(creatorId, pageId)
    const updatedPages = pages.filter(p => p.id !== pageId).map((p, i) => ({ ...p, position: i }))
    await storesRepo.update(creatorId, { pages: updatedPages })
    return { ok: true, pages: updatedPages }
  },

  async reorderPages(creatorId, orderedPageIds) {
    if (!Array.isArray(orderedPageIds)) throw httpError(400, 'orderedPageIds must be an array')
    const store = await this.getOrCreate(creatorId)
    const pages = Array.isArray(store.pages) ? store.pages : []
    const map = new Map(pages.map(p => [p.id, p]))
    const reordered = []
    orderedPageIds.forEach(id => { if (map.has(id)) { reordered.push({ ...map.get(id) }); map.delete(id) } })
    map.forEach(p => reordered.push(p))
    const final = reordered.map((p, i) => ({ ...p, position: i }))
    await storesRepo.update(creatorId, { pages: final })
    return { pages: final }
  },

  async publish(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')

    // 1. Verify user's paid subscription or active trial status from server-side database
    const sub = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const isPaid = sub && sub.status === 'ACTIVE' && !sub.isTrial
    const isTrialActive = Boolean(sub && sub.isTrial && !sub.isTrialExpired && (sub.status === 'TRIALING' || sub.trialStatus === 'ACTIVE'))
    const isEntitled = (isPaid || isTrialActive) && Boolean(sub?.entitlements?.canPublish ?? sub?.entitlements?.storefront)

    if (!isEntitled) {
      const err = httpError(403, 'Your Pro trial has ended. An active paid plan is required to turn on your storefront.')
      err.code = 'PLAN_UPGRADE_REQUIRED'
      err.status = 403
      throw err
    }

    const store = await this.getOrCreate(creatorId)
    let finalSlug = store.slug || store.username
    if (!finalSlug) {
      finalSlug = await generateUniqueStoreSlug(store.storeName || 'Creator Store', creatorId, (c, id) => storesRepo.usernameTaken(c, id))
    }
    const updatedStore = await storesRepo.update(creatorId, { published: true, slug: finalSlug, username: finalSlug })
    return {
      success: true,
      storefrontEnabled: true,
      published: true,
      store: updatedStore,
      slug: finalSlug,
      username: finalSlug,
      publicUrl: `/${finalSlug}`,
    }
  },

  async unpublish(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const updatedStore = await storesRepo.update(creatorId, { published: false })
    return {
      success: true,
      storefrontEnabled: false,
      published: false,
      store: updatedStore,
    }
  },

  async getSettings(creatorId) {
    const store = await this.getOrCreate(creatorId)
    const profile = await profilesRepo.getByCreator(creatorId)
    const storeSlug = store.slug || store.username
    const sub = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const isPaid = sub && sub.status === 'ACTIVE' && !sub.isTrial
    const isTrialActive = Boolean(sub && sub.isTrial && !sub.isTrialExpired && (sub.status === 'TRIALING' || sub.trialStatus === 'ACTIVE'))
    const isEntitled = (isPaid || isTrialActive) && Boolean(sub?.entitlements?.storefront ?? sub?.entitlements?.canPublish)
    if (!isEntitled && store.published) {
      await storesRepo.setPublished(creatorId, false).catch(() => null)
      store.published = false
    }
    return {
      settings: {
        id: store.id,
        creatorId: store.creatorId,
        storeName: store.storeName || profile?.name || 'Creator Store',
        username: storeSlug,
        slug: storeSlug,
        publicUrl: `/${storeSlug}`,
        supportEmail: store.supportEmail || profile?.email || '',
        socialLinks: store.socialLinks || profile?.socialLinks || {},
        policies: store.policies || {
          termsOfService: 'Standard terms of service apply to all purchases.',
          privacyPolicy: 'We respect customer data privacy and do not sell information.',
          refundPolicy: 'Refunds are subject to product terms and creator approval.',
        },
        theme: store.theme || DEFAULT_THEME,
        seo: store.seo || { title: '', description: '', favicon: '', ogImage: '' },
        published: !!store.published,
      }
    }
  },

  async updateSettings(creatorId, patch) {
    const existing = await this.getOrCreate(creatorId)
    const updatePayload = {}
    if (patch.storeName !== undefined) updatePayload.storeName = sanitizeText(patch.storeName)
    if (patch.username !== undefined || patch.slug !== undefined) {
      const requestedSlug = String(patch.slug || patch.username).toLowerCase().replace(/[^a-z0-9_-]/g, '').trim()
      if (requestedSlug && requestedSlug !== existing.slug && requestedSlug !== existing.username) {
        const v = validateUsername(requestedSlug)
        if (!v.ok) throw httpError(400, v.error)
        const taken = await storesRepo.usernameTaken(requestedSlug, creatorId)
        if (taken) throw httpError(409, 'Store handle is taken')
        updatePayload.username = requestedSlug
        updatePayload.slug = requestedSlug
      }
    }
    if (patch.supportEmail !== undefined) updatePayload.supportEmail = sanitizeText(patch.supportEmail)
    if (patch.socialLinks && typeof patch.socialLinks === 'object') {
      updatePayload.socialLinks = { ...(existing.socialLinks || {}), ...patch.socialLinks }
    }
    if (patch.policies && typeof patch.policies === 'object') {
      updatePayload.policies = { ...(existing.policies || {}), ...patch.policies }
    }
    if (patch.theme && typeof patch.theme === 'object') {
      if (patch.theme.showFooterBranding === false) {
        await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
      }
      updatePayload.theme = { ...(existing.theme || DEFAULT_THEME), ...patch.theme }
    }
    if (patch.seo && typeof patch.seo === 'object') {
      updatePayload.seo = { ...(existing.seo || {}), ...patch.seo }
    }
    await storesRepo.update(creatorId, updatePayload)
    return this.getSettings(creatorId)
  },

  async getPublicPolicies(username) {
    const store = await storesRepo.getBySlug(username)
    if (!store) throw httpError(404, 'Store not found')
    const profile = await profilesRepo.getByCreator(store.creatorId)
    return {
      username: store.slug || store.username,
      supportEmail: store.supportEmail || profile?.email || '',
      policies: store.policies || {
        termsOfService: 'Standard terms of service apply to all purchases.',
        privacyPolicy: 'We respect customer data privacy and do not sell information.',
        refundPolicy: 'Refunds are subject to product terms and creator approval.',
      }
    }
  }
}


// ---------------- Store Sections Service ----------------
export const storeSectionsService = {
  async getSections(creatorId) {
    return storeSectionsRepo.getForCreator(creatorId)
  },
  async createSection(creatorId, data) {
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'store_sections')
    const validTypes = ['HERO', 'FEATURED_PRODUCTS', 'PRODUCT_COLLECTION', 'PRODUCT_GRID', 'LEAD_MAGNET', 'COACHING', 'COMMUNITY', 'WEBINAR', 'MEMBERSHIP', 'TESTIMONIALS', 'FAQ', 'TEXT_CONTENT', 'SOCIAL_LINKS', 'CTA', 'COLLECTION']
    const type = (data.type || 'HERO').toUpperCase()
    if (!validTypes.includes(type)) throw httpError(400, 'Invalid section type')

    const section = {
      id: uuidv4(),
      type,
      title: data.title ? sanitizeText(data.title) : 'Section Title',
      subtitle: data.subtitle ? sanitizeText(data.subtitle) : '',
      content: data.content ? sanitizeHtml(data.content) : '',
      visible: data.visible !== false,
      config: data.config && typeof data.config === 'object' ? data.config : {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return storeSectionsRepo.addSection(creatorId, section)
  },
  async updateSection(creatorId, sectionId, data) {
    const patch = {}
    if (data.type) {
      const validTypes = ['HERO', 'FEATURED_PRODUCTS', 'PRODUCT_COLLECTION', 'PRODUCT_GRID', 'LEAD_MAGNET', 'COACHING', 'COMMUNITY', 'WEBINAR', 'MEMBERSHIP', 'TESTIMONIALS', 'FAQ', 'TEXT_CONTENT', 'SOCIAL_LINKS', 'CTA', 'COLLECTION']
      const type = data.type.toUpperCase()
      if (validTypes.includes(type)) patch.type = type
    }
    if (data.title !== undefined) patch.title = sanitizeText(data.title)
    if (data.subtitle !== undefined) patch.subtitle = sanitizeText(data.subtitle)
    if (data.content !== undefined) patch.content = sanitizeHtml(data.content)
    if (data.visible !== undefined) patch.visible = !!data.visible
    if (data.order !== undefined) patch.order = parseInt(data.order, 10)
    if (data.config && typeof data.config === 'object') patch.config = data.config

    const updated = await storeSectionsRepo.updateSection(creatorId, sectionId, patch)
    if (!updated) throw httpError(404, 'Store section not found')
    return updated
  },
  async deleteSection(creatorId, sectionId) {
    await storeSectionsRepo.deleteSection(creatorId, sectionId)
    return { success: true, deleted: true, ok: true }
  },
  async deleteManySections(creatorId, sectionIds) {
    if (!creatorId || !Array.isArray(sectionIds) || sectionIds.length === 0) {
      return { success: true, deleted: true, ok: true, count: 0 }
    }
    const res = await storeSectionsRepo.deleteMany(creatorId, sectionIds)
    return { success: true, deleted: true, ok: true, count: res.count }
  },
  async reorderSections(creatorId, orderedSectionIds) {
    if (!Array.isArray(orderedSectionIds)) throw httpError(400, 'orderedSectionIds must be an array')
    return storeSectionsRepo.reorderSections(creatorId, orderedSectionIds)
  }
}


// ---------------- Products ----------------
export const productService = {
  async list(creatorId, options = {}) {
    const res = await productsRepo.list(creatorId, options)
    const items = Array.isArray(res) ? res : (res?.items || [])
    if (!items.length) return res

    try {
      const productIds = items.map(p => p.id).filter(Boolean)
      const hasCoaching = items.some(p => p.type === 'COACHING')

      const [orderGroups, bookings, events] = await Promise.all([
        productIds.length > 0 ? prisma.order.groupBy({
          by: ['productId'],
          where: {
            creatorId,
            productId: { in: productIds },
            status: { in: ['PAID', 'ACTIVE'] },
          },
          _count: { id: true },
        }).catch(() => []) : Promise.resolve([]),
        hasCoaching ? coachingRepo.listBookingsForCreator(creatorId, {}).catch(() => []) : Promise.resolve([]),
        productIds.length > 0 ? supabaseAdmin
          .from('analytics_events')
          .select('productId')
          .eq('creatorId', creatorId)
          .in('productId', productIds)
          .then(r => r.data || [])
          .catch(() => []) : Promise.resolve([]),
      ])

      const orderCountByProduct = new Map()
      for (const g of orderGroups) {
        if (g.productId) orderCountByProduct.set(g.productId, g._count?.id || 0)
      }

      const clicksByProduct = new Map()
      for (const e of events) {
        if (e.productId) clicksByProduct.set(e.productId, (clicksByProduct.get(e.productId) || 0) + 1)
      }

      const enriched = await Promise.all(items.map(async (p) => {
        let count = 0
        let label = ''
        if (p.type === 'COURSE') {
          count = orderCountByProduct.get(p.id) || 0
          label = `${count} ${count === 1 ? 'student' : 'students'}`
        } else if (p.type === 'COACHING') {
          const productBookings = bookings.filter(b => b.productId === p.id)
          count = productBookings.length
          label = `${count} ${count === 1 ? 'booking' : 'bookings'}`
        } else if (p.type === 'MEMBERSHIP') {
          let memCount = 0
          try {
            const conf = await membershipRepo.getConfigByProductId(p.id)
            const subs = await membershipRepo.listSubscriptionsForMembership(conf?.id || p.id).catch(() => ({ items: [] }))
            const subItems = Array.isArray(subs) ? subs : (subs?.items || [])
            memCount = subItems.filter(s => s.status === 'ACTIVE' || s.status === 'TRIALING').length
          } catch (e) { }
          const paidMemCount = orderCountByProduct.get(p.id) || 0
          count = Math.max(memCount, paidMemCount)
          label = `${count} ${count === 1 ? 'member' : 'members'}`
        } else {
          count = orderCountByProduct.get(p.id) || 0
          label = `${count} ${count === 1 ? 'sale' : 'sales'}`
        }

        const clicks = clicksByProduct.get(p.id) || 0
        const isPublished = p.status === 'PUBLISHED'
        const normType = (String(p.type || '').toUpperCase().trim())
        let setupIncomplete = false
        if (!isPublished) {
          if (normType === 'DIGITAL' || normType === 'DIGITAL_DOWNLOAD' || normType === 'EBOOK') {
            if (!p.fileId && !p.fileName && !p.redirectUrl) setupIncomplete = true
          } else if (normType === 'EXTERNAL_LINK') {
            if (!p.redirectUrl) setupIncomplete = true
          }
          if (p.price === null || p.price === undefined) {
            setupIncomplete = true
          }
          if (p.status === 'SETUP_INCOMPLETE') {
            setupIncomplete = true
          }
        }

        return {
          ...p,
          performanceCount: count,
          performanceLabel: label,
          allTimeOrders: count,
          allTimeClicks: clicks,
          setupIncomplete,
          isSetupComplete: !setupIncomplete,
        }
      }))

      if (Array.isArray(res)) return enriched
      return { ...res, items: enriched }
    } catch (e) {
      return res
    }
  },
  async get(creatorId, id) {
    const p = await productsRepo.getForCreator(id, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    return p
  },
  async getManagementData(creatorId, id) {
    const product = await productsRepo.getForCreator(id, creatorId)
    if (!product) throw httpError(404, 'Product not found')

    const type = product.type || 'DIGITAL_DOWNLOAD'
    const managementData = {
      product,
      type,
      summary: {},
      overview: {},
      customers: [],
      orders: [],
      students: [],
      curriculum: { modules: [] },
      bookings: [],
      config: {},
      members: [],
      content: { posts: [] },
      tiers: [],
      analytics: {},
    }

    if (type === 'COURSE') {
      let course = await coursesRepo.getByProduct(id).catch(() => null)
      if (!course) {
        const courses = await coursesRepo.list(creatorId).catch(() => [])
        course = courses.find(c => c.productId === id) || null
      }
      const courseId = course?.id
      let students = []
      let modules = []
      let lessons = []
      let analytics = { totalStudents: 0, revenue: 0, completionRate: 0, averageProgress: 0 }

      if (courseId) {
        students = await courseService.getStudents(creatorId, courseId).catch(() => [])
        modules = await modulesRepo.listByCourse(courseId).catch(() => [])
        lessons = await lessonsRepo.listByCourse(courseId).catch(() => [])
        analytics = await courseService.getAnalytics(creatorId, courseId).catch(() => ({
          totalStudents: students.length,
          revenue: students.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0),
          completionRate: 0,
          averageProgress: 0,
        }))
      }

      const curriculumModules = modules.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        position: m.position,
        lessons: lessons.filter(l => l.moduleId === m.id).sort((a, b) => (a.position || 0) - (b.position || 0))
      })).sort((a, b) => (a.position || 0) - (b.position || 0))

      managementData.course = course
      managementData.summary = {
        students: analytics.totalStudents || students.length,
        revenue: analytics.revenue || 0,
        completionRate: analytics.completionRate || 0,
        averageProgress: analytics.averageProgress || 0,
      }
      managementData.overview = {
        title: product.title,
        description: product.description || product.shortDescription || '',
        price: Number(product.price || 0),
        currency: product.currency || 'INR',
        published: product.status === 'PUBLISHED',
        totalStudents: analytics.totalStudents || students.length,
        revenue: analytics.revenue || 0,
        completionRate: analytics.completionRate || 0,
        averageProgress: analytics.averageProgress || 0,
        recentEnrollments: students.slice(0, 10),
      }
      managementData.students = students
      managementData.curriculum = { modules: curriculumModules }
      managementData.analytics = analytics
      managementData.config = course || {}

    } else if (type === 'COACHING') {
      const config = await coachingService.getConfig(creatorId, id)
      const bookings = await coachingRepo.listBookingsForCreator(creatorId, { productId: id }).catch(() => [])

      const now = new Date()
      const upcoming = bookings.filter(b => b.status === 'CONFIRMED' && new Date(b.startTime) > now)
      const completed = bookings.filter(b => b.status === 'COMPLETED' || (b.status === 'CONFIRMED' && new Date(b.endTime) <= now))

      const orders = await ordersRepo.list(creatorId).catch(() => [])
      const paidOrders = orders.filter(o => o.productId === id && o.status === 'PAID')
      const orderRevenue = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)
      const bookingRevenue = bookings.filter(b => b.paymentStatus === 'PAID').reduce((sum, b) => sum + Number(product.price || 0), 0)
      const revenue = Math.max(orderRevenue, bookingRevenue)

      const sortedUpcoming = [...upcoming].sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      const nextBooking = sortedUpcoming[0] || null

      managementData.summary = {
        totalBookings: bookings.length,
        upcoming: upcoming.length,
        completed: completed.length,
        revenue,
      }
      managementData.overview = {
        serviceName: product.title,
        price: Number(product.price || 0),
        currency: product.currency || 'INR',
        duration: config.durationMinutes || 60,
        totalBookings: bookings.length,
        upcomingBookings: upcoming.length,
        completedBookings: completed.length,
        revenue,
        nextBooking,
      }
      managementData.bookings = bookings
      managementData.config = config

    } else if (type === 'MEMBERSHIP') {
      const config = await membershipService.getConfig(id)
      const memSubs = await membershipRepo.listSubscriptionsForMembership(config?.id || id).catch(() => ({ items: [], total: 0 }))
      const subscriptions = Array.isArray(memSubs) ? memSubs : (memSubs?.items || [])

      const posts = await membershipPostsRepo.list(id).catch(() => [])
      const tiers = await membershipTiersRepo.list(id).catch(() => [])

      const activeSubs = subscriptions.filter(s => s.status === 'ACTIVE' || s.status === 'TRIALING')
      const cancelledSubs = subscriptions.filter(s => s.status === 'CANCELLED')

      const mrr = activeSubs.reduce((sum, s) => {
        const p = Number(s.price !== undefined ? s.price : (config?.price || product.price || 0))
        return sum + (s.billingInterval === 'YEAR' ? Math.round(p / 12) : p)
      }, 0)

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const newMembers = subscriptions.filter(s => new Date(s.createdAt) >= thirtyDaysAgo).length
      const churnRate = subscriptions.length > 0 ? Math.round((cancelledSubs.length / subscriptions.length) * 100) : 0

      managementData.summary = {
        members: activeSubs.length,
        mrr,
        newMembers,
        churn: `${churnRate}%`,
      }
      managementData.overview = {
        membershipName: config?.name || product.title,
        price: Number(config?.price || product.price || 0),
        currency: config?.currency || product.currency || 'INR',
        billingInterval: config?.billingType === 'YEARLY' ? 'year' : 'month',
        activeMembers: activeSubs.length,
        mrr,
        recentMembers: subscriptions.slice(0, 10),
        status: product.status,
      }
      managementData.members = subscriptions
      managementData.content = { posts }
      managementData.tiers = tiers
      managementData.config = config

    } else {
      const orders = await ordersRepo.list(creatorId).catch(() => [])
      const productOrders = orders.filter(o => o.productId === id)
      const paidOrders = productOrders.filter(o => o.status === 'PAID')

      const revenue = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)
      const totalSales = paidOrders.length

      const customerMap = new Map()
      for (const order of productOrders) {
        const email = String(order.customerEmail || '').toLowerCase().trim()
        if (!email) continue
        if (!customerMap.has(email)) {
          customerMap.set(email, {
            id: order.customerId || order.id,
            name: order.customerName || email.split('@')[0],
            email,
            purchasedAt: order.paidAt || order.createdAt,
            amount: Number(order.amount || 0),
            currency: order.currency || product.currency || 'INR',
            status: order.status,
            ordersCount: 1,
            totalSpent: Number(order.amount || 0),
          })
        } else {
          const existing = customerMap.get(email)
          existing.ordersCount += 1
          existing.totalSpent += Number(order.amount || 0)
          if (order.status === 'PAID') existing.status = 'PAID'
        }
      }
      const customers = Array.from(customerMap.values())
      const downloadsCount = product.fileId ? totalSales : (product.files?.length ? totalSales * product.files.length : totalSales)

      managementData.summary = {
        revenue,
        totalSales,
        customers: customers.length,
        downloads: downloadsCount,
      }
      managementData.overview = {
        description: product.description || product.shortDescription || '',
        price: Number(product.price || 0),
        currency: product.currency || 'INR',
        status: product.status,
        file: {
          fileId: product.fileId,
          fileName: product.fileName,
          fileSize: product.fileSize,
          fileMime: product.fileMime,
          files: product.files || [],
        },
        totalSales,
        revenue,
        recentPurchases: paidOrders.slice(0, 10),
      }
      managementData.customers = customers
      managementData.orders = productOrders
      managementData.config = product
    }

    return managementData
  },
  async create(creatorId, data) {
    if (data.type === 'COURSE' || String(data.type).toLowerCase() === 'course') {
      throw httpError(410, 'The Courses feature has been permanently retired. New courses cannot be created.')
    }
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'products')

    const cleanTitle = sanitizeText(data.title || 'Untitled product').slice(0, 120)
    let slug = slugify(data.slug || cleanTitle)
    let n = 1
    while (await productsRepo.slugExists(creatorId, slug)) { slug = `${slugify(cleanTitle)}-${n++}` }
    const product = {
      id: uuidv4(), creatorId,
      type: data.type || 'DIGITAL_DOWNLOAD',
      title: cleanTitle, slug,
      description: sanitizeHtml(data.description || ''),
      shortDescription: sanitizeText(data.shortDescription || ''),
      thumbnail: sanitizeUrl(data.thumbnail || ''),
      price: clampPrice(data.price),
      currency: (data.currency || 'usd').toLowerCase(),
      status: data.status ? String(data.status).toUpperCase() : 'DRAFT',
      storePublished: data.storePublished !== undefined ? Boolean(data.storePublished) : true,
      fileId: data.fileId || null, fileName: data.fileName || null, fileSize: data.fileSize ? Number(data.fileSize) : null, fileMime: data.fileMime || null,
      benefits: Array.isArray(data.benefits) ? data.benefits.map(sanitizeText).slice(0, 8) : [],
      isLimitedQuantity: !!data.isLimitedQuantity,
      quantityLimit: data.quantityLimit !== undefined && data.quantityLimit !== null ? Math.max(0, parseInt(data.quantityLimit, 10)) : null,
      quantitySold: 0,
      soldOut: false,
      displayMode: data.displayMode === 'featured' ? 'featured' : 'classic',
      redirectUrl: data.redirectUrl ? sanitizeUrl(data.redirectUrl) : null,
      createdAt: new Date(), updatedAt: new Date(),
    }
    const created = await productsRepo.create(product)
    if (data.pageId !== undefined || data.addToStore) {
      try {
        await storeSectionsRepo.addSection(creatorId, {
          type: 'product',
          pageId: data.pageId || null,
          hidden: false,
          props: { productId: created.id, layout: created.displayMode || 'classic' },
        })
      } catch (err) {
        console.error('Failed to auto-create store section for product:', err)
      }
    }
    return created
  },
  async update(creatorId, id, data) {
    await this.get(creatorId, id)
    const patch = pick(data, [
      'title', 'description', 'shortDescription', 'thumbnail', 'cover', 'cta', 'currency', 'benefits',
      'integrations', 'settings', 'pricingOptions', 'receiptMessage',
      'details', 'versions', 'curriculum', 'memberBenefits',
      'bookingSchedule', 'webinarEvent', 'tipPresets', 'externalUrl',
      'contentType', 'redirectUrl', 'contentNotes', 'generateLicenseKeys', 'stampPdf', 'disableDownload', 'files',
      'storePublished', 'status', 'fileId', 'fileName', 'fileSize', 'fileMime', 'displayMode'
    ])
    if (patch.displayMode !== undefined) {
      patch.displayMode = patch.displayMode === 'featured' ? 'featured' : 'classic'
    }
    if (patch.redirectUrl !== undefined) {
      patch.redirectUrl = patch.redirectUrl ? sanitizeUrl(patch.redirectUrl) : null
    }
    if (patch.title !== undefined) patch.title = sanitizeText(patch.title).slice(0, 120)
    if (patch.shortDescription !== undefined) patch.shortDescription = sanitizeText(patch.shortDescription)
    if (patch.description !== undefined) patch.description = sanitizeHtml(patch.description)
    if (patch.thumbnail !== undefined) patch.thumbnail = sanitizeUrl(patch.thumbnail)
    if (patch.cover !== undefined) patch.cover = sanitizeUrl(patch.cover)
    if (patch.benefits && Array.isArray(patch.benefits)) patch.benefits = patch.benefits.map(sanitizeText).slice(0, 8)
    if (data.price !== undefined) patch.price = clampPrice(data.price)
    if (data.isLimitedQuantity !== undefined) patch.isLimitedQuantity = !!data.isLimitedQuantity
    if (data.quantityLimit !== undefined) {
      patch.quantityLimit = data.quantityLimit !== null ? Math.max(0, parseInt(data.quantityLimit, 10)) : null
    }
    if (data.quantitySold !== undefined) patch.quantitySold = Math.max(0, parseInt(data.quantitySold, 10))
    if (data.soldOut !== undefined) patch.soldOut = !!data.soldOut
    if (data.slug) {
      let slug = slugify(data.slug)
      const exists = await productsRepo.slugExists(creatorId, slug)
      const current = await productsRepo.getForCreator(id, creatorId)
      if (exists && current.slug !== slug) throw httpError(409, 'Slug already in use')
      patch.slug = slug
    }
    const updatedProduct = await productsRepo.update(id, creatorId, patch)
    if (patch.displayMode) {
      try {
        const sections = await storeSectionsRepo.getForCreator(creatorId)
        for (const sec of sections) {
          if (sec.type === 'product' && sec.props?.productId === id) {
            await storeSectionsRepo.updateSection(creatorId, sec.id, {
              props: { ...sec.props, layout: patch.displayMode }
            })
          }
        }
      } catch (err) {
        console.warn('Failed to sync store_sections layout with product displayMode:', err)
      }
    }
    return updatedProduct
  },

  async publish(creatorId, id) {
    const subStatus = await creatorSubscriptionService.getStatus(creatorId)
    if (subStatus.status !== 'ACTIVE' && subStatus.status !== 'TRIALING') {
      const pricing = getSubscriptionPricing()
      throw httpError(402, `A paid subscription (Creator ${pricing.CREATOR.priceFormatted}/mo or Pro ${pricing.PRO.priceFormatted}/mo) is required to publish products and start selling.`)
    }
    const p = await this.get(creatorId, id)
    if (p.type === 'COURSE') {
      const course = await coursesRepo.getByProduct(id)
      if (course) {
        const lessons = await lessonsRepo.listByCourse(course.id)
        if (!lessons.length) throw httpError(400, 'Add at least one lesson to your course before publishing.')
        await coursesRepo.update(course.id, creatorId, { status: 'PUBLISHED', publishedAt: new Date() })
      }
    }
    if (p.type === 'DIGITAL_DOWNLOAD' && !p.fileId && (!p.files || p.files.length === 0) && (!p.contentBlocks || p.contentBlocks.length === 0)) {
      throw httpError(400, 'Add at least one downloadable file or resource before publishing.')
    }
    if (p.type === 'COACHING') {
      const config = await coachingRepo.getConfigByProductId(id)
      if (!config || !config.availability || !config.availability.some(a => a.enabled)) {
        throw httpError(400, 'Configure at least one availability window before publishing your coaching product.')
      }
    }
    if (p.type === 'COMMUNITY') {
      const config = await communityRepo.getConfigByProductId(id)
      if (!config || !config.name || !config.slug) {
        throw httpError(400, 'Configure your community name and slug before publishing.')
      }
    }
    if (p.type === 'WEBINAR') {
      const config = await webinarRepo.getConfigByProductId(id)
      if (!config || !config.title || !config.startAtUTC || !config.meetingUrl) {
        throw httpError(400, 'Configure webinar schedule, timezone, and meeting URL before publishing.')
      }
      if (new Date(config.startAtUTC).getTime() <= Date.now()) {
        throw httpError(400, 'Webinar start time must be in the future.')
      }
    }
    if (p.type === 'MEMBERSHIP') {
      const config = await membershipRepo.getConfigByProductId(id)
      if (!config || !config.name || (!config.isFree && !(Number(config.price) > 0))) {
        throw httpError(400, 'Configure membership name and valid price before publishing.')
      }
      if (!Array.isArray(config.benefits) || config.benefits.length === 0) {
        throw httpError(400, 'Add at least 1 benefit to your membership before publishing.')
      }
    }
    if (p.type === 'CUSTOM_PRODUCT' || p.type === 'CUSTOM_SERVICE') {
      const config = await customServiceRepo.getConfigByProductId(id)
      if (!config || !config.name || (!config.isFree && !(Number(config.price) > 0))) {
        throw httpError(400, 'Configure service name and valid price before publishing.')
      }
      if (!config.deliveryDays || Number(config.deliveryDays) <= 0) {
        throw httpError(400, 'Configure delivery turnaround days before publishing.')
      }
      if (!Array.isArray(config.requirements) || config.requirements.length === 0) {
        throw httpError(400, 'Add at least 1 requirement intake field before publishing.')
      }
    }
    if (p.type === 'EXTERNAL_LINK') {
      const config = await externalLinkRepo.getConfigByProductId(id)
      if (!config || !config.name || (!config.isFree && !(Number(config.price) > 0))) {
        throw httpError(400, 'Configure product name and valid price before publishing.')
      }
      if (!config.destinationUrl || !config.destinationUrl.trim()) {
        throw httpError(400, 'Configure a valid destination URL before publishing.')
      }
      const check = externalLink.normalizeAndValidateUrl(config.destinationUrl)
      if (!check.valid) {
        throw httpError(400, check.error || 'Invalid destination URL format.')
      }
    }
    if (!(Number(p.price) >= 0)) throw httpError(400, 'Set a valid price before publishing')
    if (Number(p.price) > 0) {
      const payoutStatus = await payoutService.getStatus(creatorId)
      if (!payoutStatus.canSellPaidProducts) {
        throw httpError(400, 'Complete payout setup before selling paid products.')
      }
    }
    return productsRepo.update(id, creatorId, { status: 'PUBLISHED' })
  },
  async archive(creatorId, id) {
    await this.get(creatorId, id)
    return productsRepo.update(id, creatorId, { status: 'ARCHIVED' })
  },
  async remove(creatorId, id) {
    await this.get(creatorId, id)
    try {
      await supabaseAdmin.from('coaching_configs').delete().eq('productId', id)
    } catch { }
    try {
      await supabaseAdmin.from('webinar_configs').delete().eq('productId', id)
    } catch { }
    try {
      await supabaseAdmin.from('custom_service_configs').delete().eq('productId', id)
    } catch { }
    try {
      await supabaseAdmin.from('community_configs').delete().eq('productId', id)
    } catch { }
    try {
      await supabaseAdmin.from('membership_configs').delete().eq('productId', id)
    } catch { }
    await productsRepo.remove(id, creatorId)
    return { ok: true }
  },
  async attachFile(creatorId, id, { fileId, fileName, fileSize, fileMime }) {
    await this.get(creatorId, id)
    return productsRepo.update(id, creatorId, { fileId, fileName, fileSize, fileMime })
  },
}
function clampPrice(p) {
  const n = Number(p)
  if (!isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

// ---------------- Public ----------------
function withPublicInstagramProfile(profile, igAccount) {
  const base = profile ? { ...profile } : {}
  const socialLinks = { ...(base.socialLinks || {}) }
  const handle = igAccount?.status === 'CONNECTED' && igAccount?.username
    ? String(igAccount.username).replace(/^@/, '')
    : ''
  if (handle) {
    if (!socialLinks.instagram) socialLinks.instagram = `https://instagram.com/${handle}`
    base.instagramUsername = handle
  }
  base.socialLinks = socialLinks
  return base
}

function toPublicStorePayload(store, profile, products, activeSections, allPages) {
  const storeSlug = store.slug || store.username
  const storeName = store.storeName || profile?.name || storeSlug
  const publicProfile = profile
    ? {
      name: profile.name,
      bio: profile.bio,
      category: profile.category,
      avatarUrl: store.avatarUrl || profile.avatarUrl,
      socialLinks: profile.socialLinks || {},
      instagramUsername: profile.instagramUsername || null,
    }
    : {}
  const collectionProductIds = new Set()
  for (const s of (activeSections || [])) {
    if (s.type === 'collection' || s.type === 'product_collection') {
      const items = s.props?.items
      if (Array.isArray(items)) {
        for (const it of items) {
          if (!it) continue
          if (it.productId) collectionProductIds.add(String(it.productId))
          if (it.courseId) collectionProductIds.add(String(it.courseId))
          if (it.type === 'product' && it.id) collectionProductIds.add(String(it.id))
        }
      }
    }
  }

  const visibleSections = activeSections.filter(s => {
    if (s.visible === false || s.hidden) return false
    if (s.type === 'product' || s.type === 'course') {
      const pid = s.props?.productId || s.props?.courseId || s.props?.id || (!s.props?.productId && products?.[0]?.id ? products[0].id : null)
      if (pid && collectionProductIds.has(String(pid))) return false
    }
    return true
  })
  const pages = Array.isArray(allPages) ? allPages : []
  return {
    store: {
      id: store.id,
      storeName: storeName,
      username: storeSlug,
      slug: storeSlug,
      published: Boolean(store.published),
      theme: store.theme,
      sections: visibleSections,
      seo: store.seo,
      pages,
    },
    username: storeSlug,
    slug: storeSlug,
    storeName: storeName,
    theme: store.theme,
    sections: visibleSections,
    pages,
    profile: publicProfile,
    products: products.map(publicProduct),
    creatorId: store.creatorId,
  }
}

export const publicService = {
  async resolveStorefront(username, options = {}) {
    const slug = normalizeSlug(username)
    if (!slug) return { status: 'not_found', slug: '' }

    let store
    try {
      store = await storesRepo.getBySlug(slug)
    } catch (error) {
      console.error('Public storefront lookup failed:', error)
      return { status: 'error', slug }
    }

    if (!store) return { status: 'not_found', slug }

    const publicSlug = store.slug || store.username || slug

    // Server-side entitlement check: automatically OFF if trial expired with no active paid plan
    const sub = await creatorSubscriptionService.getStatus(store.creatorId).catch(() => null)
    const isPaid = sub && sub.status === 'ACTIVE' && !sub.isTrial
    const isTrialActive = Boolean(sub && sub.isTrial && !sub.isTrialExpired && (sub.status === 'TRIALING' || sub.trialStatus === 'ACTIVE'))
    const isEntitled = (isPaid || isTrialActive) && Boolean(sub?.entitlements?.storefront ?? sub?.entitlements?.canPublish)

    if (!isEntitled) {
      if (store.published) {
        await storesRepo.setPublished(store.creatorId, false).catch(() => null)
        store.published = false
      }
      return { status: 'unpublished', slug: publicSlug, reason: 'trial_expired' }
    }

    if (!store.published && !options.allowDraft) {
      return { status: 'unpublished', slug: publicSlug }
    }

    try {
      const canRemoveBranding = Boolean((isPaid || isTrialActive) && sub?.rawStatus !== 'PENDING' && (sub?.status === 'ACTIVE' || isTrialActive) && hasEntitlement(sub?.planId, 'removeBranding', isTrialActive ? 'TRIALING' : sub?.status))
      const effectiveTheme = {
        ...(store.theme || {}),
        showFooterBranding: canRemoveBranding ? (store.theme?.showFooterBranding ?? true) : true,
      }
      const effectiveStore = {
        ...store,
        theme: effectiveTheme,
      }

      const [profile, products, allSections, igAccount] = await Promise.all([
        profilesRepo.getByCreator(store.creatorId).catch(() => null),
        productsRepo.listPublished(store.creatorId).catch(() => []),
        storeSectionsRepo.getForCreator(store.creatorId).catch(() => []),
        instagramRepo.getByCreatorId(store.creatorId).catch(() => null),
      ])
      const storedSections = (allSections && allSections.length) ? allSections : (store.sections || [])

      // Get pages array from store
      const storePages = Array.isArray(store.pages) ? store.pages : []
      // Always ensure Home page exists
      const pages = (storePages.length === 0 || !storePages.some(p => p.isDefault))
        ? [{ id: 'home', name: 'Home', slug: 'home', isDefault: true, position: 0 }, ...storePages.filter(p => !p.isDefault)]
        : [...storePages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      // Filter sections to the requested page
      // pageSlug=null or 'home' → show home page sections (pageId === null)
      const requestedPageSlug = options.pageSlug || null
      let activeSections
      if (!requestedPageSlug || requestedPageSlug === 'home') {
        // Home page: sections where pageId is null/undefined
        activeSections = storedSections.filter(s => !s.pageId)
      } else {
        // Find the page by slug
        const targetPage = pages.find(p => p.slug === requestedPageSlug)
        if (targetPage) {
          activeSections = storedSections.filter(s => s.pageId === targetPage.id)
        } else {
          // Page slug not found — fall back to home
          activeSections = storedSections.filter(s => !s.pageId)
        }
      }

      // If only one page (home), show all sections regardless of pageId
      if (pages.length <= 1) {
        activeSections = storedSections
      }

      let igProfile = null
      let igMedia = null
      if (igAccount && (igAccount.status === 'CONNECTED' || igAccount.status === 'SUBSCRIPTION_FAILED')) {
        try {
          const [prof, med] = await Promise.all([
            instagramService.getProfile(store.creatorId).catch(() => null),
            instagramService.getMedia(store.creatorId, { limit: 12 }).catch(() => null),
          ])
          igProfile = prof
          igMedia = med
        } catch { }
      }

      const enrichedSections = storedSections.map((s) => {
        if (s.type === 'social' || s.type === 'instagram' || s.props?.platform === 'instagram') {
          const props = { ...(s.props || {}) }
          if (igAccount && igAccount.status !== 'DISCONNECTED') {
            props.instagramData = {
              connected: true,
              username: igAccount.username,
              profile: igProfile || {
                username: igAccount.username,
                name: igAccount.username,
                profileUrl: `https://instagram.com/${igAccount.username}`,
                profilePictureUrl: null,
                mediaCount: null,
                followersCount: null,
                followerCount: null,
                followingCount: null,
                followsCount: null,
                followersCountUnavailable: true,
                followingCountUnavailable: true,
              },
              media: igMedia?.media || [],
              lastSyncedAt: igProfile?.lastSyncedAt || new Date().toISOString(),
            }
          }
          return { ...s, props }
        }
        return s
      })

      const publicProfile = withPublicInstagramProfile(profile, igAccount)
      const result = { status: 'ok', slug: publicSlug, data: toPublicStorePayload(effectiveStore, publicProfile, products, enrichedSections, pages) }
      return result
    } catch (error) {
      console.error('Public storefront lookup failed:', error)
      return { status: 'error', slug: publicSlug }
    }
  },

  async getStore(username, options = {}) {
    const result = await this.resolveStorefront(username, options)
    if (result.status !== 'ok') return null
    return result.data
  },

  async getProduct(username, slug) {
    const store = await storesRepo.getByUsername(username)
    if (!store || !store.published) return null
    const product = await productsRepo.getPublishedBySlug(store.creatorId, slug)
    if (!product) return null
    const profile = await profilesRepo.getByCreator(store.creatorId)
    return { product: publicProduct(product), creator: profile ? { name: profile.name, avatarUrl: profile.avatarUrl, username: store.username || store.slug } : { username: store.username || store.slug } }
  },
  async getCheckoutProduct(productId) {
    const product = await productsRepo.getById(productId)
    if (!product || product.status !== 'PUBLISHED') return null
    const profile = await profilesRepo.getByCreator(product.creatorId)
    const store = await storesRepo.getByCreator(product.creatorId)
    return { product: publicProduct(product), creator: { name: profile?.name || '', avatarUrl: profile?.avatarUrl || '', username: store?.username || store?.slug } }
  },

  async getPublicStats() {
    if (global.__publicStatsCache && (Date.now() - global.__publicStatsCache.timestamp < 300000)) {
      return global.__publicStatsCache.data
    }

    try {
      let creatorsCount = 0
      let productsCount = 0
      let ordersCount = 0

      if (typeof supabaseAdmin !== 'undefined' && supabaseAdmin) {
        try {
          const { count: cCount } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
          if (typeof cCount === 'number') creatorsCount = cCount
        } catch { }

        try {
          const { count: pCount } = await supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('published', true)
          if (typeof pCount === 'number') productsCount = pCount
        } catch { }

        try {
          const { count: oCount } = await supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).in('status', ['PAID', 'COMPLETED', 'DELIVERED'])
          if (typeof oCount === 'number') ordersCount = oCount
        } catch { }
      }

      const data = {
        creatorsCount: creatorsCount || 0,
        productsCount: productsCount || 0,
        ordersCount: ordersCount || 0,
        hasSufficientData: (creatorsCount >= 5 && (productsCount >= 5 || ordersCount >= 5)),
        updatedAt: new Date().toISOString(),
      }

      global.__publicStatsCache = {
        timestamp: Date.now(),
        data,
      }
      return data
    } catch (err) {
      console.error('getPublicStats error:', err)
      return {
        creatorsCount: 0,
        productsCount: 0,
        ordersCount: 0,
        hasSufficientData: false,
        updatedAt: new Date().toISOString(),
      }
    }
  },
}
function publicProduct(p) {
  const isLimited = !!p.isLimitedQuantity
  const limit = p.quantityLimit !== undefined && p.quantityLimit !== null ? Number(p.quantityLimit) : null
  const sold = Number(p.quantitySold || 0)
  const soldOut = isLimited && limit !== null && sold >= limit
  const remaining = isLimited && limit !== null ? Math.max(0, limit - sold) : null

  return {
    id: p.id, creatorId: p.creatorId, type: p.type, title: p.title, slug: p.slug, description: p.description, shortDescription: p.shortDescription, thumbnail: p.thumbnail, coverImage: p.coverImage || p.cover_image || null, price: Number(p.price), currency: p.currency, benefits: p.benefits || [], hasFile: !!p.fileId,
    checkoutFields: (p.checkoutFields || []).filter(f => f.active !== false),
    isLimitedQuantity: isLimited,
    quantityLimit: limit,
    quantitySold: sold,
    quantityRemaining: remaining,
    soldOut: soldOut || !!p.soldOut,
  }
}

// ---------------- Custom Checkout Fields Service ----------------
export const checkoutFieldsService = {
  async getForCreator(creatorId, productId) {
    const p = await productsRepo.getForCreator(productId, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    const fields = await checkoutFieldsRepo.getForCreator(productId, creatorId)
    return fields || []
  },
  async addField(creatorId, productId, data) {
    const p = await productsRepo.getForCreator(productId, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    if (!data.label || !data.label.trim()) throw httpError(400, 'Field label is required')
    const validTypes = ['SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'DROPDOWN', 'MULTIPLE_CHOICE', 'CHECKBOX', 'DATE', 'FILE_UPLOAD']
    const type = (data.type || 'SHORT_TEXT').toUpperCase()
    if (!validTypes.includes(type)) throw httpError(400, 'Invalid field type')

    const field = {
      id: uuidv4(),
      label: sanitizeText(data.label).slice(0, 150),
      description: sanitizeText(data.description || ''),
      type,
      required: !!data.required,
      placeholder: sanitizeText(data.placeholder || ''),
      options: Array.isArray(data.options) ? data.options.map(o => sanitizeText(o)).filter(Boolean) : [],
      order: parseInt(data.order || 1, 10),
      active: data.active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return checkoutFieldsRepo.addField(creatorId, productId, field)
  },
  async updateField(creatorId, productId, fieldId, data) {
    const p = await productsRepo.getForCreator(productId, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    const patch = {}
    if (data.label !== undefined) patch.label = sanitizeText(data.label).slice(0, 150)
    if (data.description !== undefined) patch.description = sanitizeText(data.description)
    if (data.placeholder !== undefined) patch.placeholder = sanitizeText(data.placeholder)
    if (data.required !== undefined) patch.required = !!data.required
    if (data.active !== undefined) patch.active = !!data.active
    if (data.order !== undefined) patch.order = parseInt(data.order, 10)
    if (data.options && Array.isArray(data.options)) patch.options = data.options.map(o => sanitizeText(o)).filter(Boolean)
    if (data.type) {
      const validTypes = ['SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'DROPDOWN', 'MULTIPLE_CHOICE', 'CHECKBOX', 'DATE', 'FILE_UPLOAD']
      const type = data.type.toUpperCase()
      if (validTypes.includes(type)) patch.type = type
    }
    const updated = await checkoutFieldsRepo.updateField(creatorId, productId, fieldId, patch)
    if (!updated) throw httpError(404, 'Checkout field not found')
    return updated
  },
  async deleteField(creatorId, productId, fieldId) {
    const p = await productsRepo.getForCreator(productId, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    const ok = await checkoutFieldsRepo.deleteField(creatorId, productId, fieldId)
    if (!ok) throw httpError(404, 'Checkout field not found')
    return { ok: true }
  },
  async reorderFields(creatorId, productId, orderedFieldIds) {
    const p = await productsRepo.getForCreator(productId, creatorId)
    if (!p) throw httpError(404, 'Product not found')
    if (!Array.isArray(orderedFieldIds)) throw httpError(400, 'orderedFieldIds must be an array')
    return checkoutFieldsRepo.reorderFields(creatorId, productId, orderedFieldIds)
  },
  validateResponses(productFields, customResponses) {
    const activeFields = (productFields || []).filter(f => f.active !== false)
    if (activeFields.length === 0) return []
    const responsesMap = new Map()
    if (Array.isArray(customResponses)) {
      customResponses.forEach(r => {
        if (r.fieldId) responsesMap.set(r.fieldId, r.value)
        else if (r.label) responsesMap.set(r.label, r.value)
      })
    } else if (customResponses && typeof customResponses === 'object') {
      Object.entries(customResponses).forEach(([k, v]) => responsesMap.set(k, v))
    }

    const sanitizedResponses = []
    for (const field of activeFields) {
      const val = responsesMap.get(field.id) ?? responsesMap.get(field.label)
      const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
      if (field.required && isEmpty) {
        throw httpError(400, `Checkout field "${field.label}" is required.`)
      }
      if (!isEmpty) {
        if (field.type === 'FILE_UPLOAD' && typeof val === 'object' && val.fileSize) {
          if (val.fileSize > 10 * 1024 * 1024) {
            throw httpError(400, `Uploaded file for "${field.label}" exceeds maximum limit of 10MB.`)
          }
        }
        sanitizedResponses.push({
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value: typeof val === 'string' ? sanitizeText(val) : val
        })
      }
    }
    return sanitizedResponses
  }
}

// ---------------- Checkout ----------------
export const checkoutService = {
  createOrder(args) {
    return this.createSession(args)
  },
  async createSession({ productId, creatorId, username, email, name, customerName, bookingId, bookingDetails, customResponses, ref, couponCode, currency, billingCountry, country }) {
    let product = await productsRepo.getById(productId)

    // Fallback: If not found by direct ID, check if productId is a StoreSection or collection item or course or slug
    if (!product && productId) {
      try {
        const section = await prisma.storeSection.findUnique({ where: { id: productId } })
        if (section) {
          const resolvedId = section.props?.productId || (Array.isArray(section.props?.items) && section.props.items.find(i => i && i.productId)?.productId)
          if (resolvedId) {
            product = await productsRepo.getById(resolvedId)
          }
        }
      } catch (e) {}
    }

    if (!product && productId) {
      try {
        const sectionsWithItems = await prisma.storeSection.findMany({
          where: {
            OR: [
              { type: 'collection' },
              { type: 'product_collection' },
            ]
          }
        })
        for (const s of sectionsWithItems) {
          if (Array.isArray(s.props?.items)) {
            const match = s.props.items.find(it => it && (it.id === productId || it.itemId === productId))
            if (match && match.productId) {
              product = await productsRepo.getById(match.productId)
              if (product) break
            }
          }
        }
      } catch (e) {}
    }

    if (!product && productId) {
      try {
        const course = await prisma.course.findUnique({ where: { id: productId } })
        if (course?.productId) {
          product = await productsRepo.getById(course.productId)
        }
      } catch (e) {}
    }

    if (!product && productId) {
      try {
        const p = await prisma.product.findFirst({ where: { slug: productId } })
        if (p) product = await productsRepo.getById(p.id)
      } catch (e) {}
    }

    if (!product) throw httpError(404, 'Product not found or unavailable')

    // Publication check: only published products can be purchased
    if (product.status !== 'PUBLISHED' || product.storePublished === false) {
      throw httpError(400, 'Product is not available for purchase')
    }

    // Ownership check against creator storefront
    if (creatorId && product.creatorId !== creatorId) {
      throw httpError(403, 'Product does not belong to the requested creator store')
    }
    if (username) {
      const creatorStore = await storesRepo.getByUsername(username).catch(() => null)
      if (creatorStore && creatorStore.creatorId !== product.creatorId) {
        throw httpError(403, 'Product does not belong to the requested creator store')
      }
    }

    let attributedAutomationId = null
    if (ref) {
      const attr = attributionService.verifyAttributionToken(ref)
      if (attr && attr.productId === productId) {
        const auto = await automationsRepo.getForCreator(attr.automationId, product.creatorId)
        if (auto && auto.productId === productId) {
          attributedAutomationId = auto.id
        }
      }
    }

    if (product.isLimitedQuantity && product.quantityLimit !== undefined && product.quantityLimit !== null) {
      const isSoldOut = (product.quantitySold || 0) >= product.quantityLimit
      if (isSoldOut || product.soldOut) {
        throw httpError(409, 'This product is SOLD OUT. No additional purchases are allowed.')
      }
      const reservation = await productsRepo.atomicallyReserveQuantity(productId)
      if (!reservation.success) {
        throw httpError(409, 'This product is SOLD OUT. No additional purchases are allowed.')
      }
    }

    const productFields = await checkoutFieldsRepo.getForProduct(product.id)
    const sanitizedCustomResponses = checkoutFieldsService.validateResponses(productFields, customResponses)

    const cleanEmail = email ? String(email).toLowerCase().trim() : null
    const cleanName = (customerName || name || (bookingDetails && bookingDetails.customerName) || '').toString().trim()

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw httpError(400, 'Valid customer email is required')
    }
    if (!cleanName) {
      throw httpError(400, 'Customer name is required')
    }

    const rawCountry = country || billingCountry || null
    if (!rawCountry || typeof rawCountry !== 'string' || !rawCountry.trim()) {
      throw httpError(400, 'A valid country is required to complete your purchase.')
    }
    const cleanRawCountry = rawCountry.trim().toUpperCase()
    let validatedCountry = normalizeCountryCode(rawCountry)
    if (!validatedCountry && (cleanRawCountry === 'OTHER' || cleanRawCountry === 'OTHER_COUNTRY' || cleanRawCountry === 'OTHER COUNTRY' || cleanRawCountry === 'ROW' || cleanRawCountry === 'OUTSIDE_INDIA' || cleanRawCountry === 'OUTSIDE INDIA' || cleanRawCountry === 'OUTSIDE-INDIA')) {
      validatedCountry = 'US'
    }
    if (!validatedCountry || !isValidCountryCode(validatedCountry)) {
      throw httpError(400, `Unsupported or invalid country code: "${rawCountry}". Please select a valid country.`)
    }
    const provider = getProductPaymentProviderForCountry(validatedCountry)

    // Handle coaching booking association or creation
    let targetBookingId = bookingId
    if (product.type === 'COACHING' && !targetBookingId && bookingDetails) {
      const hold = await coachingService.createBookingHold({
        productId: product.id,
        startTime: bookingDetails.startTime,
        endTime: bookingDetails.endTime,
        customerEmail: cleanEmail,
        customerName: cleanName || bookingDetails.customerName,
        answers: bookingDetails.answers,
        bookingTypeId: bookingDetails.bookingTypeId,
      })
      targetBookingId = hold.id
    }

    let rawPrice = Number(product.price || 0)
    let holdCurrency = null
    if (targetBookingId) {
      const existingHold = await coachingRepo.getBookingById(targetBookingId)
      if (existingHold && existingHold.price !== undefined && existingHold.price !== null) {
        rawPrice = Number(existingHold.price)
      }
      if (existingHold && existingHold.currency) {
        holdCurrency = existingHold.currency
      }
    }
    let payablePrice = rawPrice
    let appliedCoupon = null
    let discountAmount = 0

    if (couponCode && rawPrice > 0) {
      const couponValidation = await couponService.validate(product.creatorId, couponCode, product.id, rawPrice)
      if (couponValidation && couponValidation.valid) {
        appliedCoupon = couponValidation.coupon
        discountAmount = couponValidation.discountAmount
        payablePrice = couponValidation.finalAmount
      }
    }

    const isPaid = payablePrice > 0

    // Duplicate payment protection: check if customer already owns an active entitlement for this product
    // Note: COACHING sessions are appointment-based and can be booked multiple times by returning clients
    if (cleanEmail && product.type !== 'COACHING') {
      const alreadyEntitled = await entitlementsRepo.has(null, product.id, cleanEmail)
      if (alreadyEntitled) {
        return {
          alreadyPurchased: true,
          success: true,
          productId: product.id,
          productTitle: product.title,
          message: 'An existing purchase was found with this email address.',
        }
      }
    }

    // Canonical creator currency and price (never overwritten)
    const originalCurrency = (holdCurrency || product.currency || 'USD').toUpperCase().trim()
    const originalPrice = payablePrice

    // Determine target presentment currency and amount based on country-routed provider
    let targetCurrency = originalCurrency
    let presentmentAmount = originalPrice
    let exchangeRate = 1
    let exchangeRateTimestamp = new Date()

    if (isPaid) {
      if (!isSupportedCurrency(originalCurrency)) {
        throw httpError(400, `The currency "${originalCurrency}" is not supported for payments.`)
      }
      if (provider === PRODUCT_PAYMENT_PROVIDERS.RAZORPAY) {
        // Indian buyers route to Razorpay in INR
        if (originalCurrency === 'INR') {
          targetCurrency = 'INR'
          presentmentAmount = originalPrice
        } else {
          const conversion = await convertCurrency({
            amount: originalPrice,
            fromCurrency: originalCurrency,
            toCurrency: 'INR',
          })
          presentmentAmount = conversion.convertedAmount
          targetCurrency = 'INR'
          exchangeRate = conversion.rate
          exchangeRateTimestamp = conversion.rateTimestamp
        }
      } else {
        // Non-Indian buyers route to Dodo Payments
        if (currency && typeof currency === 'string') {
          const cleanCurrency = currency.toUpperCase().trim()
          if (isSupportedCurrency(cleanCurrency)) {
            targetCurrency = cleanCurrency
          }
        }
        if (targetCurrency !== originalCurrency) {
          const conversion = await convertCurrency({
            amount: originalPrice,
            fromCurrency: originalCurrency,
            toCurrency: targetCurrency,
          })
          presentmentAmount = conversion.convertedAmount
          exchangeRate = conversion.rate
          exchangeRateTimestamp = conversion.rateTimestamp
        }
      }

      // Validate minimum amounts for the payment currency
      const minCheck = validateMinimumAmount(presentmentAmount, targetCurrency)
      if (!minCheck.valid) {
        throw httpError(400, minCheck.message)
      }
    }

    // Duplicate session & order protection: if customer already has a recent pending order for this product
    if (cleanEmail && isPaid) {
      const recentPendingOrder = await ordersRepo.getLatestPendingByProductAndEmail(product.id, cleanEmail)
      if (recentPendingOrder) {
        const orderAgeMs = Date.now() - new Date(recentPendingOrder.createdAt).getTime()
        const ttlMs = getPendingPaymentTTLMs()
        const sameAmount = Number(recentPendingOrder.amount) === Number(presentmentAmount)
        const sameCurrency = String(recentPendingOrder.currency || '').toUpperCase() === String(targetCurrency).toUpperCase()
        const sameProvider = String(recentPendingOrder.paymentProvider || '').toLowerCase() === String(provider).toLowerCase()

        if (orderAgeMs < ttlMs && sameAmount && sameCurrency && sameProvider) {
          if (provider === PRODUCT_PAYMENT_PROVIDERS.DODO && recentPendingOrder.dodoSessionId) {
            try {
              const existingSession = await dodoProvider.getCheckoutSession(recentPendingOrder.dodoSessionId)
              const payStatus = String(existingSession?.payment_status || '').toLowerCase()
              if (existingSession && existingSession.checkout_url && payStatus !== 'paid' && payStatus !== 'succeeded') {
                console.log(`[Checkout] Reusing active Dodo checkout session for order ${recentPendingOrder.id}`)
                return {
                  orderId: recentPendingOrder.id,
                  sessionId: recentPendingOrder.dodoSessionId,
                  checkoutUrl: existingSession.checkout_url,
                  provider: 'dodo',
                  country: validatedCountry,
                  order: recentPendingOrder,
                  amount: presentmentAmount,
                  currency: targetCurrency,
                  originalPrice,
                  originalCurrency,
                  presentmentAmount,
                  presentmentCurrency: targetCurrency,
                  exchangeRate,
                  productTitle: product.title,
                  productDescription: product.shortDescription || '',
                  bookingId: targetBookingId || null,
                }
              }
            } catch (e) {
              console.warn('[Checkout] Failed to retrieve existing Dodo session, creating new session:', e.message)
            }
          } else if (provider === PRODUCT_PAYMENT_PROVIDERS.RAZORPAY && recentPendingOrder.razorpayOrderId) {
            console.log(`[Checkout] Reusing active Razorpay order ${recentPendingOrder.razorpayOrderId} for order ${recentPendingOrder.id}`)
            const rzpProvider = getPaymentProvider()
            return {
              orderId: recentPendingOrder.id,
              provider: 'razorpay',
              razorpayOrderId: recentPendingOrder.razorpayOrderId,
              keyId: rzpProvider.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
              amount: Math.round(Number(presentmentAmount) * 100),
              currency: targetCurrency,
              country: validatedCountry,
              order: recentPendingOrder,
              originalPrice,
              originalCurrency,
              presentmentAmount,
              presentmentCurrency: targetCurrency,
              exchangeRate,
              productTitle: product.title,
              productDescription: product.shortDescription || '',
              bookingId: targetBookingId || null,
            }
          }
        }
      }
    }

    // Free Product or 100% Coupon Discount Flow (No payment gateway needed)
    if (!isPaid) {
      if (!cleanEmail) throw httpError(400, 'Customer email is required to access product')

      const customer = await customersRepo.upsert(product.creatorId, cleanEmail, cleanName, validatedCountry).catch(() => null)

      const orderId = uuidv4()
      const order = {
        id: orderId,
        creatorId: product.creatorId,
        productId: product.id,
        automationId: attributedAutomationId,
        customerId: customer?.id || null,
        customerName: cleanName || null,
        customerEmail: cleanEmail,
        country: validatedCountry,
        amount: 0,
        currency: originalCurrency,
        originalPrice: 0,
        originalCurrency,
        presentmentAmount: 0,
        presentmentCurrency: originalCurrency,
        exchangeRate: 1,
        exchangeRateTimestamp: new Date(),
        status: 'PAID',
        paymentMode: 'FREE',
        paymentProvider: 'free',
        customResponses: sanitizedCustomResponses,
        razorpayOrderId: `free_${orderId.substring(0, 12)}`,
        razorpayPaymentId: `free_pay_${orderId.substring(0, 12)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await ordersRepo.create(order)

      if (attributedAutomationId) {
        await automationEventsRepo.recordEvent({
          creatorId: product.creatorId,
          automationId: attributedAutomationId,
          productId: product.id,
          eventType: 'PURCHASE_COMPLETED',
          metadata: { orderId: order.id, amount: 0, isFree: true }
        })
      }

      await entitlementsRepo.create({
        id: uuidv4(),
        orderId: order.id,
        customerId: customer?.id || null,
        customerEmail: cleanEmail,
        productId: product.id,
        status: 'ACTIVE',
        startsAt: new Date(),
      }).catch((e) => console.warn('Free product entitlement creation note:', e.message))

      if (targetBookingId) {
        await coachingRepo.updateBooking(targetBookingId, { orderId: order.id, customerEmail: cleanEmail })
      }

      await analyticsService.track({ creatorId: product.creatorId, productId: product.id, type: 'order_completed' })

      // Generate secure guest access token & send purchase confirmation email for free checkout
      try {
        const guestAccess = await guestAccessService.createAccessToken({
          orderId: order.id,
          entitlementId: null,
          productId: product.id,
          customerEmail: cleanEmail,
        })
        const profile = await profilesRepo.getByCreator(product.creatorId).catch(() => null)
        const creatorName = profile?.name || profile?.displayName || 'Creator'
        if (guestAccess?.accessUrl) {
          await emailService.sendPurchaseConfirmation({
            to: cleanEmail,
            customerName: cleanName || cleanEmail.split('@')[0],
            creatorName,
            productTitle: product.title,
            amount: 0,
            currency: originalCurrency,
            orderId: order.id,
            accessUrl: guestAccess.accessUrl,
          })
        }
      } catch (emErr) {
        console.error('[FreeOrder] Email confirmation note:', emErr.message)
      }

      return {
        isFree: true,
        success: true,
        orderId: order.id,
        productTitle: product.title,
        productDescription: product.shortDescription || '',
        bookingId: targetBookingId || null,
        order,
      }
    }

    // ===== RAZORPAY CHECKOUT FOR INDIAN CUSTOMERS (One-time Digital Product Order) =====
    if (provider === PRODUCT_PAYMENT_PROVIDERS.RAZORPAY) {
      const orderId = uuidv4()
      const customer = await customersRepo.upsert(product.creatorId, cleanEmail, cleanName, validatedCountry).catch(() => null)
      const rzpProvider = getPaymentProvider()

      // Resolve creator's connected account for transfer if configured
      const payout = await payoutProfilesRepo.getByCreator(product.creatorId).catch(() => null)
      const isPayPalPayout = payout?.payoutMethod === 'PAYPAL' || Boolean(payout?.paypalEmail)
      const connectedAccountId = (!isPayPalPayout && String(payout?.razorpayAccountId || '').startsWith('acc_'))
        ? payout.razorpayAccountId
        : null

      const rzpOrder = await rzpProvider.createCheckoutOrder({
        order: { id: orderId },
        product: {
          id: product.id,
          creatorId: product.creatorId,
          price: presentmentAmount,
          currency: targetCurrency,
        },
        creatorName: product.creator?.displayName || product.creator?.name || 'Creator',
        customerEmail: cleanEmail,
        connectedAccountId,
      })

      if (appliedCoupon && appliedCoupon.id) {
        await couponsRepo.incrementUsedCount(appliedCoupon.id).catch(() => { })
      }

      const order = {
        id: orderId,
        creatorId: product.creatorId,
        productId: product.id,
        automationId: attributedAutomationId,
        customerId: customer?.id || null,
        customerName: cleanName || null,
        customerEmail: cleanEmail,
        country: validatedCountry,
        amount: presentmentAmount,
        currency: targetCurrency,
        originalPrice,
        originalCurrency,
        presentmentAmount,
        presentmentCurrency: targetCurrency,
        exchangeRate,
        exchangeRateTimestamp,
        status: 'PENDING',
        paymentProvider: 'razorpay',
        razorpayOrderId: rzpOrder.id,
        razorpayPaymentId: null,
        dodoSessionId: null,
        dodoPaymentId: null,
        customResponses: sanitizedCustomResponses,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await ordersRepo.create(order)

      if (attributedAutomationId) {
        await automationEventsRepo.recordEvent({
          creatorId: product.creatorId,
          automationId: attributedAutomationId,
          productId: product.id,
          eventType: 'CHECKOUT_STARTED',
          metadata: {
            orderId: order.id,
            amount: presentmentAmount,
            currency: targetCurrency,
            originalPrice,
            originalCurrency,
            provider: 'razorpay',
            country: validatedCountry,
          }
        })
      }

      if (targetBookingId) {
        await coachingRepo.updateBooking(targetBookingId, { orderId: order.id, customerEmail: cleanEmail })
      }

      await paymentsRepo.create({
        id: uuidv4(),
        orderId: order.id,
        creatorId: product.creatorId,
        productId: product.id,
        amount: presentmentAmount,
        currency: targetCurrency,
        paymentMode: rzpProvider.isLive ? 'LIVE' : 'TEST',
        razorpayOrderId: rzpOrder.id,
        status: 'CREATED',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await analyticsService.track({ creatorId: product.creatorId, productId: product.id, type: 'checkout_started' })

      return {
        orderId: order.id,
        provider: 'razorpay',
        razorpayOrderId: rzpOrder.id,
        keyId: rzpOrder.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
        amount: Math.round(Number(presentmentAmount) * 100),
        currency: targetCurrency,
        country: validatedCountry,
        originalPrice,
        originalCurrency,
        presentmentAmount,
        presentmentCurrency: targetCurrency,
        exchangeRate,
        productTitle: product.title,
        productDescription: product.shortDescription || '',
        bookingId: targetBookingId || null,
        order,
      }
    }

    // ===== DODO PAYMENTS CHECKOUT FOR NON-INDIAN CUSTOMERS =====
    const orderId = uuidv4()
    const customer = cleanEmail ? await customersRepo.upsert(product.creatorId, cleanEmail, cleanName, validatedCountry).catch(() => null) : null

    const dodoSession = await dodoProvider.createProductCheckoutSession({
      orderId,
      productId: product.id,
      productTitle: product.title,
      amount: originalPrice,
      currency: originalCurrency,
      billingCurrency: targetCurrency,
      customerEmail: cleanEmail,
      customerName: cleanName,
      metadata: {
        creatorId: product.creatorId,
        productId: product.id,
        orderId,
        productSlug: product.slug,
        customerCountry: validatedCountry,
        originalPrice: String(originalPrice),
        originalCurrency,
        presentmentAmount: String(presentmentAmount),
        presentmentCurrency: targetCurrency,
        exchangeRate: String(exchangeRate),
        exchangeRateTimestamp: exchangeRateTimestamp ? exchangeRateTimestamp.toISOString() : undefined,
      },
    })

    if (appliedCoupon && appliedCoupon.id) {
      await couponsRepo.incrementUsedCount(appliedCoupon.id).catch(() => { })
    }

    const order = {
      id: orderId,
      creatorId: product.creatorId,
      productId: product.id,
      automationId: attributedAutomationId,
      customerId: customer?.id || null,
      customerName: cleanName || null,
      amount: presentmentAmount,
      currency: targetCurrency,
      country: validatedCountry,
      originalPrice,
      originalCurrency,
      presentmentAmount,
      presentmentCurrency: targetCurrency,
      exchangeRate,
      exchangeRateTimestamp,
      status: 'PENDING',
      paymentProvider: 'dodo',
      dodoSessionId: dodoSession.sessionId,
      dodoPaymentId: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      customerEmail: cleanEmail,
      customResponses: sanitizedCustomResponses,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await ordersRepo.create(order)

    if (attributedAutomationId) {
      await automationEventsRepo.recordEvent({
        creatorId: product.creatorId,
        automationId: attributedAutomationId,
        productId: product.id,
        eventType: 'CHECKOUT_STARTED',
        metadata: {
          orderId: order.id,
          amount: presentmentAmount,
          currency: targetCurrency,
          originalPrice,
          originalCurrency,
          provider: 'dodo',
          country: validatedCountry,
        }
      })
    }

    if (targetBookingId) {
      await coachingRepo.updateBooking(targetBookingId, { orderId: order.id, customerEmail: email ? String(email).toLowerCase() : '' })
    }

    await paymentsRepo.create({
      id: uuidv4(),
      orderId: order.id,
      creatorId: product.creatorId,
      productId: product.id,
      amount: presentmentAmount,
      currency: targetCurrency,
      paymentMode: dodoSession.isMock ? 'TEST' : 'LIVE',
      status: 'CREATED',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    await analyticsService.track({ creatorId: product.creatorId, productId: product.id, type: 'checkout_started' })
    return {
      orderId: order.id,
      sessionId: dodoSession.sessionId,
      checkoutUrl: dodoSession.checkoutUrl,
      provider: 'dodo',
      country: validatedCountry,
      amount: presentmentAmount,
      currency: targetCurrency,
      originalPrice,
      originalCurrency,
      presentmentAmount,
      presentmentCurrency: targetCurrency,
      exchangeRate,
      productTitle: product.title,
      productDescription: product.shortDescription || '',
      bookingId: targetBookingId || null,
      order,
    }
  },

  async verifyPayment({ orderId, sessionId, paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = {}) {
    const targetOrderId = orderId || razorpayOrderId
    let order = targetOrderId ? await ordersRepo.getById(targetOrderId) : null
    if (!order && sessionId) {
      order = await ordersRepo.getByDodoSessionId(sessionId)
    }
    if (!order && targetOrderId) {
      order = await ordersRepo.getByRazorpayOrderId(targetOrderId)
    }
    if (!order) throw httpError(404, 'Order not found')

    if (order.status === 'PAID') {
      return { success: true, orderId: order.id, order }
    }

    // Branch 1: Razorpay Payment Verification (India)
    if (order.paymentProvider === 'razorpay' || razorpaySignature || (order.razorpayOrderId && (razorpayPaymentId || paymentId))) {
      const rzpOrderId = razorpayOrderId || order.razorpayOrderId
      const rzpPaymentId = razorpayPaymentId || paymentId || order.razorpayPaymentId
      if (!rzpOrderId || !rzpPaymentId || !razorpaySignature) {
        throw httpError(400, 'Razorpay verification requires razorpayOrderId, razorpayPaymentId, and razorpaySignature')
      }
      const provider = getPaymentProvider()
      const isValid = provider.verifyPaymentSignature({
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature,
      })
      if (!isValid) {
        throw httpError(400, 'Invalid Razorpay payment signature')
      }
      const verifiedPaymentId = rzpPaymentId
      const chargedAmount = order.presentmentAmount !== null && order.presentmentAmount !== undefined ? Number(order.presentmentAmount) : Number(order.amount)
      const chargedCurrency = order.presentmentCurrency || order.currency || 'INR'

      await webhookService.finalizeOrder(order.id, verifiedPaymentId, order.customerEmail, {
        paymentProvider: 'razorpay',
        razorpayPaymentId: verifiedPaymentId,
        chargedAmount,
        chargedCurrency,
      })
      const updated = await ordersRepo.getById(order.id)
      return { success: true, orderId: order.id, order: updated }
    }

    // Branch 2: Dodo Payments Verification (Rest of World)
    const effectiveSessionId = sessionId || order.dodoSessionId
    const effectivePaymentId = paymentId || order.dodoPaymentId
    let verifiedPaymentId = null
    let chargedAmount = null
    let chargedCurrency = null
    let taxAmount = null
    let taxCurrency = null

    if (effectiveSessionId && effectiveSessionId.startsWith('cks_')) {
      const session = await dodoProvider.getCheckoutSession(effectiveSessionId).catch(() => null)
      if (!session) {
        throw httpError(404, 'Checkout session not found on Dodo Payments')
      }
      const payStatus = String(session.payment_status || '').toLowerCase()
      const isPaid = payStatus === 'paid' || payStatus === 'succeeded' || Boolean(session.payment_id)
      if (!isPaid) {
        throw httpError(400, `Payment not completed (status: ${session.payment_status || 'unpaid'})`)
      }
      verifiedPaymentId = session.payment_id || `pay_${effectiveSessionId}`
      if (session.payment_id) {
        try {
          const pay = await dodoProvider.getPayment(session.payment_id)
          if (pay) {
            chargedCurrency = pay.currency ? String(pay.currency).toUpperCase() : undefined
            if (pay.total_amount !== undefined && pay.total_amount !== null) {
              chargedAmount = fromMinorUnits(pay.total_amount, chargedCurrency || 'USD')
            }
            if (pay.tax !== undefined && pay.tax !== null) {
              taxAmount = fromMinorUnits(pay.tax, chargedCurrency || 'USD')
              taxCurrency = chargedCurrency
            }
          }
        } catch (e) {
          console.warn('[Dodo] Could not retrieve payment details for session:', e.message)
        }
      }
    } else if (effectivePaymentId && effectivePaymentId.startsWith('pay_')) {
      const pay = await dodoProvider.getPayment(effectivePaymentId).catch(() => null)
      if (!pay || String(pay.status || '').toLowerCase() !== 'succeeded') {
        throw httpError(400, `Payment not successful (status: ${pay?.status || 'failed'})`)
      }
      verifiedPaymentId = pay.payment_id || effectivePaymentId
      chargedCurrency = pay.currency ? String(pay.currency).toUpperCase() : undefined
      if (pay.total_amount !== undefined && pay.total_amount !== null) {
        chargedAmount = fromMinorUnits(pay.total_amount, chargedCurrency || 'USD')
      }
      if (pay.tax !== undefined && pay.tax !== null) {
        taxAmount = fromMinorUnits(pay.tax, chargedCurrency || 'USD')
        taxCurrency = chargedCurrency
      }
    } else {
      throw httpError(400, 'Authoritative payment verification required. Unverified payments cannot be finalized.')
    }

    await webhookService.finalizeOrder(order.id, verifiedPaymentId, order.customerEmail, {
      paymentProvider: 'dodo',
      dodoPaymentId: verifiedPaymentId,
      chargedAmount,
      chargedCurrency,
      taxAmount,
      taxCurrency,
    })
    const updated = await ordersRepo.getById(order.id)
    return { success: true, orderId: order.id, order: updated }
  },

  async getStatus(orderId, email) {
    let order = await ordersRepo.getById(orderId)
    if (!order) order = await ordersRepo.getByRazorpayOrderId(orderId)
    if (!order && email) {
      order = await ordersRepo.getLatestPaidByProductAndEmail(orderId, email)
    }
    if (!order) return null
    const product = await productsRepo.getById(order.productId)
    const result = {
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      paymentMode: order.paymentMode || 'TEST',
      customerEmail: order.customerEmail || email || null,
      customerName: order.customerName || null,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      product: product ? { id: product.id, title: product.title, thumbnail: product.thumbnail, type: product.type, hasFile: !!product.fileId, creatorId: product.creatorId } : null,
    }
    if (product && product.type === 'COACHING') {
      const booking = await coachingRepo.getBookingByOrderId(order.id)
      if (booking) result.booking = booking
    }
    if (product && product.type === 'WEBINAR') {
      const config = await webinarRepo.getConfigByProductId(product.id)
      const webinarId = config?.id || product.id
      const reg = await webinarRepo.getRegistration(webinarId, order.email)
      if (reg) result.webinarRegistration = reg
    }
    if (product && product.type === 'MEMBERSHIP') {
      const config = await membershipRepo.getConfigByProductId(product.id)
      const memId = config?.id || product.id
      const sub = await membershipRepo.getSubscription(memId, order.email)
      if (sub) result.membershipSubscription = sub
    }
    if (product && (product.type === 'CUSTOM_PRODUCT' || product.type === 'CUSTOM_SERVICE')) {
      const req = await customServiceRepo.getRequestByOrderId(order.id)
      if (req) result.customServiceRequest = req
    }
    return result
  },
}

// ---------------- Webhook / Fulfillment ----------------
export const webhookService = {
  verifySignature(rawBody, signature) {
    if (!signature) return false
    try {
      const provider = getPaymentProvider()
      provider.verifyWebhook(rawBody, signature)
      return true
    } catch (e) {
      return false
    }
  },

  verifyDodoSignature(rawBody, headers) {
    return dodoProvider.verifyWebhook({ rawBody, headers })
  },

  async processDodoEvent(event) {
    const res = await this.handle(event)
    return {
      processed: Boolean(res?.ok),
      duplicate: Boolean(res?.duplicate),
      ...res,
    }
  },

  async handle(event) {
    const eventId = event.event_id || event.id || uuidv4()
    const eventType = event.event || event.event_type || event.type
    console.log(`[Webhook] Webhook received: ${eventType} (ID: ${eventId})`)

    const claimed = await webhookEventsRepo.claim(eventId, eventType)
    if (!claimed) {
      console.log(`[Webhook] Webhook already claimed/processed: ${eventId}`)
      return { duplicate: true }
    }

    try {
      // ===== DODO PAYMENTS WEBHOOK EVENTS =====
      // Subscription created or pending - record pending state only, NEVER grant active access, NEVER downgrade ACTIVE
      if (eventType === 'subscription.created' || eventType === 'subscription.pending') {
        const data = event.data || {}
        const subscriptionId = data.subscription_id || data.id
        const creatorIdFromMetadata = data.metadata?.creatorId || data.metadata?.creator_id
        console.log(`[Dodo Payments Webhook] Subscription created/pending: ${subscriptionId} (Creator: ${creatorIdFromMetadata}) - Recording PENDING state only`)

        let sub = null
        if (subscriptionId) {
          sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
        }
        if (!sub && creatorIdFromMetadata) {
          sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromMetadata)
        }

        const targetCreatorId = sub?.creatorId || creatorIdFromMetadata
        if (targetCreatorId) {
          // If the user ALREADY has an ACTIVE subscription, NEVER overwrite it to PENDING!
          if (sub && sub.status === 'ACTIVE') {
            console.log(`[Dodo Payments Webhook] Subscription created/pending received for already ACTIVE subscriber ${targetCreatorId}. Preserving ACTIVE status.`)
            await webhookEventsRepo.markProcessed(eventId)
            return { ok: true, pending: true, preservedActive: true }
          }

          await creatorSubscriptionsRepo.updateStatus(targetCreatorId, 'PENDING', {
            provider: 'DODO',
            providerSubscriptionId: subscriptionId || sub?.providerSubscriptionId,
            dodoSubscriptionId: subscriptionId || sub?.dodoSubscriptionId,
          })
          await subscriptionAuditLogsRepo.record(targetCreatorId, 'WEBHOOK_SUBSCRIPTION_PENDING', {
            providerSubscriptionId: subscriptionId,
            eventId,
          }).catch(() => {})
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true, pending: true }
      }

      if (
        eventType === 'subscription.active' ||
        eventType === 'subscription.renewed' ||
        eventType === 'subscription.plan_changed' ||
        eventType === 'subscription.updated'
      ) {
        const data = event.data || {}
        const rawStatus = String(data.status || 'active').toLowerCase()
        if (eventType === 'subscription.updated' && rawStatus !== 'active') {
          console.log(`[Dodo Payments Webhook] Subscription update received with non-active status: ${rawStatus}. Not granting active access.`)
          await webhookEventsRepo.markProcessed(eventId)
          return { ok: true, ignored: true }
        }

        const subscriptionId = data.subscription_id || data.id
        const creatorIdFromMetadata = data.metadata?.creatorId || data.metadata?.creator_id
        console.log(`[Dodo Payments Webhook] Subscription active/renewed: ${subscriptionId} (Creator: ${creatorIdFromMetadata})`)

        let sub = null
        if (subscriptionId) {
          sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
        }
        if (!sub && creatorIdFromMetadata) {
          sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromMetadata)
        }

        // Validate account association
        if (sub && creatorIdFromMetadata && sub.creatorId !== creatorIdFromMetadata) {
          console.error(`[Dodo Payments Webhook] Account mismatch: sub belongs to ${sub.creatorId}, event metadata has ${creatorIdFromMetadata}`)
          await webhookEventsRepo.markProcessed(eventId)
          return { error: 'account_mismatch' }
        }

        const targetCreatorId = sub?.creatorId || creatorIdFromMetadata
        if (targetCreatorId) {
          // Resolve target plan from product ID or metadata
          const mappedPlan = data.product_id ? mapProviderPlanToInternalPlan('DODO', data.product_id) : null
          let targetPlan = (data.metadata?.plan ? String(data.metadata.plan).toUpperCase() : null) || (mappedPlan !== 'UNSUBSCRIBED' ? mappedPlan : null)
          if (!targetPlan || targetPlan === 'UNKNOWN') targetPlan = sub?.plan || 'PRO'
          targetPlan = normalizePlanId(targetPlan, 'ACTIVE')

          // OUT-OF-ORDER & DELAYED EVENT PROTECTION:
          // A delayed or stale event must never incorrectly downgrade Pro access.
          if (sub && sub.status === 'ACTIVE' && sub.plan === 'PRO' && targetPlan === 'CREATOR') {
            const now = new Date()
            const isScheduledDowngradeDue = sub.scheduledPlan === 'CREATOR' && sub.scheduledChangeAt && now >= new Date(sub.scheduledChangeAt)

            if (!isScheduledDowngradeDue) {
              console.warn(`[Dodo Payments Webhook] Out-of-order or stale CREATOR event (${subscriptionId}) rejected: Pro plan is ACTIVE and no scheduled downgrade is due for ${targetCreatorId}.`)
              await subscriptionAuditLogsRepo.record(targetCreatorId, 'OUT_OF_ORDER_WEBHOOK_REJECTED', {
                eventId,
                eventType,
                currentPlan: sub.plan,
                attemptedPlan: targetPlan,
                providerSubscriptionId: subscriptionId,
              }).catch(() => {})
              await webhookEventsRepo.markProcessed(eventId)
              return { ok: true, ignored: true, reason: 'out_of_order_downgrade_rejected' }
            }
          }

          // Timestamp freshness check: if event timestamp is significantly older than last DB update
          const eventTimestamp = event.timestamp ? new Date(event.timestamp) : null
          if (eventTimestamp && sub?.updatedAt && new Date(sub.updatedAt).getTime() - eventTimestamp.getTime() > 15000) {
            if (sub.plan === 'PRO' && targetPlan === 'CREATOR') {
              console.warn(`[Dodo Payments Webhook] Stale event timestamp rejected for ${targetCreatorId} (${eventTimestamp.toISOString()} vs DB ${new Date(sub.updatedAt).toISOString()})`)
              await webhookEventsRepo.markProcessed(eventId)
              return { ok: true, ignored: true, reason: 'stale_event_timestamp' }
            }
          }

          const isAnnual = String(sub?.billingInterval || data.metadata?.billingInterval || '').toUpperCase() === 'ANNUAL'
          const durationDays = isAnnual ? 365 : 30
          let currentEnd = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
          if (data.next_billing_date) {
            const parsed = new Date(data.next_billing_date)
            if (!isNaN(parsed.getTime())) currentEnd = parsed
          }
          const currentStart = data.previous_billing_date ? new Date(data.previous_billing_date) : new Date()

          const planConfig = getPlanConfig(targetPlan, 'ACTIVE', isAnnual ? 'annual' : 'monthly', sub?.currency || 'USD')
          const targetPrice = planConfig.price

          const updatePayload = {
            provider: 'DODO',
            providerSubscriptionId: subscriptionId || sub?.providerSubscriptionId,
            dodoSubscriptionId: subscriptionId || sub?.dodoSubscriptionId,
            dodoCustomerId: data.customer?.customer_id || sub?.dodoCustomerId,
            currentPeriodStart: currentStart,
            currentPeriodEnd: currentEnd,
            trialStatus: 'EXPIRED',
            plan: targetPlan,
            price: targetPrice,
            amount: targetPrice,
            scheduledPlan: null,
            scheduledChangeAt: null,
            scheduledInterval: null,
            pendingUpgradePlan: null,
            pendingUpgradeInterval: null,
            pendingUpgradePaymentId: null,
            pendingUpgradeStatus: null,
            pendingUpgradeStartedAt: null,
            pendingUpgradeErrorMessage: null,
            pendingUpgradePaymentLink: null,
            pendingUpgradeAmount: null,
            pendingUpgradeCurrency: null,
          }

          if (data.metadata?.billingInterval || data.metadata?.interval) {
            updatePayload.billingInterval = String(data.metadata.billingInterval || data.metadata.interval).toUpperCase()
          }

          await creatorSubscriptionsRepo.updateStatus(targetCreatorId, 'ACTIVE', updatePayload)
          await profilesRepo.upsert(targetCreatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })

          const previousSubId = data.metadata?.previousSubscriptionId
          if (previousSubId && previousSubId.startsWith('sub_') && previousSubId !== subscriptionId) {
            try {
              console.log(`[Dodo Payments Webhook] Cancelling previous subscription ${previousSubId} following upgrade to ${subscriptionId}`)
              await dodoProvider.cancelSubscription(previousSubId, {
                immediately: true,
                cancelReason: 'cancelled_by_customer',
                comment: 'Customer upgraded to Pro',
              })
              await subscriptionAuditLogsRepo.record(targetCreatorId, 'PREVIOUS_SUBSCRIPTION_CANCELLED_ON_UPGRADE', {
                cancelledSubscriptionId: previousSubId,
                newSubscriptionId: subscriptionId,
                newPlan: targetPlan,
                eventId,
              }).catch(() => {})
            } catch (cancelErr) {
              console.warn(`[Dodo Payments Webhook] Warning cancelling old subscription ${previousSubId}:`, cancelErr.message)
            }
          }

          await subscriptionAuditLogsRepo.record(targetCreatorId, `WEBHOOK_${eventType.toUpperCase().replace('.', '_')}`, {
            providerSubscriptionId: subscriptionId,
            plan: targetPlan,
            status: 'ACTIVE',
            eventId,
          }).catch(() => {})

          console.log(`[Dodo Payments Webhook] Creator subscription marked ACTIVE for ${targetCreatorId} (${targetPlan})`)
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
        const data = event.data || {}
        const subscriptionId = data.subscription_id || data.id
        const creatorIdFromMetadata = data.metadata?.creatorId || data.metadata?.creator_id

        let sub = null
        if (subscriptionId) {
          sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
        }
        if (!sub && creatorIdFromMetadata) {
          sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromMetadata)
        }

        const targetCreatorId = sub?.creatorId || creatorIdFromMetadata
        if (targetCreatorId) {
          // If the cancellation event belongs to a secondary/older subscription that is NOT the user's active subscription,
          // do NOT cancel the user's active subscription!
          const activeSubId = sub?.dodoSubscriptionId || sub?.providerSubscriptionId
          if (activeSubId && subscriptionId && activeSubId !== subscriptionId && sub.status === 'ACTIVE') {
            console.log(`[Dodo Payments Webhook] Cancellation event for subscription ${subscriptionId} ignored because active subscription is ${activeSubId}`)
            await subscriptionAuditLogsRepo.record(targetCreatorId, 'SECONDARY_SUBSCRIPTION_CANCELLED_IGNORED', {
              cancelledSubscriptionId: subscriptionId,
              activeSubscriptionId: activeSubId,
              eventId,
            }).catch(() => {})
            await webhookEventsRepo.markProcessed(eventId)
            return { ok: true, ignored: true, reason: 'secondary_subscription_cancelled' }
          }

          const status = eventType === 'subscription.expired' ? 'EXPIRED' : 'CANCELLED'
          await creatorSubscriptionsRepo.updateStatus(targetCreatorId, status, {
            canceledAt: new Date(),
          })
          await subscriptionAuditLogsRepo.record(targetCreatorId, `WEBHOOK_${eventType.toUpperCase().replace('.', '_')}`, {
            providerSubscriptionId: subscriptionId,
            status,
            eventId,
          }).catch(() => {})
          console.log(`[Dodo Payments Webhook] Creator subscription marked ${status} for ${targetCreatorId}`)
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      if (eventType === 'subscription.failed' || eventType === 'subscription.past_due' || eventType === 'subscription.on_hold') {
        const data = event.data || {}
        const subscriptionId = data.subscription_id || data.id
        const creatorIdFromMetadata = data.metadata?.creatorId || data.metadata?.creator_id

        let sub = null
        if (subscriptionId) {
          sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
        }
        if (!sub && creatorIdFromMetadata) {
          sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromMetadata)
        }

        const targetCreatorId = sub?.creatorId || creatorIdFromMetadata
        if (targetCreatorId) {
          const activeSubId = sub?.dodoSubscriptionId || sub?.providerSubscriptionId
          if (activeSubId && subscriptionId && activeSubId !== subscriptionId && sub.status === 'ACTIVE') {
            console.log(`[Dodo Payments Webhook] Failure event for subscription ${subscriptionId} ignored because active subscription is ${activeSubId}`)
            await webhookEventsRepo.markProcessed(eventId)
            return { ok: true, ignored: true }
          }

          await creatorSubscriptionsRepo.updateStatus(targetCreatorId, 'HALTED')
          await subscriptionAuditLogsRepo.record(targetCreatorId, `WEBHOOK_${eventType.toUpperCase().replace('.', '_')}`, {
            providerSubscriptionId: subscriptionId,
            status: 'HALTED',
            eventId,
          }).catch(() => {})
          console.log(`[Dodo Payments Webhook] Creator subscription marked HALTED for ${targetCreatorId}`)
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      if (eventType === 'payment.processing') {
        const data = event.data || {}
        const paymentId = data.payment_id || data.id
        const subscriptionId = data.subscription_id
        console.log(`[Dodo Payments Webhook] Payment processing event received: ${paymentId} (Sub: ${subscriptionId})`)
        if (subscriptionId) {
          const sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
          if (sub) {
            if (sub.status === 'ACTIVE' && (sub.pendingUpgradePaymentId === paymentId || !sub.pendingUpgradePaymentId)) {
              await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', {
                pendingUpgradePaymentId: paymentId,
                pendingUpgradeStatus: 'PROCESSING',
                pendingUpgradeStartedAt: sub.pendingUpgradeStartedAt || new Date(),
              }).catch(() => {})
            }
            await subscriptionAuditLogsRepo.record(sub.creatorId, 'WEBHOOK_PAYMENT_PROCESSING', {
              providerSubscriptionId: subscriptionId,
              paymentId,
              eventId,
              chargeType: data.charge_type,
            }).catch(() => {})
          }
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true, processing: true }
      }

      if (eventType === 'payment.succeeded') {
        const data = event.data || {}
        const paymentId = data.payment_id || data.id
        const orderId = data.metadata?.orderId || data.metadata?.order_id
        const subscriptionId = data.subscription_id

        if (orderId) {
          const order = await ordersRepo.getById(orderId)
          if (order) {
            let chargedCurrency = data.currency ? String(data.currency).toUpperCase() : (order.presentmentCurrency || order.currency || 'USD')
            let chargedAmount = undefined
            let taxAmount = undefined
            let taxCurrency = chargedCurrency

            if (data.total_amount !== undefined && data.total_amount !== null) {
              chargedAmount = fromMinorUnits(data.total_amount, chargedCurrency)
            } else if (data.amount !== undefined && data.amount !== null) {
              chargedAmount = fromMinorUnits(data.amount, chargedCurrency)
            }

            if (data.tax !== undefined && data.tax !== null) {
              taxAmount = fromMinorUnits(data.tax, chargedCurrency)
            }

            await this.finalizeOrder(order.id, paymentId, order.customerEmail || data.customer?.email, {
              paymentProvider: 'dodo',
              dodoPaymentId: paymentId,
              chargedAmount,
              chargedCurrency,
              taxAmount,
              taxCurrency,
            })
          }
        }

        if (subscriptionId) {
          let sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
          if (!sub && data.metadata?.creatorId) {
            sub = await creatorSubscriptionsRepo.getByCreator(data.metadata.creatorId)
          }
          if (sub) {
            const mappedPlan = data.product_id ? mapProviderPlanToInternalPlan('DODO', data.product_id) : null
            const targetPlan = (data.metadata?.plan ? String(data.metadata.plan).toUpperCase() : null) || (mappedPlan !== 'UNSUBSCRIBED' ? mappedPlan : null) || 'CREATOR'
            const isConfirmedPro = targetPlan === 'PRO' || mappedPlan === 'PRO'

            const updatePayload = {
              dodoPaymentId: paymentId,
              pendingUpgradePlan: null,
              pendingUpgradeInterval: null,
              pendingUpgradePaymentId: null,
              pendingUpgradeStatus: null,
              pendingUpgradeStartedAt: null,
              pendingUpgradeErrorMessage: null,
              pendingUpgradePaymentLink: null,
              pendingUpgradeAmount: null,
              pendingUpgradeCurrency: null,
            }
            if (isConfirmedPro) {
              updatePayload.plan = 'PRO'
              updatePayload.status = 'ACTIVE'
              updatePayload.scheduledPlan = null
              updatePayload.scheduledChangeAt = null
              updatePayload.scheduledInterval = null
            }

            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', updatePayload)
            if (isConfirmedPro && sub.plan !== 'PRO') {
              await subscriptionAuditLogsRepo.record(sub.creatorId, 'PLAN_UPGRADE_APPLIED', {
                providerSubscriptionId: subscriptionId,
                paymentId,
                fromPlan: sub.plan,
                toPlan: 'PRO',
                eventId,
              }).catch(() => {})
            }

            const previousSubId = data.metadata?.previousSubscriptionId
            if (isConfirmedPro && previousSubId && previousSubId.startsWith('sub_') && previousSubId !== subscriptionId) {
              try {
                console.log(`[Dodo Payments Webhook] Cancelling previous subscription ${previousSubId} following payment.succeeded upgrade to ${subscriptionId}`)
                await dodoProvider.cancelSubscription(previousSubId, {
                  immediately: true,
                  cancelReason: 'cancelled_by_customer',
                  comment: 'Customer upgraded to Pro',
                })
              } catch (cancelErr) {
                console.warn(`[Dodo Payments Webhook] Warning cancelling old subscription ${previousSubId}:`, cancelErr.message)
              }
            }
          }
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      if (eventType === 'payment.failed' || eventType === 'payment.cancelled') {
        const data = event.data || {}
        const orderId = data.metadata?.orderId || data.metadata?.order_id
        if (orderId) {
          const order = await ordersRepo.getById(orderId)
          if (order) {
            await ordersRepo.update(order.id, { status: 'FAILED' })
          }
        }

        const subscriptionId = data.subscription_id
        const creatorIdFromMetadata = data.metadata?.creatorId || data.metadata?.creator_id
        let sub = null
        if (subscriptionId) sub = await creatorSubscriptionsRepo.getByDodoSubscriptionId(subscriptionId)
        if (!sub && creatorIdFromMetadata) sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromMetadata)
        if (sub) {
          // If the user has an active Creator subscription and this was an upgrade payment failure, keep Creator active!
          if (sub.status === 'ACTIVE' && sub.plan === 'CREATOR') {
            console.log(`[Dodo Payments Webhook] Upgrade payment failed for Creator subscriber ${sub.creatorId}. Keeping Creator active.`)
            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', {
              pendingUpgradeStatus: 'FAILED',
              pendingUpgradeErrorMessage: data.error_message || data.failure_reason || 'Payment failed or was cancelled.',
            })
            await subscriptionAuditLogsRepo.record(sub.creatorId, 'PLAN_UPGRADE_PAYMENT_FAILED', {
              providerSubscriptionId: subscriptionId,
              paymentId: data.payment_id || data.id,
              eventId,
            }).catch(() => {})
          } else if (sub.status === 'PENDING') {
            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'FAILED')
            await subscriptionAuditLogsRepo.record(sub.creatorId, 'WEBHOOK_PAYMENT_FAILED', {
              providerSubscriptionId: subscriptionId,
              paymentId: data.payment_id || data.id,
              eventId,
            }).catch(() => {})
          }
        }

        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      if (eventType === 'refund.succeeded') {
        const data = event.data || {}
        const orderId = data.metadata?.orderId || data.metadata?.order_id
        const paymentId = data.payment_id
        let order = null
        if (orderId) order = await ordersRepo.getById(orderId)
        if (!order && paymentId) order = await ordersRepo.getByDodoPaymentId(paymentId)
        if (order) {
          await ordersRepo.markRefunded(order.id)
          await entitlementsRepo.revokeForOrder(order.id)
          await earningsService.recordRefund({
            order,
            amount: order.originalPrice || order.amount,
            reason: data.reason || 'Dodo Payments refund',
          }).catch((e) => console.warn('[Webhook] Earnings refund ledger note:', e.message))
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      // ===== PAYPAL WEBHOOK EVENTS =====
      if (event.event_type) {
        const ppType = event.event_type
        console.log(`[PayPal] Processing webhook event: ${ppType} (ID: ${eventId})`)
        const resource = event.resource || {}

        if (
          ppType === 'BILLING.SUBSCRIPTION.ACTIVATED' ||
          ppType === 'BILLING.SUBSCRIPTION.CREATED' ||
          ppType === 'PAYMENT.SALE.COMPLETED' ||
          ppType === 'PAYMENT.CAPTURE.COMPLETED'
        ) {
          let subscriptionId = null
          let captureId = resource.id
          let customId = resource.custom_id

          if (ppType.startsWith('BILLING.SUBSCRIPTION.')) {
            subscriptionId = resource.id
            customId = resource.custom_id
          } else if (ppType === 'PAYMENT.SALE.COMPLETED') {
            subscriptionId = resource.billing_agreement_id
            customId = resource.custom_id
          } else if (ppType === 'PAYMENT.CAPTURE.COMPLETED') {
            subscriptionId = resource.supplementary_data?.related_ids?.order_id
          }

          let sub = null
          if (subscriptionId) {
            sub = await creatorSubscriptionsRepo.getByProviderSubscriptionId(subscriptionId)
          }
          if (!sub && customId) {
            sub = await creatorSubscriptionsRepo.getByCreator(customId)
          }

          if (sub) {
            const isAnnual = String(sub.billingInterval || sub.billingCycle || '').toUpperCase() === 'ANNUAL'
            const periodDays = isAnnual ? 365 : 30
            let nextBilling = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000)
            if (resource.billing_info?.next_billing_time) {
              const parsedDate = new Date(resource.billing_info.next_billing_time)
              if (!isNaN(parsedDate.getTime())) nextBilling = parsedDate
            }
            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', {
              provider: 'PAYPAL',
              providerSubscriptionId: subscriptionId || sub.providerSubscriptionId,
              razorpayPaymentId: captureId,
              currentPeriodStart: new Date(),
              currentPeriodEnd: nextBilling,
            })
            await profilesRepo.upsert(sub.creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
            console.log(`[PayPal Webhook] Activated / renewed creator subscription for ${sub.creatorId} via ${ppType}`)
          }
        } else if (ppType === 'CHECKOUT.ORDER.APPROVED') {
          const orderId = resource.id
          const sub = await creatorSubscriptionsRepo.getByProviderSubscriptionId(orderId)
          if (sub && sub.status !== 'ACTIVE') {
            await creatorSubscriptionService.verifySubscriptionPayment(sub.creatorId, {
              provider: 'paypal',
              orderId,
            }).catch(e => console.warn('[PayPal Webhook] Auto-capture error:', e.message))
          }
        } else if (
          ppType === 'BILLING.SUBSCRIPTION.CANCELLED' ||
          ppType === 'BILLING.SUBSCRIPTION.SUSPENDED' ||
          ppType === 'BILLING.SUBSCRIPTION.EXPIRED' ||
          ppType === 'PAYMENT.CAPTURE.DENIED'
        ) {
          const subscriptionId = resource.id || resource.billing_agreement_id || resource.supplementary_data?.related_ids?.order_id
          let sub = null
          if (subscriptionId) {
            sub = await creatorSubscriptionsRepo.getByProviderSubscriptionId(subscriptionId)
          }
          if (!sub && resource.custom_id) {
            sub = await creatorSubscriptionsRepo.getByCreator(resource.custom_id)
          }
          if (sub) {
            const targetStatus = (ppType === 'PAYMENT.CAPTURE.DENIED' || ppType === 'BILLING.SUBSCRIPTION.SUSPENDED') ? 'HALTED' : 'CANCELLED'
            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, targetStatus, {
              canceledAt: new Date(),
            })
            console.log(`[PayPal Webhook] Subscription marked ${targetStatus} for ${sub.creatorId}`)
          }
        }
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true }
      }

      // ===== RAZORPAY SUBSCRIPTION & INVOICE LIFECYCLE EVENTS =====
      if (
        eventType.startsWith('subscription.') ||
        eventType.startsWith('invoice.') ||
        (eventType === 'payment.failed' && (event.payload?.payment?.entity?.subscription_id || event.payload?.payment?.entity?.invoice_id))
      ) {
        const lifecycleResult = await razorpaySubscriptionLifecycleService.processWebhookEvent(event)
        await webhookEventsRepo.markProcessed(eventId)
        return { ok: true, ...lifecycleResult }
      }
      // ===== ORDER & PAYMENT EVENTS =====
      else if (eventType === 'order.paid' || eventType === 'payment.captured') {
        const payload = event.payload?.payment?.entity || event.payload?.order?.entity
        const razorpayOrderId = payload?.order_id || payload?.id
        const razorpayPaymentId = payload?.id
        const email = payload?.email
        if (razorpayOrderId) {
          const order = await ordersRepo.getByRazorpayOrderId(razorpayOrderId)
          if (order) {
            await this.finalizeOrder(order.id, razorpayPaymentId, email)
          }
          const sub = await creatorSubscriptionsRepo.getByRazorpayOrderId(razorpayOrderId)
          if (sub) {
            const isAnnual = String(sub.billingInterval || sub.billingCycle || '').toUpperCase() === 'ANNUAL' || sub.plan === 'YEARLY'
            const periodDays = isAnnual ? 365 : 30
            await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', {
              razorpayOrderId,
              razorpayPaymentId: razorpayPaymentId || sub.razorpayPaymentId,
              currency: sub.currency || payload?.currency || 'INR',
              price: sub.price,
              currentPeriodStart: sub.currentPeriodStart || new Date(),
              currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
              trialStatus: 'EXPIRED',
            })
            await profilesRepo.upsert(sub.creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
            console.log(`[Razorpay] Database subscription updated from order payment: ACTIVE for creator ${sub.creatorId} (${sub.currency || 'INR'})`)
          }
        }
      } else if (eventType === 'payment.failed') {
        const payload = event.payload?.payment?.entity
        const razorpayOrderId = payload?.order_id
        const razorpaySubscriptionId = payload?.subscription_id
        const creatorIdFromNotes = payload?.notes?.creatorId || payload?.notes?.creator_id
        if (razorpayOrderId) {
          const order = await ordersRepo.getByRazorpayOrderId(razorpayOrderId)
          if (order) {
            await ordersRepo.update(order.id, { status: 'FAILED' })
            if (order.customerEmail) {
              const product = await productsRepo.getById(order.productId).catch(() => null)
              await emailService.sendPaymentFailureEmail({
                to: order.customerEmail,
                customerName: order.customerName,
                productTitle: product?.title || 'Product Order',
                reason: payload?.error_description || 'Payment was declined or cancelled',
                retryUrl: getAppUrl(`/checkout/${product?.slug || product?.id || order.productId}`),
              }).catch(() => { })
            }
          }
          const sub = await creatorSubscriptionsRepo.getByRazorpayOrderId(razorpayOrderId)
          if (sub) await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'FAILED')
        }
        if (razorpaySubscriptionId) {
          const sub = await creatorSubscriptionsRepo.getByRazorpaySubscriptionId(razorpaySubscriptionId)
          if (sub) await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'FAILED')
        }
        if (creatorIdFromNotes) {
          const sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromNotes)
          if (sub && sub.status !== 'ACTIVE') await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'FAILED')
        }
      } else if (eventType === 'refund.created' || eventType === 'refund.processed') {
        const payload = event.payload?.refund?.entity
        const razorpayPaymentId = payload?.payment_id
        if (razorpayPaymentId) {
          const order = await ordersRepo.getByRazorpayPaymentId(razorpayPaymentId)
          if (order) {
            await ordersRepo.markRefunded(order.id)
            await entitlementsRepo.revokeForOrder(order.id)
            await earningsService.recordRefund({
              order,
              amount: payload?.amount ? payload.amount / 100 : (order.originalPrice || order.amount),
              reason: payload?.notes?.reason || 'Razorpay refund',
            }).catch((e) => console.warn('[Webhook] Earnings refund ledger note:', e.message))
          }
        }
      } else if (eventType === 'fund_account.validation.completed' || eventType === 'fund_account.validation.failed') {
        await this.handleFundAccountValidationWebhook(event)
      } else if (eventType.startsWith('account.')) {
        await this.handleAccountWebhook(event)
      }
      await webhookEventsRepo.markProcessed(eventId)
      return { ok: true }
    } catch (e) {
      console.error('[Razorpay] Webhook handling error:', e)
      await webhookEventsRepo.markFailed(eventId, String(e))
      throw e
    }
  },

  async finalizeOrder(orderId, paymentId, customerEmail, extraFields = {}) {
    const order = await ordersRepo.getById(orderId)
    if (!order) return
    const email = customerEmail || order.customerEmail

    const customer = await customersRepo.upsert(order.creatorId, email || `unknown+${orderId}@creatorzero.local`, '')

    const isDodo = extraFields.paymentProvider === 'dodo' || order.paymentProvider === 'dodo' || Boolean(extraFields.dodoPaymentId)
    const dodoPaymentId = extraFields.dodoPaymentId || (isDodo ? paymentId : null)

    const chargedAmount = extraFields.chargedAmount !== undefined && extraFields.chargedAmount !== null
      ? Number(extraFields.chargedAmount)
      : (order.chargedAmount !== undefined && order.chargedAmount !== null ? Number(order.chargedAmount) : (order.presentmentAmount !== null && order.presentmentAmount !== undefined ? Number(order.presentmentAmount) : Number(order.amount)))
    const chargedCurrency = extraFields.chargedCurrency || order.chargedCurrency || order.presentmentCurrency || order.currency || 'USD'
    const taxAmount = extraFields.taxAmount !== undefined && extraFields.taxAmount !== null
      ? Number(extraFields.taxAmount)
      : (order.taxAmount !== undefined && order.taxAmount !== null ? Number(order.taxAmount) : null)
    const taxCurrency = extraFields.taxCurrency || order.taxCurrency || chargedCurrency

    // Atomic: only the first successful transition performs fulfillment
    const didTransition = await ordersRepo.markPaidOnce(orderId, {
      customerId: customer.id,
      paymentProvider: isDodo ? 'dodo' : (order.paymentProvider || 'razorpay'),
      dodoPaymentId: dodoPaymentId || order.dodoPaymentId || null,
      razorpayPaymentId: (!isDodo ? paymentId : null) || order.razorpayPaymentId || null,
      chargedAmount,
      chargedCurrency,
      taxAmount,
      taxCurrency,
      amount: chargedAmount,
      currency: chargedCurrency,
      paidAt: new Date(),
    })
    if (!didTransition) return // already fulfilled

    // Record purchase attribution if automation originated this order
    if (order.automationId) {
      await automationEventsRepo.recordEvent({
        creatorId: order.creatorId,
        automationId: order.automationId,
        productId: order.productId,
        eventType: 'PURCHASE_COMPLETED',
        metadata: { orderId: order.id, amount: Number(chargedAmount || order.amount) }
      })
    }

    // Update payment record
    const existingPayment = await paymentsRepo.getByOrderId(orderId)
    if (existingPayment) {
      await paymentsRepo.update(existingPayment.id, {
        status: 'PAID',
        amount: chargedAmount,
        currency: chargedCurrency,
        razorpayPaymentId: !isDodo ? paymentId : (existingPayment.razorpayPaymentId || null),
        capturedAt: new Date()
      })
    } else {
      await paymentsRepo.create({
        id: uuidv4(),
        orderId: order.id,
        creatorId: order.creatorId,
        productId: order.productId,
        paymentMode: isDodo ? 'DODO' : 'RAZORPAY',
        razorpayOrderId: order.razorpayOrderId || null,
        razorpayPaymentId: !isDodo ? paymentId : null,
        amount: chargedAmount,
        currency: chargedCurrency,
        status: 'PAID',
        capturedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    // Trigger Route Transfer if creator has legacy razorpay payout profile
    const payout = await payoutProfilesRepo.getByCreator(order.creatorId)
    const canRouteTransfer = !isDodo && payout && payout.payoutMethod !== 'PAYPAL' && !payout.paypalEmail && String(payout.razorpayAccountId || '').startsWith('acc_') && Number(order.amount) > 0
    if (canRouteTransfer) {
      try {
        const transferRes = await getPaymentProvider().createDirectTransfer({
          razorpayPaymentId: paymentId, accountId: payout.razorpayAccountId, amount: order.amount, currency: order.currency
        })
        await transfersRepo.create({
          id: uuidv4(), paymentId, orderId: order.id, creatorId: order.creatorId,
          razorpayTransferId: transferRes.id || `trf_${order.id}`, amount: order.amount, currency: order.currency || 'INR',
          status: 'SUCCESS', createdAt: new Date()
        })
      } catch (e) {
        console.error('[Route Transfer Error]', e.message)
      }
    }

    // entitlement (idempotent by orderId unique index)
    await entitlementsRepo.createForOrder({
      id: uuidv4(), customerId: customer.id, creatorId: order.creatorId,
      productId: order.productId, orderId, source: 'PURCHASE', status: 'ACTIVE',
      startsAt: new Date(), expiresAt: null, createdAt: new Date(),
    })

    const product = await productsRepo.getById(order.productId)

    if (product && product.type === 'BUNDLE' && Array.isArray(product.bundleProducts)) {
      for (const item of product.bundleProducts) {
        if (item && item.id) {
          const hasEnt = await entitlementsRepo.has(customer.id, item.id)
          if (!hasEnt) {
            await entitlementsRepo.create({
              id: uuidv4(), customerId: customer.id, creatorId: order.creatorId,
              productId: item.id, orderId, source: 'BUNDLE_PURCHASE', bundleProductId: product.id, status: 'ACTIVE',
              startsAt: new Date(), expiresAt: null, createdAt: new Date(),
            })
          }
        }
      }
    }

    if (product && product.type === 'COACHING') {
      const booking = await coachingRepo.getBookingByOrderId(orderId)
      if (booking) {
        await coachingRepo.updateBooking(booking.id, { status: 'CONFIRMED', paymentStatus: 'PAID', customerId: customer.id, customerEmail: email || booking.customerEmail })
      }
    }
    if (product && product.type === 'COMMUNITY') {
      const config = await communityRepo.getConfigByProductId(product.id)
      const commId = config?.id || product.id
      await communityRepo.upsertMembership({
        communityId: commId,
        productId: product.id,
        creatorId: product.creatorId,
        customerId: customer.id,
        customerEmail: email,
        customerName: customer.name || email.split('@')[0],
        role: 'MEMBER',
        status: 'ACTIVE',
      })
    }
    if (product && product.type === 'WEBINAR') {
      const config = await webinarRepo.getConfigByProductId(product.id)
      const webinarId = config?.id || product.id
      let reg = await webinarRepo.getRegistration(webinarId, email)
      if (reg) {
        await webinarRepo.updateRegistrationStatus(reg.id, 'REGISTERED', {
          orderId: order.id,
          customerId: customer.id,
          customerName: customer.name || email.split('@')[0],
        })
      } else {
        await webinarRepo.upsertRegistration({
          webinarId,
          productId: product.id,
          creatorId: product.creatorId,
          customerId: customer.id,
          customerEmail: email,
          customerName: customer.name || email.split('@')[0],
          orderId: order.id,
          status: 'REGISTERED',
          answers: [],
        })
      }
    }
    if (product && product.type === 'MEMBERSHIP') {
      const config = await membershipRepo.getConfigByProductId(product.id)
      const memId = config?.id || product.id
      const sub = await membershipRepo.upsertSubscription({
        membershipId: memId,
        productId: product.id,
        creatorId: product.creatorId,
        customerId: customer.id,
        customerEmail: email,
        customerName: customer.name || email.split('@')[0],
        orderId: order.id,
        billingInterval: config?.billingType === 'YEARLY' ? 'YEAR' : 'MONTH',
        price: order.amount,
        currency: order.currency,
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
      })
      await membershipService.cascadeEntitlements(sub, config)
    }
    if (product && (product.type === 'CUSTOM_PRODUCT' || product.type === 'CUSTOM_SERVICE')) {
      const config = await customServiceRepo.getConfigByProductId(product.id)
      const serviceId = config?.id || product.id
      const existingReq = await customServiceRepo.getRequestByOrderId(order.id)
      if (!existingReq) {
        const answers = order.metadata?.answers || []
        await customServiceRepo.upsertRequest({
          serviceId,
          productId: product.id,
          creatorId: product.creatorId,
          customerId: customer.id,
          customerEmail: email,
          customerName: customer.name || email.split('@')[0],
          orderId: order.id,
          deliveryDays: config?.deliveryDays || 3,
          status: 'SUBMITTED',
          answers,
        })
      }
    }

    // Record Earnings Ledger entry
    await earningsService.recordSale({ order, product })

    await analyticsService.track({ creatorId: order.creatorId, productId: order.productId, type: 'purchase', metadata: { amount: order.amount, currency: order.currency } })

    // Email (real if configured, isolated non-blocking delivery)
    try {
      const profile = await profilesRepo.getByCreator(order.creatorId).catch(() => null)
      const creatorUser = await usersRepo.findById(order.creatorId).catch(() => null)
      const creatorName = profile?.name || profile?.displayName || 'Creator'

      if (email && product) {
        // Generate cryptographically secure product access token for guest customer
        try {
          const guestAccess = await guestAccessService.createAccessToken({
            orderId: order.id,
            entitlementId: null,
            productId: product.id,
            customerEmail: email,
          })
          if (guestAccess?.accessUrl) {
            // 1. Customer purchase success email with [ Download Product ]
            await emailService.sendPurchaseSuccessEmail({
              to: email,
              customerName: customer.name || email.split('@')[0],
              productTitle: product.title,
              accessUrl: guestAccess.accessUrl,
            })
          }
        } catch (tokErr) {
          console.error('[GuestAccess] Error creating access token or sending confirmation email:', tokErr.message)
        }

        if (product.type === 'COURSE') {
          await emailService.sendCourseEnrollmentEmail({
            to: email,
            customerName: customer.name || email.split('@')[0],
            creatorName,
            courseTitle: product.title,
            accessUrl: getAppUrl(`/learn/${product.id}`),
          })
        }

        if (product.type === 'COACHING') {
          const booking = await coachingRepo.getBookingByOrderId(orderId)
          if (booking) {
            const bTz = booking.timezone || 'Asia/Kolkata'
            const timeStr = `${new Date(booking.startTime).toLocaleString('en-US', { timeZone: bTz, dateStyle: 'full', timeStyle: 'short' })} (${bTz})`
            await emailService.sendBookingConfirmationEmail({
              to: email,
              customerName: customer.name || email.split('@')[0],
              creatorName,
              productTitle: product.title,
              sessionTime: timeStr,
              meetingUrl: booking.meetingUrl,
            })
          }
        }

        if (product.type === 'WEBINAR') {
          const config = await webinarRepo.getConfigByProductId(product.id)
          const timeStr = config?.startAtUTC ? `${new Date(config.startAtUTC).toUTCString()} (${config.timezone || 'UTC'})` : 'Scheduled time'
          await emailService.sendWebinarConfirmationEmail({
            to: email,
            customerName: customer.name || email.split('@')[0],
            creatorName,
            productTitle: product.title,
            webinarTime: timeStr,
            meetingUrl: config?.meetingUrl,
          })
        }

        if (product.type === 'MEMBERSHIP') {
          const config = await membershipRepo.getConfigByProductId(product.id)
          await emailService.sendMembershipActivatedEmail({
            to: email,
            customerName: customer.name || email.split('@')[0],
            creatorName,
            productTitle: product.title,
            priceDisplay: `₹${order.amount}`,
            billingInterval: config?.billingType === 'YEARLY' ? 'year' : 'month',
          })
        }

        if (product.type === 'COMMUNITY') {
          await emailService.sendCommunityAccessEmail({
            to: email,
            customerName: customer.name || email.split('@')[0],
            creatorName,
            communityTitle: product.title,
            accessUrl: `${appUrl}/community/${product.id}`,
          })
        }
      }

      // 3. Creator notification email
      if (creatorUser?.email) {
        await emailService.sendNewOrderCreatorEmail({
          to: creatorUser.email,
          creatorName,
          customerName: customer?.name || email?.split('@')[0] || 'Customer',
          customerEmail: email,
          productTitle: product?.title || 'Product',
          amount: order.amount,
          currency: order.currency || 'INR',
          orderId: order.id,
        })
      }
    } catch (e) { console.error('[EmailService] Order fulfillment email dispatch failed:', e?.message || e) }

    return await ordersRepo.getById(orderId)
  },

  async handleAccountWebhook(event) {
    const eventType = event.event || event.type || ''
    const payload = event.payload || {}
    const accountObj = payload.account?.entity || payload.entity || {}
    const razorpayAccountId = accountObj.id || event.account_id

    if (!razorpayAccountId) return { success: false, reason: 'no_account_id' }

    const profile = await payoutProfilesRepo.getByRazorpayAccountId(razorpayAccountId)
    if (!profile) return { success: false, reason: 'profile_not_found' }

    let status = profile.status
    let verificationStatus = profile.verificationStatus

    if (eventType === 'account.activated' || accountObj.status === 'activated') {
      status = 'ACTIVE'
      verificationStatus = 'VERIFIED'
    } else if (eventType === 'account.under_review' || accountObj.status === 'under_review') {
      status = 'UNDER_REVIEW'
      verificationStatus = 'PENDING'
    } else if (eventType === 'account.suspended' || accountObj.status === 'suspended') {
      status = 'SUSPENDED'
      verificationStatus = 'FAILED'
    }

    await payoutProfilesRepo.updateStatus(profile.creatorId, status, { verificationStatus })
    await payoutAuditRepo.logEvent({
      creatorId: profile.creatorId,
      event: status === 'ACTIVE' ? 'VERIFICATION_SUCCESS' : (status === 'SUSPENDED' ? 'PAYOUT_ACCOUNT_SUSPENDED' : 'VERIFICATION_PENDING'),
      metadata: { razorpayAccountId, status, verificationStatus, eventType }
    })

    return { success: true, creatorId: profile.creatorId, status }
  },

  async handleFundAccountValidationWebhook(event) {
    const entity = event.payload?.fund_account_validation?.entity
    if (!entity) return { success: false, reason: 'missing_entity' }
    const fundAccountId = entity.fund_account_id
    const validationId = entity.id
    const valStatus = entity.status
    const accountStatus = entity.results?.account_status
    const registeredName = entity.results?.registered_name

    let profile = await payoutProfilesRepo.getByRazorpayFundAccountId(fundAccountId)
    if (!profile && validationId) {
      profile = await payoutProfilesRepo.getByRazorpayValidationId(validationId)
    }
    if (!profile) return { success: false, reason: 'profile_not_found' }

    if ((valStatus === 'completed' || accountStatus === 'active') && registeredName) {
      const nameMatch = isAccountHolderNameMatch(profile.accountHolderName, registeredName)
      if (nameMatch) {
        await payoutProfilesRepo.updateStatus(profile.creatorId, 'ACTIVE', {
          verificationStatus: 'VERIFIED',
          verifiedAccountHolderName: registeredName,
          verificationMessage: 'Your bank account has been verified successfully and your payout setup is active.',
          verificationCompletedAt: new Date()
        })
        await payoutAuditRepo.logEvent({
          creatorId: profile.creatorId,
          event: 'VERIFICATION_SUCCESS',
          metadata: { fundAccountId, validationId, registeredName }
        })
      } else {
        await payoutProfilesRepo.updateStatus(profile.creatorId, 'ACTION_REQUIRED', {
          verificationStatus: 'FAILED',
          verificationMessage: "Account holder name doesn't match bank records."
        })
        await payoutAuditRepo.logEvent({
          creatorId: profile.creatorId,
          event: 'VERIFICATION_FAILED',
          metadata: { reason: 'NAME_MISMATCH', registeredName }
        })
      }
    } else {
      await payoutProfilesRepo.updateStatus(profile.creatorId, 'ACTION_REQUIRED', {
        verificationStatus: 'FAILED',
        verificationMessage: entity.error?.description || 'Bank account verification failed with Razorpay.'
      })
      await payoutAuditRepo.logEvent({
        creatorId: profile.creatorId,
        event: 'VERIFICATION_FAILED',
        metadata: { reason: entity.error?.description || 'BANK_VALIDATION_REJECTED' }
      })
    }
    return { success: true, creatorId: profile.creatorId }
  },
}

// ---------------- Download (Cookie Session & Entitlement-gated) ----------------
export const downloadService = {
  async authorizeAndGetDownloadFile({ productId, guestEmail, guestCustomerId, creatorUserId = null }) {
    if (!productId) throw httpError(400, 'Product ID is required')

    const product = await productsRepo.getById(productId)
    if (!product) throw httpError(404, 'Product not found')
    if (!product.fileId) throw httpError(404, 'Digital resource file not found on product')

    const rawPrice = Number(product.price || 0)
    const isPaidProduct = rawPrice > 0

    // 1. Creator user accessing their own product
    if (creatorUserId && product.creatorId === creatorUserId) {
      return this._fetchStorageFile(product)
    }

    // 2. Identify caller's email and customer ID
    let userEmail = guestEmail ? String(guestEmail).toLowerCase().trim() : null
    let customerId = guestCustomerId || null

    if (!userEmail && creatorUserId) {
      const loggedUser = await prisma.user.findUnique({ where: { id: creatorUserId }, select: { email: true } }).catch(() => null)
      if (loggedUser?.email) userEmail = loggedUser.email.toLowerCase().trim()
    }

    if (!userEmail && !customerId) {
      throw httpError(401, 'Unauthorized. Please access using your purchase link from your email or verify your email.')
    }

    // 3. Verify active entitlement and corresponding order
    const entitlement = await prisma.entitlement.findFirst({
      where: {
        productId,
        status: 'ACTIVE',
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(userEmail ? [
            { customerEmail: { equals: userEmail, mode: 'insensitive' } },
            { order: { customerEmail: { equals: userEmail, mode: 'insensitive' }, status: 'PAID' } },
            { customer: { email: { equals: userEmail, mode: 'insensitive' } } }
          ] : [])
        ]
      },
      include: {
        order: true
      }
    })

    if (!entitlement) {
      throw httpError(403, 'No active purchase found for this product')
    }

    // 4. If the entitlement has an order, verify the order is in a completed paid status
    if (entitlement.order && entitlement.order.status !== 'PAID') {
      throw httpError(403, 'Payment required. This order has not been completed.')
    }

    return this._fetchStorageFile(product)
  },

  async _fetchStorageFile(product) {
    await ensureBucket('product-files', false)
    const storageInfo = await resolveDigitalProductStoragePath(product)
    if (!storageInfo) {
      throw httpError(404, 'File resource unavailable on storage')
    }

    const { bucket: storageBucket, path: storagePath } = storageInfo
    const safeFileName = (product.fileName || product.title || 'download')
      .replace(/[\/\\:\*\?"<>\|\r\n]/g, '_')
      .trim() || 'download'

    const { data: blobData, error: dlErr } = await supabaseAdmin.storage
      .from(storageBucket)
      .download(storagePath)

    if (dlErr || !blobData) {
      console.error('[DownloadService] Failed to download storage object:', dlErr?.message)
      throw httpError(404, 'File resource unavailable on storage')
    }

    const arrayBuffer = await blobData.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    const fileSize = fileBuffer.length || blobData.size || product.fileSize || 0
    const fileMime = product.fileMime || blobData.type || 'application/octet-stream'

    return {
      fileBuffer,
      fileStream: typeof blobData.stream === 'function' ? blobData.stream() : null,
      blob: blobData,
      fileName: safeFileName,
      fileSize,
      fileMime,
      storageBucket,
      storagePath,
      async getSignedUrl(expiresIn = 120) {
        const { data: signedData, error: signErr } = await supabaseAdmin.storage
          .from(storageBucket)
          .createSignedUrl(storagePath, expiresIn, { download: safeFileName })
        if (signErr || !signedData?.signedUrl) {
          console.error('[DownloadService] Failed to create signed URL:', signErr?.message)
          throw httpError(500, 'Failed to generate secure download link')
        }
        return signedData.signedUrl
      },
    }
  },

  async getDownloadSignedUrl(product, expiresIn = 120) {
    await ensureBucket('product-files', false)
    const storageInfo = await resolveDigitalProductStoragePath(product)
    if (!storageInfo) {
      throw httpError(404, 'File resource unavailable on storage')
    }
    const { bucket: storageBucket, path: storagePath } = storageInfo
    const safeFileName = (product.fileName || product.title || 'download')
      .replace(/[\/\\:\*\?"<>\|\r\n]/g, '_')
      .trim() || 'download'

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expiresIn, { download: safeFileName })

    if (signErr || !signedData?.signedUrl) {
      console.error('[DownloadService] Failed to create signed URL:', signErr?.message)
      throw httpError(500, 'Failed to generate secure download link')
    }
    return {
      signedUrl: signedData.signedUrl,
      fileName: safeFileName,
      fileSize: product.fileSize || null,
      fileMime: product.fileMime || 'application/octet-stream',
      expiresIn,
    }
  },
}

// ---------------- Guest Customer Access Service ----------------
export const guestAccessService = {
  async createAccessToken({ orderId, entitlementId, productId, customerEmail, expiresInDays = 30 }) {
    if (!orderId || !productId || !customerEmail) {
      throw new Error('Missing required fields for access token generation')
    }
    const cleanEmail = String(customerEmail).toLowerCase().trim()

    const rawToken = generateSecureToken()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

    await productAccessTokensRepo.create({
      orderId,
      entitlementId: entitlementId || null,
      productId,
      customerEmail: cleanEmail,
      tokenHash,
      expiresAt,
    })

    const accessUrl = getAppUrl(`/api/purchases/email-access/${rawToken}`)
    return { rawToken, tokenHash, accessUrl, expiresAt }
  },

  async validateTokenAndResolve(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return { success: false, error: 'INVALID_TOKEN', message: 'This access link is invalid or has expired.' }
    }

    const tokenHash = hashToken(rawToken.trim())
    const record = await productAccessTokensRepo.getByTokenHash(tokenHash)
    if (!record) {
      return { success: false, error: 'NOT_FOUND', message: 'This access link is invalid or has expired.' }
    }

    if (new Date(record.expiresAt) < new Date()) {
      return { success: false, error: 'EXPIRED', message: 'This access link has expired.' }
    }

    if (!record.order || record.order.status !== 'PAID') {
      return { success: false, error: 'UNPAID', message: 'Payment for this order has not been completed.' }
    }

    if (record.entitlement && record.entitlement.status !== 'ACTIVE') {
      return { success: false, error: 'REVOKED', message: 'Access to this product is no longer active.' }
    }

    const hasEnt = await entitlementsRepo.has(record.order.customerId, record.productId, record.customerEmail)
    if (!hasEnt) {
      return { success: false, error: 'NO_ENTITLEMENT', message: 'No active entitlement found for this product.' }
    }

    // Mark used
    await productAccessTokensRepo.markUsed(record.id).catch(() => { })

    // Establish signed guest session cookie payload
    const sessionCookieValue = signPurpose(
      {
        email: record.customerEmail,
        customerId: record.order.customerId || null,
        productId: record.productId,
      },
      'guest_access',
      60 * 60 * 24 * 30
    )

    const creatorStore = record.product?.creator?.store
    const creatorUser = record.product?.creator
    const creatorSlug = creatorStore?.username || creatorStore?.slug || creatorUser?.username || 'creator'
    const productSlug = record.product?.slug || record.product?.id || 'product'
    const redirectUrl = `/${creatorSlug}/${productSlug}`

    return {
      success: true,
      sessionCookieValue,
      redirectUrl,
      customerEmail: record.customerEmail,
      product: record.product,
      order: record.order,
    }
  },

  createGuestSessionToken({ email, customerId = null, productId = null }) {
    if (!email) return null
    return signPurpose(
      {
        email: String(email).toLowerCase().trim(),
        customerId: customerId || null,
        productId: productId || null,
      },
      'guest_access',
      60 * 60 * 24 * 30 // 30 days
    )
  },

  verifyGuestSession(cookieValue) {
    if (!cookieValue) return null
    return verifyPurpose(cookieValue, 'guest_access')
  },
}

export function normalizeAccountHolderName(name) {
  if (!name) return ''
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isAccountHolderNameMatch(providedName, registeredName) {
  if (!providedName || !registeredName) return false
  const p = normalizeAccountHolderName(providedName)
  const r = normalizeAccountHolderName(registeredName)
  if (!p || !r) return false
  if (p === r) return true
  const pTokens = p.split(' ').filter(Boolean)
  const rTokens = r.split(' ').filter(Boolean)
  const matchCount = pTokens.filter(t => rTokens.includes(t)).length
  return matchCount >= Math.min(pTokens.length, 2)
}

// ---------------- Creator Payout Service ----------------
export const PAYOUT_PROCESSING_DAYS = 3

export function maskUpiId(upiId) {
  if (!upiId) return ''
  const trimmed = String(upiId).trim()
  const parts = trimmed.split('@')
  if (parts.length !== 2) return trimmed
  const [handle, bank] = parts
  if (handle.length <= 2) {
    return `${handle[0] || ''}••@${bank}`
  }
  if (handle.length <= 4) {
    return `${handle.slice(0, 2)}•••@${bank}`
  }
  return `${handle.slice(0, 3)}••••@${bank}`
}

export function maskBankAccount(accountNumber) {
  if (!accountNumber) return ''
  const clean = String(accountNumber).trim()
  const last4 = clean.slice(-4)
  return `•••• ${last4}`
}

export function maskIfsc(ifsc) {
  if (!ifsc) return ''
  const clean = String(ifsc).trim().toUpperCase()
  if (clean.length < 11) return clean
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`
}

export function maskPayPalEmail(email) {
  if (!email || typeof email !== 'string') return ''
  const trimmed = email.trim().toLowerCase()
  const parts = trimmed.split('@')
  if (parts.length !== 2) return trimmed
  const [user, domain] = parts
  if (user.length <= 2) {
    return `${user[0] || ''}••@${domain}`
  }
  if (user.length <= 4) {
    return `${user.slice(0, 2)}•••@${domain}`
  }
  return `${user.slice(0, 2)}••••${user.slice(-1)}@${domain}`
}

export const payoutService = {
  getGatewayConfig(country = 'IN') {
    const razorpayMode = getRazorpayMode()
    const cleanCountry = normalizeCountryCode(country) || 'IN'
    const isIndia = cleanCountry === 'IN'
    return {
      razorpayMode,
      razorpayIsLive: razorpayMode === 'live',
      currency: isIndia ? 'INR' : 'USD',
      country: cleanCountry,
      processingDays: PAYOUT_PROCESSING_DAYS,
    }
  },

  async getStatus(creatorId) {
    const profile = await payoutProfilesRepo.getByCreator(creatorId)
    const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
    const creatorProfile = await profilesRepo.getByCreator(creatorId).catch(() => null)

    // Creator's saved country from account/profile record - authoritative source
    const rawCountry = creatorUser?.country || creatorProfile?.country || 'IN'
    const country = normalizeCountryCode(rawCountry) || 'IN'
    const countryName = getCountryName(country) || country
    const isIndia = country === 'IN'

    // Stored payout method check
    const rawStoredMethod = String(profile?.payoutMethod || '').toUpperCase()
    const isStoredPayPal = rawStoredMethod === 'PAYPAL' || (!profile?.payoutMethod && !isIndia && Boolean(profile?.paypalEmail))
    const isStoredUpi = !isStoredPayPal && (rawStoredMethod === 'UPI' || profile?.businessType === 'UPI' || profile?.provider === 'MANUAL_UPI' || (profile?.upiId && !profile?.accountNumber) || (!profile?.paypalEmail && profile?.razorpayAccountId && String(profile.razorpayAccountId).includes('@')))
    const isStoredBank = !isStoredPayPal && !isStoredUpi && (rawStoredMethod === 'ACCOUNT' || rawStoredMethod === 'BANK_ACCOUNT' || Boolean(profile?.accountNumber || profile?.bankName))

    // Check if stored method matches the creator's registered country
    let methodMismatch = false
    let currentMethod = ''

    if (isIndia) {
      if (isStoredPayPal) {
        // Creator from India has PayPal stored - mismatch
        methodMismatch = true
        currentMethod = 'BANK_ACCOUNT'
      } else {
        currentMethod = isStoredUpi ? 'UPI' : (profile?.payoutMethod === 'ACCOUNT' ? 'ACCOUNT' : 'BANK_ACCOUNT')
      }
    } else {
      // Creator outside India
      if (isStoredUpi || isStoredBank) {
        // Non-Indian creator has Indian bank/UPI stored - mismatch
        methodMismatch = true
        currentMethod = 'PAYPAL'
      } else {
        currentMethod = 'PAYPAL'
      }
    }

    const isUpi = currentMethod === 'UPI'
    const isPayPal = currentMethod === 'PAYPAL'
    const payoutMethod = isPayPal ? 'PAYPAL' : (isUpi ? 'UPI' : (profile?.payoutMethod === 'ACCOUNT' ? 'ACCOUNT' : 'BANK_ACCOUNT'))

    let hasDetails = false
    if (!methodMismatch) {
      if (isPayPal) {
        hasDetails = Boolean(profile?.paypalEmail && String(profile.paypalEmail).includes('@'))
      } else if (isUpi) {
        hasDetails = !!(profile?.upiId || (profile?.razorpayAccountId && String(profile.razorpayAccountId).includes('@')))
      } else {
        hasDetails = !!(profile?.accountHolderName && profile?.bankName && (profile?.accountNumber || profile?.bankLast4 || profile?.razorpayAccountId) && (profile?.ifsc || profile?.ifscCode))
      }
    }

    const rawAccountId = profile?.razorpayAccountId || ''
    const upiIdRaw = isUpi ? (profile?.upiId || (rawAccountId.includes('@') ? rawAccountId : '')) : (profile?.upiId || '')
    const upiIdMasked = (isUpi && upiIdRaw) ? maskUpiId(upiIdRaw) : ''

    const bankAccountRaw = (!isUpi && !isPayPal && !rawAccountId.includes('@')) ? (profile?.accountNumber || rawAccountId) : (profile?.accountNumber || '')
    const bankLast4 = (!isUpi && !isPayPal) ? (profile?.bankLast4 || (bankAccountRaw ? bankAccountRaw.slice(-4) : '')) : ''
    const bankAccountMasked = bankLast4 ? `•••• ${bankLast4}` : ''
    const ifsc = (!isUpi && !isPayPal) ? (profile?.ifsc || profile?.ifscCode || '') : ''
    const bankIfscMasked = ifsc ? maskIfsc(ifsc) : ''
    const bankName = (!isUpi && !isPayPal) ? (profile?.bankName || '') : ''
    const accountHolderName = profile?.accountHolderName || profile?.legalName || ''

    const rawPayPalEmail = profile?.paypalEmail || ''
    const paypalEmailMasked = rawPayPalEmail ? maskPayPalEmail(rawPayPalEmail) : ''

    const payoutSchedule = profile?.payoutSchedule === 'monthly' ? 'monthly' : 'weekly'
    const minimumPayoutThreshold = Number(profile?.minimumPayoutThreshold || (isIndia ? 100 : 50))
    const isPayoutPaused = Boolean(profile?.isPayoutPaused)

    // Calculate real earnings & eligibility
    const summary = await earningsLedgerRepo.getSummary(creatorId).catch(() => ({ availableEarnings: 0 }))
    const availableEarnings = Number(summary?.availableEarnings || 0)

    let currentStatus = 'NOT_CONFIGURED'
    if (methodMismatch) {
      currentStatus = 'ACTION_REQUIRED'
    } else if (hasDetails) {
      if (profile?.status === 'ACTIVE' || profile?.status === 'VERIFIED') {
        currentStatus = profile.status === 'VERIFIED' ? 'VERIFIED' : 'ACTIVE'
      } else if (profile?.status === 'ACTION_REQUIRED' || profile?.status === 'FAILED') {
        currentStatus = profile.status
      } else {
        currentStatus = 'PENDING'
      }
    }

    const isVerifiedOrActive = currentStatus === 'ACTIVE' || currentStatus === 'VERIFIED'
    const isEligible = !methodMismatch && isVerifiedOrActive && !isPayoutPaused && availableEarnings >= minimumPayoutThreshold

    let eligibilityReason = 'Your payout account has been verified and is ready for payouts.'
    const curSymbol = isIndia ? '₹' : '$'

    if (methodMismatch) {
      eligibilityReason = isIndia
        ? 'Your registered country is India. Please update your payout method to Bank Account or UPI.'
        : `Your registered country is ${countryName}. International creators must use PayPal for payouts.`
    } else if (!hasDetails || currentStatus === 'NOT_CONFIGURED') {
      eligibilityReason = 'Setup payout method to receive transfers'
    } else if (currentStatus === 'PENDING') {
      eligibilityReason = isPayPal
        ? 'PayPal account pending verification. Payouts will be processed once verified.'
        : 'Verification usually completes within 12–24 hours.'
    } else if (isPayoutPaused) {
      eligibilityReason = 'Payouts are currently paused by creator'
    } else if (availableEarnings < minimumPayoutThreshold) {
      eligibilityReason = `Available balance (${curSymbol}${availableEarnings}) is below minimum threshold (${curSymbol}${minimumPayoutThreshold})`
    }

    return {
      status: currentStatus,
      onboardingStatus: currentStatus,
      verificationStatus: isVerifiedOrActive ? 'VERIFIED' : (currentStatus === 'PENDING' ? 'PENDING' : (methodMismatch ? 'ACTION_REQUIRED' : 'NOT_APPLICABLE')),
      verificationMessage: methodMismatch
        ? (isIndia ? 'Action required: Please update your payout method to Bank Account or UPI.' : `Action required: Please configure your PayPal ID for ${countryName}.`)
        : (currentStatus === 'PENDING'
          ? (isPayPal ? 'PayPal account pending verification.' : 'Verification usually completes within 12–24 hours.')
          : (isVerifiedOrActive ? 'Your payout account has been verified and is ready for payouts.' : 'No payout account configured.')),
      payoutMethod,
      payoutSchedule,
      minimumPayoutThreshold,
      isPayoutPaused,
      availableEarnings,
      currency: isIndia ? 'INR' : 'USD',
      country,
      countryName,
      isIndia,
      allowedPayoutMethods: isIndia ? ['BANK_ACCOUNT', 'UPI'] : ['PAYPAL'],
      methodMismatch,
      isEligibleForPayout: isEligible,
      eligibilityReason,
      platformFee: 0,
      accountHolderName,
      bankName,
      upiId: isUpi ? (upiIdMasked || upiIdRaw) : '',
      upiIdMasked,
      upiIdRaw,
      bankAccount: bankAccountMasked,
      bankAccountMasked,
      bankAccountRaw,
      bankLast4,
      ifsc,
      bankIfscMasked,
      paypalEmail: isPayPal ? rawPayPalEmail : '',
      paypalEmailMasked: isPayPal ? paypalEmailMasked : '',
      processingDays: PAYOUT_PROCESSING_DAYS,
      canSellPaidProducts: true,
      payoutsEnabled: isEligible,
      updatedAt: profile?.updatedAt || profile?.createdAt || null,
    }
  },

  async canReceivePayout(creatorId) {
    const status = await this.getStatus(creatorId)
    return status.status === 'ACTIVE' || status.status === 'VERIFIED'
  },

  async onboard(creatorId, body = {}) {
    const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
    const creatorProfile = await profilesRepo.getByCreator(creatorId).catch(() => null)

    // Authoritative country derived strictly from database record - client cannot spoof
    const rawCountry = creatorUser?.country || creatorProfile?.country || 'IN'
    const country = normalizeCountryCode(rawCountry) || 'IN'
    const countryName = getCountryName(country) || country
    const isIndia = country === 'IN'

    const submittedMethod = String(body.payoutMethod || '').toUpperCase()

    // Enforce country-specific payout method rules
    if (isIndia) {
      if (submittedMethod === 'PAYPAL') {
        throw httpError(400, 'PayPal is not available for creators in India. Please choose Bank Account or UPI.')
      }
    } else {
      if (submittedMethod === 'ACCOUNT' || submittedMethod === 'BANK_ACCOUNT' || submittedMethod === 'BANK' || submittedMethod === 'UPI') {
        throw httpError(400, `Bank Account and UPI are not available for creators in ${countryName}. Creators outside India must use PayPal.`)
      }
    }

    const payoutSchedule = String(body.payoutSchedule || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly'
    const numThreshold = body.minimumPayoutThreshold !== undefined ? Number(body.minimumPayoutThreshold) : (isIndia ? 100 : 50)
    if (isNaN(numThreshold) || numThreshold <= 0) {
      throw httpError(400, 'Minimum payout threshold must be a positive amount greater than zero.')
    }
    const minimumPayoutThreshold = numThreshold
    const isPayoutPaused = Boolean(body.isPayoutPaused)

    let payoutMethod = ''
    let accountHolderName = ''
    let bankName = ''
    let accountNumber = ''
    let ifscCode = ''
    let bankLast4 = ''
    let bankIfscMasked = ''
    let upiId = ''
    let upiIdMasked = ''
    let paypalEmail = ''
    let paypalEmailMasked = ''

    if (!isIndia || submittedMethod === 'PAYPAL') {
      payoutMethod = 'PAYPAL'
      paypalEmail = String(body.paypalEmail || body.email || '').trim().toLowerCase()
      if (!paypalEmail) {
        throw httpError(400, 'PayPal email is required.')
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(paypalEmail)) {
        throw httpError(400, 'Please enter a valid PayPal email address.')
      }
      paypalEmailMasked = maskPayPalEmail(paypalEmail)
    } else {
      const isAccount = (submittedMethod === 'ACCOUNT' || submittedMethod === 'BANK_ACCOUNT' || submittedMethod === 'BANK' || !submittedMethod)
      payoutMethod = isAccount ? 'BANK_ACCOUNT' : 'UPI'

      if (isAccount) {
        accountHolderName = String(body.accountHolderName || body.legalName || '').trim()
        bankName = String(body.bankName || '').trim()
        accountNumber = String(body.accountNumber || '').trim()
        const confirmAccountNumber = String(body.confirmAccountNumber || '').trim()
        ifscCode = String(body.ifscCode || body.ifsc || '').trim().toUpperCase()

        if (!accountHolderName || accountHolderName.length < 2) {
          throw httpError(400, 'Account holder name is required.')
        }
        if (!bankName || bankName.length < 2) {
          throw httpError(400, 'Bank name is required.')
        }
        if (!accountNumber) {
          throw httpError(400, 'Bank account number is required.')
        }
        if (!/^\d{8,20}$/.test(accountNumber)) {
          throw httpError(400, 'Bank account number must be 8–20 numeric digits.')
        }
        if (confirmAccountNumber && confirmAccountNumber !== accountNumber) {
          throw httpError(400, "Account numbers don't match.")
        }
        if (!ifscCode) {
          throw httpError(400, 'IFSC code is required.')
        }
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
        if (!ifscRegex.test(ifscCode)) {
          throw httpError(400, 'Invalid IFSC code format (e.g. SBIN0001234).')
        }

        bankLast4 = accountNumber.slice(-4)
        bankIfscMasked = maskIfsc(ifscCode)
      } else {
        // UPI
        upiId = String(body.upiId || '').trim()
        if (!upiId || !upiId.includes('@')) {
          throw httpError(400, 'Enter a valid UPI ID (e.g. name@bank).')
        }
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/
        if (!upiRegex.test(upiId)) {
          throw httpError(400, 'Enter a valid UPI ID format (e.g. yourname@okhdfcbank).')
        }
        upiIdMasked = maskUpiId(upiId)
        accountHolderName = String(body.accountHolderName || body.legalName || '').trim()
      }
    }

    const payload = {
      creatorId,
      payoutMethod,
      legalName: accountHolderName || (payoutMethod === 'PAYPAL' ? paypalEmail : undefined),
      accountHolderName: accountHolderName || (payoutMethod === 'PAYPAL' ? paypalEmail : undefined),
      bankName: payoutMethod === 'BANK_ACCOUNT' ? bankName : undefined,
      accountNumber: payoutMethod === 'BANK_ACCOUNT' ? accountNumber : undefined,
      ifscCode: payoutMethod === 'BANK_ACCOUNT' ? ifscCode : undefined,
      ifsc: payoutMethod === 'BANK_ACCOUNT' ? ifscCode : undefined,
      bankLast4: payoutMethod === 'BANK_ACCOUNT' ? bankLast4 : undefined,
      bankIfscMasked: payoutMethod === 'BANK_ACCOUNT' ? bankIfscMasked : undefined,
      upiId: payoutMethod === 'UPI' ? upiId : undefined,
      paypalEmail: payoutMethod === 'PAYPAL' ? paypalEmail : undefined,
      paypalId: payoutMethod === 'PAYPAL' ? paypalEmail : undefined,
      businessType: payoutMethod,
      provider: payoutMethod === 'PAYPAL' ? 'MANUAL_PAYPAL' : (payoutMethod === 'UPI' ? 'MANUAL_UPI' : 'MANUAL_BANK'),
      phone: String(body.phone || '').trim(),
      email: String(body.email || (payoutMethod === 'PAYPAL' ? paypalEmail : '')).trim(),
      payoutSchedule,
      minimumPayoutThreshold,
      isPayoutPaused,
      razorpayAccountId: payoutMethod === 'PAYPAL' ? paypalEmail : (payoutMethod === 'UPI' ? upiId : accountNumber),
      status: 'PENDING',
      onboardingStatus: 'PENDING',
      verificationStatus: 'PENDING',
      verificationMessage: payoutMethod === 'PAYPAL'
        ? 'PayPal account pending verification.'
        : 'Verification usually completes within 12–24 hours.',
      currentStep: 3,
      verificationStartedAt: new Date().toISOString(),
      verificationCompletedAt: null,
    }

    await payoutProfilesRepo.upsert(creatorId, payload)

    try {
      await payoutAuditRepo.logEvent({
        creatorId,
        event: 'PAYOUT_DETAILS_SAVED',
        metadata: {
          payoutMethod,
          payoutSchedule,
          minimumPayoutThreshold,
          isPayoutPaused,
          accountHolderName: payoutMethod === 'BANK_ACCOUNT' ? accountHolderName : undefined,
          bankName: payoutMethod === 'BANK_ACCOUNT' ? bankName : undefined,
          bankLast4: payoutMethod === 'BANK_ACCOUNT' ? bankLast4 : undefined,
          upiIdMasked: payoutMethod === 'UPI' ? upiIdMasked : undefined,
          paypalEmailMasked: payoutMethod === 'PAYPAL' ? paypalEmailMasked : undefined,
          country,
          status: 'PENDING',
        },
      })
    } catch { }

    return this.getStatus(creatorId)
  },

  async resumeOnboarding(creatorId) {
    return this.getStatus(creatorId)
  },

  async requestWithdrawal(creatorId, { amount }) {
    const status = await this.getStatus(creatorId)
    if (status.status !== 'ACTIVE' && status.status !== 'VERIFIED') {
      if (status.status === 'PENDING') {
        throw httpError(400, 'Your payout account is pending verification. Payouts will be available once verification completes (usually within 12–24 hours).')
      }
      throw httpError(400, 'Please set up and verify your payout account before requesting withdrawal.')
    }

    const summary = await earningsLedgerRepo.getSummary(creatorId)
    const available = Number(summary.availableEarnings || 0)
    if (available <= 0) {
      throw httpError(400, 'No available earnings eligible for payout.')
    }

    const withdrawAmount = amount ? Math.min(Number(amount), available) : available
    const isPayPal = status.payoutMethod === 'PAYPAL'
    const curSymbol = status.country === 'IN' ? '₹' : '$'
    const curCode = status.country === 'IN' ? 'INR' : 'USD'

    // Log withdrawal request for manual/admin processing
    try {
      await payoutAuditRepo.logEvent({
        creatorId,
        event: 'PAYOUT_WITHDRAWAL_REQUESTED',
        metadata: {
          amount: withdrawAmount,
          currency: curCode,
          payoutMethod: status.payoutMethod,
          accountHolderName: status.accountHolderName,
          details: isPayPal ? status.paypalEmailMasked : (status.payoutMethod === 'UPI' ? status.upiIdMasked : `${status.bankAccount} (${status.bankIfscMasked})`),
        }
      })
    } catch (e) { }

    return {
      success: true,
      amount: withdrawAmount,
      currency: curCode,
      message: `Payout request of ${curSymbol}${withdrawAmount.toLocaleString(status.country === 'IN' ? 'en-IN' : 'en-US')} submitted! Our team will process it within ${PAYOUT_PROCESSING_DAYS} business days.`,
    }
  },

  async getAdminPayoutAccounts() {
    const profiles = await payoutProfilesRepo.listAll()
    const users = await usersRepo.list()
    const stores = await storesRepo.list()

    const usersMap = new Map((users || []).map(u => [u.id, u]))
    const storesMap = new Map((stores || []).map(s => [s.creatorId, s]))

    const results = []
    for (const p of profiles) {
      const u = usersMap.get(p.creatorId)
      const s = storesMap.get(p.creatorId)
      const isPayPal = p.payoutMethod === 'PAYPAL' || p.provider === 'MANUAL_PAYPAL' || !!p.paypalEmail
      const isUpi = !isPayPal && (p.provider === 'MANUAL_UPI' || p.businessType === 'UPI' || (p.razorpayAccountId && String(p.razorpayAccountId).includes('@')))
      const rawId = p.razorpayAccountId || ''

      let summary = { availableEarnings: 0, totalSales: 0, paidOut: 0 }
      try {
        summary = await earningsLedgerRepo.getSummary(p.creatorId)
      } catch { }

      results.push({
        id: p.id,
        creatorId: p.creatorId,
        creatorName: s?.storeName || s?.username || u?.email?.split('@')[0] || 'Creator',
        creatorEmail: u?.email || p.email || 'N/A',
        storeUsername: s?.username || '',
        payoutMethod: isPayPal ? 'PAYPAL' : (isUpi ? 'UPI' : 'BANK_ACCOUNT'),
        accountHolderName: p.accountHolderName || p.legalName || (isPayPal ? p.paypalEmail : 'N/A'),
        paypalEmailMasked: isPayPal && p.paypalEmail ? maskPayPalEmail(p.paypalEmail) : '',
        paypalEmailRaw: isPayPal ? (p.paypalEmail || '') : '',
        upiIdMasked: (isUpi && rawId.includes('@')) ? maskUpiId(rawId) : '',
        upiIdRaw: (isUpi && rawId.includes('@')) ? rawId : '',
        bankAccountMasked: p.bankLast4 ? `•••• ${p.bankLast4}` : (!rawId.includes('@') && rawId ? `•••• ${rawId.slice(-4)}` : ''),
        bankAccountRaw: (!rawId.includes('@') && rawId) ? rawId : '',
        ifsc: p.ifsc || '',
        bankIfscMasked: p.bankIfscMasked || (p.ifsc ? maskIfsc(p.ifsc) : ''),
        status: p.status || 'PENDING',
        availableBalance: Number(summary?.availableEarnings || 0),
        totalSales: Number(summary?.totalSales || 0),
        totalPaidOut: Number(summary?.paidOut || 0),
        updatedAt: p.updatedAt || p.createdAt,
      })
    }

    return results
  },

  async adminMarkAsPaid(creatorId, { amount, referenceId, notes }) {
    if (!creatorId) throw httpError(400, 'Creator ID is required.')
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      throw httpError(400, 'Please enter a valid payout amount greater than 0.')
    }

    const ref = String(referenceId || '').trim() || `UTR-${Date.now()}`
    const profile = await payoutProfilesRepo.getByCreator(creatorId)

    // Create a transfer record
    const transfer = await transfersRepo.create({
      creatorId,
      amount: numAmount,
      currency: 'INR',
      razorpayTransferId: ref,
      status: 'PROCESSED',
      notes: notes || 'Manual transfer processed by admin',
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    })

    // Log in audit logs
    await payoutAuditRepo.logEvent({
      creatorId,
      event: 'ADMIN_MANUAL_PAYOUT_PROCESSED',
      metadata: {
        amount: numAmount,
        referenceId: ref,
        notes: notes || '',
        payoutMethod: profile?.businessType || profile?.provider || 'MANUAL',
        timestamp: new Date().toISOString(),
      }
    })

    // Notify creator via email
    try {
      const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
      if (creatorUser?.email) {
        await emailService.sendPayoutStatusEmail({
          to: creatorUser.email,
          creatorName: profile?.accountHolderName || profile?.name || 'Creator',
          status: 'PROCESSED',
          amount: numAmount,
          currency: 'INR',
          payoutId: ref,
          note: notes || 'Manual transfer processed by admin',
        })
      }
    } catch (e) { console.error('[EmailService] Payout status email error:', e?.message || e) }

    return {
      success: true,
      transfer,
      message: `Successfully recorded payout of ₹${numAmount.toLocaleString('en-IN')} with reference ${ref}.`,
    }
  },

  async getDashboard(creatorId) {
    const summary = await earningsLedgerRepo.getSummary(creatorId)
    const status = await this.getStatus(creatorId)
    const ledger = await earningsLedgerRepo.listByCreator(creatorId, { limit: 20 })
    const transfers = await transfersRepo.listByCreator(creatorId)

    const ledgerList = Array.isArray(ledger) ? ledger : (ledger.items || [])

    return {
      overview: {
        totalSales: summary.totalSales,
        creatorEarnings: summary.netCreatorEarnings,
        pendingEarnings: summary.pendingEarnings,
        availableEarnings: summary.availableEarnings,
        paidOut: summary.paidOut,
        refunds: summary.totalRefunds,
        totalPlatformFees: summary.totalPlatformFees || 0,
      },
      status,
      ledger: ledgerList,
      recentTransactions: ledgerList.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productTitle: item.productTitle,
        customerEmail: item.customerEmail,
        type: item.type,
        amount: item.grossAmount,
        currency: item.currency || 'INR',
        platformFee: item.platformFee,
        creatorEarnings: item.netAmount,
        status: item.type === 'REFUND' ? 'REFUNDED' : 'PAID',
        payoutStatus: item.status,
        date: item.createdAt,
      })),
      payoutHistory: transfers.map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency || 'INR',
        status: t.status,
        transferId: t.razorpayTransferId,
        date: t.processedAt || t.createdAt,
      })),
    }
  },

  async createRefund(creatorId, { orderId, amount, reason }) {
    const order = await ordersRepo.getById(orderId)
    if (!order || order.creatorId !== creatorId) throw httpError(404, 'Order not found')
    if (order.status !== 'PAID') throw httpError(400, 'Only paid orders can be refunded')

    let refundId = `rfnd_${orderId}`
    if (order.dodoPaymentId || order.paymentProvider === 'dodo') {
      const dodoRes = await dodoProvider.createRefund({
        paymentId: order.dodoPaymentId,
        amount: amount || order.amount,
        reason,
      })
      refundId = dodoRes?.refund_id || dodoRes?.id || refundId
    } else if (order.razorpayPaymentId) {
      const provider = getPaymentProvider()
      const refundRes = await provider.createRefund(order.razorpayPaymentId, amount || order.amount)
      refundId = refundRes.id || refundId
    }

    await ordersRepo.markRefunded(orderId)
    await entitlementsRepo.revokeForOrder(orderId)
    await earningsService.recordRefund({ order, amount: amount || order.amount, reason })

    const refundDoc = await refundsRepo.create({
      id: uuidv4(),
      orderId,
      creatorId,
      razorpayRefundId: refundId,
      amount: amount || order.amount,
      status: 'PROCESSED',
      reason: reason || 'Customer request',
      createdAt: new Date(),
      processedAt: new Date(),
    })

    return { success: true, refund: refundDoc }
  },

  async getAdminPaymentsOverview() {
    const { supabaseAdmin } = require('./supabase')
    const { data: ordersData } = await supabaseAdmin.from('orders').select('*').eq('status', 'PAID')
    const { data: transfersData } = await supabaseAdmin.from('transfers').select('*')
    const { data: refundsData } = await supabaseAdmin.from('refunds').select('*')
    const orders = ordersData || []
    const transfers = transfersData || []
    const refunds = refundsData || []

    const totalGmv = orders.reduce((sum, o) => sum + Number(o.amount || 0), 0)
    const platformCommissionPercent = 0 // Configurable platform commission
    const platformRevenue = Math.round(totalGmv * (platformCommissionPercent / 100))
    const creatorPayouts = transfers.filter(t => t.status === 'PROCESSED').reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const totalRefunds = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0)

    return {
      stats: {
        totalGmv,
        platformCommissionPercent,
        platformRevenue,
        creatorPayouts,
        totalRefunds,
        totalOrdersCount: orders.length,
        totalTransfersCount: transfers.length,
      },
      transfers: transfers.slice(0, 20).map(t => ({
        id: t.id,
        creatorId: t.creatorId,
        orderId: t.orderId,
        amount: t.amount,
        status: t.status,
        transferId: t.razorpayTransferId,
        date: t.processedAt || t.createdAt,
      })),
    }
  },
}

// ---------------- Earnings Ledger Service ----------------
export const earningsService = {
  async recordSale({ order, product }) {
    // Preserve the creator's canonical configured price and currency
    const canonicalPrice = order.originalPrice !== undefined && order.originalPrice !== null
      ? Number(order.originalPrice)
      : Number(order.amount || 0)
    const canonicalCurrency = (order.originalCurrency || product?.currency || order.currency || 'USD').toUpperCase()

    const feePct = Number(process.env.PLATFORM_FEE_PERCENTAGE || 0)
    const platformFee = feePct > 0 ? Math.round(canonicalPrice * (feePct / 100) * 100) / 100 : 0
    const processingFee = 0
    const netAmount = canonicalPrice - platformFee - processingFee

    return earningsLedgerRepo.createEntry({
      id: uuidv4(),
      creatorId: order.creatorId,
      orderId: order.id,
      productId: order.productId,
      productTitle: product?.title || 'Product Sale',
      customerEmail: order.customerEmail || '',
      type: 'SALE',
      grossAmount: canonicalPrice,
      platformFee,
      processingFee,
      netAmount,
      status: 'AVAILABLE',
      currency: canonicalCurrency,
      paymentMode: order.paymentMode || 'TEST',
    })
  },

  async recordRefund({ order, amount, reason }) {
    const canonicalPrice = order.originalPrice !== undefined && order.originalPrice !== null
      ? Number(order.originalPrice)
      : Number(order.amount || 0)
    const canonicalCurrency = (order.originalCurrency || order.currency || 'USD').toUpperCase()
    const refAmt = amount !== undefined && amount !== null ? Number(amount) : canonicalPrice

    return earningsLedgerRepo.createEntry({
      id: uuidv4(),
      creatorId: order.creatorId,
      orderId: order.id,
      productId: order.productId,
      productTitle: `Refund: Order #${order.id.slice(0, 8)}`,
      customerEmail: order.customerEmail || '',
      type: 'REFUND',
      grossAmount: refAmt,
      refundAmount: refAmt,
      netAmount: -refAmt,
      status: 'AVAILABLE',
      currency: canonicalCurrency,
      paymentMode: order.paymentMode || 'TEST',
    })
  },

  async getSummary(creatorId) {
    return earningsLedgerRepo.getSummary(creatorId)
  },

  async getLedger(creatorId, options = {}) {
    return earningsLedgerRepo.listByCreator(creatorId, options)
  },
}

// Backward compatible alias
export const razorpayAccountService = {
  getStatus: (creatorId) => payoutService.getStatus(creatorId),
  connectAccount: (creatorId) => payoutService.onboard(creatorId, { legalName: 'Creator Account', accountNumber: '000000004521', ifscCode: 'SBIN000123' }),
}

// ---------------- Video Provider Abstraction ----------------
export class VideoProvider {
  static getProvider(videoUrl) {
    if (!videoUrl || typeof videoUrl !== 'string') return 'DIRECT'
    const u = videoUrl.toLowerCase()
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YOUTUBE'
    if (u.includes('vimeo.com')) return 'VIMEO'
    return 'DIRECT'
  }

  static getPlaybackUrl(videoUrl) {
    if (!videoUrl || typeof videoUrl !== 'string') return ''
    const url = videoUrl.trim()
    const provider = this.getProvider(url)

    if (provider === 'YOUTUBE') {
      const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)
      if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}`
      }
    } else if (provider === 'VIMEO') {
      const match = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/)
      if (match && match[3]) {
        return `https://player.vimeo.com/video/${match[3]}`
      }
    }
    return sanitizeUrl(url)
  }
}

export function validateExternalUrl(url) {
  if (!url) return ''
  const trimmed = String(url).trim()
  if (!trimmed) return ''
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
    throw httpError(400, 'Unsafe URL protocol not allowed')
  }
  if (trimmed.startsWith('/')) {
    return trimmed
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw httpError(400, 'Only https:// or http:// URLs are allowed')
  }
  return sanitizeUrl(trimmed)
}

// ---------------- Course Service (Creator) ----------------
export const courseService = {
  async list(creatorId, options = {}) {
    return coursesRepo.list(creatorId, options)
  },
  async get(creatorId, id) {
    const course = await coursesRepo.getForCreator(id, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    const modules = await modulesRepo.listByCourse(course.id)
    const lessons = await lessonsRepo.listByCourse(course.id)
    const product = await productsRepo.getForCreator(course.productId, creatorId)
    return { course, modules, lessons, product }
  },
  async create(creatorId, data) {
    throw httpError(410, 'The Courses feature has been permanently retired. New courses cannot be created.')
  },

  async update(creatorId, id, data) {
    const existing = await coursesRepo.getForCreator(id, creatorId)
    if (!existing) throw httpError(404, 'Course not found')
    const patch = {}
    if (data.title !== undefined) patch.title = sanitizeText(data.title).slice(0, 120)
    if (data.shortDescription !== undefined) patch.shortDescription = sanitizeText(data.shortDescription)
    if (data.description !== undefined) patch.description = sanitizeHtml(data.description)
    if (data.thumbnail !== undefined) patch.thumbnail = sanitizeUrl(data.thumbnail)
    if (data.instructor !== undefined) patch.instructor = sanitizeText(data.instructor)
    if (data.difficulty !== undefined) patch.difficulty = sanitizeText(data.difficulty)
    if (data.duration !== undefined) patch.duration = sanitizeText(data.duration)

    const updated = await coursesRepo.update(id, creatorId, patch)
    if (existing.productId) {
      await productService.update(creatorId, existing.productId, {
        title: patch.title,
        shortDescription: patch.shortDescription,
        thumbnail: patch.thumbnail,
        price: data.price !== undefined ? data.price : undefined,
        currency: data.currency !== undefined ? data.currency : undefined,
      })
    }
    return updated
  },

  async publish(creatorId, id) {
    const course = await coursesRepo.getForCreator(id, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    if (!course.title || !course.title.trim()) throw httpError(400, 'Course title is required before publishing')
    const lessons = await lessonsRepo.listByCourse(id)
    if (!lessons.length) throw httpError(400, 'Add at least one lesson before publishing')
    const product = await productsRepo.getForCreator(course.productId, creatorId)
    if (!product || Number(product.price) < 0) throw httpError(400, 'Course must have a valid price (>= 0)')

    const updated = await coursesRepo.update(id, creatorId, { status: 'PUBLISHED', publishedAt: new Date() })
    if (course.productId) await productService.publish(creatorId, course.productId)
    return updated
  },

  async archive(creatorId, id) {
    const course = await coursesRepo.getForCreator(id, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    const updated = await coursesRepo.update(id, creatorId, { status: 'ARCHIVED' })
    if (course.productId) await productService.archive(creatorId, course.productId)
    return updated
  },

  async remove(creatorId, id) {
    const course = await coursesRepo.getForCreator(id, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    await coursesRepo.remove(id, creatorId)
    if (course.productId) await productService.remove(creatorId, course.productId)
    return { ok: true }
  },

  // Modules
  async addModule(creatorId, courseId, data) {
    await coursesRepo.getForCreator(courseId, creatorId)
    const existing = await modulesRepo.listByCourse(courseId)
    const mod = {
      id: uuidv4(),
      creatorId,
      courseId,
      title: sanitizeText(data.title || 'New Module'),
      description: sanitizeText(data.description || ''),
      position: existing.length + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return modulesRepo.create(mod)
  },
  async updateModule(creatorId, id, data) {
    await modulesRepo.getForCreator(id, creatorId)
    const patch = {}
    if (data.title !== undefined) patch.title = sanitizeText(data.title)
    if (data.description !== undefined) patch.description = sanitizeText(data.description)
    return modulesRepo.update(id, creatorId, patch)
  },
  async deleteModule(creatorId, id) {
    const mod = await modulesRepo.getForCreator(id, creatorId)
    if (!mod) throw httpError(404, 'Module not found')
    await modulesRepo.remove(id, creatorId)
    return { ok: true }
  },
  async reorderModules(creatorId, courseId, moduleIds) {
    await coursesRepo.getForCreator(courseId, creatorId)
    return modulesRepo.updatePositions(courseId, creatorId, moduleIds)
  },

  // Lessons
  async addLesson(creatorId, moduleId, data) {
    const mod = await modulesRepo.getForCreator(moduleId, creatorId)
    if (!mod) throw httpError(404, 'Module not found')
    const existing = await lessonsRepo.listByModule(moduleId)

    let type = ['VIDEO', 'TEXT', 'PDF', 'LINK', 'EXTERNAL_RESOURCE'].includes(data.contentType) ? data.contentType : 'VIDEO'
    if (type === 'LINK') type = 'EXTERNAL_RESOURCE'

    let videoUrl = data.videoUrl ? sanitizeUrl(data.videoUrl) : ''
    let resourceUrl = data.resourceUrl ? validateExternalUrl(data.resourceUrl) : ''

    const lesson = {
      id: uuidv4(),
      creatorId,
      courseId: mod.courseId,
      moduleId,
      title: sanitizeText(data.title || 'New Lesson'),
      description: sanitizeText(data.description || ''),
      contentType: type,
      content: sanitizeHtml(data.content || ''),
      videoUrl,
      videoProvider: VideoProvider.getProvider(videoUrl),
      resourceUrl,
      pdfFileId: data.pdfFileId || null,
      pdfFileName: data.pdfFileName || null,
      pdfFileSize: data.pdfFileSize || null,
      duration: sanitizeText(data.duration || ''),
      position: existing.length + 1,
      isPreview: !!data.isPreview,
      status: 'PUBLISHED',
      dripType: ['IMMEDIATE', 'DAYS_AFTER_PURCHASE', 'SPECIFIC_DATE'].includes(data.dripType) ? data.dripType : 'IMMEDIATE',
      dripDays: Number(data.dripDays || 0),
      dripDate: data.dripDate ? new Date(data.dripDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return lessonsRepo.create(lesson)
  },
  async updateLesson(creatorId, id, data) {
    const existing = await lessonsRepo.getForCreator(id, creatorId)
    if (!existing) throw httpError(404, 'Lesson not found')
    const patch = {}
    if (data.title !== undefined) patch.title = sanitizeText(data.title)
    if (data.description !== undefined) patch.description = sanitizeText(data.description)
    if (data.contentType !== undefined) {
      let type = data.contentType
      if (type === 'LINK') type = 'EXTERNAL_RESOURCE'
      patch.contentType = type
    }
    if (data.content !== undefined) patch.content = sanitizeHtml(data.content)
    if (data.videoUrl !== undefined) {
      patch.videoUrl = sanitizeUrl(data.videoUrl)
      patch.videoProvider = VideoProvider.getProvider(data.videoUrl)
    }
    if (data.resourceUrl !== undefined) patch.resourceUrl = validateExternalUrl(data.resourceUrl)
    if (data.pdfFileId !== undefined) patch.pdfFileId = data.pdfFileId
    if (data.pdfFileName !== undefined) patch.pdfFileName = data.pdfFileName
    if (data.pdfFileSize !== undefined) patch.pdfFileSize = data.pdfFileSize
    if (data.duration !== undefined) patch.duration = sanitizeText(data.duration)
    if (data.isPreview !== undefined) patch.isPreview = !!data.isPreview
    if (data.status !== undefined) patch.status = data.status
    if (data.dripType !== undefined) patch.dripType = data.dripType
    if (data.dripDays !== undefined) patch.dripDays = Number(data.dripDays)
    if (data.dripDate !== undefined) patch.dripDate = data.dripDate ? new Date(data.dripDate) : null
    return lessonsRepo.update(id, creatorId, patch)
  },
  async attachLessonPdf(creatorId, id, { fileId, fileName, fileSize, fileMime }) {
    const lesson = await lessonsRepo.getForCreator(id, creatorId)
    if (!lesson) throw httpError(404, 'Lesson not found')
    return lessonsRepo.update(id, creatorId, {
      contentType: 'PDF',
      pdfFileId: fileId,
      pdfFileName: fileName,
      pdfFileSize: fileSize,
      pdfFileMime: fileMime || 'application/pdf',
      resourceUrl: `/api/learning/courses/${lesson.courseId}/lessons/${id}/pdf`,
    })
  },
  async deleteLesson(creatorId, id) {
    const lesson = await lessonsRepo.getForCreator(id, creatorId)
    if (!lesson) throw httpError(404, 'Lesson not found')
    await lessonsRepo.remove(id, creatorId)
    return { ok: true }
  },
  async reorderLessons(creatorId, moduleId, lessonIds) {
    const mod = await modulesRepo.getForCreator(moduleId, creatorId)
    if (!mod) throw httpError(404, 'Module not found')
    return lessonsRepo.updatePositions(moduleId, creatorId, lessonIds)
  },
  async getStudents(creatorId, courseId) {
    const course = await coursesRepo.getForCreator(courseId, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    const orders = await ordersRepo.list(creatorId)
    const paidOrders = orders.filter((o) => o.productId === course.productId && o.status === 'PAID')
    const customers = await customersRepo.list(creatorId)
    const lessons = await lessonsRepo.listByCourse(courseId)
    const publishedLessons = lessons.filter((l) => l.status === 'PUBLISHED')

    const studentList = []
    for (const order of paidOrders) {
      const cust = customers.find((c) => c.id === order.customerId || c.email === order.customerEmail)
      if (cust) {
        const progressList = await courseProgressRepo.listByCourse(cust.id, courseId)
        const completedCount = progressList.filter((p) => p.completed).length
        const total = publishedLessons.length
        const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0
        studentList.push({
          id: cust.id,
          name: cust.name || cust.email.split('@')[0],
          email: cust.email,
          purchasedAt: order.paidAt || order.createdAt,
          amountPaid: order.amount,
          currency: order.currency,
          completedLessons: completedCount,
          totalLessons: total,
          progressPercentage: progressPct,
          isCompleted: total > 0 && completedCount >= total,
        })
      }
    }
    return studentList
  },
  async getAnalytics(creatorId, courseId) {
    const course = await coursesRepo.getForCreator(courseId, creatorId)
    if (!course) throw httpError(404, 'Course not found')
    const students = await this.getStudents(creatorId, courseId)
    const totalSales = students.length
    const revenue = students.reduce((acc, s) => acc + Number(s.amountPaid || 0), 0)
    const completedCount = students.filter((s) => s.isCompleted).length
    const completionRate = totalSales > 0 ? Math.round((completedCount / totalSales) * 100) : 0
    const avgProgress = totalSales > 0 ? Math.round(students.reduce((acc, s) => acc + s.progressPercentage, 0) / totalSales) : 0
    return {
      courseId,
      totalSales,
      revenue,
      totalStudents: totalSales,
      completionRate,
      averageProgress: avgProgress,
    }
  },
}

// ---------------- Public Course Service ----------------
export const publicCourseService = {
  async getCourseBySlug(username, slug) {
    const store = await storesRepo.getByUsername(username)
    if (!store || !store.published) return null
    const course = await coursesRepo.getBySlug(store.creatorId, slug)
    if (!course || course.status !== 'PUBLISHED') return null
    const product = await productsRepo.getById(course.productId)
    const profile = await profilesRepo.getByCreator(store.creatorId)
    const modules = await modulesRepo.listByCourse(course.id)
    const lessons = await lessonsRepo.listByCourse(course.id)

    const publicModules = modules.map((m) => {
      const modLessons = lessons.filter((l) => l.moduleId === m.id && l.status === 'PUBLISHED').map((l) => ({
        id: l.id,
        title: l.title,
        duration: l.duration,
        isPreview: l.isPreview,
        contentType: l.contentType,
      }))
      return { id: m.id, title: m.title, description: m.description, lessons: modLessons }
    })

    return {
      course: {
        id: course.id,
        productId: course.productId,
        title: course.title,
        slug: course.slug,
        description: course.description,
        shortDescription: course.shortDescription,
        thumbnail: course.thumbnail,
        instructor: course.instructor,
        difficulty: course.difficulty,
        duration: course.duration,
        totalModules: modules.length,
        totalLessons: lessons.filter((l) => l.status === 'PUBLISHED').length,
      },
      product: product ? { id: product.id, price: product.price, currency: product.currency } : null,
      creator: profile ? { name: profile.name, avatarUrl: profile.avatarUrl, username: store.username } : { username: store.username },
      curriculum: publicModules,
    }
  },
}

// ---------------- Learning Service ----------------
export const learningService = {
  async verifyCourseAccess(userOrCustomerEmail, courseId) {
    const course = await coursesRepo.getById(courseId)
    if (!course) throw httpError(404, 'Course not found')
    const product = await productsRepo.getById(course.productId)
    if (!product) throw httpError(404, 'Linked product not found')

    if (Number(product.price) === 0) return { course, product, hasAccess: true, customerId: userOrCustomerEmail }

    // 1. Check if user is the creator of the course
    const creatorUser = await usersRepo.getById(course.creatorId)
    if (creatorUser && creatorUser.email.toLowerCase() === String(userOrCustomerEmail).toLowerCase()) {
      return { course, product, customerId: course.creatorId, hasAccess: true }
    }

    // 2. Check if customer exists in tenant database
    let cust = (await customersRepo.list(course.creatorId)).find((c) => c.email.toLowerCase() === String(userOrCustomerEmail).toLowerCase())

    // 3. Fallback: check if paid order exists for this email & product, and auto-grant entitlement if needed
    if (!cust) {
      const orders = await ordersRepo.list(course.creatorId)
      const paidOrder = orders.find(
        (o) => o.customerEmail && o.customerEmail.toLowerCase() === String(userOrCustomerEmail).toLowerCase() && o.productId === course.productId && o.status === 'PAID'
      )
      if (paidOrder) {
        cust = await customersRepo.upsert(course.creatorId, userOrCustomerEmail, '')
        await entitlementsRepo.createForOrder({
          id: uuidv4(), customerId: cust.id, creatorId: course.creatorId,
          productId: course.productId, orderId: paidOrder.id, source: 'PURCHASE', status: 'ACTIVE',
          startsAt: new Date(), expiresAt: null, createdAt: new Date(),
        })
      }
    }

    if (!cust) return { course, product, hasAccess: false }

    const hasEnt = await entitlementsRepo.has(cust.id, course.productId)
    return { course, product, customerId: cust.id, hasAccess: hasEnt || Number(product.price) === 0 }
  },

  async getCoursePlayer(userEmail, courseId) {
    const { course, product, customerId, hasAccess } = await this.verifyCourseAccess(userEmail, courseId)
    if (!hasAccess) throw httpError(403, 'Course access required. Please purchase this course.')

    const modules = await modulesRepo.listByCourse(courseId)
    const lessons = await lessonsRepo.listByCourse(courseId)
    const progressList = await courseProgressRepo.listByCourse(customerId, courseId)

    const completedLessonIds = new Set(progressList.filter((p) => p.completed).map((p) => p.lessonId))

    let entitlementStartDate = new Date()
    const ent = await entitlementsRepo.getByOrder(courseId)
    if (ent?.startsAt) entitlementStartDate = new Date(ent.startsAt)

    const now = new Date()

    const playerModules = modules.map((m) => {
      const modLessons = lessons.filter((l) => l.moduleId === m.id && l.status === 'PUBLISHED').map((l) => {
        let isLocked = false
        if (l.dripType === 'DAYS_AFTER_PURCHASE' && l.dripDays > 0) {
          const unlockDate = new Date(entitlementStartDate.getTime() + l.dripDays * 24 * 60 * 60 * 1000)
          if (now < unlockDate) isLocked = true
        } else if (l.dripType === 'SPECIFIC_DATE' && l.dripDate) {
          if (now < new Date(l.dripDate)) isLocked = true
        }

        return {
          id: l.id,
          title: l.title,
          description: l.description,
          contentType: l.contentType,
          duration: l.duration,
          isPreview: l.isPreview,
          completed: completedLessonIds.has(l.id),
          isLocked,
        }
      })
      return { id: m.id, title: m.title, lessons: modLessons }
    })

    const publishedLessons = lessons.filter((l) => l.status === 'PUBLISHED')
    const percentComplete = publishedLessons.length > 0 ? Math.round((completedLessonIds.size / publishedLessons.length) * 100) : 0

    return {
      course: { id: course.id, title: course.title, thumbnail: course.thumbnail },
      curriculum: playerModules,
      progress: {
        percentComplete,
        completedCount: completedLessonIds.size,
        totalCount: publishedLessons.length,
        isCompleted: percentComplete === 100,
      },
    }
  },

  async getLesson(userEmail, courseId, lessonId) {
    const { course, hasAccess } = await this.verifyCourseAccess(userEmail, courseId)
    const lesson = await lessonsRepo.getById(lessonId)
    if (!lesson || lesson.courseId !== courseId) throw httpError(404, 'Lesson not found')

    if (!hasAccess && !lesson.isPreview) {
      throw httpError(403, 'Course access required to view this lesson')
    }

    return {
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description,
        contentType: lesson.contentType,
        content: lesson.content,
        videoUrl: VideoProvider.getPlaybackUrl(lesson.videoUrl),
        videoProvider: lesson.videoProvider || VideoProvider.getProvider(lesson.videoUrl),
        resourceUrl: lesson.resourceUrl,
        pdfFileId: lesson.pdfFileId,
        pdfFileName: lesson.pdfFileName,
        pdfFileSize: lesson.pdfFileSize,
        duration: lesson.duration,
        isPreview: lesson.isPreview,
      },
    }
  },

  async trackProgress(userEmail, courseId, lessonId, completed = true, lastPosition = 0) {
    const { course, customerId, hasAccess } = await this.verifyCourseAccess(userEmail, courseId)
    if (!hasAccess) throw httpError(403, 'Course access required')

    const progress = await courseProgressRepo.upsert({
      customerId,
      creatorId: course.creatorId,
      courseId,
      lessonId,
      completed: !!completed,
      lastPosition,
      completedAt: completed ? new Date() : null,
    })

    const lessons = await lessonsRepo.listByCourse(courseId)
    const published = lessons.filter((l) => l.status === 'PUBLISHED')
    const allProgress = await courseProgressRepo.listByCourse(customerId, courseId)
    const completedSet = new Set(allProgress.filter((p) => p.completed).map((p) => p.lessonId))

    let cert = null
    if (published.length > 0 && completedSet.size >= published.length) {
      cert = await certificateService.issueCertificate(customerId, course.creatorId, courseId)
    }

    return { progress, isCourseCompleted: completedSet.size >= published.length, certificate: cert }
  },

  async getStudentCourses(userEmail) {
    const { supabaseAdmin } = require('./supabase')
    const email = String(userEmail).toLowerCase()
    const { data: customers } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customerIds = (customers || []).map((c) => c.id)
    if (!customerIds.length) return []

    const { data: ents } = await supabaseAdmin.from('entitlements').select('*').in('customerId', customerIds).eq('status', 'ACTIVE')
    const productIds = (ents || []).map((e) => e.productId)

    const { data: coursesData } = await supabaseAdmin.from('courses').select('*').in('productId', productIds)
    const courses = coursesData || []
    const progressDocs = customerIds.length > 0 ? await courseProgressRepo.getProgress(customerIds[0], courses[0]?.id) : []

    return courses.map((c) => {
      const courseProg = progressDocs.filter((p) => p.courseId === c.id && p.completed)
      return {
        id: c.id,
        title: c.title,
        thumbnail: c.thumbnail,
        description: c.shortDescription,
        completedLessons: courseProg.length,
      }
    })
  },
}

// ---------------- Certificate Service ----------------
export const certificateService = {
  async issueCertificate(customerId, creatorId, courseId) {
    const existing = await certificatesRepo.get(customerId, courseId)
    if (existing) return existing

    const course = await coursesRepo.getById(courseId)
    const profile = await profilesRepo.getByCreator(creatorId)
    const customer = await customersRepo.get(customerId, creatorId)

    const cert = {
      id: uuidv4(),
      certificateId: `CERT-${uuidv4().slice(0, 8).toUpperCase()}`,
      customerId,
      creatorId,
      courseId,
      studentName: customer?.name || customer?.email || 'Student',
      courseTitle: course?.title || 'Course',
      creatorName: profile?.name || 'Instructor',
      completedAt: new Date(),
      createdAt: new Date(),
    }
    return certificatesRepo.create(cert)
  },
  async getCertificate(certificateId) {
    const cert = await certificatesRepo.getById(certificateId)
    if (!cert) throw httpError(404, 'Certificate not found')
    return cert
  },
}



// ---------------- Analytics ----------------
export const analyticsService = {
  async track({ creatorId, productId = null, type, sessionId = null, metadata = {} }) {
    if (!creatorId || !type) return
    await analyticsRepo.track({ id: uuidv4(), creatorId, productId, type, sessionId, metadata, createdAt: new Date().toISOString() })
  },
  async overview(creatorId, days = 30, options = {}) {
    const isAllTime = days >= 365
    const now = Date.now()
    const until = options.to ? new Date(options.to) : null
    const since = options.from ? new Date(options.from) : (isAllTime ? new Date(0) : new Date(now - days * 24 * 60 * 60 * 1000))
    const prevSince = isAllTime ? null : new Date(since.getTime() - (now - since.getTime()))

    const [rawOrders, customers, rawProducts, storeViews, productViews, checkoutStarted] = await Promise.all([
      ordersRepo.list(creatorId).catch(() => []),
      customersRepo.list(creatorId).catch(() => []),
      productsRepo.list(creatorId).catch(() => []),
      options.productId ? Promise.resolve(0) : analyticsRepo.countByType(creatorId, 'store_view', since).catch(() => 0),
      analyticsRepo.countByType(creatorId, 'product_view', since).catch(() => 0),
      analyticsRepo.countByType(creatorId, 'checkout_started', since).catch(() => 0),
    ])

    let allOrders = rawOrders
    if (options.productId) {
      allOrders = allOrders.filter((o) => String(o.productId) === String(options.productId))
    }

    const paid = allOrders.filter((o) => o.status === 'PAID')
    const refunded = allOrders.filter((o) => o.status === 'REFUNDED')

    let products = rawProducts
    if (options.productId) {
      products = products.filter((p) => String(p.id) === String(options.productId))
    }

    // Period specific metrics
    const periodPaid = isAllTime ? paid : paid.filter((o) => {
      const dt = new Date(o.paidAt || o.createdAt)
      return dt >= since && (!until || dt <= until)
    })
    const periodRefunded = isAllTime ? refunded : refunded.filter((o) => {
      const dt = new Date(o.updatedAt || o.paidAt || o.createdAt)
      return dt >= since && (!until || dt <= until)
    })

    const periodPaidRevenue = periodPaid.reduce((s, o) => s + Number(o.amount || 0), 0)
    const periodRefundRevenue = periodRefunded.reduce((s, o) => s + Number(o.amount || 0), 0)
    const grossRevenue = periodPaidRevenue + periodRefundRevenue
    const refundsTotal = periodRefunded.reduce((s, o) => s + Number(o.refundAmount || o.amount || 0), 0)
    const netRevenue = Math.max(0, grossRevenue - refundsTotal)
    const periodOrdersCount = periodPaid.length

    // Previous equivalent period metrics for comparison
    const prevOrders = prevSince ? paid.filter((o) => {
      const dt = new Date(o.paidAt || o.createdAt)
      return dt >= prevSince && dt < since
    }) : []
    const prevRevenue = prevOrders.reduce((s, o) => s + Number(o.amount || 0), 0)

    // Earnings Trend calculation
    let trend = 'steady'
    let trendPercent = 0
    let headline = `Your earnings are steady over the last ${days} days`
    if (isAllTime) {
      headline = 'All-time earnings overview'
    } else if (prevRevenue > 0) {
      trendPercent = Math.round(((netRevenue - prevRevenue) / prevRevenue) * 100)
      if (trendPercent > 0) {
        trend = 'up'
        headline = `Your earnings are up ${trendPercent}% over the last ${days} days`
      } else if (trendPercent < 0) {
        trend = 'down'
        headline = `Your earnings are down ${Math.abs(trendPercent)}% over the last ${days} days`
      } else {
        trend = 'steady'
        headline = `Your earnings are steady over the last ${days} days`
      }
    } else if (netRevenue > 0) {
      trend = 'up'
      headline = `Your earnings are growing over the last ${days} days`
    }

    const comparisonText = isAllTime ? 'All-time performance' : `Compared to the previous ${days} days`
    const relevantViews = options.productId ? productViews : storeViews
    const conversion = relevantViews > 0 ? (periodOrdersCount / relevantViews) * 100 : 0
    const currency = paid[0]?.currency || products[0]?.currency || 'usd'

    // revenue by day (Net revenue by day)
    const byDay = {}
    const numDays = Math.min(days, 365)
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      byDay[d.toISOString().slice(0, 10)] = 0
    }
    periodPaid.forEach((o) => {
      const key = new Date(o.paidAt || o.createdAt).toISOString().slice(0, 10)
      if (key in byDay) byDay[key] += Number(o.amount || 0)
    })
    const revenueSeries = Object.entries(byDay).map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))

    // All events for traffic and product deep-dive
    const periodEvents = await analyticsRepo.listEvents(creatorId, { since, until: until || undefined }).catch(() => [])

    // Detailed Product Performance
    const productStats = products.map((p) => {
      const pIdStr = String(p.id)
      const pOrders = periodPaid.filter((o) => String(o.productId) === pIdStr)
      const pRefunds = periodRefunded.filter((o) => String(o.productId) === pIdStr)
      const unitsSold = pOrders.length
      const pGross = pOrders.reduce((s, o) => s + Number(o.amount || 0), 0) + pRefunds.reduce((s, o) => s + Number(o.amount || 0), 0)
      const pRefundTotal = pRefunds.reduce((s, o) => s + Number(o.refundAmount || o.amount || 0), 0)
      const pNet = Math.max(0, pGross - pRefundTotal)
      const pViews = periodEvents.filter((e) => e.type === 'product_view' && String(e.productId) === pIdStr).length
      const pConversion = pViews > 0 ? Math.round((unitsSold / pViews) * 1000) / 10 : (unitsSold > 0 ? 100 : 0)

      return {
        id: p.id,
        title: p.title,
        revenue: Math.round(pNet * 100) / 100,
        grossRevenue: Math.round(pGross * 100) / 100,
        refundsTotal: Math.round(pRefundTotal * 100) / 100,
        netRevenue: Math.round(pNet * 100) / 100,
        unitsSold,
        views: pViews,
        conversion: pConversion,
        thumbnail: p.thumbnail,
      }
    }).sort((a, b) => b.revenue - a.revenue)

    const topProducts = productStats.slice(0, 5)

    // Traffic Sources Breakdown
    const trafficSources = await analyticsRepo.getTrafficSources(creatorId, since).catch(() => [])

    const recentOrders = await Promise.all(periodPaid.slice(0, 8).map(async (o) => {
      const p = products.find((x) => x.id === o.productId)
      const c = customers.find((x) => x.id === o.customerId)
      return { id: o.id, amount: o.amount, currency: o.currency, productTitle: p?.title || 'Product', customerEmail: c?.email || '—', createdAt: o.paidAt || o.createdAt }
    }))

    const instagramMetrics = await automationEventsRepo.getMetricsForCreator(creatorId, since)

    return {
      currency,
      revenue: Math.round(netRevenue * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      totalRevenue: Math.round(netRevenue * 100) / 100,
      periodRevenue: Math.round(netRevenue * 100) / 100,
      prevRevenue: Math.round(prevRevenue * 100) / 100,
      refundsTotal: Math.round(refundsTotal * 100) / 100,
      refundCount: periodRefunded.length,
      orders: periodOrdersCount,
      totalOrders: allOrders.length,
      paidOrdersCount: periodOrdersCount,
      refundedOrdersCount: periodRefunded.length,
      customers: customers.length,
      storeViews,
      productViews,
      checkoutStarted,
      views: storeViews + productViews,
      clicks: checkoutStarted,
      trend,
      trendPercent,
      headline,
      comparisonText,
      conversion: Math.round(conversion * 10) / 10,
      revenueSeries,
      topProducts,
      productPerformance: productStats,
      trafficSources,
      recentOrders,
      instagram: instagramMetrics,
    }
  },
}

// ---------------- Coaching Service ----------------
export const coachingService = {
  async getConfig(creatorId, productId) {
    let config = await coachingRepo.getConfigByProductId(productId)
    if (!config) {
      config = {
        productId,
        creatorId: creatorId || null,
        durationMinutes: 30,
        timezone: 'Asia/Kolkata',
        sessionType: '1:1 Consultation',
        deliveryMethod: 'GOOGLE_MEET',
        meetingType: 'GOOGLE_MEET',
        meetingUrl: '',
        locationText: '',
        calendarProvider: 'GOOGLE_CALENDAR',
        calendarConnected: true,
        calendarId: 'primary',
        minimumNoticeMinutes: 1440, // 24 hours
        maximumAdvanceDays: 60, // 60 days
        bufferMinutes: 15,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        maxSessionsPerDay: null,
        allowRescheduling: true,
        reschedulingDeadlineNoticeHours: 24,
        allowCancellation: true,
        cancellationPolicyNoticeHours: 24,
        cancellationPolicy: 'Cancellations made less than 24 hours before the session are not eligible for a refund.',
        discountType: null,
        discountValue: 0,
        blockedDates: [],
        blockedTimeRanges: [],
        dateOverrides: [],
        customerFields: {
          phone: { enabled: true, required: false },
          instagram: { enabled: false, required: false },
          message: { enabled: true, required: false },
        },
        availability: [
          { dayOfWeek: 1, dayName: 'Monday', enabled: true, windows: [{ startTime: '09:00', endTime: '11:00' }, { startTime: '14:00', endTime: '17:00' }] },
          { dayOfWeek: 2, dayName: 'Tuesday', enabled: true, windows: [{ startTime: '09:00', endTime: '11:00' }] },
          { dayOfWeek: 3, dayName: 'Wednesday', enabled: false, windows: [{ startTime: '09:00', endTime: '17:00' }] },
          { dayOfWeek: 4, dayName: 'Thursday', enabled: false, windows: [{ startTime: '09:00', endTime: '17:00' }] },
          { dayOfWeek: 5, dayName: 'Friday', enabled: true, windows: [{ startTime: '11:00', endTime: '12:00' }] },
          { dayOfWeek: 6, dayName: 'Saturday', enabled: true, windows: [{ startTime: '11:00', endTime: '12:00' }] },
          { dayOfWeek: 0, dayName: 'Sunday', enabled: true, windows: [{ startTime: '10:00', endTime: '16:00' }] },
        ],
        questions: [
          { id: 'q1', question: 'What would you like help with?', type: 'LONG_TEXT', required: true, order: 1 }
        ]
      }
    }

    // Attach product title, description, price, coverImage if available
    if (productId) {
      try {
        const product = await productsRepo.getById(productId)
        if (product) {
          config.title = product.title || config.title || '1:1 Consultation'
          config.description = product.description || product.shortDescription || config.description || ''
          config.price = Number(product.price || 0)
          config.currency = product.currency || 'INR'
          config.coverImage = product.coverImage || product.thumbnail || ''
          config.thumbnail = product.thumbnail || product.coverImage || ''
          config.status = product.status || 'DRAFT'
          config.creatorId = config.creatorId || product.creatorId
        }
      } catch (e) { }
    }

    // Attach Linktree-style bookingTypes, customerFields, and preferences
    const cf = config.customerFields || {}
    const rawBookingTypes = (Array.isArray(config.bookingTypes) && config.bookingTypes.length > 0)
      ? config.bookingTypes
      : (Array.isArray(cf.bookingTypes) && cf.bookingTypes.length > 0 ? cf.bookingTypes : null)
    config.bookingTypes = rawBookingTypes || [
      {
        id: 'bt_default',
        name: config.title || 'Book 1:1 time with me',
        durationMinutes: config.durationMinutes || 30,
        price: Number(config.price || 0),
        currency: (config.currency || 'INR').toLowerCase(),
        isFree: Number(config.price || 0) === 0,
      }
    ]
    config.mailingListOptIn = Boolean(cf.mailingListOptIn)
    config.customTerms = cf.customTerms || ''
    config.supportEmail = cf.supportEmail || ''

    return config
  },

  async saveConfig(creatorId, productId, data) {
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'coaching')
    const product = await productsRepo.getForCreator(productId, creatorId)
    if (!product) throw httpError(404, 'Product not found')

    // 1. Process booking types (Linktree 4-step wizard core feature)
    let bookingTypes = []
    if (Array.isArray(data.bookingTypes) && data.bookingTypes.length > 0) {
      bookingTypes = data.bookingTypes.map((bt, idx) => {
        const isFree = Boolean(bt.isFree)
        let price = 0
        let currency = (bt.currency || data.currency || product.currency || 'INR').toUpperCase().trim()

        if (isFree) {
          price = 0
        } else {
          const rawPrice = bt.price !== undefined ? bt.price : bt.amount
          if (rawPrice === null || rawPrice === undefined || rawPrice === '' || isNaN(Number(rawPrice))) {
            throw httpError(400, `Invalid price for session type "${bt.name || idx + 1}". A valid numeric price is required.`)
          }
          price = Number(rawPrice)
          if (price <= 0) {
            throw httpError(400, `Price for paid session type "${bt.name || idx + 1}" must be greater than zero.`)
          }
          if (!isSupportedCurrency(currency)) {
            throw httpError(400, `Unsupported currency "${currency}" for session type "${bt.name || idx + 1}".`)
          }
          const minCheck = validateMinimumAmount(price, currency)
          if (!minCheck.valid) {
            throw httpError(400, minCheck.message)
          }
        }

        return {
          id: bt.id || `bt_${Date.now()}_${idx}`,
          name: String(bt.name || '1:1 Session').trim(),
          durationMinutes: Math.max(1, parseInt(bt.durationMinutes || 30, 10)),
          price: isFree ? 0 : price,
          currency: currency.toLowerCase(),
          isFree,
        }
      })
    } else {
      const isFree = data.isFree === true || (data.isFree === undefined && (data.price === 0 || (data.price === undefined && Number(product.price) === 0)))
      let singlePrice = 0
      let currency = (data.currency || product.currency || 'INR').toUpperCase().trim()

      if (isFree) {
        singlePrice = 0
      } else {
        const rawPrice = data.price !== undefined ? data.price : (data.basePrice !== undefined ? data.basePrice : product.price)
        if (rawPrice === null || rawPrice === undefined || rawPrice === '' || isNaN(Number(rawPrice))) {
          throw httpError(400, 'A valid numeric price is required for paid sessions.')
        }
        singlePrice = Number(rawPrice)
        if (singlePrice <= 0) {
          throw httpError(400, 'Price must be greater than zero for paid sessions.')
        }
        if (!isSupportedCurrency(currency)) {
          throw httpError(400, `Unsupported currency "${currency}".`)
        }
        const minCheck = validateMinimumAmount(singlePrice, currency)
        if (!minCheck.valid) {
          throw httpError(400, minCheck.message)
        }
      }

      const singleDuration = Math.max(1, parseInt(data.durationMinutes || 30, 10))
      bookingTypes = [
        {
          id: 'bt_default',
          name: String(data.name || data.title || product.title || 'Book 1:1 time with me').trim(),
          durationMinutes: singleDuration,
          price: isFree ? 0 : singlePrice,
          currency: currency.toLowerCase(),
          isFree,
        }
      ]
    }

    const primaryBookingType = bookingTypes[0] || {}
    const basePrice = primaryBookingType.isFree ? 0 : primaryBookingType.price
    const discountType = data.discountType === 'PERCENTAGE' || data.discountType === 'FIXED' ? data.discountType : null
    let discountVal = Math.max(0, parseFloat(data.discountValue || 0))
    if (discountType === 'PERCENTAGE') {
      discountVal = Math.min(100, discountVal)
    } else if (discountType === 'FIXED') {
      discountVal = Math.min(basePrice, discountVal)
    }

    let finalPrice = basePrice
    if (discountType === 'PERCENTAGE') {
      finalPrice = Math.max(0, Math.round(basePrice * (1 - discountVal / 100)))
    } else if (discountType === 'FIXED') {
      finalPrice = Math.max(0, basePrice - discountVal)
    }

    // Sync updates to Product table
    const productPatch = {}
    if (data.title || data.name) productPatch.title = String(data.title || data.name).trim()
    if (data.description !== undefined) productPatch.description = String(data.description).trim()
    if (data.shortDescription !== undefined) productPatch.shortDescription = String(data.shortDescription).trim()
    if (data.thumbnail || data.coverImage) {
      productPatch.thumbnail = data.thumbnail || data.coverImage
      productPatch.coverImage = data.coverImage || data.thumbnail
    }
    if (data.price !== undefined || data.basePrice !== undefined || bookingTypes.length > 0) {
      productPatch.price = finalPrice
    }
    if (data.currency || primaryBookingType.currency) {
      productPatch.currency = (data.currency || primaryBookingType.currency || 'inr').toLowerCase()
    }
    if (data.status) {
      productPatch.status = data.status
    }
    if (Object.keys(productPatch).length > 0) {
      await productsRepo.update(productId, creatorId, productPatch)
    }

    const customerFieldsPayload = {
      ...(typeof data.customerFields === 'object' && data.customerFields ? data.customerFields : {}),
      bookingTypes,
      mailingListOptIn: Boolean(data.mailingListOptIn),
      customTerms: String(data.customTerms || '').trim(),
      supportEmail: String(data.supportEmail || '').trim(),
    }

    const patch = {
      durationMinutes: primaryBookingType.durationMinutes || Math.max(1, parseInt(data.durationMinutes || 30, 10)),
      timezone: data.timezone || 'Asia/Kolkata',
      sessionType: data.sessionType || primaryBookingType.name || '1:1 Consultation',
      deliveryMethod: data.meetingType || data.deliveryMethod || 'GOOGLE_MEET',
      meetingType: data.meetingType || data.deliveryMethod || 'GOOGLE_MEET',
      meetingUrl: sanitizeUrl(data.meetingUrl || ''),
      locationText: sanitizeText(data.locationText || ''),
      calendarProvider: data.calendarProvider || 'GOOGLE_CALENDAR',
      calendarId: data.calendarId || 'primary',
      minimumNoticeMinutes: parseInt(data.minimumNoticeMinutes !== undefined ? data.minimumNoticeMinutes : 240, 10),
      maximumAdvanceDays: parseInt(data.maximumAdvanceDays !== undefined ? data.maximumAdvanceDays : 10, 10),
      bufferMinutes: parseInt(data.bufferMinutes !== undefined ? data.bufferMinutes : 15, 10),
      bufferBeforeMinutes: parseInt(data.bufferBeforeMinutes !== undefined ? data.bufferBeforeMinutes : 15, 10),
      bufferAfterMinutes: parseInt(data.bufferAfterMinutes !== undefined ? data.bufferAfterMinutes : 15, 10),
      maxSessionsPerDay: data.maxSessionsPerDay ? parseInt(data.maxSessionsPerDay, 10) : null,
      allowRescheduling: data.allowRescheduling !== false,
      reschedulingDeadlineNoticeHours: parseInt(data.reschedulingDeadlineNoticeHours !== undefined ? data.reschedulingDeadlineNoticeHours : 24, 10),
      allowCancellation: data.allowCancellation !== false,
      cancellationPolicyNoticeHours: parseInt(data.cancellationPolicyNoticeHours !== undefined ? data.cancellationPolicyNoticeHours : 24, 10),
      cancellationPolicy: sanitizeText(data.cancellationPolicy || 'Cancellations must be made at least 24 hours before the scheduled booking.'),
      discountType: discountType,
      discountValue: discountVal,
      blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : [],
      blockedTimeRanges: Array.isArray(data.blockedTimeRanges) ? data.blockedTimeRanges : [],
      dateOverrides: Array.isArray(data.dateOverrides) ? data.dateOverrides : [],
      availability: Array.isArray(data.availability) ? data.availability : [],
      questions: Array.isArray(data.questions) ? data.questions : [],
      customerFields: customerFieldsPayload,
    }

    const savedConfig = await coachingRepo.upsertConfig(creatorId, productId, patch)
    return {
      ...savedConfig,
      title: productPatch.title || product.title,
      description: productPatch.description !== undefined ? productPatch.description : product.description,
      price: productPatch.price !== undefined ? productPatch.price : product.price,
      currency: productPatch.currency || product.currency || 'inr',
      status: productPatch.status || product.status,
      thumbnail: productPatch.thumbnail || product.thumbnail,
      coverImage: productPatch.coverImage || product.coverImage,
      bookingTypes,
      mailingListOptIn: Boolean(data.mailingListOptIn),
      customTerms: String(data.customTerms || '').trim(),
      supportEmail: String(data.supportEmail || '').trim(),
    }
  },

  async getAvailableSlots({ productId, date, timezone, durationMinutes, bookingTypeId }) {
    const product = await productsRepo.getById(productId)
    if (!product || product.status !== 'PUBLISHED') return { slots: [], timezone: 'UTC' }

    const config = await this.getConfig(product.creatorId, productId)
    if (!config) {
      return { slots: [], timezone: 'UTC' }
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw httpError(400, 'Invalid date format (expected YYYY-MM-DD)')
    }

    const targetTz = timezone || config.timezone || 'Asia/Kolkata'

    let duration = parseInt(durationMinutes, 10)
    if (isNaN(duration) || duration <= 0) {
      if (bookingTypeId && Array.isArray(config.bookingTypes)) {
        const bt = config.bookingTypes.find((b) => b.id === bookingTypeId)
        if (bt?.durationMinutes) duration = parseInt(bt.durationMinutes, 10)
      }
    }
    if (!duration || isNaN(duration) || duration <= 0) {
      duration = config.durationMinutes || 30
    }

    const maxPerDay = config.maxSessionsPerDay
    if (maxPerDay) {
      const count = await coachingRepo.countBookingsOnDate(product.creatorId, date, targetTz)
      if (count >= maxPerDay) return { slots: [], timezone: targetTz, date }
    }

    const [yr, mo, da] = date.split('-').map(Number)
    const rangeStart = new Date(Date.UTC(yr, mo - 1, da, 0, 0, 0) - 2 * 24 * 60 * 60 * 1000)
    const rangeEnd = new Date(Date.UTC(yr, mo - 1, da, 23, 59, 59, 999) + 2 * 24 * 60 * 60 * 1000)

    const rawExistingBookings = await coachingRepo.listBookingsForCreator(product.creatorId, {
      fromDate: rangeStart.toISOString(),
      toDate: rangeEnd.toISOString(),
      status: ['CONFIRMED', 'PENDING', 'RESCHEDULED'],
    })

    const nowMs = Date.now()
    const HOLD_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes hold expiry
    const existingBookings = rawExistingBookings.filter((b) => {
      if (b.status === 'PENDING' && b.createdAt) {
        if (nowMs - new Date(b.createdAt).getTime() > HOLD_EXPIRY_MS) return false
      }
      return true
    })

    const slots = this._computeSlotsForDate({
      config,
      date,
      duration,
      existingBookings,
      nowMs,
      targetTimezone: targetTz,
    })

    return { slots, timezone: targetTz, date }
  },

  _computeSlotsForDate({ config, date, duration, existingBookings, nowMs, targetTimezone }) {
    if (!config) return []

    const creatorTimezone = config.timezone || 'Asia/Kolkata'
    const viewerTimezone = targetTimezone || creatorTimezone

    const bufferBefore = parseInt(config.bufferBeforeMinutes || 0, 10)
    const bufferAfter = parseInt(config.bufferAfterMinutes !== undefined ? config.bufferAfterMinutes : (config.bufferMinutes || 15), 10)
    const totalBuffer = bufferBefore + bufferAfter
    const minNotice = config.minimumNoticeMinutes !== undefined ? config.minimumNoticeMinutes : 240
    const maxAdvanceDays = config.maximumAdvanceDays || 60

    const minNoticeMs = minNotice * 60 * 1000
    const maxAdvanceMs = maxAdvanceDays * 24 * 60 * 60 * 1000
    const slots = []

    // Helper to calculate candidate creator calendar dates
    const getCandidateDates = (dateStr) => {
      if (viewerTimezone === creatorTimezone) return [dateStr]
      const [yr, mo, da] = dateStr.split('-').map(Number)
      const base = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0))
      const prev = new Date(base.getTime() - 24 * 60 * 60 * 1000)
      const next = new Date(base.getTime() + 24 * 60 * 60 * 1000)
      const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      return [fmt(prev), dateStr, fmt(next)]
    }

    const candidateDates = getCandidateDates(date)

    for (const cDate of candidateDates) {
      if (Array.isArray(config.blockedDates) && config.blockedDates.includes(cDate)) {
        continue
      }

      const timeWindows = []
      const dateOverride = (config.dateOverrides || []).find((o) => o.date === cDate)

      if (dateOverride) {
        if (!dateOverride.enabled) {
          continue
        }
        if (Array.isArray(dateOverride.windows)) {
          timeWindows.push(...dateOverride.windows.filter((w) => w.startTime && w.endTime))
        }
      } else {
        const [yr, mo, da] = cDate.split('-').map(Number)
        const dateObj = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0))
        const dayOfWeek = dateObj.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat

        for (const a of (config.availability || [])) {
          if (a.enabled && Number(a.dayOfWeek) === dayOfWeek) {
            if (Array.isArray(a.windows) && a.windows.length > 0) {
              timeWindows.push(...a.windows)
            } else if (a.startTime && a.endTime) {
              timeWindows.push({ startTime: a.startTime, endTime: a.endTime })
            }
          }
        }
      }

      if (timeWindows.length === 0) continue

      for (const win of timeWindows) {
        if (!win.startTime || !win.endTime) continue
        const [startH, startM] = win.startTime.split(':').map(Number)
        const [endH, endM] = win.endTime.split(':').map(Number)

        const winStartMin = startH * 60 + startM
        const winEndMin = endH * 60 + endM

        let currentMin = winStartMin
        while (currentMin + duration <= winEndMin) {
          const slotStartH = Math.floor(currentMin / 60)
          const slotStartM = currentMin % 60
          const slotEndMinTotal = currentMin + duration
          const slotEndH = Math.floor(slotEndMinTotal / 60)
          const slotEndM = slotEndMinTotal % 60

          // Check blocked time ranges on cDate in creator timezone
          const isBlockedByTimeRange = (config.blockedTimeRanges || []).some((b) => {
            if (b.date && b.date !== cDate) return false
            const [bStartH, bStartM] = b.startTime.split(':').map(Number)
            const [bEndH, bEndM] = b.endTime.split(':').map(Number)
            const bStartMin = bStartH * 60 + bStartM
            const bEndMin = bEndH * 60 + bEndM
            return currentMin < bEndMin && slotEndMinTotal > bStartMin
          })

          if (!isBlockedByTimeRange) {
            const startHStr = String(slotStartH).padStart(2, '0')
            const startMStr = String(slotStartM).padStart(2, '0')
            const endHStr = String(slotEndH).padStart(2, '0')
            const endMStr = String(slotEndM).padStart(2, '0')

            const slotStartUtc = localDateTimeToUtc({
              date: cDate,
              time: `${startHStr}:${startMStr}`,
              timezone: creatorTimezone,
            })
            const slotEndUtc = localDateTimeToUtc({
              date: cDate,
              time: `${endHStr}:${endMStr}`,
              timezone: creatorTimezone,
            })

            // Verify if the slot falls on the requested calendar date in viewerTimezone
            const slotViewerDate = getDateInTimezone(slotStartUtc, viewerTimezone)
            if (slotViewerDate === date) {
              const startMs = slotStartUtc.getTime()
              const endMs = slotEndUtc.getTime()

              if (startMs >= nowMs + minNoticeMs && startMs <= nowMs + maxAdvanceMs) {
                const isOverlapping = existingBookings.some((b) => {
                  const bStart = new Date(b.startTime).getTime() - (bufferBefore * 60 * 1000)
                  const bEnd = new Date(b.endTime).getTime() + (bufferAfter * 60 * 1000)
                  return startMs < bEnd && endMs > bStart
                })

                if (!isOverlapping) {
                  const displayStart = formatInTimezone(slotStartUtc, viewerTimezone, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })
                  const displayEnd = formatInTimezone(slotEndUtc, viewerTimezone, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })

                  slots.push({
                    startTime: slotStartUtc.toISOString(),
                    endTime: slotEndUtc.toISOString(),
                    durationMinutes: duration,
                    formattedTime: `${displayStart} - ${displayEnd}`,
                    displayStart,
                    displayEnd,
                  })
                }
              }
            }
          }

          currentMin += duration + totalBuffer
        }
      }
    }

    slots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    return slots
  },

  async getAvailableMonthDates({ productId, year, month, durationMinutes, bookingTypeId, timezone }) {
    const product = await productsRepo.getById(productId)
    if (!product || product.status !== 'PUBLISHED') return { availableDates: [], timezone: 'UTC' }

    const config = await this.getConfig(product.creatorId, productId)
    if (!config) return { availableDates: [], timezone: 'UTC' }

    const targetTz = timezone || config.timezone || 'Asia/Kolkata'

    const y = parseInt(year, 10)
    const m = parseInt(month, 10) // 1-12
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      throw httpError(400, 'Invalid year or month')
    }

    let duration = parseInt(durationMinutes, 10)
    if (isNaN(duration) || duration <= 0) {
      if (bookingTypeId && Array.isArray(config.bookingTypes)) {
        const bt = config.bookingTypes.find((b) => b.id === bookingTypeId)
        if (bt?.durationMinutes) duration = parseInt(bt.durationMinutes, 10)
      }
    }
    if (!duration || isNaN(duration) || duration <= 0) {
      duration = config.durationMinutes || 30
    }

    const daysInMonth = new Date(y, m, 0).getDate()
    const monthStartIso = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 2 * 24 * 60 * 60 * 1000).toISOString()
    const monthEndIso = new Date(Date.UTC(y, m - 1, daysInMonth, 23, 59, 59, 999) + 2 * 24 * 60 * 60 * 1000).toISOString()

    // Query existing bookings around the month
    const rawExistingBookings = await coachingRepo.listBookingsForCreator(product.creatorId, {
      fromDate: monthStartIso,
      toDate: monthEndIso,
      status: ['CONFIRMED', 'PENDING', 'RESCHEDULED'],
    })

    const nowMs = Date.now()
    const HOLD_EXPIRY_MS = 15 * 60 * 1000
    const existingBookings = rawExistingBookings.filter((b) => {
      if (b.status === 'PENDING' && b.createdAt) {
        if (nowMs - new Date(b.createdAt).getTime() > HOLD_EXPIRY_MS) return false
      }
      return true
    })

    const maxPerDay = config.maxSessionsPerDay
    const availableDates = []

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      if (maxPerDay) {
        const countOnDate = existingBookings.filter((b) => {
          const bDate = getDateInTimezone(b.startTime, targetTz)
          return bDate === dateStr
        }).length
        if (countOnDate >= maxPerDay) continue
      }

      const daySlots = this._computeSlotsForDate({
        config,
        date: dateStr,
        duration,
        existingBookings,
        nowMs,
        targetTimezone: targetTz,
      })

      if (daySlots.length > 0) {
        availableDates.push(dateStr)
      }
    }

    return {
      availableDates,
      timezone: targetTz,
      minimumNoticeMinutes: config.minimumNoticeMinutes,
      maximumAdvanceDays: config.maximumAdvanceDays,
    }
  },

  async createBookingHold({
    productId,
    startTime,
    endTime,
    timezone,
    customerEmail,
    customerName,
    customerPhone,
    answers,
    bookingTypeId,
    bookingTypeName,
    mailingListOptIn,
    customQuestionsAnswers,
  }) {
    const product = await productsRepo.getById(productId)
    if (!product || product.status !== 'PUBLISHED') throw httpError(404, 'Product not found or not published')
    if (product.type !== 'COACHING') throw httpError(400, 'Product is not a coaching or booking service')

    if (!customerEmail) throw httpError(400, 'Customer email is required')
    if (!startTime || !endTime) throw httpError(400, 'Session start and end time are required')

    return withBookingLock(product.creatorId, async () => {
      const config = await this.getConfig(product.creatorId, productId)

      const bookingTypes = config.bookingTypes || []
      if (bookingTypeId && Array.isArray(bookingTypes) && bookingTypes.length > 0 && !bookingTypes.some(b => b.id === bookingTypeId)) {
        throw httpError(404, 'Booking type not found')
      }

      const creatorTz = config.timezone || 'Asia/Kolkata'
      const bookingTz = timezone || creatorTz

      const startMs = new Date(startTime).getTime()
      const endMs = new Date(endTime).getTime()
      const nowMs = Date.now()
      const dateStrInCreatorTz = getDateInTimezone(startTime, creatorTz)

      // Check blocked dates & blocked time ranges in creator timezone
      if (Array.isArray(config.blockedDates) && config.blockedDates.includes(dateStrInCreatorTz)) {
        throw httpError(409, 'Selected date is blocked by the creator.')
      }
      const isBlockedRange = (config.blockedTimeRanges || []).some(b => {
        if (b.date && b.date !== dateStrInCreatorTz) return false
        const [bStartH, bStartM] = b.startTime.split(':').map(Number)
        const [bEndH, bEndM] = b.endTime.split(':').map(Number)
        const bStartMs = localDateTimeToUtc({
          date: dateStrInCreatorTz,
          time: `${String(bStartH).padStart(2, '0')}:${String(bStartM).padStart(2, '0')}`,
          timezone: creatorTz,
        }).getTime()
        const bEndMs = localDateTimeToUtc({
          date: dateStrInCreatorTz,
          time: `${String(bEndH).padStart(2, '0')}:${String(bEndM).padStart(2, '0')}`,
          timezone: creatorTz,
        }).getTime()
        return startMs < bEndMs && endMs > bStartMs
      })
      if (isBlockedRange) {
        throw httpError(409, 'Selected time slot falls within a blocked time range.')
      }

      if (startMs <= nowMs) throw httpError(400, 'Cannot book a session in the past')
      const minNotice = config.minimumNoticeMinutes !== undefined ? config.minimumNoticeMinutes : 1440
      if (startMs < nowMs + minNotice * 60 * 1000) {
        throw httpError(400, `Minimum notice of ${Math.round(minNotice / 60)} hour(s) is required for booking`)
      }

      const bufferBefore = parseInt(config.bufferBeforeMinutes || 0, 10)
      const bufferAfter = parseInt(config.bufferAfterMinutes !== undefined ? config.bufferAfterMinutes : (config.bufferMinutes || 15), 10)
      const overlapping = await coachingRepo.findOverlappingBookings(
        product.creatorId,
        new Date(startMs - bufferBefore * 60 * 1000).toISOString(),
        new Date(endMs + bufferAfter * 60 * 1000).toISOString()
      )

      if (overlapping.length > 0) {
        throw httpError(409, 'This time slot is no longer available. Please choose another time.')
      }

      // Determine booking type specifics
      const selectedType = (bookingTypeId ? bookingTypes.find(b => b.id === bookingTypeId) : null) || bookingTypes[0] || null
      const price = selectedType ? (selectedType.isFree ? 0 : Number(selectedType.price || 0)) : Number(product.price || 0)
      const isFree = price === 0
      const currency = (selectedType?.currency || product.currency || 'inr').toLowerCase()
      const sessionDurationMinutes = selectedType?.durationMinutes || config.durationMinutes || 30
      const typeTitle = selectedType?.name || bookingTypeName || config.sessionType || product.title || '1:1 Coaching'

      // Auto-generate Google Meet URL if GOOGLE_MEET type
      let meetingUrl = config.meetingUrl || ''
      if ((config.meetingType === 'GOOGLE_MEET' || config.deliveryMethod === 'GOOGLE_MEET') && !meetingUrl) {
        const meetCode = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`
        meetingUrl = `https://meet.google.com/${meetCode}`
      }

      const cleanEmail = String(customerEmail).toLowerCase().trim()

      // Capture mailing list lead if opted-in
      if (mailingListOptIn && cleanEmail) {
        try {
          await customersRepo.upsert(product.creatorId, cleanEmail, customerName ? String(customerName).trim() : '')
          await leadsRepo.capture(product.creatorId, {
            email: cleanEmail,
            name: customerName ? String(customerName).trim() : '',
            source: 'COACHING_BOOKING',
            productId: product.id,
          }).catch(() => {})
        } catch (leadErr) {
          console.warn('[Coaching Booking] Mailing list capture note:', leadErr.message)
        }
      }

      const booking = {
        id: uuidv4(),
        productId: product.id,
        creatorId: product.creatorId,
        orderId: null,
        customerId: null,
        customerEmail: cleanEmail,
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        bookingTypeId: selectedType?.id || 'bt_default',
        bookingTypeName: typeTitle,
        durationMinutes: sessionDurationMinutes,
        price: price,
        currency: currency,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        timezone: bookingTz,
        status: isFree ? 'CONFIRMED' : 'PENDING',
        paymentStatus: isFree ? 'PAID' : 'PENDING',
        meetingType: config.meetingType || 'GOOGLE_MEET',
        meetingUrl: meetingUrl,
        locationText: config.locationText || '',
        answers: answers || customQuestionsAnswers || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const createdBooking = await coachingRepo.createBooking(booking)

      // For free bookings, send confirmation email immediately
      if (isFree) {
        try {
          const creatorProfile = await profilesRepo.getByCreator(product.creatorId).catch(() => null)
          const creatorName = creatorProfile?.name || 'Creator'
          const timeStr = `${new Date(startTime).toLocaleString('en-US', { timeZone: bookingTz, dateStyle: 'full', timeStyle: 'short' })} (${bookingTz})`
          await emailService.sendBookingConfirmationEmail({
            to: cleanEmail,
            customerName: customerName || cleanEmail.split('@')[0],
            creatorName,
            productTitle: typeTitle,
            sessionTime: timeStr,
            meetingUrl: createdBooking.meetingUrl,
          })
        } catch (emailErr) {
          console.warn('[Coaching Free Booking] Email dispatch note:', emailErr.message)
        }
      }

      return createdBooking
    })
  },

  async getBooking(bookingId, reqEmail, reqCreatorId) {
    const booking = await coachingRepo.getBookingById(bookingId)
    if (!booking) throw httpError(404, 'Booking not found')

    if (reqCreatorId && booking.creatorId === reqCreatorId) return booking
    if (reqEmail && booking.customerEmail === String(reqEmail).toLowerCase()) return booking

    if (booking.orderId) {
      const order = await ordersRepo.getById(booking.orderId)
      if (order && order.customerEmail === String(reqEmail).toLowerCase()) return booking
    }

    throw httpError(403, 'Access denied to this booking')
  },

  async rescheduleBooking({ bookingId, customerEmail, creatorId, newStartTime, newEndTime }) {
    const booking = await coachingRepo.getBookingById(bookingId)
    if (!booking) throw httpError(404, 'Booking not found')

    if (creatorId && booking.creatorId !== creatorId && customerEmail && booking.customerEmail !== String(customerEmail).toLowerCase()) {
      throw httpError(403, 'Access denied')
    }

    const config = await this.getConfig(booking.creatorId, booking.productId)
    if (!creatorId && !config.allowRescheduling) {
      throw httpError(400, 'Rescheduling is not allowed for this coaching product.')
    }

    const buffer = config.bufferMinutes !== undefined ? config.bufferMinutes : 15
    const overlapping = await coachingRepo.findOverlappingBookings(
      booking.creatorId,
      new Date(new Date(newStartTime).getTime() - buffer * 60 * 1000).toISOString(),
      new Date(new Date(newEndTime).getTime() + buffer * 60 * 1000).toISOString(),
      bookingId
    )

    if (overlapping.length > 0) {
      throw httpError(409, 'The requested new slot is not available. Please pick another time.')
    }

    const patch = {
      startTime: new Date(newStartTime),
      endTime: new Date(newEndTime),
      status: 'CONFIRMED',
      rescheduledFrom: {
        oldStartTime: booking.startTime,
        oldEndTime: booking.endTime,
        rescheduledAt: new Date(),
      },
    }

    const updated = await coachingRepo.updateBooking(bookingId, patch)
    try {
      const profile = await profilesRepo.getByCreator(booking.creatorId).catch(() => null)
      const prod = await productsRepo.getById(booking.productId).catch(() => null)
      if (booking.customerEmail) {
        const bTz = booking.timezone || 'Asia/Kolkata'
        const newSessionTime = `${new Date(newStartTime).toLocaleString('en-US', { timeZone: bTz, dateStyle: 'full', timeStyle: 'short' })} (${bTz})`
        await emailService.sendBookingRescheduledEmail({
          to: booking.customerEmail,
          customerName: booking.customerName || booking.customerEmail.split('@')[0],
          creatorName: profile?.name || 'Creator',
          productTitle: prod?.title || 'Coaching Session',
          newSessionTime,
          meetingUrl: booking.meetingUrl,
        })
      }
    } catch (e) { console.error('Coaching reschedule email error:', e) }
    return updated
  },

  async cancelBooking({ bookingId, customerEmail, creatorId, reason }) {
    const booking = await coachingRepo.getBookingById(bookingId)
    if (!booking) throw httpError(404, 'Booking not found')

    const isCreator = creatorId && booking.creatorId === creatorId
    const isCustomer = customerEmail && booking.customerEmail === String(customerEmail).toLowerCase()

    if (!isCreator && !isCustomer) throw httpError(403, 'Access denied')

    if (!isCreator) {
      const config = await this.getConfig(booking.creatorId, booking.productId)
      const noticeHours = config.cancellationPolicyNoticeHours || 24
      const startMs = new Date(booking.startTime).getTime()
      if (Date.now() > startMs - noticeHours * 3600 * 1000) {
        throw httpError(400, `Sessions can only be cancelled at least ${noticeHours} hours before the start time.`)
      }
    }

    const updated = await coachingRepo.updateBooking(bookingId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: reason || '',
    })

    try {
      const profile = await profilesRepo.getByCreator(booking.creatorId).catch(() => null)
      const prod = await productsRepo.getById(booking.productId).catch(() => null)
      if (booking.customerEmail) {
        const bTz = booking.timezone || 'Asia/Kolkata'
        const sessionTime = `${new Date(booking.startTime).toLocaleString('en-US', { timeZone: bTz, dateStyle: 'full', timeStyle: 'short' })} (${bTz})`
        await emailService.sendBookingCancellationEmail({
          to: booking.customerEmail,
          customerName: booking.customerName || booking.customerEmail.split('@')[0],
          creatorName: profile?.name || 'Creator',
          productTitle: prod?.title || 'Coaching Session',
          sessionTime,
          reason: reason || '',
        })
      }
    } catch (e) { console.error('Coaching cancellation email error:', e) }

    if (booking.orderId) {
      try {
        const order = await ordersRepo.getById(booking.orderId)
        if (order && order.status === 'PAID' && Number(order.amount) > 0) {
          await payoutService.createRefund(booking.creatorId, { orderId: order.id, reason: 'Coaching booking cancelled' }).catch(() => { })
        }
      } catch (e) { console.error('Coaching refund trigger error:', e) }
    }

    return updated
  },

  async listCreatorBookings(creatorId, options = {}) {
    const bookings = await coachingRepo.listBookingsForCreator(creatorId, options)
    const productIds = [...new Set(bookings.map(b => b.productId || b.product_id).filter(Boolean))]
    const productMap = {}
    for (const pid of productIds) {
      try {
        const prod = await productsRepo.getById(pid)
        if (prod) {
          productMap[pid] = {
            id: prod.id,
            title: prod.title || '1:1 Coaching',
            thumbnail: prod.thumbnail || prod.coverImage || '',
            price: Number(prod.price || 0),
            currency: prod.currency || 'INR',
            status: prod.status || 'PUBLISHED',
          }
        }
      } catch (e) { }
    }

    return bookings.map(b => {
      const pid = b.productId || b.product_id
      const prod = productMap[pid] || {}
      return {
        ...b,
        productId: pid,
        productTitle: prod.title || '1:1 Coaching Session',
        product: prod,
      }
    })
  },

  async getCreatorAvailability(creatorId) {
    const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
    const creatorTz = profile?.timezone || 'Asia/Kolkata'

    const products = await productsRepo.list(creatorId).catch(() => [])
    const coachingProducts = (products || []).filter(p => p.type === 'COACHING')

    let activeConfig = null
    for (const cp of coachingProducts) {
      const cfg = await coachingRepo.getConfigByProductId(cp.id)
      if (cfg) {
        activeConfig = cfg
        break
      }
    }

    if (!activeConfig) {
      activeConfig = await this.getConfig(creatorId, coachingProducts[0]?.id || null)
    }

    return {
      timezone: activeConfig.timezone || creatorTz,
      durationMinutes: activeConfig.durationMinutes || 60,
      bufferMinutes: activeConfig.bufferMinutes !== undefined ? activeConfig.bufferMinutes : 15,
      bufferBeforeMinutes: activeConfig.bufferBeforeMinutes || 0,
      bufferAfterMinutes: activeConfig.bufferAfterMinutes !== undefined ? activeConfig.bufferAfterMinutes : 15,
      minimumNoticeMinutes: activeConfig.minimumNoticeMinutes !== undefined ? activeConfig.minimumNoticeMinutes : 1440,
      maximumAdvanceDays: activeConfig.maximumAdvanceDays || 60,
      availability: activeConfig.availability || [
        { dayOfWeek: 1, dayName: 'Monday', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
        { dayOfWeek: 2, dayName: 'Tuesday', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
        { dayOfWeek: 3, dayName: 'Wednesday', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
        { dayOfWeek: 4, dayName: 'Thursday', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
        { dayOfWeek: 5, dayName: 'Friday', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
        { dayOfWeek: 6, dayName: 'Saturday', enabled: false, windows: [{ startTime: '10:00', endTime: '14:00' }] },
        { dayOfWeek: 0, dayName: 'Sunday', enabled: false, windows: [{ startTime: '10:00', endTime: '14:00' }] },
      ],
      products: coachingProducts.map(p => ({
        id: p.id,
        title: p.title,
        price: Number(p.price || 0),
        currency: p.currency || 'INR',
        status: p.status,
      }))
    }
  },

  async saveCreatorAvailability(creatorId, data) {
    const products = await productsRepo.list(creatorId).catch(() => [])
    const coachingProducts = (products || []).filter(p => p.type === 'COACHING')

    const patch = {
      timezone: data.timezone || 'Asia/Kolkata',
      bufferMinutes: parseInt(data.bufferMinutes !== undefined ? data.bufferMinutes : 15, 10),
      bufferBeforeMinutes: parseInt(data.bufferBeforeMinutes || 0, 10),
      bufferAfterMinutes: parseInt(data.bufferAfterMinutes !== undefined ? data.bufferAfterMinutes : (data.bufferMinutes || 15), 10),
      minimumNoticeMinutes: parseInt(data.minimumNoticeMinutes !== undefined ? data.minimumNoticeMinutes : 1440, 10),
      maximumAdvanceDays: parseInt(data.maximumAdvanceDays !== undefined ? data.maximumAdvanceDays : 60, 10),
      availability: Array.isArray(data.availability) ? data.availability : [],
    }

    if (data.productId && data.productId !== 'ALL') {
      await coachingRepo.upsertConfig(creatorId, data.productId, patch)
    } else if (coachingProducts.length > 0) {
      for (const cp of coachingProducts) {
        await coachingRepo.upsertConfig(creatorId, cp.id, patch)
      }
    } else {
      // If no coaching products yet, we can store in a general creator config
      await coachingRepo.upsertConfig(creatorId, 'default', patch)
    }

    return this.getCreatorAvailability(creatorId)
  },

  async listStudentBookings(customerEmail, options) {
    return coachingRepo.listBookingsForCustomer(customerEmail, options)
  },
}

// ---------------- Community Service ----------------
export const communityService = {
  async getConfig(creatorId, productId) {
    let config = await communityRepo.getConfigByProductId(productId)
    if (!config) {
      const product = await productsRepo.getById(productId)
      config = {
        productId,
        creatorId,
        name: product?.title || 'Community Group',
        slug: product?.slug || `community-${productId.slice(0, 8)}`,
        shortDescription: product?.shortDescription || '',
        description: product?.description || '',
        category: 'Technology',
        tags: ['#developers', '#startups'],
        coverImage: product?.thumbnail || '',
        accessType: 'ONE_TIME',
        allowNewMembers: true,
        rules: [
          { id: 'r1', title: 'Be respectful', description: 'Treat all community members with empathy and respect.' },
          { id: 'r2', title: 'No spam', description: 'Self-promotion and spam will be removed immediately.' },
          { id: 'r3', title: 'Keep discussions relevant', description: 'Stay on topic and contribute meaningfully.' },
        ],
        benefits: [
          'Direct access to group discussions',
          'Networking with fellow members',
          'Exclusive announcements and updates',
        ],
        status: 'DRAFT',
      }
    }
    return config
  },

  async saveConfig(creatorId, productId, data) {
    const product = await productsRepo.getById(productId)
    if (!product || product.creatorId !== creatorId) throw httpError(404, 'Product not found')

    if (data.slug) {
      const existing = await communityRepo.getConfigBySlug(data.slug)
      if (existing && existing.productId !== productId) {
        throw httpError(409, 'Community slug is already taken')
      }
    }

    const updated = await communityRepo.upsertConfig(creatorId, productId, data)
    if (data.name || data.slug || data.shortDescription || data.coverImage) {
      await productsRepo.update(productId, creatorId, {
        title: data.name || product.title,
        slug: data.slug || product.slug,
        shortDescription: data.shortDescription || product.shortDescription,
        thumbnail: data.coverImage || product.thumbnail,
      })
    }
    return updated
  },

  async getPublicDetails(productIdOrSlug) {
    let config = await communityRepo.getConfigByProductId(productIdOrSlug)
    if (!config) config = await communityRepo.getConfigBySlug(productIdOrSlug)
    if (!config) {
      const product = await productsRepo.getById(productIdOrSlug)
      if (product && product.type === 'COMMUNITY') {
        config = await this.getConfig(product.creatorId, product.id)
      }
    }
    if (!config) throw httpError(404, 'Community not found')

    const product = await productsRepo.getById(config.productId)
    const creator = await profilesRepo.getByCreator(config.creatorId)
    const memberCount = await communityRepo.countMembers(config.id || config.productId, 'ACTIVE')

    return {
      config,
      product: product ? { id: product.id, title: product.title, price: product.price, currency: product.currency, status: product.status } : null,
      creator: creator ? { name: creator.name, username: creator.username, avatar: creator.avatar } : null,
      memberCount: memberCount + 1,
    }
  },

  async verifyAccess(communityId, customerEmail, creatorId = null) {
    let config = await communityRepo.getConfigByProductId(communityId)
    if (!config) config = await communityRepo.getConfigBySlug(communityId)
    const actualCommunityId = config ? (config.id || config.productId) : communityId
    const targetCreatorId = config ? config.creatorId : creatorId

    if (creatorId && targetCreatorId && creatorId === targetCreatorId) {
      return { hasAccess: true, role: 'OWNER', communityId: actualCommunityId, config }
    }

    if (!customerEmail) throw httpError(401, 'Authentication or customer email is required')

    if (targetCreatorId) {
      const creatorUser = await usersRepo.getById(targetCreatorId)
      if (creatorUser && creatorUser.email.toLowerCase() === customerEmail.toLowerCase()) {
        return { hasAccess: true, role: 'OWNER', communityId: actualCommunityId, config }
      }
    }

    const membership = await communityRepo.getMembership(actualCommunityId, customerEmail)
    if (!membership || membership.status !== 'ACTIVE') {
      throw httpError(403, 'You do not have an active membership to this community.')
    }

    return { hasAccess: true, role: membership.role || 'MEMBER', membership, communityId: actualCommunityId, config }
  },

  async createPost(communityId, customerEmail, userDetails, postData) {
    const creatorId = userDetails?.creatorId || userDetails?.id
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)


    if (postData.isAnnouncement && access.role !== 'OWNER' && access.role !== 'ADMIN') {
      throw httpError(403, 'Only owners and admins can create announcements.')
    }

    if (!postData.content || !postData.content.trim()) {
      throw httpError(400, 'Post content cannot be empty.')
    }

    const post = await communityRepo.createPost({
      communityId: access.communityId,
      authorEmail: customerEmail,
      authorName: userDetails?.name || customerEmail.split('@')[0],
      authorRole: access.role,
      title: postData.title ? sanitizeText(postData.title) : '',
      content: postData.content,
      isAnnouncement: postData.isAnnouncement || false,
      attachments: postData.attachments || [],
      referencedProduct: postData.referencedProduct || null,
      category: postData.category ? sanitizeText(postData.category) : '',
    })

    return post
  },

  async pinPost(communityId, postId, customerEmail, creatorId, isPinned = true) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    if (access.role !== 'OWNER' && access.role !== 'ADMIN') {
      throw httpError(403, 'Only community owners and admins can pin posts.')
    }
    const updated = await communityRepo.updatePost(postId, { isAnnouncement: !!isPinned, isPinned: !!isPinned })
    return updated
  },

  async hidePost(communityId, postId, customerEmail, creatorId, isHidden = true) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    if (access.role !== 'OWNER' && access.role !== 'ADMIN') {
      throw httpError(403, 'Only community owners and admins can hide posts.')
    }
    const updated = await communityRepo.updatePost(postId, { isHidden: !!isHidden })
    return updated
  },

  async createResource(communityId, customerEmail, creatorId, data) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    if (access.role !== 'OWNER' && access.role !== 'ADMIN') {
      throw httpError(403, 'Only community owners and admins can create resources.')
    }
    if (!data.title || !data.title.trim()) throw httpError(400, 'Resource title is required')

    const resource = {
      id: uuidv4(),
      communityId: access.communityId,
      creatorId: access.config?.creatorId || creatorId,
      title: sanitizeText(data.title),
      description: sanitizeText(data.description || ''),
      fileUrl: sanitizeUrl(data.fileUrl || ''),
      fileId: data.fileId || null,
      externalUrl: sanitizeUrl(data.externalUrl || ''),
      category: sanitizeText(data.category || 'General'),
      visibility: data.visibility || 'MEMBERS_ONLY',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return communityResourcesRepo.createResource(resource)
  },

  async listResources(communityId, customerEmail, creatorId = null) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    const resources = await communityResourcesRepo.listResources(access.communityId)
    return resources
  },

  async deleteResource(communityId, resourceId, customerEmail, creatorId = null) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    if (access.role !== 'OWNER' && access.role !== 'ADMIN') {
      throw httpError(403, 'Only community owners and admins can delete resources.')
    }
    await communityResourcesRepo.deleteResource(resourceId)
    return { ok: true }
  },


  async listPosts(communityId, customerEmail, creatorId = null, { limit = 30, skip = 0 } = {}) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    const { items, total } = await communityRepo.listPosts(access.communityId, { limit, skip })

    const postIds = items.map((p) => p.id)
    const userLikes = await communityRepo.getUserReactionsForPosts(postIds, customerEmail)
    const userLikesSet = new Set(userLikes)

    const postsWithLikes = items.map((p) => ({
      ...p,
      hasLiked: userLikesSet.has(p.id),
    }))

    return { posts: postsWithLikes, total, role: access.role, config: access.config }
  },

  async deletePost(postId, customerEmail, creatorId = null) {
    const post = await communityRepo.getPost(postId)
    if (!post) throw httpError(404, 'Post not found')

    const access = await this.verifyAccess(post.communityId, customerEmail, creatorId)
    const isAuthor = post.authorEmail?.toLowerCase() === customerEmail?.toLowerCase()
    const isMod = access.role === 'OWNER' || access.role === 'ADMIN'

    if (!isAuthor && !isMod) {
      throw httpError(403, 'You do not have permission to delete this post.')
    }

    return communityRepo.deletePost(postId)
  },

  async createComment(postId, customerEmail, userDetails, content) {
    const post = await communityRepo.getPost(postId)
    if (!post) throw httpError(404, 'Post not found')

    const access = await this.verifyAccess(post.communityId, customerEmail, userDetails?.creatorId)

    if (!content || !content.trim()) throw httpError(400, 'Comment content cannot be empty.')

    const comment = await communityRepo.createComment({
      postId,
      communityId: post.communityId,
      authorEmail: customerEmail,
      authorName: userDetails?.name || customerEmail.split('@')[0],
      content,
    })

    if (post.authorEmail && post.authorEmail.toLowerCase() !== customerEmail.toLowerCase()) {
      await communityRepo.createNotification({
        communityId: post.communityId,
        recipientEmail: post.authorEmail,
        actorEmail: customerEmail,
        type: 'NEW_COMMENT',
        title: 'New comment on your post',
        message: `${userDetails?.name || customerEmail.split('@')[0]} commented: "${content.slice(0, 50)}..."`,
        link: `/community/${post.communityId}`,
      })
    }

    return comment
  },

  async listComments(postId, customerEmail, creatorId = null) {
    const post = await communityRepo.getPost(postId)
    if (!post) throw httpError(404, 'Post not found')

    await this.verifyAccess(post.communityId, customerEmail, creatorId)
    return communityRepo.listComments(postId)
  },

  async deleteComment(commentId, customerEmail, creatorId = null) {
    const db = await getDb()
    const comment = await db.collection('community_comments').findOne({ id: commentId })
    if (!comment) throw httpError(404, 'Comment not found')

    const access = await this.verifyAccess(comment.communityId, customerEmail, creatorId)
    const isAuthor = comment.authorEmail?.toLowerCase() === customerEmail?.toLowerCase()
    const isMod = access.role === 'OWNER' || access.role === 'ADMIN'

    if (!isAuthor && !isMod) {
      throw httpError(403, 'You do not have permission to delete this comment.')
    }

    return communityRepo.deleteComment(commentId)
  },

  async toggleReaction(postId, customerEmail) {
    const post = await communityRepo.getPost(postId)
    if (!post) throw httpError(404, 'Post not found')

    await this.verifyAccess(post.communityId, customerEmail)
    return communityRepo.toggleReaction({
      postId,
      communityId: post.communityId,
      customerEmail,
      type: 'LIKE',
    })
  },

  async listMembers(communityId, customerEmail, creatorId = null, params = {}) {
    const access = await this.verifyAccess(communityId, customerEmail, creatorId)
    return communityRepo.listMembers(access.communityId, params)
  },

  async manageMember(creatorId, communityId, { targetEmail, role, status }) {
    const config = await communityRepo.getConfigByProductId(communityId) || await communityRepo.getConfigBySlug(communityId)
    if (!config || config.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    const membership = await communityRepo.getMembership(config.id || config.productId, targetEmail)
    if (!membership) throw httpError(404, 'Member not found')

    const updates = {}
    if (role && ['ADMIN', 'MODERATOR', 'MEMBER'].includes(role)) updates.role = role
    if (status && ['ACTIVE', 'SUSPENDED', 'BANNED', 'LEFT'].includes(status)) updates.status = status

    return communityRepo.upsertMembership({
      ...membership,
      ...updates,
    })
  },

  async getStats(creatorId, productId) {
    const config = await communityRepo.getConfigByProductId(productId)
    if (!config || config.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    const commId = config.id || config.productId
    const totalMembers = await communityRepo.countMembers(commId, 'ACTIVE')
    const { total: totalPosts } = await communityRepo.listPosts(commId, { limit: 1 })
    return {
      totalMembers: totalMembers + 1,
      totalPosts,
      activeToday: Math.max(1, Math.round(totalMembers * 0.4)),
    }
  },
}

// ---------------- Webinar Service ----------------
export const webinarService = {
  async getConfig(creatorId, productId) {
    let config = await webinarRepo.getConfigByProductId(productId)
    if (!config) {
      const product = await productsRepo.getById(productId)
      config = {
        productId,
        creatorId,
        title: product?.title || 'Live Webinar',
        shortDescription: product?.shortDescription || '',
        description: product?.description || '',
        category: 'Technology',
        tags: ['#webinar', '#live'],
        coverImage: product?.thumbnail || '',
        startAtUTC: new Date(Date.now() + 86400000 * 3).toISOString(),
        endAtUTC: new Date(Date.now() + 86400000 * 3 + 3600000 * 1.5).toISOString(),
        timezone: 'Asia/Kolkata',
        durationMinutes: 90,
        price: product?.price || 0,
        currency: product?.currency || 'inr',
        isFree: (product?.price || 0) === 0,
        capacity: 100,
        meetingType: 'VIDEO_CALL',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        meetingInstructions: 'Please join 5 minutes before the webinar starts.',
        registrationRequired: true,
        registrationCutoffMinutes: 15,
        allowCancellation: true,
        cancellationCutoffHours: 2,
        questions: [
          { id: 'q1', question: 'What is your current role?', type: 'SHORT_TEXT', required: true, order: 1 },
          { id: 'q2', question: 'What do you hope to learn from this session?', type: 'LONG_TEXT', required: false, order: 2 },
        ],
        agenda: [
          { id: 'a1', time: '06:00 PM', title: 'Welcome & Introduction', description: 'Opening remarks and session overview.', order: 1 },
          { id: 'a2', time: '06:15 PM', title: 'Main Masterclass Presentation', description: 'Core presentation and framework breakdown.', order: 2 },
          { id: 'a3', time: '07:15 PM', title: 'Live Audience Q&A', description: 'Open Q&A with live answers.', order: 3 },
        ],
        speakers: [
          { id: 's1', name: 'Primary Host', role: 'Creator & Lead Instructor', bio: 'Building digital product experiences and helping creators grow.', image: '', website: '', twitter: '', linkedin: '', order: 1 },
        ],
        resources: [],
        replay: { enabled: false, title: 'Webinar Recording Replay', url: '', availability: 'LIFETIME', expiresAt: null },
        whatYouWillLearn: [
          'Validate product ideas before building',
          'Build and launch step-by-step',
          'Drive customer engagement and sales',
        ],
        whoIsThisFor: 'Creators, developers, and professionals who want to master digital products and live events.',
        locationType: 'ONLINE',
        inPersonLocation: '',
        backupMeetingUrl: '',
        waitlistEnabled: false,
        waitlistMessage: 'Join the waitlist to receive an instant notification if a seat opens up.',
        status: 'DRAFT',
      }
      config = await webinarRepo.upsertConfig(creatorId, productId, config)
    }
    return config
  },

  async saveConfig(creatorId, productId, body) {
    const existing = await this.getConfig(creatorId, productId)

    let startAtUTC = body.startAtUTC || existing.startAtUTC
    const durationMinutes = Number(body.durationMinutes || existing.durationMinutes || 90)
    const endAtUTC = new Date(new Date(startAtUTC).getTime() + durationMinutes * 60000).toISOString()
    const isFree = Number(body.price !== undefined ? body.price : existing.price) === 0

    const updated = {
      ...existing,
      ...body,
      durationMinutes,
      startAtUTC,
      endAtUTC,
      isFree,
      price: Number(body.price !== undefined ? body.price : existing.price),
      currency: (body.currency || existing.currency || 'inr').toLowerCase(),
    }

    if (body.title || body.shortDescription || body.price !== undefined) {
      await productsRepo.update(productId, {
        ...(body.title ? { title: body.title } : {}),
        ...(body.shortDescription ? { shortDescription: body.shortDescription } : {}),
        ...(body.price !== undefined ? { price: Number(body.price) } : {}),
      })
    }

    return webinarRepo.upsertConfig(creatorId, productId, updated)
  },

  async getPublicDetails(productIdOrSlug) {
    let config = await webinarRepo.getConfigByProductId(productIdOrSlug)
    let product = await productsRepo.getById(productIdOrSlug)
    if (!product && config) {
      product = await productsRepo.getById(config.productId)
    }
    if (!config && product) {
      config = await webinarRepo.getConfigByProductId(product.id)
    }
    if (!config) throw httpError(404, 'Webinar not found')

    const webinarId = config.id || config.productId
    const totalRegistrations = await webinarRepo.countRegistrations(webinarId, ['REGISTERED', 'ATTENDED'])

    const capacity = config.capacity ? Number(config.capacity) : null
    const isFull = capacity !== null && totalRegistrations >= capacity

    const startMs = new Date(config.startAtUTC).getTime()
    const cutoffMinutes = Number(config.registrationCutoffMinutes || 0)
    const cutoffMs = startMs - cutoffMinutes * 60000
    const isRegistrationClosed = Date.now() >= cutoffMs
    const hasEnded = Date.now() >= new Date(config.endAtUTC).getTime()

    const publicConfig = {
      id: config.id || config.productId,
      productId: config.productId,
      creatorId: config.creatorId,
      title: config.title,
      shortDescription: config.shortDescription,
      description: config.description,
      category: config.category,
      tags: config.tags || [],
      coverImage: config.coverImage,
      startAtUTC: config.startAtUTC,
      endAtUTC: config.endAtUTC,
      timezone: config.timezone,
      durationMinutes: config.durationMinutes,
      price: config.price,
      currency: config.currency,
      isFree: config.isFree,
      capacity: config.capacity,
      locationType: config.locationType || 'ONLINE',
      inPersonLocation: config.inPersonLocation || '',
      backupMeetingUrl: config.backupMeetingUrl || '',
      questions: config.questions || [],
      agenda: config.agenda || [],
      speakers: config.speakers || [],
      resources: (config.resources || []).filter(r => r.visibility === 'PUBLIC' || r.visibility === 'BEFORE_EVENT'),
      replay: config.replay || { enabled: false },
      whatYouWillLearn: config.whatYouWillLearn || [],
      whoIsThisFor: config.whoIsThisFor || '',
      waitlistEnabled: config.waitlistEnabled || false,
      waitlistMessage: config.waitlistMessage || '',
      status: config.status,
    }

    const creatorProfile = await profilesRepo.getByCreator(config.creatorId)

    return {
      config: publicConfig,
      product: product ? { id: product.id, title: product.title, price: product.price, currency: product.currency, type: product.type, thumbnail: product.thumbnail } : null,
      creator: creatorProfile ? { name: creatorProfile.name, avatar: creatorProfile.avatar, bio: creatorProfile.bio } : null,
      totalRegistrations,
      isFull,
      isRegistrationClosed,
      hasEnded,
    }
  },

  async registerFree(productId, customerData, answers = []) {
    const config = await webinarRepo.getConfigByProductId(productId)
    if (!config) throw httpError(404, 'Webinar configuration not found')

    const webinarId = config.id || config.productId
    const email = customerData.email ? customerData.email.toLowerCase().trim() : ''
    if (!email) throw httpError(400, 'Email address is required')

    const existing = await webinarRepo.getRegistration(webinarId, email)
    if (existing && existing.status === 'REGISTERED') {
      return existing
    }

    const currentCount = await webinarRepo.countRegistrations(webinarId, ['REGISTERED', 'ATTENDED'])
    if (config.capacity && currentCount >= Number(config.capacity)) {
      throw httpError(409, 'This webinar has reached maximum attendee capacity.')
    }

    const startMs = new Date(config.startAtUTC).getTime()
    const cutoffMinutes = Number(config.registrationCutoffMinutes || 0)
    if (Date.now() >= startMs - cutoffMinutes * 60000) {
      throw httpError(400, 'Registration for this webinar has closed.')
    }

    const customer = await customersRepo.upsert(config.creatorId, email, customerData.name || email.split('@')[0])

    const registration = await webinarRepo.upsertRegistration({
      webinarId,
      productId,
      creatorId: config.creatorId,
      customerId: customer.id,
      customerEmail: email,
      customerName: customerData.name || customer.name || email.split('@')[0],
      orderId: null,
      status: 'REGISTERED',
      answers: answers || [],
    })

    await entitlementsRepo.createForOrder({
      id: `ent_reg_${registration.id}`,
      customerId: customer.id,
      productId,
      orderId: `free_reg_${registration.id}`,
      status: 'ACTIVE',
      createdAt: new Date(),
    }).catch(() => { })

    try {
      const profile = await profilesRepo.getByCreator(config.creatorId)
      const emailService = getEmailService()
      if (emailService.isConfigured()) {
        const timeStr = `${new Date(config.startAtUTC).toUTCString()} (${config.timezone})`
        const emailContent = webinarRegistrationEmail({
          productTitle: config.title,
          creatorName: profile?.name || 'Creator',
          webinarTime: timeStr,
          meetingUrl: config.meetingUrl,
        })
        await emailService.send({ to: email, ...emailContent })
      }
    } catch (e) {
      console.error('Failed to send webinar registration email:', e)
    }

    return registration
  },

  async verifyAccess(productId, customerEmail, creatorId = null) {
    const config = await webinarRepo.getConfigByProductId(productId)
    if (!config) throw httpError(404, 'Webinar not found')

    const webinarId = config.id || config.productId

    if (creatorId && creatorId === config.creatorId) {
      return {
        authorized: true,
        role: 'CREATOR',
        meetingUrl: config.meetingUrl,
        meetingInstructions: config.meetingInstructions,
        config,
      }
    }

    if (!customerEmail) throw httpError(401, 'Email authentication required for meeting access')

    const creatorUser = await usersRepo.getById(config.creatorId)
    if (creatorUser && creatorUser.email.toLowerCase() === customerEmail.toLowerCase()) {
      return {
        authorized: true,
        role: 'CREATOR',
        meetingUrl: config.meetingUrl,
        meetingInstructions: config.meetingInstructions,
        config,
      }
    }

    const reg = await webinarRepo.getRegistration(webinarId, customerEmail)
    if (!reg || (reg.status !== 'REGISTERED' && reg.status !== 'ATTENDED')) {
      throw httpError(403, 'Access denied. You do not have a confirmed registration for this webinar.')
    }

    return {
      authorized: true,
      role: 'ATTENDEE',
      registration: reg,
      meetingUrl: config.meetingUrl,
      meetingInstructions: config.meetingInstructions,
      config,
    }
  },

  async listRegistrationsForCreator(creatorId, productId, options = {}) {
    const config = await webinarRepo.getConfigByProductId(productId)
    if (!config || config.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    const webinarId = config.id || config.productId
    return webinarRepo.listRegistrationsForWebinar(webinarId, options)
  },

  async updateAttendance(creatorId, registrationId, status) {
    const reg = await webinarRepo.getRegistrationById(registrationId)
    if (!reg) throw httpError(404, 'Registration not found')

    if (reg.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (!['ATTENDED', 'NO_SHOW', 'REGISTERED'].includes(status)) {
      throw httpError(400, 'Invalid status')
    }

    return webinarRepo.updateRegistrationStatus(registrationId, status)
  },

  async cancelWebinar(creatorId, productId, reason = '') {
    const config = await webinarRepo.getConfigByProductId(productId)
    if (!config || config.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    const webinarId = config.id || config.productId

    await webinarRepo.upsertConfig(creatorId, productId, { ...config, status: 'CANCELLED' })

    const { items: registrants } = await webinarRepo.listRegistrationsForWebinar(webinarId, { limit: 1000 })

    for (const reg of registrants) {
      if (reg.status === 'REGISTERED') {
        await webinarRepo.updateRegistrationStatus(reg.id, 'CANCELLED', { cancelReason: reason })

        try {
          const profile = await profilesRepo.getByCreator(creatorId)
          const emailService = getEmailService()
          if (emailService.isConfigured()) {
            const timeStr = `${new Date(config.startAtUTC).toUTCString()} (${config.timezone})`
            const emailContent = webinarCancellationEmail({
              productTitle: config.title,
              creatorName: profile?.name || 'Creator',
              webinarTime: timeStr,
              reason,
            })
            await emailService.send({ to: reg.customerEmail, ...emailContent })
          }
        } catch (e) {
          console.error('Failed to send webinar cancellation email:', e)
        }
      }
    }

    return { success: true, count: registrants.length }
  },

  async cancelRegistration(customerEmail, registrationId) {
    const reg = await webinarRepo.getRegistrationById(registrationId)
    if (!reg) throw httpError(404, 'Registration not found')

    if (reg.customerEmail.toLowerCase() !== customerEmail.toLowerCase().trim()) {
      throw httpError(403, 'Unauthorized')
    }

    const config = await webinarRepo.getConfigByProductId(reg.productId)
    if (!config) throw httpError(404, 'Webinar not found')

    const startMs = new Date(config.startAtUTC).getTime()
    const cutoffHours = Number(config.cancellationCutoffHours || 1)
    if (Date.now() >= startMs - cutoffHours * 3600000) {
      throw httpError(400, `Cancellations are only allowed up to ${cutoffHours} hour(s) before start time.`)
    }

    return webinarRepo.updateRegistrationStatus(registrationId, 'CANCELLED')
  },

  async listCustomerWebinars(customerEmail) {
    if (!customerEmail) return []
    const regs = await webinarRepo.listRegistrationsForCustomer(customerEmail)
    const out = []
    for (const reg of regs) {
      const config = await webinarRepo.getConfigByProductId(reg.productId)
      const product = await productsRepo.getById(reg.productId)
      if (config && product) {
        out.push({
          registration: reg,
          config: {
            id: config.id || config.productId,
            title: config.title,
            startAtUTC: config.startAtUTC,
            endAtUTC: config.endAtUTC,
            timezone: config.timezone,
            durationMinutes: config.durationMinutes,
            status: config.status,
          },
          product: { id: product.id, title: product.title, thumbnail: product.thumbnail },
        })
      }
    }
    return out
  },
}

// ---------------- Memberships (Recurring Monthly Access) ----------------
export const membershipService = {
  async getConfig(productId) {
    if (!productId) throw httpError(400, 'Product ID is required')
    let config = await membershipRepo.getConfigByProductId(productId)
    if (!config) {
      const prod = await productsRepo.getById(productId)
      if (!prod) throw httpError(404, 'Product not found')
      config = await membershipRepo.upsertConfig({
        productId,
        creatorId: prod.creatorId,
        name: prod.title || 'Pro Membership',
        shortDescription: prod.shortDescription || '',
        price: prod.price || 499,
        currency: prod.currency || 'inr',
        status: 'DRAFT',
      })
    }
    return config
  },

  async saveConfig(productId, creatorId, configData) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (configData.isFree) {
      configData.price = 0
    } else if (configData.price !== undefined) {
      configData.price = Math.max(0, Number(configData.price))
    }

    const config = await membershipRepo.upsertConfig({
      ...configData,
      productId,
      creatorId,
    })

    // Sync title/price to Product model
    await productsRepo.update(productId, {
      title: config.name || prod.title,
      price: config.isFree ? 0 : config.price,
      currency: config.currency,
      shortDescription: config.shortDescription || prod.shortDescription,
    })

    return config
  },

  async getPublicDetails(productIdOrSlug) {
    let prod = await productsRepo.getById(productIdOrSlug)
    if (!prod) prod = await productsRepo.getBySlug(productIdOrSlug)
    if (!prod || prod.type !== 'MEMBERSHIP') throw httpError(404, 'Membership product not found')

    const config = await membershipRepo.getConfigByProductId(prod.id)
    if (!config) throw httpError(404, 'Membership configuration not found')

    const activeMembersCount = await membershipRepo.countSubscriptions(config.id || prod.id, ['ACTIVE', 'TRIALING'])

    return {
      product: {
        id: prod.id,
        title: prod.title,
        slug: prod.slug,
        thumbnail: prod.thumbnail,
        creatorId: prod.creatorId,
      },
      config: {
        id: config.id,
        productId: prod.id,
        name: config.name || prod.title,
        shortDescription: config.shortDescription,
        description: config.description,
        category: config.category,
        tags: config.tags,
        coverImage: config.coverImage,
        billingType: config.billingType,
        price: config.isFree ? 0 : config.price,
        currency: config.currency,
        isFree: config.isFree,
        trialDays: config.trialDays,
        benefits: config.benefits || [],
        unlockedResources: config.unlockedResources || [],
        status: config.status,
      },
      activeMembersCount,
    }
  },

  async subscribeFree(productId, customerData) {
    const config = await this.getConfig(productId)
    if (!config) throw httpError(404, 'Membership not found')
    if (!config.isFree && Number(config.price) > 0) {
      throw httpError(400, 'This membership requires payment.')
    }

    const email = customerData.email ? customerData.email.toLowerCase().trim() : ''
    if (!email) throw httpError(400, 'Email address is required')

    const customer = await customersRepo.upsert(config.creatorId, email, customerData.name || email.split('@')[0])
    const membershipId = config.id || productId

    const existing = await membershipRepo.getSubscription(membershipId, email)
    if (existing && (existing.status === 'ACTIVE' || existing.status === 'TRIALING')) {
      return existing
    }

    const sub = await membershipRepo.upsertSubscription({
      membershipId,
      productId,
      creatorId: config.creatorId,
      customerId: customer.id,
      customerEmail: email,
      customerName: customerData.name || customer.name || email.split('@')[0],
      orderId: null,
      billingInterval: config.billingType === 'YEARLY' ? 'YEAR' : 'MONTH',
      price: 0,
      currency: config.currency,
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    })

    // Create main entitlement
    await entitlementsRepo.createForOrder({
      id: `ent_sub_${sub.id}`,
      customerId: customer.id,
      productId,
      orderId: `free_sub_${sub.id}`,
      status: 'ACTIVE',
      createdAt: new Date(),
    }).catch(() => { })

    // Cascade entitlements to linked resources
    await this.cascadeEntitlements(sub, config)

    try {
      const profile = await profilesRepo.getByCreator(config.creatorId)
      const emailService = getEmailService()
      const tmpl = membershipActivatedEmail({
        productTitle: config.name || 'Pro Membership',
        creatorName: profile?.displayName || 'Creator',
        priceDisplay: 'FREE',
        billingInterval: config.billingType === 'YEARLY' ? 'year' : 'month',
      })
      await emailService.sendEmail({ to: email, ...tmpl })
    } catch (e) { }

    return sub
  },

  async cascadeEntitlements(subscription, config) {
    if (!subscription || !config || !Array.isArray(config.unlockedResources)) return
    const customerId = subscription.customerId
    const email = subscription.customerEmail
    const name = subscription.customerName || email.split('@')[0]

    for (const resource of config.unlockedResources) {
      try {
        if (resource.type === 'COMMUNITY' && resource.resourceId) {
          const commConfig = await communityRepo.getConfigByProductId(resource.resourceId)
          const actualCommId = commConfig?.id || resource.resourceId
          await communityRepo.upsertMembership({
            communityId: actualCommId,
            productId: resource.resourceId,
            creatorId: subscription.creatorId,
            customerId,
            customerEmail: email,
            customerName: name,
            role: 'MEMBER',
            status: 'ACTIVE',
          })
        } else if (resource.type === 'COURSE' && resource.resourceId) {
          await entitlementsRepo.createForOrder({
            id: `ent_mem_course_${subscription.id}_${resource.resourceId}`,
            customerId,
            productId: resource.resourceId,
            orderId: `membership_${subscription.id}`,
            status: 'ACTIVE',
            createdAt: new Date(),
          }).catch(() => { })
        } else if (resource.type === 'DIGITAL_DOWNLOAD' && resource.resourceId) {
          await entitlementsRepo.createForOrder({
            id: `ent_mem_dd_${subscription.id}_${resource.resourceId}`,
            customerId,
            productId: resource.resourceId,
            orderId: `membership_${subscription.id}`,
            status: 'ACTIVE',
            createdAt: new Date(),
          }).catch(() => { })
        } else if (resource.type === 'WEBINAR' && resource.resourceId) {
          await webinarRepo.upsertRegistration({
            webinarId: resource.resourceId,
            productId: resource.resourceId,
            creatorId: subscription.creatorId,
            customerId,
            customerEmail: email,
            customerName: name,
            orderId: `membership_${subscription.id}`,
            status: 'REGISTERED',
            answers: [],
          }).catch(() => { })
        }
      } catch (e) {
        console.error('cascadeEntitlements error for resource:', resource, e)
      }
    }
  },

  async verifyAccess(productId, customerEmail, targetCreatorId = null) {
    if (!productId) throw httpError(400, 'Product ID is required')
    const config = await this.getConfig(productId)
    const membershipId = config.id || productId

    if (targetCreatorId && targetCreatorId === config.creatorId) {
      return { authorized: true, role: 'OWNER', subscription: null, config }
    }

    if (!customerEmail) throw httpError(401, 'Authentication or customer email is required')

    const sub = await membershipRepo.getSubscription(membershipId, customerEmail)
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING')) {
      throw httpError(403, 'Active membership subscription required.')
    }

    return { authorized: true, role: 'MEMBER', subscription: sub, config }
  },

  async cancelSubscription(subscriptionId, customerEmail) {
    const sub = await membershipRepo.getSubscriptionById(subscriptionId)
    if (!sub) throw httpError(404, 'Subscription not found')
    if (sub.customerEmail.toLowerCase() !== customerEmail.toLowerCase().trim()) {
      throw httpError(403, 'Unauthorized to cancel this subscription')
    }

    const config = await membershipRepo.getConfigByProductId(sub.productId)
    const immediate = config?.cancellationPolicy === 'IMMEDIATE'

    const updated = await membershipRepo.updateSubscriptionStatus(
      subscriptionId,
      immediate ? 'CANCELLED' : sub.status,
      {
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
      }
    )

    try {
      const profile = await profilesRepo.getByCreator(sub.creatorId)
      const emailService = getEmailService()
      const endStr = new Date(sub.currentPeriodEnd).toLocaleDateString()
      const tmpl = membershipCancelledEmail({
        productTitle: config?.name || 'Pro Membership',
        creatorName: profile?.displayName || 'Creator',
        currentPeriodEnd: endStr,
      })
      await emailService.sendEmail({ to: customerEmail, ...tmpl })
    } catch (e) { }

    return updated
  },

  async resumeSubscription(subscriptionId, customerEmail) {
    const sub = await membershipRepo.getSubscriptionById(subscriptionId)
    if (!sub) throw httpError(404, 'Subscription not found')
    if (sub.customerEmail.toLowerCase() !== customerEmail.toLowerCase().trim()) {
      throw httpError(403, 'Unauthorized to resume this subscription')
    }

    const updated = await membershipRepo.updateSubscriptionStatus(
      subscriptionId,
      'ACTIVE',
      {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      }
    )
    return updated
  },

  async listSubscriptionsForCreator(creatorId, options = {}) {
    if (!options.productId) {
      const prods = await productsRepo.list(creatorId)
      const memProd = prods.find(p => p.type === 'MEMBERSHIP')
      if (!memProd) return { items: [], total: 0 }
      const conf = await membershipRepo.getConfigByProductId(memProd.id)
      if (!conf) return { items: [], total: 0 }
      return await membershipRepo.listSubscriptionsForMembership(conf.id || memProd.id, options)
    }
    const conf = await membershipRepo.getConfigByProductId(options.productId)
    if (!conf) return { items: [], total: 0 }
    return await membershipRepo.listSubscriptionsForMembership(conf.id || options.productId, options)
  },

  async getCreatorAnalytics(creatorId) {
    return await membershipRepo.getCreatorAnalytics(creatorId)
  },

  async listSubscriptionsForCustomer(customerEmail) {
    if (!customerEmail) return []
    const subs = await membershipRepo.listSubscriptionsForCustomer(customerEmail)
    const results = []
    for (const sub of subs) {
      const config = await membershipRepo.getConfigByProductId(sub.productId)
      const product = await productsRepo.getById(sub.productId)
      results.push({
        subscription: sub,
        config: config || {},
        product: product || {},
      })
    }
    return results
  },

  // ---- Membership Posts ----

  async listPosts(productId, creatorId, options = {}) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    return await membershipPostsRepo.list(productId, options)
  },

  async createPost(productId, creatorId, data) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    if (!data.title?.trim()) throw httpError(400, 'Post title is required')
    return await membershipPostsRepo.create({
      ...data,
      productId,
      creatorId,
    })
  },

  async updatePost(productId, creatorId, postId, data) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    const post = await membershipPostsRepo.getById(postId)
    if (!post || post.productId !== productId) throw httpError(404, 'Post not found')
    return await membershipPostsRepo.update(postId, data)
  },

  async deletePost(productId, creatorId, postId) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    const post = await membershipPostsRepo.getById(postId)
    if (!post || post.productId !== productId) throw httpError(404, 'Post not found')
    await membershipPostsRepo.delete(postId)
    return { deleted: true }
  },

  async publishPost(productId, creatorId, postId) {
    return await this.updatePost(productId, creatorId, postId, {
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString(),
    })
  },

  async duplicatePost(productId, creatorId, postId) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    const post = await membershipPostsRepo.getById(postId)
    if (!post || post.productId !== productId) throw httpError(404, 'Post not found')
    return await membershipPostsRepo.create({
      productId,
      creatorId,
      title: `${post.title} (Copy)`,
      content: post.content,
      coverImage: post.coverImage,
      status: 'DRAFT',
      visibility: post.visibility,
      tierAccess: post.tierAccess,
      categoryId: post.categoryId,
      attachments: post.attachments,
      externalLinks: post.externalLinks,
    })
  },

  // ---- Membership Tiers ----

  async listTiers(productId) {
    return await membershipTiersRepo.listByProduct(productId)
  },

  async saveTier(productId, creatorId, data) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    if (!data.name?.trim()) throw httpError(400, 'Tier name is required')
    return await membershipTiersRepo.upsert({
      ...data,
      productId,
      creatorId,
    })
  },

  async deleteTier(productId, creatorId, tierId) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    const tier = await membershipTiersRepo.getById(tierId)
    if (!tier || tier.productId !== productId) throw httpError(404, 'Tier not found')
    await membershipTiersRepo.delete(tierId)
    return { deleted: true }
  },

  async reorderTiers(productId, creatorId, orderedIds) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    await membershipTiersRepo.reorder(productId, orderedIds)
    return await membershipTiersRepo.listByProduct(productId)
  },

  // ---- Member Management ----

  async updateMember(creatorId, subscriptionId, action, tierId) {
    const sub = await membershipRepo.getSubscriptionById(subscriptionId)
    if (!sub) throw httpError(404, 'Subscription not found')
    if (sub.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (action === 'cancel') {
      return await membershipRepo.updateSubscriptionStatus(subscriptionId, sub.status, {
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
      })
    } else if (action === 'restore') {
      return await membershipRepo.updateSubscriptionStatus(subscriptionId, 'ACTIVE', {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      })
    } else if (action === 'changeTier' && tierId) {
      return await membershipRepo.updateSubscriptionStatus(subscriptionId, sub.status, { tierId })
    }
    throw httpError(400, 'Invalid action')
  },
}

// ---------------- Custom Service (Bespoke Deliverables) ----------------
export const customService = {
  async getConfig(productId) {
    if (!productId) throw httpError(400, 'Product ID is required')
    let config = await customServiceRepo.getConfigByProductId(productId)
    if (!config) {
      const prod = await productsRepo.getById(productId)
      if (!prod) throw httpError(404, 'Product not found')
      config = await customServiceRepo.upsertConfig({
        productId,
        creatorId: prod.creatorId,
        name: prod.title || 'Resume Review',
        shortDescription: prod.shortDescription || '',
        price: prod.price || 1499,
        currency: prod.currency || 'inr',
        deliveryDays: 3,
        revisionLimit: 2,
        status: 'DRAFT',
      })
    }
    return config
  },

  async saveConfig(productId, creatorId, configData) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (configData.isFree) {
      configData.price = 0
    } else if (configData.price !== undefined) {
      configData.price = Math.max(0, Number(configData.price))
    }

    const config = await customServiceRepo.upsertConfig({
      ...configData,
      productId,
      creatorId,
    })

    // Sync title/price to Product model
    await productsRepo.update(productId, {
      title: config.name || prod.title,
      price: config.isFree ? 0 : config.price,
      currency: config.currency,
      shortDescription: config.shortDescription || prod.shortDescription,
    })

    return config
  },

  async getPublicDetails(productIdOrSlug) {
    let prod = await productsRepo.getById(productIdOrSlug)
    if (!prod) prod = await productsRepo.getBySlug(productIdOrSlug)
    if (!prod || (prod.type !== 'CUSTOM_PRODUCT' && prod.type !== 'CUSTOM_SERVICE')) throw httpError(404, 'Custom service product not found')

    const config = await customServiceRepo.getConfigByProductId(prod.id)
    if (!config) throw httpError(404, 'Custom service configuration not found')

    const activeRequestsCount = await customServiceRepo.countActiveRequests(config.id || prod.id)
    const isFull = config.maxActiveRequests ? activeRequestsCount >= Number(config.maxActiveRequests) : false

    return {
      product: {
        id: prod.id,
        title: prod.title,
        slug: prod.slug,
        thumbnail: prod.thumbnail,
        creatorId: prod.creatorId,
      },
      config: {
        id: config.id,
        productId: prod.id,
        name: config.name || prod.title,
        shortDescription: config.shortDescription,
        description: config.description,
        category: config.category,
        tags: config.tags,
        coverImage: config.coverImage,
        price: config.isFree ? 0 : config.price,
        currency: config.currency,
        isFree: config.isFree,
        deliveryDays: config.deliveryDays,
        serviceType: config.serviceType || 'Consulting',
        turnaroundValue: config.turnaroundValue || 3,
        turnaroundUnit: config.turnaroundUnit || 'days',
        revisionLimit: config.revisionLimit,
        packagesEnabled: config.packagesEnabled || false,
        packages: config.packages || [],
        deliverables: config.deliverables || [],
        scopeIncluded: config.scopeIncluded || '',
        scopeExcluded: config.scopeExcluded || '',
        targetAudience: config.targetAudience || '',
        communicationMethod: config.communicationMethod || 'In-app & Email',
        requirements: config.requirements || [],
        workflowStages: config.workflowStages || [],
        callEnabled: config.callEnabled || false,
        meetingUrl: config.meetingUrl || '',
        meetingPlatform: config.meetingPlatform || 'Google Meet',
        meetingInstructions: config.meetingInstructions || '',
        requireRequirementsBeforeStart: config.requireRequirementsBeforeStart !== undefined ? config.requireRequirementsBeforeStart : true,
        allowRevision: config.allowRevision !== undefined ? config.allowRevision : true,
        supportInstructions: config.supportInstructions || '',
        maxActiveRequests: config.maxActiveRequests,
        status: config.status,
      },
      activeRequestsCount,
      isFull,
    }
  },

  async submitFreeRequest(productId, customerData, answers = []) {
    const config = await this.getConfig(productId)
    if (!config) throw httpError(404, 'Custom service not found')
    if (!config.isFree && Number(config.price) > 0) {
      throw httpError(400, 'This custom service requires payment.')
    }

    const activeCount = await customServiceRepo.countActiveRequests(config.id || productId)
    if (config.maxActiveRequests && activeCount >= Number(config.maxActiveRequests)) {
      throw httpError(409, 'This creator has reached maximum active requests for this service.')
    }

    const email = customerData.email ? customerData.email.toLowerCase().trim() : ''
    if (!email) throw httpError(400, 'Email address is required')

    const customer = await customersRepo.upsert(config.creatorId, email, customerData.name || email.split('@')[0])
    const serviceId = config.id || productId

    const req = await customServiceRepo.upsertRequest({
      serviceId,
      productId,
      creatorId: config.creatorId,
      customerId: customer.id,
      customerEmail: email,
      customerName: customerData.name || customer.name || email.split('@')[0],
      orderId: null,
      deliveryDays: config.deliveryDays || 3,
      status: 'SUBMITTED',
      answers: answers || [],
    })

    // Create main entitlement
    await entitlementsRepo.createForOrder({
      id: `ent_req_${req.id}`,
      customerId: customer.id,
      productId,
      orderId: `free_req_${req.id}`,
      status: 'ACTIVE',
      createdAt: new Date(),
    }).catch(() => { })

    try {
      const profile = await profilesRepo.getByCreator(config.creatorId)
      const emailService = getEmailService()
      const dueStr = new Date(req.dueAt).toLocaleDateString()
      const tmpl = customServiceRequestEmail({
        productTitle: config.name || 'Custom Service',
        creatorName: profile?.displayName || 'Creator',
        dueAt: dueStr,
      })
      await emailService.sendEmail({ to: email, ...tmpl })
    } catch (e) { }

    return req
  },

  async verifyAccess(requestId, customerEmail, targetCreatorId = null) {
    if (!requestId) throw httpError(400, 'Request ID is required')
    const req = await customServiceRepo.getRequest(requestId)
    if (!req) throw httpError(404, 'Service request not found')

    if (targetCreatorId && targetCreatorId === req.creatorId) {
      return { authorized: true, role: 'OWNER', request: req }
    }

    if (!customerEmail) throw httpError(401, 'Authentication or customer email is required')

    if (req.customerEmail.toLowerCase() !== customerEmail.toLowerCase().trim()) {
      throw httpError(403, 'Unauthorized access to this service request.')
    }

    // Sanitize out private creator internal notes for customer view
    const sanitized = { ...req, internalNotes: undefined }
    return { authorized: true, role: 'CUSTOMER', request: sanitized }
  },

  async requestClarification(creatorId, requestId, message) {
    const req = await customServiceRepo.getRequest(requestId)
    if (!req) throw httpError(404, 'Service request not found')
    if (req.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (!message || !message.trim()) throw httpError(400, 'Clarification request message is required')

    const updated = await customServiceRepo.updateRequestStatus(requestId, 'CLARIFICATION_REQUIRED', {
      clarificationRequest: {
        message,
        requestedAt: new Date(),
      },
    })
    return updated
  },

  async respondClarification(customerEmail, requestId, message, files = []) {
    const access = await this.verifyAccess(requestId, customerEmail)
    const req = access.request

    const updatedAnswers = [...(req.answers || [])]
    if (message) {
      updatedAnswers.push({
        questionId: 'clarification_response',
        questionText: 'Clarification Response',
        answer: message,
        files: files || [],
        createdAt: new Date(),
      })
    }

    const updated = await customServiceRepo.updateRequestStatus(requestId, 'IN_PROGRESS', {
      answers: updatedAnswers,
      clarificationRequest: null,
    })
    return updated
  },

  async submitDelivery(creatorId, requestId, message, files = []) {
    const req = await customServiceRepo.getRequest(requestId)
    if (!req) throw httpError(404, 'Service request not found')
    if (req.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if ((!files || files.length === 0) && (!message || !message.trim())) {
      throw httpError(400, 'Please provide deliverable files or a response message.')
    }

    const revisionNumber = (req.deliveries?.length || 0) + 1
    const newDelivery = {
      id: uuidv4(),
      revisionNumber,
      message: message || '',
      files: files || [],
      deliveredAt: new Date(),
    }

    const updatedDeliveries = [...(req.deliveries || []), newDelivery]

    const updated = await customServiceRepo.updateRequestStatus(requestId, 'DELIVERED', {
      deliveries: updatedDeliveries,
      revisionRequest: null,
    })

    try {
      const config = await customServiceRepo.getConfigByProductId(req.productId)
      const profile = await profilesRepo.getByCreator(creatorId)
      const emailService = getEmailService()
      const tmpl = customServiceDeliveredEmail({
        productTitle: config?.name || 'Custom Service',
        creatorName: profile?.displayName || 'Creator',
      })
      await emailService.sendEmail({ to: req.customerEmail, ...tmpl })
    } catch (e) { }

    return updated
  },

  async requestRevision(customerEmail, requestId, message) {
    const access = await this.verifyAccess(requestId, customerEmail)
    const req = access.request

    if (req.status !== 'DELIVERED') {
      throw httpError(400, 'Revisions can only be requested after a delivery has been submitted.')
    }

    const config = await customServiceRepo.getConfigByProductId(req.productId)
    const limit = config?.revisionLimit !== undefined ? Number(config.revisionLimit) : 2

    if (limit >= 0 && (req.usedRevisions || 0) >= limit) {
      throw httpError(400, `You have reached the limit of ${limit} included revision(s) for this service.`)
    }

    if (!message || !message.trim()) throw httpError(400, 'Please describe what you would like revised.')

    const usedRevisions = (req.usedRevisions || 0) + 1

    const updated = await customServiceRepo.updateRequestStatus(requestId, 'REVISION_REQUESTED', {
      usedRevisions,
      revisionRequest: {
        message,
        requestedAt: new Date(),
      },
    })
    return updated
  },

  async acceptDelivery(customerEmail, requestId) {
    const access = await this.verifyAccess(requestId, customerEmail)
    const req = access.request

    if (req.status !== 'DELIVERED') {
      throw httpError(400, 'Only delivered service requests can be completed.')
    }

    const updated = await customServiceRepo.updateRequestStatus(requestId, 'COMPLETED', {
      completedAt: new Date(),
    })
    return updated
  },

  async updateInternalNotes(creatorId, requestId, internalNotes) {
    const req = await customServiceRepo.getRequest(requestId)
    if (!req) throw httpError(404, 'Service request not found')
    if (req.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    const updated = await customServiceRepo.updateRequestStatus(requestId, req.status, {
      internalNotes,
    })
    return updated
  },

  async updateStatus(creatorId, requestId, status) {
    const req = await customServiceRepo.getRequest(requestId)
    if (!req) throw httpError(404, 'Service request not found')
    if (req.creatorId !== creatorId) throw httpError(403, 'Unauthorized')
    return await customServiceRepo.updateRequestStatus(requestId, status)
  },

  async listRequestsForCreator(creatorId, options = {}) {
    return await customServiceRepo.listRequestsForCreator(creatorId, options)
  },

  async getCreatorAnalytics(creatorId) {
    return await customServiceRepo.getCreatorAnalytics(creatorId)
  },

  async listRequestsForCustomer(customerEmail) {
    if (!customerEmail) return []
    const reqs = await customServiceRepo.listRequestsForCustomer(customerEmail)
    const results = []
    for (const req of reqs) {
      const config = await customServiceRepo.getConfigByProductId(req.productId)
      const product = await productsRepo.getById(req.productId)
      // Sanitize out creator internal notes
      const sanitizedReq = { ...req, internalNotes: undefined }
      results.push({
        request: sanitizedReq,
        config: config || {},
        product: product || {},
      })
    }
    return results
  },
}

// ---------------- External Link (Link to Anywhere) ----------------
export const externalLink = {
  normalizeAndValidateUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return { valid: false, error: 'Destination URL is required.' }
    }
    const trimmed = rawUrl.trim()
    const lower = trimmed.toLowerCase()

    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('file:') || lower.startsWith('vbscript:')) {
      return { valid: false, error: 'Unsafe URL protocol rejected. Only HTTP/HTTPS URLs are allowed.' }
    }

    let normalized = trimmed
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      normalized = `https://${trimmed}`
    }

    try {
      const parsed = new URL(normalized)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed.' }
      }
      return { valid: true, url: normalized }
    } catch (e) {
      return { valid: false, error: 'Invalid URL format.' }
    }
  },

  async getConfig(productId) {
    if (!productId) throw httpError(400, 'Product ID is required')
    let config = await externalLinkRepo.getConfigByProductId(productId)
    if (!config) {
      const prod = await productsRepo.getById(productId)
      if (!prod) throw httpError(404, 'Product not found')
      config = await externalLinkRepo.upsertConfig({
        productId,
        creatorId: prod.creatorId,
        name: prod.title || 'YouTube Masterclass',
        shortDescription: prod.shortDescription || '',
        price: prod.price || 299,
        currency: prod.currency || 'inr',
        destinationUrl: '',
        destinationType: 'YOUTUBE',
        status: 'DRAFT',
      })
    }
    return config
  },

  async saveConfig(productId, creatorId, configData) {
    const prod = await productsRepo.getById(productId)
    if (!prod) throw httpError(404, 'Product not found')
    if (prod.creatorId !== creatorId) throw httpError(403, 'Unauthorized')

    if (configData.destinationUrl) {
      const check = this.normalizeAndValidateUrl(configData.destinationUrl)
      if (!check.valid) throw httpError(400, check.error || 'Invalid destination URL.')
      configData.destinationUrl = check.url
    }

    if (configData.isFree) {
      configData.price = 0
    } else if (configData.price !== undefined) {
      configData.price = Math.max(0, Number(configData.price))
    }

    const config = await externalLinkRepo.upsertConfig({
      ...configData,
      productId,
      creatorId,
    })

    // Sync title/price to Product model
    await productsRepo.update(productId, {
      title: config.name || prod.title,
      price: config.isFree ? 0 : config.price,
      currency: config.currency,
      shortDescription: config.shortDescription || prod.shortDescription,
    })

    return config
  },

  async getPublicDetails(productIdOrSlug) {
    let prod = await productsRepo.getById(productIdOrSlug)
    if (!prod) prod = await productsRepo.getBySlug(productIdOrSlug)
    if (!prod || prod.type !== 'EXTERNAL_LINK') throw httpError(404, 'External link product not found')

    const config = await externalLinkRepo.getConfigByProductId(prod.id)
    if (!config) throw httpError(404, 'External link configuration not found')

    const openCount = await externalLinkRepo.getLinkOpenCount(prod.id)
    const isPaid = !config.isFree && Number(config.price) > 0

    return {
      product: {
        id: prod.id,
        title: prod.title,
        slug: prod.slug,
        thumbnail: prod.thumbnail,
        creatorId: prod.creatorId,
      },
      config: {
        id: config.id,
        productId: prod.id,
        name: config.name || prod.title,
        shortDescription: config.shortDescription,
        description: config.description,
        category: config.category,
        tags: config.tags,
        coverImage: config.coverImage,
        price: config.isFree ? 0 : config.price,
        currency: config.currency,
        isFree: config.isFree,
        destinationType: config.destinationType,
        accessInstructions: config.accessInstructions,
        status: config.status,
        // SECURITY: Omit protected destinationUrl for paid products on public API
        destinationUrl: isPaid ? undefined : config.destinationUrl,
      },
      openCount,
    }
  },

  async getAuthorizedAccess(productId, customerEmail, creatorId = null) {
    if (!productId) throw httpError(400, 'Product ID is required')
    const prod = await productsRepo.getById(productId)
    if (!prod || prod.type !== 'EXTERNAL_LINK') throw httpError(404, 'External link product not found')

    const config = await externalLinkRepo.getConfigByProductId(productId)
    if (!config) throw httpError(404, 'External link configuration not found')

    // Creator / Owner bypass
    if (creatorId && creatorId === prod.creatorId) {
      return { authorized: true, destinationUrl: config.destinationUrl, config }
    }

    // Free product bypass
    if (config.isFree || Number(config.price) === 0) {
      if (customerEmail) {
        await externalLinkRepo.recordLinkOpen(productId, prod.creatorId, customerEmail)
      }
      return { authorized: true, destinationUrl: config.destinationUrl, config }
    }

    // Paid product: Verify customer purchase entitlement
    if (!customerEmail) throw httpError(401, 'Authentication or customer email is required.')

    const email = customerEmail.toLowerCase().trim()
    const customer = await customersRepo.getByEmail(prod.creatorId, email)
    if (!customer) throw httpError(403, 'You have not purchased access to this external resource.')

    const hasEntitlement = await entitlementsRepo.has(customer.id, productId)
    if (!hasEntitlement) {
      throw httpError(403, 'Purchase required to access this external link resource.')
    }

    // Record open analytics event
    await externalLinkRepo.recordLinkOpen(productId, prod.creatorId, email)

    return {
      authorized: true,
      destinationUrl: config.destinationUrl,
      config,
    }
  },

  async submitFreeAccess(productId, customerData) {
    const config = await this.getConfig(productId)
    if (!config) throw httpError(404, 'External link product not found')

    const email = customerData.email ? customerData.email.toLowerCase().trim() : ''
    if (!email) throw httpError(400, 'Email address is required')

    const customer = await customersRepo.upsert(config.creatorId, email, customerData.name || email.split('@')[0])
    await entitlementsRepo.createForOrder({
      id: `ent_ext_${productId}_${customer.id}`,
      customerId: customer.id,
      productId,
      orderId: `free_ext_${productId}`,
      status: 'ACTIVE',
      createdAt: new Date(),
    }).catch(() => { })

    await externalLinkRepo.recordLinkOpen(productId, config.creatorId, email)
    return { authorized: true, destinationUrl: config.destinationUrl, config }
  },

  async listPurchasesForCustomer(customerEmail) {
    if (!customerEmail) return []
    const email = customerEmail.toLowerCase().trim()
    const customerList = await customersRepo.listByEmail(email)
    if (!customerList || customerList.length === 0) return []

    const customerIds = customerList.map(c => c.id)
    const { supabaseAdmin } = await import('./supabase')
    const { data: entsData } = await supabaseAdmin.from('entitlements').select('*').in('customerId', customerIds).eq('status', 'ACTIVE')
    const ents = entsData || []

    const productIds = Array.from(new Set(ents.map(e => e.productId)))
    const results = []

    for (const pid of productIds) {
      const prod = await productsRepo.getById(pid)
      if (prod && prod.type === 'EXTERNAL_LINK') {
        const config = await externalLinkRepo.getConfigByProductId(prod.id)
        results.push({
          product: prod,
          config: config || {},
          hasAccess: true,
        })
      }
    }
    return results
  },

  async getCreatorAnalytics(creatorId) {
    return await externalLinkRepo.getCreatorAnalytics(creatorId)
  },
}

// ---------------- Customer Account Unified Service ----------------
export const customerAccountService = {
  async getOverview(userEmail) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: customersData } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customers = customersData || []
    const customerIds = customers.map((c) => c.id)

    const { data: allEnts } = await supabaseAdmin.from('entitlements').select('*').eq('status', 'ACTIVE').order('createdAt', { ascending: false })
    const entitlements = (allEnts || []).filter(e => customerIds.includes(e.customerId) || e.customerEmail === email)

    const productIds = Array.from(new Set(entitlements.map((e) => e.productId)))
    const { data: productsData } = await supabaseAdmin.from('products').select('*').in('id', productIds)
    const products = productsData || []
    const productMap = new Map(products.map((p) => [p.id, p]))

    const creatorIds = Array.from(new Set(products.map((p) => p.creatorId)))
    const { data: creatorProfilesData } = await supabaseAdmin.from('creator_profiles').select('*').in('creatorId', creatorIds)
    const creatorProfiles = creatorProfilesData || []
    const creatorMap = new Map(creatorProfiles.map((cp) => [cp.creatorId, cp]))

    const { data: coursesData } = await supabaseAdmin.from('courses').select('*').in('productId', productIds)
    const courses = coursesData || []
    let continueLearning = []
    if (courses.length > 0 && customerIds.length > 0) {
      const { data: progressDocsData } = await supabaseAdmin.from('course_progress').select('*').in('customerId', customerIds)
      const progressDocs = progressDocsData || []
      continueLearning = courses.map((c) => {
        const completedLessons = progressDocs.filter((p) => p.courseId === c.id && p.completed).length
        const totalLessons = c.lessonsCount || 10
        const percentage = Math.min(100, Math.round((completedLessons / Math.max(1, totalLessons)) * 100))
        return {
          courseId: c.id,
          title: c.title,
          thumbnail: c.thumbnail,
          completedLessons,
          totalLessons,
          percentage,
          updatedAt: c.updatedAt || new Date(),
        }
      }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3)
    }

    const upcomingBookings = await db.collection('coaching_bookings').find({
      customerEmail: email,
      status: { $in: ['CONFIRMED', 'PENDING'] },
      startTime: { $gte: new Date().toISOString().slice(0, 10) },
    }).sort({ startTime: 1 }).limit(3).toArray()

    const webinarRegistrations = await db.collection('webinar_attendees').find({ customerEmail: email }).toArray()
    const webinarIds = webinarRegistrations.map((w) => w.webinarId)
    const upcomingWebinars = await db.collection('webinars').find({
      id: { $in: webinarIds },
      scheduledAt: { $gte: new Date().toISOString() },
    }).sort({ scheduledAt: 1 }).limit(3).toArray()

    const activeMemberships = await db.collection('membership_subscriptions').find({
      customerEmail: email,
      status: { $in: ['ACTIVE', 'CANCELS_AT_PERIOD_END'] },
    }).toArray()

    const recentOrders = await db.collection('orders').find({
      $or: [
        { customerId: { $in: customerIds } },
        { customerEmail: email },
      ],
      status: 'PAID',
    }).sort({ createdAt: -1 }).limit(5).toArray()

    const formattedOrders = recentOrders.map((o) => {
      const prod = productMap.get(o.productId)
      const creator = creatorMap.get(o.creatorId)
      return {
        id: o.id,
        productTitle: prod?.title || 'Digital Product',
        productType: prod?.type || 'PRODUCT',
        creatorName: creator?.name || 'Creator',
        amount: o.amount,
        createdAt: o.createdAt,
      }
    })

    const activityTimeline = []
    recentOrders.forEach((o) => {
      const prod = productMap.get(o.productId)
      activityTimeline.push({
        id: `act_order_${o.id}`,
        title: `Purchased ${prod?.title || 'Product'}`,
        type: 'PURCHASE',
        date: o.createdAt,
      })
    })
    upcomingBookings.forEach((b) => {
      activityTimeline.push({
        id: `act_book_${b.id}`,
        title: `Booked coaching session: ${b.sessionTitle || 'Coaching'}`,
        type: 'COACHING',
        date: b.createdAt || b.startTime,
      })
    })

    activityTimeline.sort((a, b) => new Date(b.date) - new Date(a.date))

    return {
      summary: {
        totalPurchases: recentOrders.length,
        activeEntitlements: entitlements.length,
        activeCourses: courses.length,
        upcomingBookingsCount: upcomingBookings.length + upcomingWebinars.length,
        activeMembershipsCount: activeMemberships.length,
      },
      continueLearning,
      upcomingBookings: upcomingBookings.map((b) => {
        const creator = creatorMap.get(b.creatorId)
        return {
          id: b.id,
          sessionTitle: b.sessionTitle || 'Coaching Session',
          creatorName: creator?.name || 'Creator',
          startTime: b.startTime,
          endTime: b.endTime,
          meetingLink: b.meetingLink,
          status: b.status,
        }
      }),
      upcomingWebinars: upcomingWebinars.map((w) => ({
        id: w.id,
        title: w.title,
        scheduledAt: w.scheduledAt,
        joinUrl: w.joinUrl,
      })),
      activeMemberships: activeMemberships.map((m) => ({
        id: m.id,
        planTitle: m.planTitle || 'Membership Plan',
        status: m.status,
        renewsAt: m.currentPeriodEnd,
        price: m.price,
      })),
      recentOrders: formattedOrders,
      activityTimeline: activityTimeline.slice(0, 10),
    }
  },

  async getLibrary(userEmail, { type, search } = {}) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: customersData } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customerIds = (customersData || []).map((c) => c.id)

    const { data: allEnts } = await supabaseAdmin.from('entitlements').select('*').eq('status', 'ACTIVE').order('createdAt', { ascending: false })
    const entitlements = (allEnts || []).filter(e => customerIds.includes(e.customerId) || e.customerEmail === email)

    const productIds = Array.from(new Set(entitlements.map((e) => e.productId)))
    if (productIds.length === 0) return []

    let query = supabaseAdmin.from('products').select('*').in('id', productIds)
    if (type && type !== 'ALL') query = query.eq('type', type)
    const { data: productsData } = await query
    let products = productsData || []

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      products = products.filter((p) => p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }

    const creatorIds = Array.from(new Set(products.map((p) => p.creatorId)))
    const { data: creatorProfilesData } = await supabaseAdmin.from('creator_profiles').select('*').in('creatorId', creatorIds)
    const creatorMap = new Map((creatorProfilesData || []).map((cp) => [cp.creatorId, cp]))

    const items = await Promise.all(products.map(async (p) => {
      const entitlement = entitlements.find((e) => e.productId === p.id)
      const creator = creatorMap.get(p.creatorId)

      let extra = {}
      if (p.type === 'COURSE') {
        const { data: course } = await supabaseAdmin.from('courses').select('*').eq('productId', p.id).maybeSingle()
        if (course) {
          const { data: progressDocs } = customerIds.length > 0 ? await supabaseAdmin.from('course_progress').select('*').in('customerId', customerIds).eq('courseId', course.id).eq('completed', true) : { data: [] }
          extra = { courseId: course.id, completedLessons: (progressDocs || []).length, totalLessons: course.lessonsCount || 10 }
        }
      } else if (p.type === 'COACHING') {
        const { data: booking } = await supabaseAdmin.from('coaching_bookings').select('*').eq('customerEmail', email).eq('productId', p.id).neq('status', 'CANCELLED').maybeSingle()
        if (booking) {
          extra = { bookingId: booking.id, startTime: booking.startTime, endTime: booking.endTime, meetingLink: booking.meetingLink, status: booking.status }
        }
      } else if (p.type === 'WEBINAR') {
        const { data: webinar } = await supabaseAdmin.from('webinar_configs').select('*').eq('productId', p.id).maybeSingle()
        if (webinar) {
          extra = { webinarId: webinar.id, scheduledAt: webinar.scheduledAt, joinUrl: webinar.joinUrl }
        }
      } else if (p.type === 'COMMUNITY') {
        const { data: config } = await supabaseAdmin.from('community_configs').select('*').eq('productId', p.id).maybeSingle()
        if (config) {
          extra = { communityId: config.id, name: config.name, memberCount: config.memberCount || 1 }
        }
      } else if (p.type === 'CUSTOM_SERVICE') {
        const { data: req } = await supabaseAdmin.from('custom_service_requests').select('*').eq('customerEmail', email).eq('productId', p.id).maybeSingle()
        if (req) {
          extra = { requestId: req.id, serviceStatus: req.status, deliveryDate: req.deliveryDate }
        }
      } else if (p.type === 'EXTERNAL_LINK') {
        const { data: config } = await supabaseAdmin.from('external_link_configs').select('*').eq('productId', p.id).maybeSingle()
        if (config) {
          extra = { configId: config.id }
        }
      } else if (p.type === 'MEMBERSHIP') {
        const { data: sub } = await supabaseAdmin.from('membership_subscriptions').select('*').eq('customerEmail', email).eq('productId', p.id).maybeSingle()
        if (sub) {
          extra = { subscriptionId: sub.id, subStatus: sub.status, renewsAt: sub.currentPeriodEnd }
        }
      }

      return {
        id: p.id,
        title: p.title,
        type: p.type,
        thumbnail: p.coverImage || p.thumbnail,
        description: p.shortDescription || p.description,
        creatorName: creator?.name || 'Creator',
        creatorAvatar: creator?.avatarUrl || '',
        purchasedAt: entitlement?.createdAt || p.createdAt,
        fileInfo: p.fileId ? { fileName: p.fileName, fileSize: p.fileSize } : null,
        extra,
      }
    }))

    return items
  },

  async getOrders(userEmail) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: customersData } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customerIds = (customersData || []).map((c) => c.id)

    const { data: allOrders } = await supabaseAdmin.from('orders').select('*').order('createdAt', { ascending: false })
    const orders = (allOrders || []).filter(o => customerIds.includes(o.customerId) || o.customerEmail?.toLowerCase() === email)

    const productIds = Array.from(new Set(orders.map((o) => o.productId)))
    const { data: productsData } = await supabaseAdmin.from('products').select('*').in('id', productIds)
    const productMap = new Map((productsData || []).map((p) => [p.id, p]))

    const creatorIds = Array.from(new Set(orders.map((o) => o.creatorId)))
    const { data: creatorProfilesData } = await supabaseAdmin.from('creator_profiles').select('*').in('creatorId', creatorIds)
    const creatorMap = new Map((creatorProfilesData || []).map((cp) => [cp.creatorId, cp]))

    return orders.map((o) => {
      const prod = productMap.get(o.productId)
      const creator = creatorMap.get(o.creatorId)
      return {
        id: o.id,
        orderNumber: o.id.slice(0, 8).toUpperCase(),
        productId: o.productId,
        productTitle: prod?.title || 'Product',
        productType: prod?.type || 'PRODUCT',
        creatorName: creator?.name || 'Creator',
        amount: o.amount,
        currency: o.currency || 'INR',
        status: o.status,
        createdAt: o.createdAt,
      }
    })
  },

  async getOrderById(userEmail, orderId) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle()
    if (!order) throw httpError(404, 'Order not found')

    const { data: customersData } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customerIds = (customersData || []).map((c) => c.id)

    const isOwner = order.customerEmail?.toLowerCase() === email || customerIds.includes(order.customerId)
    if (!isOwner) throw httpError(403, 'You do not have permission to view this order')

    const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', order.productId).maybeSingle()
    const { data: creatorProfile } = await supabaseAdmin.from('creator_profiles').select('*').eq('creatorId', order.creatorId).maybeSingle()
    const { data: entitlement } = await supabaseAdmin.from('entitlements').select('*').eq('orderId', order.id).maybeSingle()

    return {
      id: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      productId: order.productId,
      productTitle: product?.title || 'Product',
      productType: product?.type || 'PRODUCT',
      creatorName: creatorProfile?.name || 'Creator',
      amount: order.amount,
      currency: order.currency || 'INR',
      status: order.status,
      razorpayOrderId: order.razorpayOrderId,
      createdAt: order.createdAt,
      entitlementStatus: entitlement?.status || (order.status === 'PAID' ? 'ACTIVE' : 'INACTIVE'),
    }
  },

  async getDownloads(userEmail) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: customersData } = await supabaseAdmin.from('customers').select('*').eq('email', email)
    const customerIds = (customersData || []).map((c) => c.id)

    const { data: allEnts } = await supabaseAdmin.from('entitlements').select('*').eq('status', 'ACTIVE')
    const entitlements = (allEnts || []).filter(e => customerIds.includes(e.customerId) || e.customerEmail?.toLowerCase() === email)

    const productIds = Array.from(new Set(entitlements.map((e) => e.productId)))
    const { data: productsData } = await supabaseAdmin.from('products').select('*').in('id', productIds).eq('type', 'DIGITAL_DOWNLOAD')
    const products = productsData || []

    const creatorIds = Array.from(new Set(products.map((p) => p.creatorId)))
    const { data: creatorProfilesData } = await supabaseAdmin.from('creator_profiles').select('*').in('creatorId', creatorIds)
    const creatorMap = new Map((creatorProfilesData || []).map((cp) => [cp.creatorId, cp]))

    return products.map((p) => {
      const ent = entitlements.find((e) => e.productId === p.id)
      const creator = creatorMap.get(p.creatorId)

      return {
        id: p.id,
        productId: p.id,
        title: p.title,
        description: p.description,
        creatorName: creator?.name || 'Creator',
        fileName: p.fileName || 'download',
        fileSize: p.fileSize,
        fileMime: p.fileMime,
        purchasedAt: ent?.createdAt || p.createdAt,
      }
    })
  },

  async getNotifications(userEmail) {
    const email = String(userEmail || '').toLowerCase().trim()
    const { supabaseAdmin } = await import('./supabase')

    const { data: ordersData } = await supabaseAdmin.from('orders').select('*').eq('customerEmail', email).eq('status', 'PAID').order('createdAt', { ascending: false }).limit(5)
    const { data: bookingsData } = await supabaseAdmin.from('coaching_bookings').select('*').eq('customerEmail', email).eq('status', 'CONFIRMED').order('startTime', { ascending: true }).limit(5)
    const { data: serviceRequestsData } = await supabaseAdmin.from('custom_service_requests').select('*').eq('customerEmail', email).order('updatedAt', { ascending: false }).limit(5)

    const orders = ordersData || []
    const bookings = bookingsData || []
    const serviceRequests = serviceRequestsData || []

    orders.forEach((o) => {
      notifications.push({
        id: `notif_order_${o.id}`,
        title: 'Payment Successful',
        message: `Your payment of ₹${o.amount} for order #${o.id.slice(0, 6)} was successful.`,
        type: 'ORDER',
        createdAt: o.createdAt,
        read: true,
        link: `/account/orders/${o.id}`,
      })
    })

    bookings.forEach((b) => {
      notifications.push({
        id: `notif_book_${b.id}`,
        title: 'Upcoming Coaching Session',
        message: `Your session "${b.sessionTitle || 'Coaching'}" is confirmed for ${b.startTime}.`,
        type: 'COACHING',
        createdAt: b.createdAt || new Date(),
        read: false,
        link: '/account/coaching',
      })
    })

    serviceRequests.forEach((s) => {
      notifications.push({
        id: `notif_svc_${s.id}`,
        title: `Service Status: ${s.status}`,
        message: `Your service request for "${s.title || 'Custom Service'}" is currently ${s.status}.`,
        type: 'SERVICE',
        createdAt: s.updatedAt || new Date(),
        read: false,
        link: '/account/services',
      })
    })

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return {
      unreadCount: notifications.filter((n) => !n.read).length,
      notifications: notifications.slice(0, 10),
    }
  },
}

// ---------------- Creator Platform Subscriptions ----------------
export const creatorSubscriptionService = {
  async assertActiveEntitlement(creatorId, feature = 'mutation') {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const sub = await this.getStatus(creatorId)

    const isPaid = sub.status === 'ACTIVE' && !sub.isTrial
    const isTrialActive = Boolean(sub.isTrial && !sub.isTrialExpired && (sub.status === 'TRIALING' || sub.trialStatus === 'ACTIVE'))
    const hasActiveEntitlement = isPaid || isTrialActive

    if (!hasActiveEntitlement) {
      const err = httpError(403, 'Your Pro trial has ended. Upgrade your plan to continue selling and creating content.')
      err.code = 'PLAN_UPGRADE_REQUIRED'
      err.planId = sub.planId
      err.trialStatus = sub.trialStatus
      err.status = 403
      throw err
    }

    if (feature && feature !== 'mutation' && feature !== 'read' && feature !== 'any') {
      const isVerifiedPro = (isPaid || isTrialActive) && sub.rawStatus !== 'PENDING' && (sub.status === 'ACTIVE' || isTrialActive) && hasEntitlement(sub.planId, feature, isTrialActive ? 'TRIALING' : sub.status)
      const isEntitled = (feature === 'removeBranding')
        ? isVerifiedPro
        : hasEntitlement(sub.planId, feature, isTrialActive ? 'TRIALING' : sub.status)

      if (!isEntitled) {
        const err = httpError(403, feature === 'removeBranding'
          ? 'An active Pro subscription is required to remove CreatorStore footer branding.'
          : 'Upgrade your plan to unlock this feature.')
        err.code = 'PLAN_UPGRADE_REQUIRED'
        err.planId = sub.planId
        err.feature = feature
        err.status = 403
        throw err
      }
    }

    return { allowed: true, sub }
  },
  async getEffectiveSubscription(creatorId) {
    return getEffectiveSubscription(creatorId)
  },
  async getPlanEntitlements(creatorId) {
    return getPlanEntitlements(creatorId)
  },
  async hasEntitlement(creatorId, featureKey) {
    return checkEntitlementForUserOrPlan(creatorId, featureKey)
  },
  async requireEntitlement(creatorId, featureKey) {
    return requireEntitlement(creatorId, featureKey)
  },
  mapProviderPlanToInternalPlan(provider, providerPlanId) {
    return mapProviderPlanToInternalPlan(provider, providerPlanId)
  },
  async get(creatorId) {
    return this.getStatus(creatorId)
  },
  async getStatus(creatorId, existingUser = null) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const user = existingUser || await usersRepo.findById(creatorId)
    if (!user) throw httpError(404, 'User not found')

    let sub = await creatorSubscriptionsRepo.getByCreator(creatorId).catch(() => null)
    if (!sub) {
      sub = {
        status: 'INACTIVE',
        plan: 'UNSUBSCRIBED',
        billingCycle: 'MONTHLY',
        price: 0,
        currency: 'INR',
        trialStatus: 'NOT_STARTED',
      }
    }

    const now = new Date()
    let effectiveStatus = sub.status || 'INACTIVE'
    let currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
    let trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null
    let trialStartedAt = sub.trialStartedAt ? new Date(sub.trialStartedAt) : null
    let trialStatus = sub.trialStatus || 'NOT_STARTED'
    let isTrial = false
    let isTrialExpired = false
    let daysRemaining = 0

    let inGracePeriod = false
    let gracePeriodEndsAt = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt) : null
    let gracePeriodDaysRemaining = 0
    let isPastDue = false

    const hasPaidPeriod = Boolean(sub.razorpayPaymentId || sub.providerSubscriptionId || (sub.price && sub.price > 0))
    const isPaidSub = Boolean(hasPaidPeriod && !isTrial)

    // 1. Check Paid Subscription state with grace period & paid-through protection
    if (sub.status === 'ACTIVE' && currentPeriodEnd && currentPeriodEnd > now) {
      effectiveStatus = 'ACTIVE'
      isTrial = false
      daysRemaining = Math.max(0, Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    } else if ((sub.status === 'PENDING' || sub.status === 'HALTED' || sub.status === 'CANCELLED') && hasPaidPeriod && currentPeriodEnd && currentPeriodEnd > now) {
      // User is STILL within their already paid billing cycle! Paid access must not be revoked prematurely.
      effectiveStatus = 'ACTIVE'
      isTrial = false
      isPastDue = sub.status === 'PENDING' || sub.status === 'HALTED'
      daysRemaining = Math.max(0, Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    } else if ((sub.status === 'PENDING' || sub.status === 'HALTED') && gracePeriodEndsAt && gracePeriodEndsAt > now) {
      // Current period has ended, but user is within configured grace period!
      effectiveStatus = 'ACTIVE'
      isTrial = false
      inGracePeriod = true
      isPastDue = true
      gracePeriodDaysRemaining = Math.max(1, Math.ceil((gracePeriodEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      daysRemaining = 0
    } else if (sub.status === 'ACTIVE' && currentPeriodEnd && now >= currentPeriodEnd) {
      effectiveStatus = 'EXPIRED'
      isTrial = false
      daysRemaining = 0
    } else if (sub.status === 'HALTED') {
      effectiveStatus = 'HALTED'
      isTrial = false
      daysRemaining = 0
    } else if (sub.status === 'CANCELLED') {
      effectiveStatus = 'CANCELLED'
      isTrial = false
      daysRemaining = 0
    } else if (trialStartedAt || trialStatus === 'ACTIVE' || sub.status === 'TRIALING') {
      // 2. Evaluate Trial state
      if (trialEndsAt && now >= trialEndsAt) {
        // Trial expired!
        trialStatus = 'EXPIRED'
        effectiveStatus = 'EXPIRED'
        isTrial = false
        isTrialExpired = true
        daysRemaining = 0
      } else if (trialEndsAt && now < trialEndsAt && (trialStatus === 'ACTIVE' || sub.status === 'TRIALING')) {
        // Trial is ACTIVE! Full Pro access
        trialStatus = 'ACTIVE'
        effectiveStatus = 'TRIALING'
        isTrial = true
        isTrialExpired = false
        daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      } else {
        effectiveStatus = 'INACTIVE'
        isTrial = false
      }
    } else {
      const subAgeMs = (sub.updatedAt || sub.createdAt) ? (now.getTime() - new Date(sub.updatedAt || sub.createdAt).getTime()) : 0
      const isRazorpayPending = sub.provider === 'RAZORPAY' && sub.status === 'PENDING'
      const ttlMs = isRazorpayPending ? (getRazorpayPendingSubscriptionTimeoutMinutes() * 60 * 1000) : getPendingPaymentTTLMs()
      const isPendingCheckoutExpired = (sub.status === 'PENDING') && subAgeMs > ttlMs

      if (effectiveStatus === 'ACTIVE' && currentPeriodEnd && now > currentPeriodEnd) {
        effectiveStatus = 'EXPIRED'
      } else if (isPendingCheckoutExpired) {
        effectiveStatus = 'EXPIRED'
      } else if (effectiveStatus !== 'ACTIVE' && effectiveStatus !== 'TRIALING') {
        effectiveStatus = 'INACTIVE'
      }
    }

    // Resolve planId
    let planId = PLAN_IDS.UNSUBSCRIBED
    if (isTrial) {
      planId = PLAN_IDS.PRO
    } else if (effectiveStatus === 'ACTIVE') {
      planId = normalizePlanId(sub.plan, 'ACTIVE')
    } else {
      planId = PLAN_IDS.UNSUBSCRIBED
    }

    const isAnnual = String(sub.billingInterval || sub.billingCycle || '').toUpperCase().trim() === 'ANNUAL' || String(sub.billingInterval || '').toLowerCase().trim() === 'yearly'
    const billingInterval = isAnnual ? 'ANNUAL' : 'MONTHLY'
    const billingCycle = isAnnual ? 'ANNUAL' : 'MONTHLY'

    const subCurrency = (sub.currency || 'USD').toUpperCase()
    const currencySymbol = subCurrency === 'USD' ? '$' : '₹'
    const region = subCurrency === 'USD' ? BILLING_REGIONS.INTERNATIONAL : BILLING_REGIONS.INDIA

    let planConfig = getPlanConfig(planId, isTrial ? 'TRIALING' : effectiveStatus, isAnnual ? 'annual' : 'monthly', subCurrency)
    let planDisplay = isTrial ? 'Pro' : planConfig.name
    let fullPlanTitle = isTrial ? 'CreatorStore Pro (7-Day Free Trial)' : `CreatorStore ${planDisplay} Plan (${isAnnual ? 'Annual' : 'Monthly'})`

    const canonicalPrice = planConfig.price
    const storedPrice = (sub.price !== undefined && sub.price !== null && sub.price !== '')
      ? Number(sub.price)
      : (sub.amount !== undefined && sub.amount !== null && sub.amount !== '' ? Number(sub.amount) : null)

    // A stored price is only valid if it matches the current plan's pricing model.
    // If a user upgraded to PRO, a stale storedPrice of 6 (the old Creator price) must NOT be used.
    const isMismatchedStoredPrice = storedPrice !== null && (
      (planId === 'PRO' && storedPrice === (subCurrency === 'USD' ? (isAnnual ? 58 : 6) : (isAnnual ? 4790 : 499))) ||
      (planId === 'CREATOR' && storedPrice === (subCurrency === 'USD' ? (isAnnual ? 115 : 12) : (isAnnual ? 9590 : 999)))
    )

    const price = isTrial
      ? 0
      : ((storedPrice !== null && storedPrice > 0 && !isMismatchedStoredPrice)
        ? storedPrice
        : canonicalPrice)

    if (sub.id && effectiveStatus === 'ACTIVE' && !isTrial && (isMismatchedStoredPrice || (planId === 'PRO' && Number(sub.amount) !== price))) {
      creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
        amount: price,
        price,
      }).catch(err => console.warn('[Subscription] Failed to reconcile subscription amount:', err.message))
    }
    const startDate = sub.createdAt || sub.startDate || trialStartedAt || null

    const latestPayment = (sub.razorpayPaymentId || sub.razorpayOrderId) ? {
      razorpayPaymentId: sub.razorpayPaymentId || 'pay_active_sub',
      razorpayOrderId: sub.razorpayOrderId || sub.pendingOrderId || 'order_active_sub',
      amount: price,
      currency: subCurrency,
      currencySymbol,
      status: 'Successful',
      createdAt: sub.updatedAt || sub.createdAt || now,
    } : null

    const paymentHistory = latestPayment ? [
      {
        id: sub.razorpayPaymentId || sub.id || 'pay_1',
        paymentId: sub.razorpayPaymentId || 'pay_active_sub',
        orderId: sub.razorpayOrderId || 'order_active_sub',
        amount: price,
        currency: subCurrency,
        currencySymbol,
        date: sub.updatedAt || sub.createdAt || now,
        status: 'Successful',
        plan: fullPlanTitle,
      }
    ] : []

    let pendingUpgrade = null
    const activeDodoSubId = sub.dodoSubscriptionId || sub.providerSubscriptionId

    if (activeDodoSubId && activeDodoSubId.startsWith('sub_') && isDodoConfigured()) {
      try {
        let recentPayments = []
        try {
          recentPayments = await dodoProvider.listPayments({ subscriptionId: activeDodoSubId, limit: 10 })
        } catch (e) {
          console.warn('[Dodo] Could not list subscription payments in getStatus:', e.message)
        }

        // 0. Authoritative check: if DB is marked PRO, but Dodo subscription is actually CREATOR and no PRO payment succeeded
        if (sub.plan === 'PRO') {
          const verifiedSub = await dodoProvider.getSubscription(activeDodoSubId).catch(() => null)
          const verifiedPlan = identifyProductPlan(verifiedSub?.product_id)
          if (verifiedPlan.planId === 'CREATOR') {
            const hasSucceededProPayment = recentPayments.some(p => p.status === 'succeeded' && (identifyProductPlan(p.product_id).planId === 'PRO' || p.metadata?.planId === 'PRO'))
            if (!hasSucceededProPayment) {
              console.warn(`[Dodo] Database has PRO for creator ${creatorId}, but authoritative Dodo subscription ${activeDodoSubId} is CREATOR. Auto-reconciling to CREATOR.`)
              await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
                plan: 'CREATOR',
                amount: 6,
                currency: 'USD',
              })
              sub.plan = 'CREATOR'
              planId = PLAN_IDS.CREATOR
              planConfig = getPlanConfig(planId, effectiveStatus, isAnnual ? 'annual' : 'monthly')
              planDisplay = planConfig.name
              fullPlanTitle = `CreatorStore ${planDisplay} Plan (${isAnnual ? 'Annual' : 'Monthly'})`
            }
          }
        }

        // 1. Authoritative check: if a plan change payment succeeded on Dodo, verify subscription with Dodo
        const successfulPlanChange = recentPayments.find(p => p.charge_type === 'plan_change' && p.status === 'succeeded')
        if (successfulPlanChange && sub.plan !== 'PRO') {
          const verifiedSub = await dodoProvider.getSubscription(activeDodoSubId).catch(() => null)
          const verifiedPlan = identifyProductPlan(verifiedSub?.product_id)
          if (verifiedPlan.planId === 'PRO') {
            const proConfig = getPlanConfig('PRO', 'ACTIVE', isAnnual ? 'annual' : 'monthly', subCurrency)
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              plan: 'PRO',
              price: proConfig.price,
              amount: proConfig.price,
              dodoPaymentId: successfulPlanChange.payment_id,
              currentPeriodEnd: verifiedSub.next_billing_date ? new Date(verifiedSub.next_billing_date) : undefined,
              pendingUpgradeStatus: null,
              pendingUpgradePaymentId: null,
            })
            planId = PLAN_IDS.PRO
            sub.plan = 'PRO'
            planConfig = proConfig
            planDisplay = planConfig.name
            fullPlanTitle = `CreatorStore ${planDisplay} Plan (${isAnnual ? 'Annual' : 'Monthly'})`
          }
        }

        // 2. Identify in-flight or stale pending plan change (only if not already on confirmed PRO)
        const inFlightPlanChange = sub.plan !== 'PRO'
          ? recentPayments.find(p => p.charge_type === 'plan_change' && (p.status === 'processing' || p.status === 'pending'))
          : null
        if (inFlightPlanChange) {
          const payAgeMs = inFlightPlanChange.created_at ? (Date.now() - new Date(inFlightPlanChange.created_at).getTime()) : 0
          const ttlMs = getPendingPaymentTTLMs()
          const isStale = payAgeMs > ttlMs

          if (inFlightPlanChange.error_message) {
            pendingUpgrade = {
              targetPlan: 'PRO',
              status: 'FAILED',
              paymentId: inFlightPlanChange.payment_id,
              amount: inFlightPlanChange.total_amount ? (inFlightPlanChange.total_amount / 100) : null,
              currency: inFlightPlanChange.currency,
              createdAt: inFlightPlanChange.created_at,
              errorMessage: inFlightPlanChange.error_message,
              paymentLink: inFlightPlanChange.payment_link || null,
              message: `Upgrade payment requires attention: ${inFlightPlanChange.error_message}. Your Creator plan remains active.`,
              canRetry: true,
              canUpdatePaymentMethod: true,
              isStale,
              needsAttention: true,
            }
          } else if (isStale) {
            const ageHours = Math.round(payAgeMs / 3600000)
            const staleMsg = `Upgrade payment has been processing with Dodo Payments for ${ageHours} hours. Dodo does not allow automated cancellation of in-flight card authorizations. Resolution required: Update your payment method to replace this payment, or contact Dodo support quoting Payment ID ${inFlightPlanChange.payment_id}.`
            pendingUpgrade = {
              targetPlan: 'PRO',
              status: 'STALE_PROCESSING',
              paymentId: inFlightPlanChange.payment_id,
              amount: inFlightPlanChange.total_amount ? (inFlightPlanChange.total_amount / 100) : null,
              currency: inFlightPlanChange.currency,
              createdAt: inFlightPlanChange.created_at,
              errorMessage: null,
              paymentLink: inFlightPlanChange.payment_link || null,
              message: staleMsg,
              isStale: true,
              needsAttention: true,
              ageHours,
              canRetry: false,
              canUpdatePaymentMethod: true,
              requiredResolution: 'UPDATE_PAYMENT_METHOD_OR_SUPPORT',
            }
          } else {
            pendingUpgrade = {
              targetPlan: 'PRO',
              status: inFlightPlanChange.status.toUpperCase(),
              paymentId: inFlightPlanChange.payment_id,
              amount: inFlightPlanChange.total_amount ? (inFlightPlanChange.total_amount / 100) : null,
              currency: inFlightPlanChange.currency,
              createdAt: inFlightPlanChange.created_at,
              errorMessage: null,
              paymentLink: inFlightPlanChange.payment_link || null,
              message: 'Your upgrade to Pro is currently processing with the payment provider. Entitlements will activate once confirmed.',
              canRetry: false,
              canUpdatePaymentMethod: false,
              isStale: false,
              needsAttention: false,
            }
          }
        } else if (sub.pendingUpgradeStatus && sub.plan !== 'PRO') {
          const isStale = sub.pendingUpgradeStatus === 'STALE_PROCESSING' || (sub.pendingUpgradeStartedAt && (Date.now() - new Date(sub.pendingUpgradeStartedAt).getTime() > getPendingPaymentTTLMs()))
          pendingUpgrade = {
            targetPlan: sub.pendingUpgradePlan || 'PRO',
            status: sub.pendingUpgradeStatus,
            paymentId: sub.pendingUpgradePaymentId || null,
            amount: sub.pendingUpgradeAmount ? Number(sub.pendingUpgradeAmount) : null,
            currency: sub.pendingUpgradeCurrency || subCurrency,
            createdAt: sub.pendingUpgradeStartedAt ? new Date(sub.pendingUpgradeStartedAt).toISOString() : null,
            errorMessage: sub.pendingUpgradeErrorMessage || null,
            paymentLink: sub.pendingUpgradePaymentLink || null,
            message: sub.pendingUpgradeErrorMessage || 'Upgrade state pending reconciliation.',
            isStale: Boolean(isStale),
            needsAttention: Boolean(isStale || sub.pendingUpgradeErrorMessage),
            canRetry: sub.pendingUpgradeStatus === 'FAILED' || sub.pendingUpgradeStatus === 'EXPIRED',
            canUpdatePaymentMethod: true,
          }
        }

        // 3. Populate authentic payment history from Dodo payments
        if (recentPayments.length > 0) {
          paymentHistory.length = 0
          for (const p of recentPayments) {
            const isSuccess = p.status === 'succeeded'
            const isProc = p.status === 'processing' || p.status === 'pending'
            paymentHistory.push({
              id: p.payment_id,
              paymentId: p.payment_id,
              orderId: p.payment_id,
              amount: p.total_amount ? (p.total_amount / 100) : price,
              currency: p.currency || subCurrency,
              currencySymbol: p.currency === 'INR' ? '₹' : (p.currency === 'USD' ? '$' : currencySymbol),
              date: p.created_at || now,
              status: isSuccess ? 'Successful' : (isProc ? 'Processing' : 'Failed'),
              plan: p.charge_type === 'plan_change' ? 'CreatorStore Pro Plan (Upgrade)' : fullPlanTitle,
              chargeType: p.charge_type,
              errorMessage: p.error_message || null,
            })
          }
        }
      } catch (err) {
        console.warn('[Dodo Payments] Error checking recent payments for getStatus:', err.message)
      }
    }

    let isUpgraded = false
    let previousPlan = null
    let previousSubscriptionReplaced = false
    let previousSubscriptionCancelledConfirmed = false

    if (planId === 'PRO' && effectiveStatus === 'ACTIVE') {
      try {
        const logs = await prisma.subscriptionAuditLog.findMany({
          where: {
            creatorId,
            event: { in: ['SUPERSEDED_SUBSCRIPTION_CANCELLED', 'PLAN_UPGRADE_COMPLETED', 'UPGRADE_OLD_SUBSCRIPTION_CANCEL_FAILED'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
        const upgradeLog = logs.find(l => l.event === 'PLAN_UPGRADE_COMPLETED' || l.event === 'SUPERSEDED_SUBSCRIPTION_CANCELLED')
        if (upgradeLog) {
          isUpgraded = true
          previousPlan = 'Creator'
          previousSubscriptionReplaced = true
          previousSubscriptionCancelledConfirmed = logs.some(l => l.event === 'SUPERSEDED_SUBSCRIPTION_CANCELLED')
        }
      } catch (e) {}
    }

    return {
      status: effectiveStatus,
      rawStatus: sub.status || 'PENDING',
      trialStatus,
      trialStartedAt: trialStartedAt ? trialStartedAt.toISOString() : null,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      isTrial,
      isTrialExpired,
      planId,
      plan: planDisplay,
      fullPlanTitle,
      billingInterval,
      billingCycle,
      isAnnual,
      price,
      currency: subCurrency,
      currencySymbol,
      region,
      priceFormatted: subCurrency === 'USD' ? `$${price}` : `₹${Number(price).toLocaleString('en-IN')}`,
      entitlements: planConfig.entitlements,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString() : (startDate ? new Date(startDate).toISOString() : null),
      currentPeriodEnd: isTrial && trialEndsAt ? trialEndsAt.toISOString() : (currentPeriodEnd ? currentPeriodEnd.toISOString() : null),
      nextBillingDate: isPaidSub && currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
      daysRemaining,
      cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
      canSell: user.role === 'CREATOR' && (effectiveStatus === 'ACTIVE' || effectiveStatus === 'TRIALING'),
      provider: (sub.provider || 'DODO').toUpperCase(),
      paymentProvider: (sub.provider || 'DODO').toLowerCase(),
      isRecurring: true,
      renewalType: 'AUTO_RENEWING',
      dodoSubscriptionId: sub.dodoSubscriptionId || sub.providerSubscriptionId || null,
      dodoPaymentId: sub.dodoPaymentId || null,
      providerSubscriptionId: sub.dodoSubscriptionId || sub.providerSubscriptionId || null,
      razorpaySubscriptionId: sub.providerSubscriptionId || null,
      razorpayOrderId: sub.razorpayOrderId || sub.pendingOrderId || null,
      razorpayPaymentId: sub.razorpayPaymentId || null,
      scheduledPlan: sub.scheduledPlan || null,
      scheduledChangeAt: sub.scheduledChangeAt ? new Date(sub.scheduledChangeAt).toISOString() : null,
      scheduledInterval: sub.scheduledInterval || null,
      hasScheduledChange: Boolean(sub.scheduledPlan),
      isCheckoutExpired: Boolean((sub.status === 'PENDING') && (((sub.updatedAt || sub.createdAt) ? (now.getTime() - new Date(sub.updatedAt || sub.createdAt).getTime()) : 0) > ((sub.provider === 'RAZORPAY') ? (getRazorpayPendingSubscriptionTimeoutMinutes() * 60 * 1000) : getPendingPaymentTTLMs()))),
      checkoutExpiredAt: ((sub.status === 'PENDING') && (sub.updatedAt || sub.createdAt)) ? new Date(new Date(sub.updatedAt || sub.createdAt).getTime() + ((sub.provider === 'RAZORPAY') ? (getRazorpayPendingSubscriptionTimeoutMinutes() * 60 * 1000) : getPendingPaymentTTLMs())).toISOString() : null,
      pendingPaymentTTLMinutes: (sub.provider === 'RAZORPAY') ? getRazorpayPendingSubscriptionTimeoutMinutes() : getPendingPaymentTTLMinutes(),
      authStatus: sub.authStatus || null,
      inGracePeriod: Boolean(inGracePeriod),
      gracePeriodEndsAt: gracePeriodEndsAt ? gracePeriodEndsAt.toISOString() : null,
      gracePeriodDaysRemaining,
      isPastDue: Boolean(isPastDue),
      isHalted: sub.status === 'HALTED' || sub.authStatus === 'HALTED',
      lastPaymentFailureReason: sub.lastPaymentFailureReason || null,
      lastPaymentFailureAt: sub.lastPaymentFailureAt ? new Date(sub.lastPaymentFailureAt).toISOString() : null,
      lastInvoiceId: sub.lastInvoiceId || null,
      hasAccess: Boolean(effectiveStatus === 'ACTIVE' || effectiveStatus === 'TRIALING'),
      isRetryPending: Boolean(sub.authStatus === 'PENDING_RETRY' || (isPastDue && sub.status === 'PENDING')),
      isSubscriptionCancelled: Boolean(sub.status === 'CANCELLED' || sub.authStatus === 'CANCELLED'),
      retryCount: sub.retryCount || 0,
      isUpgraded,
      previousPlan,
      previousSubscription: isUpgraded ? 'Replaced by Pro Plan' : null,
      previousSubscriptionReplaced,
      previousSubscriptionCancelledConfirmed,
      pendingUpgrade,
      latestPayment,
      paymentHistory,
    }
  },

  async createCheckoutSession(creatorId, body = {}) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const user = await usersRepo.findById(creatorId)
    if (!user) throw httpError(404, 'User not found')

    return await withCreatorLock(creatorId, async () => {
      // 1. Load authoritative subscription state from database
      const existingSub = await creatorSubscriptionsRepo.getByCreator(creatorId).catch(() => null)
      const now = new Date()

      const isCurrentlyActivePaid = (
        existingSub &&
        existingSub.status === 'ACTIVE' &&
        existingSub.currentPeriodEnd &&
        new Date(existingSub.currentPeriodEnd) > now &&
        (existingSub.dodoSubscriptionId || existingSub.providerSubscriptionId || existingSub.razorpayPaymentId)
      )

      const rawPlan = body?.plan || 'PRO'
      const validPlans = ['CREATOR', 'CREATOR_MONTHLY', 'PRO', 'CREATOR_PRO']
      if (body?.plan && !validPlans.includes(String(body.plan).toUpperCase().trim())) {
        throw httpError(400, `Invalid subscription plan: '${body.plan}'. Allowed plans are CREATOR or PRO.`)
      }

      const rawInterval = body?.interval || body?.billingInterval || body?.billingCycle || 'monthly'
      const validIntervals = ['monthly', 'annual', 'yearly']
      if (body?.interval && !validIntervals.includes(String(body.interval).toLowerCase().trim())) {
        throw httpError(400, `Invalid billing interval: '${body.interval}'. Allowed intervals are monthly or annual.`)
      }
      // Centralized provider & region selection:
      // If the creator already has a billing record with an established provider, preserve that provider and currency.
      // New checkout provider selection strictly follows country/region payment-routing rules.
      let provider
      let region
      if (isCurrentlyActivePaid && existingSub?.provider) {
        provider = String(existingSub.provider).toLowerCase()
        region = (existingSub.currency === 'INR' || provider === 'razorpay')
          ? BILLING_REGIONS.INDIA
          : BILLING_REGIONS.INTERNATIONAL
      } else {
        const userCountry = requireUserCountry(user)
        provider = getSubscriptionProviderForCountry(userCountry)
        region = getBillingRegionForCountry(userCountry)
      }

      // 2. Centralized server-authoritative billing resolution
      const billingConfig = resolveBillingConfig({
        plan: rawPlan,
        interval: rawInterval,
        region,
      })

      const selectedPlanId = billingConfig.planId
      const isAnnual = billingConfig.isAnnual
      const intervalKey = billingConfig.intervalKey
      const currency = billingConfig.currency
      const chargeAmount = billingConfig.amount
      const requestedInterval = billingConfig.billingInterval

      // 3. ENFORCE SINGLE ACTIVE SUBSCRIPTION: Handle existing active paid subscriptions
      if (isCurrentlyActivePaid) {
        const activePlanId = normalizePlanId(existingSub.plan, 'ACTIVE')
        const activeInterval = String(existingSub.billingInterval || existingSub.billingCycle || 'MONTHLY').toUpperCase()
        const activeDodoSubId = existingSub.dodoSubscriptionId || existingSub.providerSubscriptionId

        // A. Same Plan & Same Billing Interval -> Never create a second subscription!
        if (activePlanId === selectedPlanId && activeInterval === requestedInterval) {
          return {
            alreadyActive: true,
            currentPlan: true,
            status: 'ACTIVE',
            planId: activePlanId,
            planName: billingConfig.planName,
            billingInterval: activeInterval,
            message: `You already have an active ${billingConfig.planName} (${billingConfig.billingInterval.toLowerCase()}) subscription.`,
            subscription: existingSub,
          }
        }

        // B. Plan Change on Existing Dodo Subscription
        if (activeDodoSubId && activeDodoSubId.startsWith('sub_') && (existingSub.provider || '').toUpperCase() === 'DODO') {
          // Check if this is an UPGRADE (Creator -> Pro, or Monthly -> Annual on same tier)
          const isTierUpgrade = activePlanId === 'CREATOR' && selectedPlanId === 'PRO'
          const isCycleUpgrade = activePlanId === selectedPlanId && activeInterval === 'MONTHLY' && requestedInterval === 'ANNUAL'
          const isUpgrade = isTierUpgrade || isCycleUpgrade

          if (isUpgrade) {
            console.log(`[Dodo Payments] Initiating Pro upgrade workflow for creator ${creatorId} from ${activePlanId} (${activeInterval}) to ${selectedPlanId} (${requestedInterval})`)

            // 1. Authoritative check: verify if the user's active Dodo subscription is already confirmed as PRO
            const verifiedSub = await dodoProvider.getSubscription(activeDodoSubId).catch(() => null)
            const verifiedPlan = identifyProductPlan(verifiedSub?.product_id)
            if (verifiedPlan.planId === selectedPlanId && verifiedSub?.status === 'active') {
              return {
                alreadyActive: true,
                currentPlan: true,
                status: 'ACTIVE',
                planId: selectedPlanId,
                planName: billingConfig.planName,
                billingInterval: requestedInterval,
                message: `You already have an active ${billingConfig.planName} (${billingConfig.billingInterval.toLowerCase()}) subscription.`,
                subscription: existingSub,
              }
            }

            // 2. Safe retry / double-click protection & pending upgrade reconciliation:
            const existingPendingId = existingSub.pendingUpgradePaymentId
            const existingLink = existingSub.pendingUpgradePaymentLink
            const startedAt = existingSub.pendingUpgradeStartedAt ? new Date(existingSub.pendingUpgradeStartedAt).getTime() : 0
            const isWithinTtl = (Date.now() - startedAt) < (getPendingPaymentTTLMinutes() * 60 * 1000)
            const isSameTargetPlan = existingSub.pendingUpgradePlan === selectedPlanId && (existingSub.pendingUpgradeInterval || 'MONTHLY') === requestedInterval

            if (existingPendingId && existingSub.pendingUpgradeStatus === 'PENDING_CHECKOUT') {
              try {
                const pendingSession = await dodoProvider.getCheckoutSession(existingPendingId)
                if (pendingSession?.payment_status === 'succeeded') {
                  console.log(`[Dodo Payments] Pending upgrade checkout session ${existingPendingId} already succeeded! Activating PRO.`)
                  let verifiedUpgradeSub = null
                  if (pendingSession.subscription_id) {
                    verifiedUpgradeSub = await dodoProvider.getSubscription(pendingSession.subscription_id).catch(() => null)
                  }
                  const currentPeriodEnd = verifiedUpgradeSub?.next_billing_date
                    ? new Date(verifiedUpgradeSub.next_billing_date)
                    : new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000)

                  const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
                    plan: selectedPlanId,
                    billingInterval: requestedInterval,
                    dodoPaymentId: pendingSession.payment_id || null,
                    dodoSubscriptionId: pendingSession.subscription_id || existingSub.dodoSubscriptionId,
                    providerSubscriptionId: pendingSession.subscription_id || existingSub.providerSubscriptionId,
                    currentPeriodStart: new Date(),
                    currentPeriodEnd,
                    pendingUpgradeStatus: null,
                    pendingUpgradePaymentId: null,
                    pendingUpgradePlan: null,
                    pendingUpgradePaymentLink: null,
                  })
                  if (activeDodoSubId && pendingSession.subscription_id && activeDodoSubId !== pendingSession.subscription_id) {
                    await dodoProvider.cancelSubscription(activeDodoSubId, { immediately: true }).catch(() => {})
                  }
                  return {
                    alreadyActive: true,
                    currentPlan: true,
                    status: 'ACTIVE',
                    planId: selectedPlanId,
                    planName: billingConfig.planName,
                    billingInterval: requestedInterval,
                    message: `Your Pro upgrade is confirmed and active!`,
                    subscription: updatedSub,
                  }
                }
              } catch (pendingErr) {
                const isNotFound = pendingErr?.status === 404 || pendingErr?.message?.includes('404')
                if (!isNotFound) {
                  console.warn(`[Dodo Payments] Network/API issue checking pending upgrade ${existingPendingId}:`, pendingErr.message)
                  return {
                    pending: true,
                    status: 'PENDING_RECONCILIATION',
                    provider: 'dodo',
                    planId: selectedPlanId,
                    message: 'We are currently verifying your upgrade with Dodo Payments. Please wait a moment before trying again.',
                    subscription: existingSub,
                  }
                }
              }

              if (existingLink && isWithinTtl && isSameTargetPlan) {
                console.log(`[Dodo Payments] Reusing existing active upgrade checkout session for creator ${creatorId}`)
                return {
                  provider: 'dodo',
                  flowType: 'plan_upgrade',
                  checkoutUrl: existingLink,
                  sessionId: existingPendingId,
                  planId: selectedPlanId,
                  billingInterval: requestedInterval,
                  amount: chargeAmount,
                  currency,
                  currencySymbol: billingConfig.currencySymbol,
                  price: chargeAmount,
                  priceFormatted: billingConfig.priceFormatted,
                  region: billingConfig.region,
                  isRecurring: true,
                  renewalType: 'AUTO_RENEWING',
                  resumed: true,
                  message: `Please complete checkout on Dodo to finalize your upgrade to ${billingConfig.planName}.`,
                }
              } else if (!isWithinTtl) {
                console.log(`[Dodo Payments] Expired upgrade attempt ${existingPendingId} (> ${getPendingPaymentTTLMinutes()}m). Clearing pending upgrade lock while keeping Creator active...`)
                await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
                  pendingUpgradeStatus: null,
                  pendingUpgradePaymentId: null,
                  pendingUpgradePlan: null,
                  pendingUpgradeStartedAt: null,
                  pendingUpgradePaymentLink: null,
                })
              }
            }

            // 3. Create fresh hosted checkout session for Pro product/price on Dodo
            const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
            const customerName = profile?.name || profile?.displayName || user.name || 'Creator'

            console.log(`[Dodo Payments] Creating fresh upgrade checkout session for creator ${creatorId} (Product: ${billingConfig.dodoProductId})`)

            const dodoSession = await dodoProvider.createSubscriptionCheckoutSession({
              creatorId,
              productId: billingConfig.dodoProductId,
              planId: selectedPlanId,
              billingInterval: requestedInterval,
              customerEmail: user.email,
              customerName,
              metadata: {
                creatorId,
                planId: selectedPlanId,
                billingInterval: requestedInterval,
                region: billingConfig.region,
                isUpgrade: 'true',
                previousSubscriptionId: activeDodoSubId,
                previousPlan: activePlanId,
                checkoutType: 'CREATOR_SUBSCRIPTION',
              },
            })

            // 4. Record pending upgrade state without altering current Creator active subscription
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              pendingUpgradeStatus: 'PENDING_CHECKOUT',
              pendingUpgradePaymentId: dodoSession.sessionId,
              pendingUpgradePaymentLink: dodoSession.checkoutUrl,
              pendingUpgradePlan: selectedPlanId,
              pendingUpgradeInterval: requestedInterval,
              pendingUpgradeStartedAt: new Date(),
              pendingUpgradeAmount: chargeAmount,
              pendingUpgradeCurrency: currency,
              pendingUpgradeErrorMessage: null,
            })

            await subscriptionAuditLogsRepo.record(creatorId, 'PLAN_UPGRADE_CHECKOUT_CREATED', {
              fromPlan: activePlanId,
              targetPlan: selectedPlanId,
              billingInterval: requestedInterval,
              previousSubscriptionId: activeDodoSubId,
              sessionId: dodoSession.sessionId,
              amount: chargeAmount,
              currency,
            }).catch(() => {})

            return {
              provider: 'dodo',
              flowType: 'plan_upgrade',
              checkoutUrl: dodoSession.checkoutUrl,
              sessionId: dodoSession.sessionId,
              orderId: dodoSession.sessionId,
              amount: chargeAmount,
              currency,
              currencySymbol: billingConfig.currencySymbol,
              planId: selectedPlanId,
              interval: intervalKey,
              billingInterval: requestedInterval,
              price: chargeAmount,
              priceFormatted: billingConfig.priceFormatted,
              region: billingConfig.region,
              isRecurring: true,
              renewalType: 'AUTO_RENEWING',
              message: `Please complete checkout on Dodo to finalize your upgrade to ${billingConfig.planName}.`,
            }
          }

          // DOWNGRADE (Pro -> Creator, or Annual -> Monthly)
          const isTierDowngrade = activePlanId === 'PRO' && selectedPlanId === 'CREATOR'
          const isCycleDowngrade = activePlanId === selectedPlanId && activeInterval === 'ANNUAL' && requestedInterval === 'MONTHLY'

          if (isTierDowngrade || isCycleDowngrade) {
            console.log(`[Dodo Payments] Scheduling downgrade for subscription ${activeDodoSubId} to ${selectedPlanId} at next billing date (${existingSub.currentPeriodEnd})`)
            try {
              await dodoProvider.changeSubscriptionPlan(activeDodoSubId, {
                productId: billingConfig.dodoProductId,
                prorationBillingMode: 'full_immediately',
                quantity: 1,
                effectiveAt: 'next_billing_date',
                cancelScheduledChangePlan: true,
                metadata: {
                  creatorId,
                  planId: selectedPlanId,
                  billingInterval: requestedInterval,
                  region: billingConfig.region,
                  checkoutType: 'CREATOR_SUBSCRIPTION',
                },
              })
            } catch (err) {
              console.error(`[Dodo Payments] Plan change downgrade API error:`, err.message)
              await subscriptionAuditLogsRepo.record(creatorId, 'PLAN_DOWNGRADE_FAILED', {
                providerSubscriptionId: activeDodoSubId,
                fromPlan: activePlanId,
                targetPlan: selectedPlanId,
                error: err.message,
              }).catch(() => {})
              throw httpError(400, `Unable to schedule downgrade: ${err.message}. Please contact support.`)
            }

            // User retains active Pro entitlements until currentPeriodEnd!
            const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              scheduledPlan: selectedPlanId,
              scheduledChangeAt: existingSub.currentPeriodEnd,
              scheduledInterval: requestedInterval,
            })

            await subscriptionAuditLogsRepo.record(creatorId, 'PLAN_DOWNGRADE_SCHEDULED', {
              providerSubscriptionId: activeDodoSubId,
              fromPlan: activePlanId,
              toPlan: selectedPlanId,
              billingInterval: requestedInterval,
              effectiveAt: existingSub.currentPeriodEnd,
            }).catch(() => {})

            const effectiveDateStr = existingSub.currentPeriodEnd ? new Date(existingSub.currentPeriodEnd).toLocaleDateString() : 'your next billing date'
            return {
              success: true,
              scheduledDowngrade: true,
              status: 'ACTIVE',
              planId: activePlanId,
              scheduledPlan: selectedPlanId,
              scheduledChangeAt: existingSub.currentPeriodEnd ? new Date(existingSub.currentPeriodEnd).toISOString() : null,
              message: `Your downgrade to ${billingConfig.planName} is scheduled for ${effectiveDateStr}. You will retain full Pro access until then.`,
              subscription: updatedSub,
            }
          }
        }

        // C. Plan Change / Upgrade on Existing Razorpay Subscription
        const isRazorpayActive = (existingSub.provider || '').toUpperCase() === 'RAZORPAY' || (existingSub.providerSubscriptionId && !existingSub.providerSubscriptionId.startsWith('sub_dodo_') && !existingSub.dodoSubscriptionId)
        if (isRazorpayActive) {
          const isTierUpgrade = activePlanId === 'CREATOR' && selectedPlanId === 'PRO'
          const isCycleUpgrade = activePlanId === selectedPlanId && activeInterval === 'MONTHLY' && requestedInterval === 'ANNUAL'
          const isUpgrade = isTierUpgrade || isCycleUpgrade

          if (isUpgrade) {
            console.log(`[Razorpay] Initiating Pro upgrade workflow for creator ${creatorId} from ${activePlanId} (${activeInterval}) to ${selectedPlanId} (${requestedInterval})`)

            const rzpProvider = getPaymentProvider()
            const activeRzpSubId = existingSub.providerSubscriptionId || existingSub.razorpayOrderId

            // 1. Authoritative check: verify if the user's active Razorpay subscription is already confirmed as PRO
            if (activeRzpSubId) {
              const verifiedSub = await rzpProvider.fetchSubscription(activeRzpSubId).catch(() => null)
              if (verifiedSub && (verifiedSub.status === 'active' || verifiedSub.status === 'authenticated')) {
                const verifiedPlan = identifyProductPlan(verifiedSub.plan_id)
                if (verifiedPlan.planId === 'PRO') {
                  return {
                    alreadyActive: true,
                    currentPlan: true,
                    status: 'ACTIVE',
                    planId: 'PRO',
                    planName: billingConfig.planName,
                    billingInterval: requestedInterval,
                    message: `You already have an active ${billingConfig.planName} subscription.`,
                    subscription: existingSub,
                  }
                }
              }
            }

            // 2. Safe retry / double-click protection & pending upgrade reconciliation:
            const existingPendingId = existingSub.pendingUpgradePaymentId
            const startedAt = existingSub.pendingUpgradeStartedAt ? new Date(existingSub.pendingUpgradeStartedAt).getTime() : 0
            const isWithinTtl = (Date.now() - startedAt) < (getPendingPaymentTTLMinutes() * 60 * 1000)
            const isSameTargetPlan = existingSub.pendingUpgradePlan === selectedPlanId && (existingSub.pendingUpgradeInterval || 'MONTHLY') === requestedInterval

            if (existingPendingId && existingSub.pendingUpgradeStatus === 'PENDING_CHECKOUT') {
              // Reconcile status of the existing pending upgrade subscription on Razorpay
              try {
                const checkPendingSub = await rzpProvider.fetchSubscription(existingPendingId)
                if (checkPendingSub && (checkPendingSub.status === 'active' || checkPendingSub.status === 'authenticated')) {
                  console.log(`[Razorpay] Pending upgrade subscription ${existingPendingId} is already ${checkPendingSub.status}! Activating PRO.`)
                  const currentPeriodEnd = checkPendingSub.current_end ? new Date(checkPendingSub.current_end * 1000) : new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000)
                  const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
                    plan: 'PRO',
                    provider: 'RAZORPAY',
                    providerSubscriptionId: existingPendingId,
                    razorpayOrderId: existingPendingId,
                    authStatus: 'ACTIVE',
                    lastVerifiedAt: new Date(),
                    currentPeriodStart: new Date(),
                    currentPeriodEnd,
                    pendingUpgradeStatus: null,
                    pendingUpgradePaymentId: null,
                    pendingUpgradePlan: null,
                  })
                  if (activeRzpSubId && activeRzpSubId !== existingPendingId) {
                    await rzpProvider.cancelSubscription(activeRzpSubId, false).catch(() => {})
                  }
                  return {
                    alreadyActive: true,
                    currentPlan: true,
                    status: 'ACTIVE',
                    planId: 'PRO',
                    planName: billingConfig.planName,
                    billingInterval: requestedInterval,
                    message: `Your Pro upgrade is confirmed and active!`,
                    subscription: updatedSub,
                  }
                }
              } catch (pendingErr) {
                const isNotFound = pendingErr?.statusCode === 404 || pendingErr?.error?.code === 'BAD_REQUEST_ERROR'
                if (!isNotFound) {
                  console.warn(`[Razorpay] Network/API issue while checking pending upgrade ${existingPendingId}:`, pendingErr.message)
                  return {
                    pending: true,
                    status: 'PENDING_RECONCILIATION',
                    provider: 'razorpay',
                    planId: selectedPlanId,
                    message: 'We are currently verifying your upgrade with Razorpay. Please wait a moment before trying again.',
                    subscription: existingSub,
                  }
                }
              }

              if (isWithinTtl && isSameTargetPlan) {
                console.log(`[Razorpay] Reusing existing active upgrade checkout session ${existingPendingId} for creator ${creatorId}`)
                return {
                  provider: 'razorpay',
                  flowType: 'plan_upgrade',
                  subscriptionId: existingPendingId,
                  orderId: existingPendingId,
                  keyId: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                  amount: billingConfig.amountSmallestUnit,
                  currency: 'INR',
                  currencySymbol: '₹',
                  planId: selectedPlanId,
                  interval: intervalKey,
                  billingInterval: requestedInterval,
                  price: chargeAmount,
                  priceFormatted: billingConfig.priceFormatted,
                  region: 'INDIA',
                  isRecurring: true,
                  renewalType: 'AUTO_RENEWING',
                  isUpgrade: true,
                  previousSubscriptionId: activeRzpSubId,
                  resumed: true,
                  message: `Please complete checkout on Razorpay to finalize your upgrade to ${billingConfig.planName}.`,
                }
              } else if (!isWithinTtl) {
                // Cancel expired upgrade attempt on Razorpay, leave Creator subscription intact
                console.log(`[Razorpay] Expired upgrade attempt ${existingPendingId} (> ${getPendingPaymentTTLMinutes()}m). Cancelling attempt on Razorpay...`)
                await rzpProvider.cancelSubscription(existingPendingId, false).catch(() => {})
                await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
                  pendingUpgradeStatus: null,
                  pendingUpgradePaymentId: null,
                  pendingUpgradePlan: null,
                  pendingUpgradeStartedAt: null,
                })
              }
            }

            // 3. Create fresh Pro subscription on Razorpay
            console.log(`[Razorpay] Creating Pro upgrade subscription for creator ${creatorId} (Plan ID: ${billingConfig.planIdRazorpay}, INR ${chargeAmount})`)
            let rzpSub
            try {
              rzpSub = await rzpProvider.createSubscription({
                planId: billingConfig.planIdRazorpay,
                creatorId,
                planName: billingConfig.planName,
                priceInr: chargeAmount,
                currency: 'INR',
                customerEmail: user.email,
                customerNotify: 1,
                totalCount: isAnnual ? 10 : 120,
              })
            } catch (subErr) {
              console.error(`[Razorpay] Pro upgrade subscription creation failed:`, subErr.message)
              throw httpError(400, subErr.message || 'Unable to create Razorpay upgrade subscription session')
            }

            const newSubscriptionId = rzpSub.id

            // 4. Record pending upgrade state WITHOUT altering current Creator active subscription
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              pendingUpgradeStatus: 'PENDING_CHECKOUT',
              pendingUpgradePaymentId: newSubscriptionId,
              pendingUpgradePlan: selectedPlanId,
              pendingUpgradeInterval: requestedInterval,
              pendingUpgradeStartedAt: new Date(),
              pendingUpgradeAmount: chargeAmount,
              pendingUpgradeCurrency: 'INR',
              pendingUpgradeErrorMessage: null,
            })

            await subscriptionAuditLogsRepo.record(creatorId, 'PLAN_UPGRADE_CHECKOUT_CREATED', {
              provider: 'RAZORPAY',
              fromPlan: activePlanId,
              targetPlan: selectedPlanId,
              billingInterval: requestedInterval,
              previousSubscriptionId: activeRzpSubId,
              newSubscriptionId,
              amount: chargeAmount,
              currency: 'INR',
            }).catch(() => {})

            return {
              provider: 'razorpay',
              flowType: 'plan_upgrade',
              subscriptionId: newSubscriptionId,
              orderId: newSubscriptionId,
              keyId: rzpSub.keyId || process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
              amount: billingConfig.amountSmallestUnit,
              currency: 'INR',
              currencySymbol: '₹',
              planId: selectedPlanId,
              interval: intervalKey,
              billingInterval: requestedInterval,
              price: chargeAmount,
              priceFormatted: billingConfig.priceFormatted,
              region: 'INDIA',
              isRecurring: true,
              renewalType: 'AUTO_RENEWING',
              isUpgrade: true,
              previousSubscriptionId: activeRzpSubId,
              message: `Please complete payment to upgrade from Creator to ${billingConfig.planName}. Your Creator access remains active until confirmed.`,
            }
          }

          // User is active on PRO and requested CREATOR on Razorpay (or already has higher plan)
          if (activePlanId === 'PRO' && selectedPlanId === 'CREATOR') {
            console.log(`[Razorpay] Creator ${creatorId} already has active Pro plan; rejecting lower Creator checkout`)
            return {
              alreadyActive: true,
              currentPlan: true,
              status: 'ACTIVE',
              planId: activePlanId,
              planName: 'Pro',
              billingInterval: activeInterval,
              message: `You currently have an active Pro subscription which includes all Creator features. Your Pro access remains active until ${existingSub.currentPeriodEnd ? new Date(existingSub.currentPeriodEnd).toLocaleDateString() : 'the end of your billing cycle'}.`,
              subscription: existingSub,
            }
          }
        }
      }

      // 4. PENDING CHECKOUT RESOLUTION & RECONCILIATION
      // Every subscription attempt first checks the database, reconciles pending payments with the correct provider, and creates a new checkout only when necessary.
      const isPending = existingSub && (existingSub.status === 'PENDING' || existingSub.status === 'CREATED')
      if (isPending) {
        const subAgeMs = (existingSub.updatedAt || existingSub.createdAt) ? (Date.now() - new Date(existingSub.updatedAt || existingSub.createdAt).getTime()) : 0
        const ttlMs = getPendingPaymentTTLMinutes() * 60 * 1000 // 30 minutes
        const isOlderThanTtl = subAgeMs > ttlMs

        // Use the provider recorded on this attempt, NOT recalculating it from user country
        const recordedProvider = (
          existingSub.provider ||
          (existingSub.dodoSubscriptionId?.startsWith('cks_') ? 'DODO' : (existingSub.providerSubscriptionId?.startsWith('sub_') ? 'RAZORPAY' : provider))
        ).toUpperCase()
        const isRecordedRzp = recordedProvider === 'RAZORPAY'
        const isRecordedDodo = recordedProvider === 'DODO'

        const isSamePlanAndCycle = (
          normalizePlanId(existingSub.plan, 'ACTIVE') === selectedPlanId &&
          String(existingSub.billingInterval || existingSub.billingCycle || 'MONTHLY').toUpperCase() === requestedInterval
        )

        // --- A. RECONCILE RECORDED RAZORPAY ATTEMPT ---
        if (isRecordedRzp && existingSub.providerSubscriptionId) {
          const rzpProvider = getPaymentProvider()
          let rzpSub = null
          let rzpOutage = false

          try {
            rzpSub = await withBoundedBackoff(async () => {
              return await rzpProvider.fetchSubscription(existingSub.providerSubscriptionId)
            }, { maxAttempts: 2, initialDelay: 200 })
          } catch (fetchErr) {
            const isNotFound = fetchErr?.statusCode === 404 || fetchErr?.error?.code === 'BAD_REQUEST_ERROR'
            if (!isNotFound) {
              console.warn(`[Razorpay Reconciliation] API error while checking pending subscription ${existingSub.providerSubscriptionId}:`, fetchErr.message)
              rzpOutage = true
            }
          }

          if (rzpOutage) {
            // Provider is unavailable: preserve safe pending state, do not create duplicate subscription
            return {
              pending: true,
              status: 'PENDING_RECONCILIATION',
              provider: 'razorpay',
              planId: existingSub.plan || selectedPlanId,
              message: 'We are currently verifying your payment with Razorpay. Please wait a moment before trying again.',
              subscription: existingSub,
            }
          }

          // 1. Success on provider: reconcile to ACTIVE
          if (rzpSub?.status === 'active' || rzpSub?.status === 'authenticated') {
            console.log(`[Razorpay Reconciliation] Subscription ${existingSub.providerSubscriptionId} is already ${rzpSub.status}! Activating subscription.`)
            const currentPeriodEnd = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000)
            const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              authStatus: 'ACTIVE',
              lastVerifiedAt: new Date(),
              currentPeriodStart: new Date(),
              currentPeriodEnd,
              plan: selectedPlanId,
              billingInterval: requestedInterval,
            })
            await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
            return {
              alreadyActive: true,
              currentPlan: true,
              status: 'ACTIVE',
              planId: selectedPlanId,
              planName: billingConfig.planName,
              billingInterval: requestedInterval,
              message: `Your ${billingConfig.planName} subscription is already active.`,
              subscription: updatedSub,
            }
          }

          // 2. Confirmed still pending ('created') on Razorpay
          if (rzpSub?.status === 'created') {
            if (isOlderThanTtl) {
              console.log(`[Razorpay Reconciliation] Pending subscription ${existingSub.providerSubscriptionId} exceeded 30m TTL (${Math.round(subAgeMs / 60000)}m). Cancelling on Razorpay and marking EXPIRED.`)
              try {
                await rzpProvider.cancelSubscription(existingSub.providerSubscriptionId, false)
              } catch (cancelErr) {
                console.warn('[Razorpay] Non-fatal cancel warning during expiration:', cancelErr.message)
              }
              await creatorSubscriptionsRepo.updateStatus(creatorId, 'EXPIRED', {
                status: 'EXPIRED',
                authStatus: 'EXPIRED',
                cancellationReason: 'ABANDONED_CHECKOUT_TIMEOUT',
              })
              await subscriptionAuditLogsRepo.record(creatorId, 'CHECKOUT_SESSION_EXPIRED', {
                sessionId: existingSub.providerSubscriptionId,
                ageMinutes: Math.round(subAgeMs / 60000),
                ttlMinutes: 30,
              }).catch(() => {})
              // Permit clean new checkout below
            } else if (isSamePlanAndCycle) {
              console.log(`[Razorpay Reconciliation] Reusing existing valid pending Razorpay subscription ${existingSub.providerSubscriptionId}`)
              return {
                provider: 'razorpay',
                subscriptionId: existingSub.providerSubscriptionId,
                orderId: existingSub.providerSubscriptionId,
                keyId: rzpProvider.keyId || process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: billingConfig.amountSmallestUnit,
                currency: 'INR',
                currencySymbol: '₹',
                planId: selectedPlanId,
                planName: billingConfig.planName,
                interval: intervalKey,
                billingInterval: requestedInterval,
                price: chargeAmount,
                priceFormatted: billingConfig.priceFormatted,
                region: 'INDIA',
                paymentMethodsDescription: billingConfig.paymentMethodsDescription,
                flowType: 'subscription',
                isRecurring: true,
                renewalType: 'AUTO_RENEWING',
                resumed: true,
                isResumed: true,
                message: 'Resuming your existing Razorpay checkout attempt.',
              }
            } else {
              // Different plan chosen: cancel previous created subscription on Razorpay
              try {
                console.log(`[Razorpay] Cancelling superseded subscription ${existingSub.providerSubscriptionId} due to plan change...`)
                await rzpProvider.cancelSubscription(existingSub.providerSubscriptionId, false)
              } catch (cancelErr) {}
            }
          } else if (rzpSub?.status === 'cancelled' || rzpSub?.status === 'expired') {
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'CANCELLED', {
              status: 'CANCELLED',
              authStatus: 'CANCELLED',
            })
            // Permit clean new checkout below
          }
        }

        // --- B. RECONCILE RECORDED DODO ATTEMPT ---
        if (isRecordedDodo && existingSub.dodoSubscriptionId && existingSub.dodoSubscriptionId.startsWith('cks_')) {
          let session = null
          let dodoOutage = false

          try {
            session = await withBoundedBackoff(async () => {
              return await dodoProvider.getCheckoutSession(existingSub.dodoSubscriptionId)
            }, { maxAttempts: 2, initialDelay: 200 })
          } catch (sessionErr) {
            const isNotFound = sessionErr?.status === 404 || sessionErr?.message?.includes('404')
            if (!isNotFound) {
              console.warn(`[Dodo Reconciliation] API error while checking checkout session ${existingSub.dodoSubscriptionId}:`, sessionErr.message)
              dodoOutage = true
            }
          }

          if (dodoOutage) {
            // Provider is unavailable: preserve safe pending state, do not create duplicate subscription
            return {
              pending: true,
              status: 'PENDING_RECONCILIATION',
              provider: 'dodo',
              planId: existingSub.plan || selectedPlanId,
              message: 'We are currently verifying your payment with Dodo Payments. Please wait a moment before trying again.',
              subscription: existingSub,
            }
          }

          // 1. Success on provider: reconcile to ACTIVE
          if (session?.payment_status === 'succeeded') {
            console.log(`[Dodo Reconciliation] Checkout session ${existingSub.dodoSubscriptionId} confirmed succeeded! Activating subscription.`)
            let verifiedSub = null
            if (session.subscription_id) {
              verifiedSub = await dodoProvider.getSubscription(session.subscription_id).catch(() => null)
            }
            const currentPeriodEnd = verifiedSub?.next_billing_date
              ? new Date(verifiedSub.next_billing_date)
              : new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000)

            const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              status: 'ACTIVE',
              plan: selectedPlanId,
              billingInterval: requestedInterval,
              dodoPaymentId: session.payment_id || null,
              dodoSubscriptionId: session.subscription_id || existingSub.dodoSubscriptionId,
              providerSubscriptionId: session.subscription_id || existingSub.dodoSubscriptionId,
              currentPeriodStart: new Date(),
              currentPeriodEnd,
            })
            await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
            return {
              alreadyActive: true,
              currentPlan: true,
              status: 'ACTIVE',
              planId: selectedPlanId,
              planName: billingConfig.planName,
              billingInterval: requestedInterval,
              message: `Your ${billingConfig.planName} subscription is already active.`,
              subscription: updatedSub,
            }
          }

          // 2. Processing on Dodo
          if (session?.payment_status === 'processing') {
            return {
              pending: true,
              status: 'PROCESSING',
              provider: 'dodo',
              planId: selectedPlanId,
              message: 'Your payment is currently processing with Dodo Payments. Entitlements will activate once confirmed.',
              subscription: existingSub,
            }
          }

          // 3. Explicitly failed or cancelled on Dodo
          if (session?.payment_status === 'failed' || session?.payment_status === 'cancelled') {
            console.log(`[Dodo Reconciliation] Session ${existingSub.dodoSubscriptionId} reported ${session.payment_status}. Marking FAILED.`)
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'FAILED', { status: 'FAILED' })
            // Permit clean new checkout below
          } else {
            // Unpaid details collection stage
            if (isOlderThanTtl) {
              console.log(`[Dodo Reconciliation] Session ${existingSub.dodoSubscriptionId} exceeded 30m TTL (${Math.round(subAgeMs / 60000)}m). Marking EXPIRED.`)
              await creatorSubscriptionsRepo.updateStatus(creatorId, 'EXPIRED', { status: 'EXPIRED' })
              await subscriptionAuditLogsRepo.record(creatorId, 'CHECKOUT_SESSION_EXPIRED', {
                sessionId: existingSub.dodoSubscriptionId,
                ageMinutes: Math.round(subAgeMs / 60000),
                ttlMinutes: 30,
              }).catch(() => {})
              // Permit clean new checkout below
            } else if (isSamePlanAndCycle && session?.checkout_url) {
              console.log(`[Dodo Reconciliation] Reusing existing valid pending Dodo checkout session ${existingSub.dodoSubscriptionId}`)
              return {
                provider: 'dodo',
                checkoutUrl: session.checkout_url,
                sessionId: existingSub.dodoSubscriptionId,
                subscriptionId: existingSub.dodoSubscriptionId,
                orderId: existingSub.dodoSubscriptionId,
                amount: chargeAmount,
                currency,
                currencySymbol: billingConfig.currencySymbol,
                planId: selectedPlanId,
                interval: intervalKey,
                billingInterval: requestedInterval,
                price: chargeAmount,
                priceFormatted: billingConfig.priceFormatted,
                region: billingConfig.region,
                paymentMethodsDescription: billingConfig.paymentMethodsDescription,
                flowType: 'subscription',
                isRecurring: true,
                renewalType: 'AUTO_RENEWING',
                resumed: true,
                message: 'Resuming your existing checkout attempt.',
              }
            }
          }
        }
      }

      // 5. NEW CHECKOUT: Only for unsubscribed, trialing, cancelled, or expired users
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      const customerName = profile?.name || profile?.displayName || user.name || 'Creator'

      // A. INDIA: Route through Razorpay Subscription Integration
      if (provider === 'razorpay') {
        const rzpProvider = getPaymentProvider()
        const configCheck = rzpProvider.validateConfiguration({ throwOnError: false })
        if (!configCheck.isValid && !rzpProvider.isMock) {
          console.warn('[Razorpay] Configuration issue detected:', configCheck.issues.join(' | '))
        }

        // Cancel previous Razorpay subscription if present and in incomplete created state
        if (existingSub?.provider === 'RAZORPAY' && existingSub?.providerSubscriptionId && existingSub.status === 'PENDING') {
          try {
            console.log(`[Razorpay] Cancelling previous created subscription ${existingSub.providerSubscriptionId} before generating fresh session...`)
            await rzpProvider.cancelSubscription(existingSub.providerSubscriptionId, false)
          } catch (e) {}
        }

        console.log(`[Razorpay] Creating ${intervalKey} subscription for creator ${creatorId} on ${selectedPlanId} plan (INR ${chargeAmount})`)
        let rzpSub
        try {
          rzpSub = await rzpProvider.createSubscription({
            planId: billingConfig.planIdRazorpay,
            creatorId,
            planName: billingConfig.planName,
            priceInr: chargeAmount,
            currency: 'INR',
            customerEmail: user.email,
            customerNotify: 1,
            totalCount: isAnnual ? 10 : 120,
          })
        } catch (subErr) {
          console.error(`[Razorpay] Subscription checkout session creation failed:`, subErr.message)
          throw httpError(400, subErr.message || 'Unable to create Razorpay subscription session')
        }

        const subscriptionId = rzpSub.id

        await creatorSubscriptionsRepo.upsert(creatorId, {
          status: 'PENDING',
          authStatus: 'CREATED',
          plan: selectedPlanId,
          billingInterval: billingConfig.billingInterval,
          billingCycle: billingConfig.billingInterval,
          price: chargeAmount,
          amount: chargeAmount,
          currency: 'INR',
          provider: 'RAZORPAY',
          providerSubscriptionId: subscriptionId,
          razorpayOrderId: subscriptionId,
          pendingOrderId: subscriptionId,
          scheduledPlan: null,
          scheduledChangeAt: null,
          scheduledInterval: null,
          retryCount: 0,
          lastVerifiedAt: new Date(),
        })

        await subscriptionAuditLogsRepo.record(creatorId, 'CHECKOUT_SESSION_CREATED', {
          provider: 'RAZORPAY',
          providerSubscriptionId: subscriptionId,
          plan: selectedPlanId,
          billingInterval: requestedInterval,
          amount: chargeAmount,
          currency: 'INR',
        }).catch(() => {})

        await profilesRepo.upsert(creatorId, { onboardingStatus: 'PAYMENT_PENDING' })

        return {
          provider: 'razorpay',
          subscriptionId,
          orderId: subscriptionId,
          keyId: rzpSub.keyId || process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: billingConfig.amountSmallestUnit,
          currency: 'INR',
          currencySymbol: '₹',
          planId: selectedPlanId,
          planName: billingConfig.planName,
          interval: intervalKey,
          billingInterval: billingConfig.billingInterval,
          price: chargeAmount,
          priceFormatted: billingConfig.priceFormatted,
          region: 'INDIA',
          paymentMethodsDescription: billingConfig.paymentMethodsDescription,
          flowType: 'subscription',
          isRecurring: true,
          renewalType: 'AUTO_RENEWING',
          message: `Razorpay subscription created. Complete checkout via Razorpay modal to activate ${billingConfig.planName}.`,
        }
      }

      // B. OUTSIDE INDIA: Route through Dodo Payments Integration
      console.log(`[Dodo Payments] Creating ${intervalKey} checkout session for creator ${creatorId} on ${selectedPlanId} plan (${currency} ${chargeAmount})`)

      const dodoSession = await dodoProvider.createSubscriptionCheckoutSession({
        creatorId,
        productId: billingConfig.dodoProductId,
        planId: selectedPlanId,
        billingInterval: billingConfig.billingInterval,
        customerEmail: user.email,
        customerNotify: 1,
        customerName,
        metadata: {
          creatorId,
          planId: selectedPlanId,
          billingInterval: billingConfig.billingInterval,
          region: billingConfig.region,
        },
      })

      const sessionId = dodoSession.sessionId

      await creatorSubscriptionsRepo.upsert(creatorId, {
        status: 'PENDING',
        plan: selectedPlanId,
        billingInterval: billingConfig.billingInterval,
        billingCycle: billingConfig.billingInterval,
        price: chargeAmount,
        currency,
        provider: 'DODO',
        providerSubscriptionId: sessionId,
        dodoSubscriptionId: sessionId,
        pendingOrderId: null,
        scheduledPlan: null,
        scheduledChangeAt: null,
        scheduledInterval: null,
      })

      await subscriptionAuditLogsRepo.record(creatorId, 'CHECKOUT_SESSION_CREATED', {
        providerSubscriptionId: sessionId,
        plan: selectedPlanId,
        billingInterval: requestedInterval,
        amount: chargeAmount,
        currency,
      }).catch(() => {})

      await profilesRepo.upsert(creatorId, { onboardingStatus: 'PAYMENT_PENDING' })

      return {
        provider: 'dodo',
        checkoutUrl: dodoSession.checkoutUrl,
        sessionId: sessionId,
        subscriptionId: sessionId,
        orderId: sessionId,
        amount: chargeAmount,
        currency,
        currencySymbol: billingConfig.currencySymbol,
        planId: selectedPlanId,
        interval: intervalKey,
        billingInterval: billingConfig.billingInterval,
        price: chargeAmount,
        priceFormatted: billingConfig.priceFormatted,
        region: billingConfig.region,
        paymentMethodsDescription: billingConfig.paymentMethodsDescription,
        flowType: 'subscription',
        isRecurring: true,
        renewalType: 'AUTO_RENEWING',
      }
    })
  },

  async cancelScheduledDowngrade(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const sub = await creatorSubscriptionsRepo.getByCreator(creatorId)
    if (!sub) throw httpError(404, 'Subscription not found')
    if (!sub.scheduledPlan) {
      throw httpError(400, 'No scheduled plan change found to cancel')
    }

    const activeDodoSubId = sub.dodoSubscriptionId || sub.providerSubscriptionId
    if (activeDodoSubId && activeDodoSubId.startsWith('sub_')) {
      try {
        await dodoProvider.cancelScheduledChangePlan(activeDodoSubId)
      } catch (err) {
        console.warn(`[Dodo Payments] Warning cancelling scheduled plan change for ${activeDodoSubId}:`, err.message)
      }
    }

    const updated = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
      scheduledPlan: null,
      scheduledChangeAt: null,
      scheduledInterval: null,
    })

    await subscriptionAuditLogsRepo.record(creatorId, 'SCHEDULED_DOWNGRADE_CANCELLED', {
      providerSubscriptionId: activeDodoSubId,
      cancelledScheduledPlan: sub.scheduledPlan,
    }).catch(() => {})

    return {
      success: true,
      message: 'Scheduled downgrade cancelled. You will remain on your current plan.',
      subscription: updated,
    }
  },

  async updatePaymentMethod(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const sub = await creatorSubscriptionsRepo.getByCreator(creatorId)
    if (!sub) throw httpError(404, 'Subscription not found')
    const activeDodoSubId = sub.dodoSubscriptionId || sub.providerSubscriptionId
    if (!activeDodoSubId || !activeDodoSubId.startsWith('sub_')) {
      throw httpError(400, 'No active Dodo subscription found to update payment method')
    }
    const client = dodoProvider.getClient()
    const returnUrl = `${getDodoBaseUrl()}/dashboard/settings/billing?payment_method_updated=true`
    const res = await client.subscriptions.updatePaymentMethod(activeDodoSubId, {
      payment_method: {
        type: 'new',
        return_url: returnUrl,
      }
    })
    return {
      success: true,
      checkoutUrl: res.payment_link,
      paymentId: res.payment_id,
      expiresOn: res.expires_on,
      message: 'Please complete your card update on Dodo.'
    }
  },

  async verifySubscriptionPayment(creatorId, {
    sessionId, subscriptionId, paymentId, dodoSubscriptionId, dodoPaymentId,
    razorpayOrderId, razorpaySubscriptionId, razorpayPaymentId, razorpaySignature,
    interval, billingInterval, region, provider, orderId,
  } = {}) {
    if (!creatorId) throw httpError(400, 'Creator ID required')

    const sub = await creatorSubscriptionsRepo.getByCreator(creatorId)
    const incomingSessionId = dodoSubscriptionId || subscriptionId || sessionId || orderId || razorpaySubscriptionId || razorpayOrderId || null
    const incomingPaymentId = dodoPaymentId || paymentId || razorpayPaymentId || null

    if (!incomingSessionId && !incomingPaymentId) {
      throw httpError(400, 'Missing payment or checkout session identifier')
    }

    const targetSessionId = incomingSessionId
    const targetPaymentId = incomingPaymentId

    console.log(`[Dodo Payments] Verifying subscription for creator ${creatorId} (Session/Sub: ${targetSessionId}, Payment: ${targetPaymentId})`)

    // 1. Strict rejection of mock identifiers
    if (
      (targetSessionId && (targetSessionId.startsWith('cks_mock_') || targetSessionId.startsWith('sub_mock_') || targetSessionId.startsWith('sub_dodo_mock_'))) ||
      (targetPaymentId && targetPaymentId.startsWith('pay_mock_'))
    ) {
      throw httpError(400, 'Mock payment identifiers are strictly prohibited.')
    }

    // 2. Razorpay Subscription Verification (India)
    const isRazorpayVerification = Boolean(
      razorpaySignature ||
      (provider && String(provider).toLowerCase() === 'razorpay') ||
      (sub?.provider && String(sub.provider).toUpperCase() === 'RAZORPAY') ||
      (incomingSessionId && incomingSessionId.startsWith('sub_') && !incomingSessionId.startsWith('sub_dodo_') && !sub?.dodoSubscriptionId)
    )

    if (isRazorpayVerification) {
      console.log(`[Razorpay] Verifying subscription for creator ${creatorId}`)
      if (!razorpaySignature) {
        throw httpError(400, 'Razorpay signature is required for subscription verification')
      }

      const rzpSubId = razorpaySubscriptionId || razorpayOrderId || sub?.providerSubscriptionId || sub?.razorpayOrderId
      const rzpPayId = razorpayPaymentId || targetPaymentId

      // Idempotency check:
      if (sub && sub.status === 'ACTIVE') {
        const isMatch = (rzpPayId && sub.razorpayPaymentId === rzpPayId) || (rzpSubId && (sub.providerSubscriptionId === rzpSubId || sub.razorpayOrderId === rzpSubId))
        if (isMatch) {
          console.log(`[Razorpay] Subscription already verified and active for creator ${creatorId}`)
          await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
          return {
            status: 'ACTIVE',
            provider: 'RAZORPAY',
            message: 'Creator subscription already active',
            subscription: sub,
          }
        }
      }

      const rzpProvider = getPaymentProvider()
      const isValid = rzpProvider.verifySubscriptionSignature({
        razorpaySubscriptionId: rzpSubId,
        razorpayPaymentId: rzpPayId,
        razorpaySignature,
      })

      if (!isValid) {
        console.error(`[Razorpay] Invalid subscription signature for creator ${creatorId}`)
        throw httpError(400, 'Invalid Razorpay subscription payment signature')
      }

      const isAnnual = String(sub?.billingInterval || billingInterval || '').toUpperCase() === 'ANNUAL'
      const durationDays = isAnnual ? 365 : 30
      const currentStart = new Date()
      const currentEnd = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

      const isUpgrade = Boolean(
        (sub?.pendingUpgradePaymentId && sub.pendingUpgradePaymentId === rzpSubId) ||
        (sub?.pendingUpgradePlan === 'PRO') ||
        (sub?.plan === 'CREATOR' && (rzpSubId !== sub?.providerSubscriptionId))
      )
      const targetPlan = isUpgrade ? 'PRO' : normalizePlanId(sub?.plan || 'PRO', 'ACTIVE')
      const planConfig = getPlanConfig(targetPlan, 'ACTIVE', isAnnual ? 'annual' : 'monthly', 'INR')
      const oldCreatorSubId = isUpgrade ? (sub?.providerSubscriptionId && sub.providerSubscriptionId !== rzpSubId ? sub.providerSubscriptionId : null) : null

      const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
        provider: 'RAZORPAY',
        providerSubscriptionId: rzpSubId || sub?.providerSubscriptionId,
        razorpayPaymentId: rzpPayId || sub?.razorpayPaymentId,
        razorpayOrderId: rzpSubId || sub?.razorpayOrderId,
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        trialStatus: 'EXPIRED',
        plan: targetPlan,
        price: planConfig.price,
        amount: planConfig.price,
        currency: 'INR',
        billingInterval: isAnnual ? 'ANNUAL' : 'MONTHLY',
        pendingOrderId: null,
        pendingUpgradeStatus: null,
        pendingUpgradePaymentId: null,
        pendingUpgradePlan: null,
        pendingUpgradeErrorMessage: null,
        pendingUpgradeStartedAt: null,
        pendingUpgradeAmount: null,
        pendingUpgradeCurrency: null,
        pendingUpgradePaymentLink: null,
        cancellationReason: null,
      })

      if (isUpgrade && oldCreatorSubId) {
        try {
          console.log(`[Razorpay Upgrade] Cancelling previous Creator subscription ${oldCreatorSubId} on Razorpay...`)
          await rzpProvider.cancelSubscription(oldCreatorSubId, false)
          await subscriptionAuditLogsRepo.record(creatorId, 'SUPERSEDED_SUBSCRIPTION_CANCELLED', {
            provider: 'RAZORPAY',
            oldSubscriptionId: oldCreatorSubId,
            newSubscriptionId: rzpSubId,
            reason: 'plan_upgraded',
            fromPlan: 'CREATOR',
            toPlan: 'PRO',
          }).catch(() => {})
        } catch (cancelErr) {
          console.warn(`[Razorpay Upgrade] Failed to cancel previous subscription ${oldCreatorSubId}:`, cancelErr.message)
          await subscriptionAuditLogsRepo.record(creatorId, 'UPGRADE_OLD_SUBSCRIPTION_CANCEL_FAILED', {
            provider: 'RAZORPAY',
            oldSubscriptionId: oldCreatorSubId,
            newSubscriptionId: rzpSubId,
            error: cancelErr.message,
          }).catch(() => {})
        }
      }

      await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
      await subscriptionAuditLogsRepo.record(creatorId, isUpgrade ? 'PLAN_UPGRADE_COMPLETED' : 'RAZORPAY_SUBSCRIPTION_VERIFIED', {
        providerSubscriptionId: rzpSubId,
        paymentId: rzpPayId,
        plan: targetPlan,
        status: 'ACTIVE',
        isUpgrade,
        previousSubscriptionId: oldCreatorSubId,
      }).catch(() => {})

      return {
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        plan: targetPlan,
        upgraded: isUpgrade,
        message: isUpgrade
          ? "You've upgraded to Pro! Your Pro plan is now active. You now have access to Pro features."
          : 'Subscription successfully verified and activated',
        subscription: updatedSub,
      }
    }

    // 3. Idempotency check: If subscription is ALREADY active with this specific incoming subscription/session/payment ID, return current
    if (sub && sub.status === 'ACTIVE') {
      const isSessionMatch = incomingSessionId && (sub.dodoSubscriptionId === incomingSessionId || sub.providerSubscriptionId === incomingSessionId)
      const isPaymentMatch = incomingPaymentId && (sub.dodoPaymentId === incomingPaymentId)

      if (isSessionMatch || isPaymentMatch) {
        console.log(`[Dodo Payments] Subscription already verified and active for creator ${creatorId}`)
        await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
        return {
          status: 'ACTIVE',
          provider: 'DODO',
          message: 'Creator subscription already active',
          subscription: sub,
        }
      }
    }

    if (!isDodoConfigured()) {
      throw httpError(500, 'Dodo Payments provider is not configured')
    }

    let calculatedNextBilling = null
    let activeDodoSubId = null
    let capturePaymentId = targetPaymentId || null
    let subDetails = null
    let sessionDetails = null
    let paymentDetails = null
    let verified = false

    // A. Check by Dodo Subscription ID (sub_...)
    if (targetSessionId && targetSessionId.startsWith('sub_')) {
      subDetails = await dodoProvider.getSubscription(targetSessionId).catch((err) => {
        console.error(`[Dodo Payments] Subscription retrieve error for ${targetSessionId}:`, err.message)
        return null
      })
      if (!subDetails) {
        throw httpError(404, `Subscription ${targetSessionId} not found on Dodo Payments`)
      }
      if (subDetails.metadata?.creatorId && subDetails.metadata.creatorId !== creatorId) {
        throw httpError(403, 'Subscription account association mismatch')
      }
      const rawStatus = String(subDetails.status || '').toLowerCase()
      if (rawStatus !== 'active') {
        throw httpError(400, `Dodo subscription is not active (current status: ${subDetails.status})`)
      }
      activeDodoSubId = subDetails.subscription_id || targetSessionId
      if (subDetails.next_billing_date) {
        const nextTime = new Date(subDetails.next_billing_date)
        if (!isNaN(nextTime.getTime())) calculatedNextBilling = nextTime
      }

      // Check latest payment on this subscription for status and capture ID
      try {
        const client = dodoProvider.getClient()
        for await (const p of client.payments.list({ subscription_id: activeDodoSubId })) {
          if (!capturePaymentId) capturePaymentId = p.payment_id
          if (!paymentDetails) paymentDetails = p
          break
        }
      } catch (_) {}

      // If latest payment is processing/pending, return pending state
      if (paymentDetails && (paymentDetails.status === 'processing' || paymentDetails.status === 'pending')) {
        return {
          pending: true,
          status: 'PENDING_PAYMENT',
          planId: sub?.plan || 'CREATOR',
          message: 'Your payment is currently processing with the payment provider. Entitlements will activate once confirmed.',
          subscription: sub,
        }
      }

      verified = true
    }

    // B. Check by Dodo Checkout Session ID (cks_...)
    if (!verified && targetSessionId && targetSessionId.startsWith('cks_')) {
      sessionDetails = await dodoProvider.getCheckoutSession(targetSessionId).catch((err) => {
        console.error(`[Dodo Payments] Checkout session retrieve error for ${targetSessionId}:`, err.message)
        return null
      })
      if (!sessionDetails) {
        throw httpError(404, `Checkout session ${targetSessionId} not found on Dodo Payments`)
      }
      if (sessionDetails.metadata?.creatorId && sessionDetails.metadata.creatorId !== creatorId) {
        throw httpError(403, 'Checkout session account association mismatch')
      }

      const payStatus = String(sessionDetails.payment_status || '').toLowerCase()
      let isPaid = payStatus === 'paid' || payStatus === 'succeeded'

      if (sessionDetails.payment_id) {
        capturePaymentId = sessionDetails.payment_id
        const payment = await dodoProvider.getPayment(sessionDetails.payment_id).catch(() => null)
        if (payment) {
          const pStatus = String(payment.status || '').toLowerCase()
          if (pStatus === 'processing' || pStatus === 'pending') {
            return {
              pending: true,
              status: 'PENDING_PAYMENT',
              planId: sub?.plan || 'CREATOR',
              message: 'Your payment is currently processing with the payment provider. Entitlements will activate once confirmed.',
              subscription: sub,
            }
          }
          if (pStatus === 'succeeded') {
            isPaid = true
          } else if (pStatus === 'failed' || pStatus === 'cancelled') {
            throw httpError(400, `Dodo payment was not successful (status: ${payment.status})`)
          }
        }
      }

      if (!isPaid && !sessionDetails.subscription_id) {
        throw httpError(400, `Dodo checkout session has not completed payment (status: ${sessionDetails.payment_status || 'unpaid'})`)
      }

      if (sessionDetails.subscription_id) {
        subDetails = await dodoProvider.getSubscription(sessionDetails.subscription_id).catch(() => null)
        if (subDetails && String(subDetails.status || '').toLowerCase() === 'active') {
          activeDodoSubId = subDetails.subscription_id
          if (subDetails.next_billing_date) {
            const nextTime = new Date(subDetails.next_billing_date)
            if (!isNaN(nextTime.getTime())) calculatedNextBilling = nextTime
          }
        }
      }

      activeDodoSubId = activeDodoSubId || targetSessionId
      verified = true
    }

    // C. Check by Dodo Payment ID (pay_...)
    if (!verified && targetPaymentId && targetPaymentId.startsWith('pay_')) {
      paymentDetails = await dodoProvider.getPayment(targetPaymentId).catch((err) => {
        console.error(`[Dodo Payments] Payment retrieve error for ${targetPaymentId}:`, err.message)
        return null
      })
      if (!paymentDetails) {
        throw httpError(404, `Payment ${targetPaymentId} not found on Dodo Payments`)
      }
      if (paymentDetails.metadata?.creatorId && paymentDetails.metadata.creatorId !== creatorId) {
        throw httpError(403, 'Payment account association mismatch')
      }
      const payStatus = String(paymentDetails.status || '').toLowerCase()
      if (payStatus === 'processing' || payStatus === 'pending') {
        return {
          pending: true,
          status: 'PENDING_PAYMENT',
          planId: sub?.plan || 'CREATOR',
          message: 'Your payment is currently processing with the payment provider. Entitlements will activate once confirmed.',
          subscription: sub,
        }
      }
      if (payStatus !== 'succeeded') {
        throw httpError(400, `Dodo payment was not successful (status: ${paymentDetails.status})`)
      }
      capturePaymentId = paymentDetails.payment_id || targetPaymentId
      activeDodoSubId = paymentDetails.subscription_id || targetSessionId || `sub_${capturePaymentId}`
      verified = true
    }

    if (!verified) {
      throw httpError(400, 'Unable to verify payment with Dodo Payments. Subscription remains inactive.')
    }

    // Derive plan authoritatively from provider product_id when available; avoid default PRO
    let targetPlanId = null
    const dodoProductId = subDetails?.product_id || sessionDetails?.product_id || paymentDetails?.product_id
    if (dodoProductId) {
      const prodInfo = identifyProductPlan(dodoProductId)
      if (prodInfo.planId && prodInfo.planId !== 'UNKNOWN') {
        targetPlanId = prodInfo.planId
      }
    }
    if (!targetPlanId) {
      targetPlanId = normalizePlanId(sub?.plan || 'CREATOR', 'ACTIVE')
    }
    const isAnnual = String(interval || billingInterval || sub?.billingInterval || sub?.billingCycle || '').toLowerCase().trim() === 'annual'
    const targetRegion = region ? normalizeRegion(region) : (sub?.currency === 'USD' ? BILLING_REGIONS.INTERNATIONAL : BILLING_REGIONS.INDIA)

    const billingConfig = resolveBillingConfig({
      plan: targetPlanId,
      interval: isAnnual ? 'annual' : 'monthly',
      region: targetRegion,
    })

    const periodDays = isAnnual ? 365 : 30
    const currentPeriodEnd = calculatedNextBilling || new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000)
    const price = billingConfig.amount
    const currency = billingConfig.currency

    const updatedSub = await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
      plan: targetPlanId,
      billingInterval: isAnnual ? 'ANNUAL' : 'MONTHLY',
      billingCycle: isAnnual ? 'ANNUAL' : 'MONTHLY',
      price,
      currency,
      provider: 'DODO',
      providerSubscriptionId: activeDodoSubId,
      dodoSubscriptionId: activeDodoSubId,
      dodoPaymentId: capturePaymentId,
      currentPeriodStart: new Date(),
      currentPeriodEnd,
      trialStatus: 'EXPIRED',
      pendingUpgradeStatus: null,
      pendingUpgradePlan: null,
      pendingUpgradeInterval: null,
      pendingUpgradePaymentId: null,
      pendingUpgradePaymentLink: null,
      pendingUpgradeStartedAt: null,
      pendingUpgradeErrorMessage: null,
      pendingUpgradeAmount: null,
      pendingUpgradeCurrency: null,
    })

    // Cancel previous subscription on Dodo if this was an upgrade
    const previousSubId = sessionDetails?.metadata?.previousSubscriptionId || (sub?.plan === 'CREATOR' && targetPlanId === 'PRO' && sub?.dodoSubscriptionId !== activeDodoSubId ? sub?.dodoSubscriptionId : null)
    if (previousSubId && previousSubId.startsWith('sub_') && previousSubId !== activeDodoSubId) {
      try {
        console.log(`[Dodo Upgrade] Cancelling previous subscription ${previousSubId} following successful Pro upgrade to ${activeDodoSubId}`)
        await dodoProvider.cancelSubscription(previousSubId, {
          immediately: true,
          cancelReason: 'cancelled_by_customer',
          comment: 'Customer upgraded to Pro',
        })
        await subscriptionAuditLogsRepo.record(creatorId, 'PREVIOUS_SUBSCRIPTION_CANCELLED_ON_UPGRADE', {
          cancelledSubscriptionId: previousSubId,
          newSubscriptionId: activeDodoSubId,
          newPlan: targetPlanId,
        }).catch(() => {})
      } catch (cancelErr) {
        console.warn(`[Dodo Upgrade] Warning cancelling old subscription ${previousSubId}:`, cancelErr.message)
      }
    }

    await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })
    console.log(`[Dodo Payments] Database subscription updated: ACTIVE for creator ${creatorId} (${targetPlanId} - ${isAnnual ? 'ANNUAL' : 'MONTHLY'} - ${currency})`)

    // Email notification
    try {
      const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      if (creatorUser?.email) {
        await emailService.sendSubscriptionStatusEmail({
          to: creatorUser.email,
          creatorName: profile?.name || 'Creator',
          planName: `${billingConfig.planName} (${isAnnual ? 'Annual' : 'Monthly'})`,
          status: 'ACTIVE',
          priceDisplay: `${billingConfig.priceFormatted}${isAnnual ? '/year' : '/month'}`,
          currentPeriodEnd: currentPeriodEnd.toLocaleDateString(),
        })
      }
    } catch (e) {
      console.error('[EmailService] Subscription status email error:', e?.message || e)
    }

    return {
      success: true,
      status: 'ACTIVE',
      plan: targetPlanId,
      provider: 'DODO',
      message: `${billingConfig.planName} (${isAnnual ? 'Annual' : 'Monthly'}) subscription activated successfully via Dodo Payments`,
      subscription: updatedSub,
      planId: targetPlanId,
      billingInterval: isAnnual ? 'ANNUAL' : 'MONTHLY',
      currency,
      region: targetRegion,
    }
  },

  async cancelSubscription(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const sub = await creatorSubscriptionsRepo.getByCreator(creatorId)
    if (!sub) throw httpError(404, 'Subscription not found')

    const isRazorpay = (sub.provider || '').toUpperCase() === 'RAZORPAY' || (sub.providerSubscriptionId && !sub.providerSubscriptionId.startsWith('sub_dodo_') && !sub.dodoSubscriptionId)
    const targetSubId = sub.providerSubscriptionId || sub.dodoSubscriptionId

    if (targetSubId) {
      if (isRazorpay) {
        const rzpProvider = getPaymentProvider()
        try {
          console.log(`[Razorpay] User-initiated cancellation for subscription ${targetSubId}`)
          await rzpProvider.cancelSubscription(targetSubId, true)
        } catch (e) {
          console.warn(`[Razorpay] Cancel API call warning for ${targetSubId}:`, e.message)
        }
      } else {
        try {
          console.log(`[Dodo Payments] User-initiated cancellation for subscription ${targetSubId}`)
          await dodoProvider.cancelSubscription(targetSubId, { cancelAtNextBillingDate: true })
        } catch (e) {
          console.warn(`[Dodo Payments] Cancel API call warning for ${targetSubId}:`, e.message)
        }
      }
    }

    const updated = await creatorSubscriptionsRepo.updateStatus(creatorId, 'CANCELLED', {
      cancellationReason: 'USER_CANCELLED',
      canceledAt: new Date(),
    })

    await subscriptionAuditLogsRepo.record(creatorId, 'SUBSCRIPTION_CANCELLED', {
      provider: isRazorpay ? 'RAZORPAY' : 'DODO',
      providerSubscriptionId: targetSubId,
      reason: 'USER_CANCELLED',
      plan: sub.plan,
    }).catch(() => {})

    return {
      success: true,
      status: 'CANCELLED',
      message: 'Subscription cancelled successfully.',
      subscription: updated,
    }
  },

  async selectPlan(creatorId, { plan }) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const selectedPlanId = normalizePlanId(plan, 'ACTIVE')
    const planConfig = getPlanConfig(selectedPlanId)
    const existing = await creatorSubscriptionsRepo.getByCreator(creatorId).catch(() => null)
    const isPaidActive = existing && existing.status === 'ACTIVE' && (existing.dodoSubscriptionId || existing.providerSubscriptionId)
    const sub = await creatorSubscriptionsRepo.upsert(creatorId, {
      status: isPaidActive ? existing.status : 'PENDING',
      plan: isPaidActive ? existing.plan : selectedPlanId,
      billingCycle: 'MONTHLY',
      price: planConfig.price,
      currency: 'INR',
    })
    await profilesRepo.upsert(creatorId, { onboardingStatus: 'PLAN_SELECTION' })
    return { subscription: sub, planId: isPaidActive ? existing.plan : selectedPlanId }
  },

  async startTrial(creatorId, body = {}) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const user = await usersRepo.findById(creatorId)
    if (!user) throw httpError(404, 'User not found')

    const sub = await creatorSubscriptionsRepo.getByCreator(creatorId).catch(() => null)
    const now = new Date()

    // 1. If paid active subscription exists, return status (paid takes precedence)
    if (sub && sub.status === 'ACTIVE' && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now && (sub.razorpayPaymentId || sub.providerSubscriptionId)) {
      return this.getStatus(creatorId)
    }

    // 2. Idempotency & Single-Trial Eligibility:
    // If trial was already started or currently active/expired, return current status without extending
    if (sub && (sub.trialStartedAt || sub.trialStatus === 'ACTIVE' || sub.trialStatus === 'EXPIRED' || sub.status === 'TRIALING')) {
      return this.getStatus(creatorId)
    }

    // 3. Start 7-Day Free Pro Trial
    const trialDurationDays = 7
    const trialEndsAt = new Date(now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000)

    const updatedSub = await creatorSubscriptionsRepo.upsert(creatorId, {
      status: 'TRIALING',
      plan: 'PRO',
      billingCycle: 'MONTHLY',
      price: 0,
      currency: 'INR',
      trialStartedAt: now,
      trialEndsAt: trialEndsAt,
      trialStatus: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    })

    await profilesRepo.upsert(creatorId, { onboardingStatus: 'COMPLETED', onboardingComplete: true })

    // Send trial started transactional email (non-blocking)
    try {
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      if (user.email) {
        await emailService.sendTrialStartedEmail({
          to: user.email,
          creatorName: profile?.name || 'Creator',
          trialEndsAt,
        })
      }
    } catch (e) {
      console.error('[EmailService] Trial started email error:', e?.message || e)
    }

    return {
      status: 'TRIALING',
      trialStatus: 'ACTIVE',
      isTrial: true,
      isTrialExpired: false,
      planId: 'PRO',
      plan: 'Pro',
      fullPlanTitle: 'CreatorStore Pro (7-Day Free Trial)',
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      daysRemaining: trialDurationDays,
      message: '7-day Pro trial started successfully',
      subscription: updatedSub,
    }
  },

  async updateSubscriptionStatus(creatorId, status) {
    if (!['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING', 'TRIALING'].includes(status)) {
      throw httpError(400, 'Invalid subscription status')
    }
    if (status === 'ACTIVE' || status === 'TRIALING') {
      throw httpError(403, 'Subscription status cannot be updated directly to ACTIVE or TRIALING. Use verified checkout or startTrial.')
    }
    const sub = await creatorSubscriptionsRepo.updateStatus(creatorId, status)
    return { status: sub.status, subscription: sub }
  },
}

// ---------------- Customer Upgrade to Creator ----------------
export const accountUpgradeService = {
  async upgradeToCreator(userId) {
    if (!userId) throw httpError(400, 'User ID required')
    const user = await usersRepo.findById(userId)
    if (!user) throw httpError(404, 'User not found')

    if (user.role !== 'CREATOR') {
      await usersRepo.update(userId, { role: 'CREATOR' })
    }

    let sub = await creatorSubscriptionsRepo.getByCreator(userId)
    if (!sub) {
      sub = await creatorSubscriptionsRepo.upsert(userId, {
        status: 'PENDING',
        plan: 'CREATOR_MONTHLY',
        price: 999,
        currency: 'INR',
      })
    }

    const profile = await profilesRepo.getByCreator(userId)
    if (!profile) {
      await profilesRepo.upsert(userId, { name: user.name || user.email.split('@')[0], bio: '', category: '', avatarUrl: '', socialLinks: {}, onboardingComplete: false })
    }

    return {
      user: { ...user, role: 'CREATOR' },
      subscriptionStatus: sub.status,
      message: 'Account upgraded to Creator successfully',
    }
  },
}

// ---------- Marketing Engine Services ----------

export const leadService = {
  async capture(creatorId, data) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    if (!data.email) throw httpError(400, 'Email address required')
    const lead = await leadsRepo.capture(creatorId, data)
    await customerTagsRepo.addTag(creatorId, data.email, 'Lead')

    // Non-blocking creator notification email
    try {
      const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      if (creatorUser?.email) {
        await emailService.sendNewLeadCreatorEmail({
          to: creatorUser.email,
          creatorName: profile?.name || 'Creator',
          leadName: data.name || '',
          leadEmail: data.email,
          leadPhone: data.phone || '',
          formName: data.formName || 'Lead Capture',
          submittedAt: new Date().toLocaleString(),
          dashboardUrl: getAppUrl('/dashboard/leads'),
        })
      }
    } catch (e) { console.error('[EmailService] Lead capture creator notification error:', e?.message || e) }

    return lead
  },

  async list(creatorId, options) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    return leadsRepo.list(creatorId, options)
  },
}

export const couponService = {
  async create(creatorId, data) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'coupons')
    if (!data.code || data.discount === undefined || data.discount === null) {
      throw httpError(400, 'Coupon code and discount value required')
    }

    const subStatus = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const planId = (subStatus?.status === 'ACTIVE' || subStatus?.status === 'TRIALING') ? subStatus.planId : 'UNSUBSCRIBED'
    if (!hasEntitlement(planId, 'couponCodes')) {
      const pricing = getSubscriptionPricing()
      throw httpError(403, `Discount and coupon codes require the Pro plan (${pricing.PRO.priceFormatted}/month). Upgrade to unlock coupons.`)
    }

    const rawCode = String(data.code).toUpperCase().trim()
    if (!/^[A-Z0-9_-]{2,30}$/.test(rawCode)) {
      throw httpError(400, 'Coupon code must be 2-30 characters (letters, numbers, hyphen, underscore).')
    }

    const discountType = data.type === 'FIXED' ? 'FIXED' : 'PERCENTAGE'
    const discountVal = Number(data.discount)
    if (isNaN(discountVal) || discountVal <= 0) {
      throw httpError(400, 'Discount value must be greater than 0.')
    }
    if (discountType === 'PERCENTAGE' && discountVal > 100) {
      throw httpError(400, 'Percentage discount cannot exceed 100%.')
    }

    const scope = data.scope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL'
    let productIds = null
    if (scope === 'SPECIFIC') {
      const rawIds = Array.isArray(data.productIds) ? data.productIds : (data.productId ? [data.productId] : [])
      const creatorProds = await productsRepo.list(creatorId)
      const validOwnedIds = new Set((creatorProds || []).map((p) => p.id))
      productIds = rawIds.filter((id) => validOwnedIds.has(id))
      if (!productIds || productIds.length === 0) {
        throw httpError(400, 'Please select at least one valid product for this coupon.')
      }
    }

    const minOrderPrice = Math.max(0, Number(data.minOrderPrice || 0))

    let expiresAt = null
    if (data.validityHours && Number(data.validityHours) > 0) {
      expiresAt = new Date(Date.now() + Number(data.validityHours) * 3600 * 1000).toISOString()
    } else if (data.expiresAt || data.expiryDate) {
      expiresAt = new Date(data.expiresAt || data.expiryDate).toISOString()
    } else {
      // Default validity 24 hours
      expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    }

    // Check for existing active coupon with same code
    const existing = await couponsRepo.getByCode(creatorId, rawCode)
    if (existing) {
      const now = new Date()
      const existingExp = existing.expiresAt ? new Date(existing.expiresAt) : (existing.expiryDate ? new Date(existing.expiryDate) : null)
      if (existingExp && existingExp <= now) {
        // Expired duplicate: delete it
        await couponsRepo.delete(creatorId, existing.id)
      } else {
        throw httpError(409, `Coupon '${rawCode}' already exists and is active.`)
      }
    }

    const createdCoupon = await couponsRepo.create({
      creatorId,
      code: rawCode,
      type: discountType,
      discount: discountVal,
      scope,
      productIds,
      productId: productIds && productIds.length === 1 ? productIds[0] : null,
      minOrderPrice,
      validityHours: Number(data.validityHours || 24),
      expiresAt,
      expiryDate: expiresAt,
      usageLimit: Number(data.usageLimit || 0),
      usedCount: 0,
      status: 'ACTIVE',
    })

    let productTitles = []
    if (createdCoupon.scope === 'SPECIFIC' && Array.isArray(createdCoupon.productIds)) {
      const products = await productsRepo.list(creatorId).catch(() => [])
      const prodMap = new Map((products || []).map((p) => [p.id, p.title]))
      productTitles = createdCoupon.productIds.map((id) => prodMap.get(id) || 'Product').filter(Boolean)
    }
    return {
      ...createdCoupon,
      productTitles,
    }
  },

  async validate(creatorId, code, productId, basePrice) {
    const baseNum = Number(basePrice || 0)
    if (!code) return { valid: false, discountAmount: 0, finalPrice: baseNum }
    if (!creatorId) throw httpError(400, 'Creator ID required')

    const cleanCode = String(code).toUpperCase().trim()
    const coupon = await couponsRepo.getByCode(creatorId, cleanCode)
    if (!coupon || coupon.status !== 'ACTIVE') {
      throw httpError(400, 'Invalid coupon code.')
    }

    const now = new Date()
    const expDate = coupon.expiresAt ? new Date(coupon.expiresAt) : (coupon.expiryDate ? new Date(coupon.expiryDate) : null)
    if (expDate && expDate <= now) {
      // Layer 1 runtime check + immediate background deletion
      couponsRepo.delete(creatorId, coupon.id).catch(() => { })
      throw httpError(400, 'This coupon has expired.')
    }

    // Product scope verification
    if (coupon.scope === 'SPECIFIC' || (Array.isArray(coupon.productIds) && coupon.productIds.length > 0)) {
      const allowed = Array.isArray(coupon.productIds) ? coupon.productIds : (coupon.productId ? [coupon.productId] : [])
      if (!allowed.includes(productId)) {
        throw httpError(400, 'This coupon is not valid for this product.')
      }
    } else if (coupon.productId && coupon.productId !== productId) {
      throw httpError(400, 'This coupon is not valid for this product.')
    }

    // Minimum order price verification
    const minOrder = Number(coupon.minOrderPrice || 0)
    if (minOrder > 0 && baseNum < minOrder) {
      throw httpError(400, `Minimum order value for this coupon is ₹${minOrder}.`)
    }

    // Usage limit verification
    if (coupon.usageLimit > 0 && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
      throw httpError(400, 'Coupon usage limit reached.')
    }

    // Calculate discount
    let discountAmount = 0
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = Math.round(((baseNum * Number(coupon.discount)) / 100) * 100) / 100
    } else {
      discountAmount = Math.min(baseNum, Number(coupon.discount))
    }
    const finalPrice = Math.max(0, baseNum - discountAmount)

    return {
      valid: true,
      couponCode: coupon.code,
      couponId: coupon.id,
      discountType: coupon.type,
      discountValue: Number(coupon.discount),
      discountAmount,
      originalAmount: baseNum,
      finalAmount: finalPrice,
      coupon,
    }
  },

  async delete(creatorId, id) {
    if (!creatorId || !id) throw httpError(400, 'Creator ID and Coupon ID required')
    const success = await couponsRepo.delete(creatorId, id)
    return { success, id }
  },

  async cleanupExpired(creatorId = null) {
    const success = await couponsRepo.deleteExpired(creatorId)
    return { success }
  },

  async list(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    await couponsRepo.deleteExpired(creatorId).catch(() => { })
    const items = await couponsRepo.listByCreator(creatorId)
    const products = await productsRepo.list(creatorId).catch(() => [])
    const prodMap = new Map((products || []).map((p) => [p.id, p.title]))

    return items.map((c) => {
      let productTitles = []
      if (c.scope === 'SPECIFIC' && Array.isArray(c.productIds)) {
        productTitles = c.productIds.map((id) => prodMap.get(id) || 'Product').filter(Boolean)
      } else if (c.productId) {
        const t = prodMap.get(c.productId)
        if (t) productTitles = [t]
      }
      return {
        ...c,
        productTitles,
      }
    })
  },
}

export const marketingService = {
  async getOverview(creatorId) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    const [leadsRes, couponsRes, broadcastsRes] = await Promise.all([
      leadsRepo.list(creatorId).catch(() => ({ items: [], total: 0 })),
      couponService.list(creatorId).catch(() => []),
      emailRepo.listBroadcasts(creatorId).catch(() => []),
    ])

    const totalLeads = leadsRes?.total !== undefined ? leadsRes.total : (Array.isArray(leadsRes) ? leadsRes.length : (leadsRes?.items?.length || 0))
    const couponsList = Array.isArray(couponsRes) ? couponsRes : []
    const now = Date.now()
    const activeCoupons = couponsList.filter(c => {
      if (c.status && c.status !== 'ACTIVE') return false
      if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return false
      return true
    }).length

    const broadcastsList = Array.isArray(broadcastsRes) ? broadcastsRes : []
    const totalCampaigns = broadcastsList.length

    return {
      totalLeads,
      activeCoupons,
      totalCampaigns,
      recentCampaigns: broadcastsList.slice(0, 5),
    }
  }
}

export const emailMarketingService = {
  async getAudienceEstimate(creatorId, segment = 'ALL_CUSTOMERS') {
    if (!creatorId) throw httpError(400, 'Creator ID required')

    let recipientEmails = new Set()

    if (segment === 'ALL_CUSTOMERS' || segment === 'CUSTOMERS') {
      const customersRes = await customersRepo.list(creatorId).catch(() => [])
      const customers = Array.isArray(customersRes) ? customersRes : (customersRes?.items || [])
      for (const c of customers) {
        if (c.email) recipientEmails.add(c.email.toLowerCase().trim())
      }
    }

    if (segment === 'ALL_CUSTOMERS' || segment === 'LEADS') {
      const leadsRes = await leadsRepo.list(creatorId).catch(() => [])
      const leads = Array.isArray(leadsRes) ? leadsRes : (leadsRes?.items || [])
      for (const l of leads) {
        if (l.email) recipientEmails.add(l.email.toLowerCase().trim())
      }
    }

    if (segment === 'COURSE_BUYERS') {
      const customersRes = await customersRepo.list(creatorId).catch(() => [])
      const customers = Array.isArray(customersRes) ? customersRes : (customersRes?.items || [])
      for (const c of customers) {
        if (c.email && (c.coursesEnrolled || c.productType === 'COURSE' || c.tags?.includes('course'))) {
          recipientEmails.add(c.email.toLowerCase().trim())
        }
      }
      if (recipientEmails.size === 0) {
        for (const c of customers) {
          if (c.email) recipientEmails.add(c.email.toLowerCase().trim())
        }
      }
    }

    return {
      count: recipientEmails.size,
      recipients: Array.from(recipientEmails),
    }
  },

  async sendTestEmail(creatorId, { testEmail, subject, content }) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    if (!testEmail) throw httpError(400, 'Test email address required')
    if (!subject || !content) throw httpError(400, 'Subject and content required')

    const subStatus = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const planId = (subStatus?.status === 'ACTIVE' || subStatus?.status === 'TRIALING') ? subStatus.planId : 'UNSUBSCRIBED'
    if (!hasEntitlement(planId, 'emailBroadcasts')) {
      throw httpError(403, 'Email broadcasts require an active subscription. Upgrade to unlock.')
    }

    const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
    const creatorName = profile?.name || 'Creator'

    const sendRes = await emailService.sendMarketingBroadcastEmail({
      to: testEmail,
      creatorName,
      subject: `[TEST] ${subject}`,
      content,
    })

    return { success: true, delivered: sendRes?.delivered !== false, testEmail }
  },

  async sendBroadcast(creatorId, data) {
    if (!creatorId) throw httpError(400, 'Creator ID required')
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'emailBroadcasts')
    if (!data.subject || !data.content) throw httpError(400, 'Subject and content required')

    const subStatus = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const planId = (subStatus?.status === 'ACTIVE' || subStatus?.status === 'TRIALING') ? subStatus.planId : 'UNSUBSCRIBED'
    if (!hasEntitlement(planId, 'emailBroadcasts')) {
      throw httpError(403, 'Email broadcasts require an active subscription. Upgrade to unlock.')
    }

    const audience = data.audience || 'ALL_CUSTOMERS'
    const { count, recipients } = await this.getAudienceEstimate(creatorId, audience)

    const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
    const creatorName = profile?.name || 'Creator'

    // Create broadcast record
    const broadcastRecord = await emailRepo.createBroadcast(creatorId, {
      name: data.name || data.subject,
      subject: data.subject,
      content: data.content,
      audience,
      sentCount: count,
      status: 'SENT',
    })

    // Dispatch emails to audience
    if (recipients.length > 0) {
      for (const email of recipients) {
        try {
          await emailService.sendMarketingBroadcastEmail({
            to: email,
            creatorName,
            subject: data.subject,
            content: data.content,
          })
        } catch (err) {
          console.error(`[Broadcast] Error sending to ${email}:`, err?.message || err)
        }
      }
    }

    return broadcastRecord
  },

  async listBroadcasts(creatorId) {
    return emailRepo.listBroadcasts(creatorId)
  },
}

// ---------------- Creator Onboarding Service ----------------
export const onboardingService = {
  async getStatus(creatorId) {
    const store = await storesRepo.getByCreator(creatorId)
    const products = await productsRepo.list(creatorId)
    const payout = await payoutProfilesRepo.getByCreator(creatorId)
    const dbRecord = await onboardingRepo.get(creatorId)
    const manualCompleted = dbRecord.completedSteps || []

    const completed = new Set(manualCompleted)

    // Auto-detect completed steps based on real DB status
    if (store && store.username) completed.add('ACCOUNT_SETUP')
    if (payout && (payout.status === 'ACTIVE' || payout.onboardingStatus === 'ACTIVE' || payout.accountNumber || payout.bankAccount)) completed.add('CONNECT_PAYOUT')
    if (products && products.length > 0) completed.add('CREATE_PRODUCT')
    if (store && store.published) completed.add('PUBLISH_STORE')


    const checklist = [
      { id: 'ACCOUNT_SETUP', title: 'Set up store username and profile', completed: completed.has('ACCOUNT_SETUP') },
      { id: 'CONNECT_PAYOUT', title: 'Connect Razorpay payout account', completed: completed.has('CONNECT_PAYOUT') },
      { id: 'CREATE_PRODUCT', title: 'Create your first product', completed: completed.has('CREATE_PRODUCT') },
      { id: 'PUBLISH_STORE', title: 'Publish your storefront', completed: completed.has('PUBLISH_STORE') },
      { id: 'SHARE_STORE', title: 'Share your store link with audience', completed: completed.has('SHARE_STORE') },
    ]

    const completedCount = checklist.filter(item => item.completed).length
    const progressPercentage = Math.round((completedCount / checklist.length) * 100)

    let nextStep = null
    if (!completed.has('ACCOUNT_SETUP')) nextStep = { id: 'ACCOUNT_SETUP', title: 'Set up your store username', link: '/settings' }
    else if (!completed.has('CONNECT_PAYOUT')) nextStep = { id: 'CONNECT_PAYOUT', title: 'Connect Razorpay payout account to accept payments', link: '/payouts' }
    else if (!completed.has('CREATE_PRODUCT')) nextStep = { id: 'CREATE_PRODUCT', title: 'Create your first digital download, coaching session, or bundle', link: '/products/new' }
    else if (!completed.has('PUBLISH_STORE')) nextStep = { id: 'PUBLISH_STORE', title: 'Publish your store to go live', link: '/store/edit' }
    else if (!completed.has('SHARE_STORE')) nextStep = { id: 'SHARE_STORE', title: 'Share your store link on social media', link: '/dashboard/store' }

    return {
      checklist,
      completedSteps: Array.from(completed),
      completedCount,
      totalSteps: checklist.length,
      progressPercentage,
      nextStep,
    }
  },

  async completeStep(creatorId, stepId) {
    await onboardingRepo.completeStep(creatorId, stepId)
    return this.getStatus(creatorId)
  }
}

// ---------------- Creator Success Center ----------------
export const successCenterService = {
  async getResources() {
    return {
      playbooks: [
        {
          id: 'pb-1',
          title: 'First 10 Sales Playbook',
          category: 'GROWTH',
          description: 'A 7-day step-by-step roadmap to get your first 10 paying customers without paid ads.',
          estimatedTime: '15 min read',
        },
        {
          id: 'pb-2',
          title: 'Pricing Strategy & Elasticity Guide',
          category: 'MONETIZATION',
          description: 'How to price digital downloads, coaching, and services for maximum conversion in INR/USD.',
          estimatedTime: '10 min read',
        },
        {
          id: 'pb-3',
          title: 'High-Converting Checkout Funnel Checklist',
          category: 'CONVERSION',
          description: 'Optimize order bumps, checkout custom fields, and email follow-ups to increase average order value by 35%.',
          estimatedTime: '12 min read',
        },
      ],
      templates: [
        {
          id: 'tpl-1',
          title: 'High-Converting Product Launch Sequence',
          type: 'EMAIL_TEMPLATES',
          description: '4 pre-written email broadcast templates for launch week.',
        },
        {
          id: 'tpl-2',
          title: '1:1 Coaching Intake Questionnaire',
          type: 'CHECKOUT_FIELDS',
          description: 'Ready-to-use checkout custom fields template for coaching clients.',
        },
      ],
      tools: [
        { id: 'tool-1', title: 'Digital Product Earnings Calculator', type: 'CALCULATOR' },
        { id: 'tool-2', title: 'Services & Coaching Rate Estimator', type: 'CALCULATOR' },
      ]
    }
  }
}

// ---------------- Instagram Integration & Automations Service ----------------

export const instagramService = {
  async getStatus(creatorId) {
    if (!creatorId) {
      const res = { connected: false, status: 'DISCONNECTED' }
      res.account = { ...res }
      return res
    }
    const acc = await instagramRepo.getByCreatorId(creatorId)
    if (!acc || !acc.accessToken || acc.status === 'DISCONNECTED') {
      const res = {
        connected: false,
        status: 'DISCONNECTED',
        username: '',
        instagramUsername: '',
        isExpired: false,
        canReconnect: true,
        reauthorizationRequired: false,
      }
      res.account = { ...res }
      return res
    }
    const isExpired = (acc.tokenExpiresAt && new Date(acc.tokenExpiresAt) < new Date()) || acc.status === 'TOKEN_EXPIRED'
    if (isExpired) {
      const res = {
        connected: false,
        error: 'TOKEN_EXPIRED',
        status: 'EXPIRED',
        isExpired: true,
        canReconnect: true,
        reauthorizationRequired: true,
        username: acc.username || '',
        instagramUsername: acc.username ? (acc.username.startsWith('@') ? acc.username : `@${acc.username}`) : '',
      }
      res.account = { ...res }
      return res
    }
    const rawUsername = acc.username || ''
    const cleanUsername = rawUsername ? (rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`) : ''

    // If webhook subscription failed, the Instagram OAuth connection is STILL ACTIVE and VALID!
    if (acc.status === 'SUBSCRIPTION_FAILED') {
      const res = {
        connected: true,
        status: 'CONNECTED',
        connectionStatus: 'CONNECTED',
        subscriptionStatus: 'FAILED',
        webhookStatus: 'FAILED',
        webhookSubscribed: false,
        isExpired: false,
        canReconnect: false,
        reauthorizationRequired: false,
        error: 'WEBHOOK_SUBSCRIPTION_FAILED',
        message: 'Instagram account authorized, but webhook subscription could not be activated.',
        instagramUsername: cleanUsername,
        username: rawUsername,
        platformUserId: acc.platformUserId || '',
        platform: acc.platform || 'INSTAGRAM',
        canRetry: true,
        tokenExpiresAt: acc.tokenExpiresAt,
        updatedAt: acc.updatedAt,
      }
      res.account = { ...res }
      return res
    }

    const res = {
      connected: true,
      instagramUsername: cleanUsername,
      username: rawUsername,
      platformUserId: acc.platformUserId || '',
      platform: acc.platform || 'INSTAGRAM',
      status: 'CONNECTED',
      connectionStatus: 'CONNECTED',
      subscriptionStatus: 'ACTIVE',
      webhookStatus: 'ACTIVE',
      webhookSubscribed: true,
      isExpired: false,
      canReconnect: false,
      reauthorizationRequired: false,
      tokenExpiresAt: acc.tokenExpiresAt,
      updatedAt: acc.updatedAt,
    }
    res.account = { ...res }
    return res
  },

  async getAccount(creatorId) {
    return this.getStatus(creatorId)
  },

  async getProfile(creatorId, { forceRefresh = false } = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const acc = await instagramRepo.getByCreatorId(creatorId)
    if (!acc || !acc.accessToken || acc.status === 'DISCONNECTED') {
      return { connected: false, status: 'DISCONNECTED' }
    }
    const isExpired = acc.tokenExpiresAt && new Date(acc.tokenExpiresAt) < new Date()
    if (isExpired) {
      return { connected: false, error: 'TOKEN_EXPIRED', status: 'EXPIRED', reauthorizationRequired: true }
    }

    global.__instagramProfileCache = global.__instagramProfileCache || new Map()
    const cached = global.__instagramProfileCache.get(creatorId)
    const now = Date.now()
    if (!forceRefresh && cached && (now - cached._cachedAt < 15 * 60 * 1000)) {
      const { _cachedAt, ...rest } = cached
      return rest
    }

    const accessToken = acc.accessToken
    const apiVersion = process.env.META_API_VERSION || 'v21.0'
    const username = acc.username || ''

    if (accessToken && !accessToken.startsWith('meta_tok_') && !accessToken.startsWith('mock_')) {
      try {
        let data = null
        const fieldsPrimary = 'id,username,name,account_type,profile_picture_url,biography,media_count,followers_count,follows_count'
        const urlPrimary = `https://graph.instagram.com/${apiVersion}/me?fields=${fieldsPrimary}&access_token=${encodeURIComponent(accessToken)}`
        const resPrimary = await fetch(urlPrimary)
        const jsonPrimary = await resPrimary.json()

        if (jsonPrimary && !jsonPrimary.error) {
          data = jsonPrimary
        } else if (jsonPrimary?.error?.code === 190) {
          return { connected: false, status: 'EXPIRED', error: 'TOKEN_EXPIRED', reauthorizationRequired: true }
        } else {
          // If primary request failed (e.g. if account type or node doesn't support followers/following), gracefully try fallback without them
          const fieldsFallback = 'id,username,account_type,profile_picture_url,media_count'
          const urlFallback = `https://graph.instagram.com/${apiVersion}/me?fields=${fieldsFallback}&access_token=${encodeURIComponent(accessToken)}`
          const resFallback = await fetch(urlFallback)
          const jsonFallback = await resFallback.json()
          if (jsonFallback && !jsonFallback.error) {
            data = jsonFallback
          }
        }

        if (data) {
          const rawFollowers = data.followers_count
          const hasFollowers = typeof rawFollowers === 'number' && !Number.isNaN(rawFollowers)
          const followersCount = hasFollowers ? rawFollowers : null

          const rawFollowing = data.follows_count
          const hasFollowing = typeof rawFollowing === 'number' && !Number.isNaN(rawFollowing)
          const followingCount = hasFollowing ? rawFollowing : null

          const profile = {
            connected: true,
            id: data.id || acc.platformUserId || '',
            username: data.username || username,
            name: data.name || data.username || username,
            profilePictureUrl: data.profile_picture_url || null,
            biography: data.biography || null,
            accountType: data.account_type || null,
            mediaCount: typeof data.media_count === 'number' ? data.media_count : null,
            followersCount: followersCount,
            followerCount: followersCount,
            followingCount: followingCount,
            followsCount: followingCount,
            followersCountUnavailable: !hasFollowers,
            followingCountUnavailable: !hasFollowing,
            profileUrl: `https://instagram.com/${data.username || username}`,
            lastSyncedAt: new Date().toISOString(),
            status: 'CONNECTED',
          }
          global.__instagramProfileCache.set(creatorId, { ...profile, _cachedAt: now })
          return profile
        }
      } catch (err) {
        console.warn('Instagram profile API fetch failed (retaining cached or graceful state):', err.message)
        if (cached) {
          const { _cachedAt, ...rest } = cached
          return { ...rest, temporaryError: true }
        }
      }
    }

    const fallbackProfile = {
      connected: true,
      id: acc.platformUserId || '',
      username: username,
      name: username,
      profilePictureUrl: null,
      biography: null,
      accountType: null,
      mediaCount: null,
      followersCount: null,
      followerCount: null,
      followingCount: null,
      followsCount: null,
      followersCountUnavailable: true,
      followingCountUnavailable: true,
      profileUrl: username ? `https://instagram.com/${username}` : '',
      lastSyncedAt: acc.updatedAt ? new Date(acc.updatedAt).toISOString() : new Date().toISOString(),
      status: 'CONNECTED',
    }
    return fallbackProfile
  },

  async getMedia(creatorId, { limit = 20, forceRefresh = false } = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const acc = await instagramRepo.getByCreatorId(creatorId)
    if (!acc || (acc.status !== 'CONNECTED' && acc.status !== 'SUBSCRIPTION_FAILED')) {
      return { media: [], connected: false }
    }

    const isExpired = acc.tokenExpiresAt && new Date(acc.tokenExpiresAt) < new Date()
    if (isExpired) {
      return { media: [], connected: false, error: 'TOKEN_EXPIRED', status: 'EXPIRED' }
    }

    global.__instagramMediaCache = global.__instagramMediaCache || new Map()
    const cached = global.__instagramMediaCache.get(creatorId)
    const now = Date.now()
    if (!forceRefresh && cached && (now - cached._cachedAt < 15 * 60 * 1000)) {
      return { media: cached.media, lastSyncedAt: cached.lastSyncedAt }
    }

    const accessToken = acc.accessToken
    const platformUserId = acc.platformUserId
    const username = acc.username || ''

    if (accessToken && !accessToken.startsWith('meta_tok_') && !accessToken.startsWith('mock_')) {
      try {
        const apiVersion = process.env.META_API_VERSION || 'v21.0'
        const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'
        const url = `https://graph.instagram.com/${apiVersion}/${platformUserId || 'me'}/media?fields=${fields}&access_token=${encodeURIComponent(accessToken)}&limit=${Math.min(limit, 50)}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.error) {
          if (data.error.code === 190) {
            return { media: [], connected: false, error: 'TOKEN_EXPIRED', status: 'EXPIRED' }
          }
          console.warn('Meta API media fetch error:', data.error.message)
          if (cached) return { media: cached.media, lastSyncedAt: cached.lastSyncedAt, temporaryError: true }
          return { media: [], temporaryError: true, error: data.error.message }
        }

        if (data.data && Array.isArray(data.data)) {
          const media = data.data.map(item => ({
            id: item.id,
            caption: item.caption || '',
            mediaType: item.media_type === 'VIDEO' || item.media_type === 'REEL' ? 'REEL' : item.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : 'POST',
            mediaUrl: item.media_url || item.thumbnail_url || item.permalink || '',
            thumbnailUrl: item.thumbnail_url || item.media_url || '',
            permalink: item.permalink || (username ? `https://instagram.com/${username}` : ''),
            timestamp: item.timestamp || null,
          }))

          const result = { media, lastSyncedAt: new Date().toISOString() }
          global.__instagramMediaCache.set(creatorId, { ...result, _cachedAt: now })
          return result
        }
      } catch (err) {
        console.error('Failed to fetch Instagram media from Meta API:', err.message)
        if (cached) return { media: cached.media, lastSyncedAt: cached.lastSyncedAt, temporaryError: true }
        return { media: [], temporaryError: true }
      }
    }

    // Return empty list when no live media or in dev mock mode without real Meta credentials (no fake posts)
    return { media: [], empty: true, lastSyncedAt: new Date().toISOString() }
  },

  getOAuthUrl(creatorId, returnUrl) {
    if (!creatorId) throw httpError(401, 'Creator ID required to generate OAuth state')

    const appId = process.env.META_INSTAGRAM_APP_ID || process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || 'MOCK_META_APP_ID'
    const redirectUri = process.env.META_INSTAGRAM_REDIRECT_URI || process.env.META_REDIRECT_URI || getAppUrl('/api/integrations/instagram/callback')
    const scope = 'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages'

    // Cryptographically signed state token bound to creatorId with 10-minute expiry
    const stateToken = signPurpose({ creatorId, returnUrl: returnUrl || null, nonce: generateSecureToken() }, 'instagram_oauth_state', 600)

    return `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(stateToken)}&enable_fb_login=0`
  },

  async subscribeWebhook(accessToken, { platformUserId, pageId, pageAccessToken, isFacebookLogin } = {}) {
    if (!accessToken) {
      return { success: false, error: 'Access token missing' }
    }

    if (accessToken.startsWith('meta_tok_') || accessToken.startsWith('mock_') || accessToken.startsWith('test_') || process.env.META_TEST_MODE === 'true') {
      console.log('[INSTAGRAM_WEBHOOK_SUBSCRIBE_DEV_MODE] Mock webhook subscription simulated successfully')
      return { success: true, devMode: true }
    }

    const apiVersion = process.env.META_API_VERSION || 'v21.0'

    // Route according to the specific Meta login product:
    if (isFacebookLogin && pageId) {
      // Facebook Login flow: requires Facebook Page ID and Page Access Token on graph.facebook.com
      const token = pageAccessToken || accessToken
      const fbUrl = `https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps`
      try {
        const bodyParams = new URLSearchParams({
          subscribed_fields: 'feed,messages',
          access_token: token,
        })
        const res = await fetch(fbUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        })
        const data = await res.json()
        const isSuccess = res.ok && (data.success === true || data.success === 'true' || (Array.isArray(data.data) && data.data.length > 0))
        if (isSuccess) {
          console.log(`[INSTAGRAM_WEBHOOK_SUBSCRIBE_SUCCESS] Facebook Page ${pageId} subscribed to webhooks`)
          return { success: true, endpoint: fbUrl }
        }
        const err = data?.error || {}
        console.error(`[INSTAGRAM_WEBHOOK_SUBSCRIBE_FAILED] Facebook Page ${pageId} subscription failed:`, {
          status: res.status,
          code: err.code,
          subcode: err.error_subcode,
          type: err.type,
          message: err.message,
        })
        return {
          success: false,
          error: err.message || 'Page webhook subscription rejected by Facebook Graph API',
          code: err.code || res.status,
          subcode: err.error_subcode || null,
          type: err.type || null,
          status: res.status,
        }
      } catch (e) {
        console.error('[INSTAGRAM_WEBHOOK_SUBSCRIBE_NETWORK_ERROR]', e.message)
        return { success: false, error: e.message, status: 500 }
      }
    } else {
      // Instagram Login flow (Business Login for Instagram):
      // Must use graph.instagram.com/{apiVersion}/me/subscribed_apps with Instagram User Access Token.
      // NOTE: Calling graph.instagram.com/{user_id}/subscribed_apps produces Meta Error Code 100
      // ("Unsupported request - method type: post") because the user_id node only supports GET.
      // /me/subscribed_apps is the official Meta endpoint for user-level webhook field subscriptions.
      const igUrl = `https://graph.instagram.com/${apiVersion}/me/subscribed_apps`
      try {
        const queryUrl = `${igUrl}?subscribed_fields=comments,messages&access_token=${encodeURIComponent(accessToken)}`
        const bodyParams = new URLSearchParams({
          subscribed_fields: 'comments,messages',
        })
        const res = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        })
        const data = await res.json()
        const isSuccess = res.ok && (data.success === true || data.success === 'true' || (Array.isArray(data.data) && data.data.length > 0))

        if (isSuccess) {
          console.log(`[INSTAGRAM_WEBHOOK_SUBSCRIBE_SUCCESS] Instagram account (/me) subscribed to webhooks. Fields: comments,messages`)
          return { success: true, endpoint: igUrl }
        }

        const err = data?.error || {}
        console.error(`[INSTAGRAM_WEBHOOK_SUBSCRIBE_FAILED] Instagram /me/subscribed_apps failed:`, {
          status: res.status,
          code: err.code,
          subcode: err.error_subcode,
          type: err.type,
          message: err.message,
        })
        return {
          success: false,
          error: err.message || 'Webhook subscription rejected by Instagram Graph API',
          code: err.code || res.status,
          subcode: err.error_subcode || null,
          type: err.type || null,
          status: res.status,
        }
      } catch (e) {
        console.error('[INSTAGRAM_WEBHOOK_SUBSCRIBE_NETWORK_ERROR]', e.message)
        return { success: false, error: e.message, status: 500 }
      }
    }
  },

  async retrySubscription(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const acc = await instagramRepo.getByCreatorId(creatorId)
    if (!acc || !acc.accessToken) {
      throw httpError(400, 'No Instagram account found to subscribe')
    }

    if (acc.tokenExpiresAt && new Date(acc.tokenExpiresAt) < new Date()) {
      throw httpError(400, 'Instagram access token has expired. Please reconnect your account.')
    }

    const subResult = await this.subscribeWebhook(acc.accessToken, {
      platformUserId: acc.platformUserId,
      isFacebookLogin: acc.platform === 'FACEBOOK',
    })

    if (subResult.success) {
      await instagramRepo.upsert(creatorId, {
        platform: acc.platform || 'INSTAGRAM',
        platformUserId: acc.platformUserId,
        username: acc.username,
        accessToken: acc.accessToken,
        tokenExpiresAt: acc.tokenExpiresAt,
        status: 'CONNECTED',
      })
      return {
        success: true,
        status: 'CONNECTED',
        message: 'Instagram webhook subscription activated successfully',
      }
    } else {
      return {
        success: false,
        status: 'SUBSCRIPTION_FAILED',
        error: subResult.error || 'Webhook subscription rejected by Meta Graph API',
        code: subResult.code || null,
        message: `Meta Error: ${subResult.error || 'Failed to activate webhook subscription'}`,
      }
    }
  },

  async handleCallback(code, stateToken) {
    if (!code) throw httpError(400, 'Authorization code missing')
    if (!stateToken) throw httpError(400, 'OAuth state parameter missing')

    // Verify cryptographic OAuth state token before processing anything
    const verifiedState = verifyPurpose(stateToken, 'instagram_oauth_state')
    if (!verifiedState || !verifiedState.creatorId) {
      throw httpError(400, 'Invalid or expired OAuth state token')
    }

    const creatorId = verifiedState.creatorId
    const returnUrl = verifiedState.returnUrl || null

    const appId = process.env.META_INSTAGRAM_APP_ID || process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID
    const appSecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    const redirectUri = process.env.META_INSTAGRAM_REDIRECT_URI || process.env.META_REDIRECT_URI || getAppUrl('/api/integrations/instagram/callback')

    let accessToken = null
    let platformUserId = null
    let username = null
    let tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    let status = 'CONNECTED'
    let subscriptionError = null
    let isFacebookLogin = false
    let pageId = null
    let pageAccessToken = null

    const isTestCode = code.startsWith('mock_') || code.startsWith('test_') || process.env.META_TEST_MODE === 'true'

    if (appId && appSecret && !isTestCode) {
      try {
        const apiVersion = process.env.META_API_VERSION || 'v21.0'

        // 1. Exchange short-lived token (tries api.instagram.com first, falls back to graph.facebook.com)
        let shortToken = null
        let igUserId = null

        try {
          const igFormData = new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code: code,
          })
          const igTokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: igFormData.toString(),
          })
          const igTokenData = await igTokenRes.json()
          if (igTokenData.access_token) {
            shortToken = igTokenData.access_token
            igUserId = igTokenData.user_id || igTokenData.user?.id
          }
        } catch (e) {
          console.warn('Instagram API short token exchange fallback:', e.message)
        }

        if (!shortToken) {
          const tokenRes = await fetch(`https://graph.facebook.com/${apiVersion}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`)
          const tokenData = await tokenRes.json()
          if (tokenData.error) {
            throw httpError(400, tokenData.error.message || 'Meta OAuth code exchange failed')
          }
          shortToken = tokenData.access_token
          isFacebookLogin = true
        }

        // 2. Exchange long-lived token
        try {
          const longRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`)
          const longData = await longRes.json()
          accessToken = longData.access_token || shortToken
        } catch (e) {
          const longRes = await fetch(`https://graph.facebook.com/${apiVersion}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`)
          const longData = await longRes.json()
          accessToken = longData.access_token || shortToken
          isFacebookLogin = true
        }

        // 3. Get user profile / Instagram business account
        try {
          const meIgRes = await fetch(`https://graph.instagram.com/${apiVersion}/me?fields=id,username,user_id,account_type&access_token=${encodeURIComponent(accessToken)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const meIgData = await meIgRes.json()
          if (meIgData && meIgData.username) {
            username = meIgData.username
            // Prioritize user_id (the canonical Instagram Professional User ID sent in webhook entry.id) over id (App-Scoped ID)
            platformUserId = meIgData.user_id || meIgData.id || igUserId
          }
        } catch (e) {
          console.warn('Instagram me profile lookup failed:', e.message)
        }

        if (!username) {
          const meRes = await fetch(`https://graph.facebook.com/${apiVersion}/me/accounts?access_token=${encodeURIComponent(accessToken)}`)
          const meData = await meRes.json()
          if (meData.data && meData.data.length > 0) {
            pageId = meData.data[0].id
            pageAccessToken = meData.data[0].access_token || accessToken
            const pageRes = await fetch(`https://graph.facebook.com/${apiVersion}/${pageId}?fields=instagram_business_account,username&access_token=${encodeURIComponent(pageAccessToken)}`)
            const pageData = await pageRes.json()
            if (pageData.instagram_business_account) {
              platformUserId = pageData.instagram_business_account.id
              const igRes = await fetch(`https://graph.facebook.com/${apiVersion}/${platformUserId}?fields=username&access_token=${encodeURIComponent(pageAccessToken)}`)
              const igData = await igRes.json()
              username = igData.username || pageData.username || 'creator_instagram'
              isFacebookLogin = true
            }
          }
          if (!username) username = meData.data?.[0]?.name?.toLowerCase().replace(/\s+/g, '_') || 'creator_instagram'
        }

        // 4. Subscribe connected Instagram account to Meta App webhooks
        const subResult = await this.subscribeWebhook(accessToken, {
          platformUserId,
          pageId,
          pageAccessToken,
          isFacebookLogin,
        })

        if (subResult.success) {
          status = 'CONNECTED'
          console.log(`[INSTAGRAM_OAUTH_SUBSCRIBE_SUCCESS] Webhook subscription verified for ${username} (${platformUserId}). Fields: comments,messages`)
        } else {
          status = 'SUBSCRIPTION_FAILED'
          subscriptionError = subResult.error || 'Webhook subscription rejected by Meta Graph API'
          console.warn(`[INSTAGRAM_OAUTH_SUBSCRIBE_WARNING] OAuth token received for ${username} (${platformUserId}), but webhook subscription failed: "${subscriptionError}" (Meta Code: ${subResult.code}). Persisting account in SUBSCRIPTION_FAILED status for safe retry.`)
        }
      } catch (err) {
        if (err.status) throw err
        console.error('Meta OAuth API call error:', err.message)
        throw httpError(400, err.message || 'Failed to exchange Meta OAuth token')
      }
    } else {
      // Development/test fallback mode
      accessToken = `meta_tok_${generateSecureToken()}`
      username = `creator_${creatorId.slice(0, 8)}`
      platformUserId = `ig_id_${generateSecureToken().slice(0, 10)}`
      status = 'CONNECTED'
    }

    const saved = await instagramRepo.upsert(creatorId, {
      platform: isFacebookLogin ? 'FACEBOOK' : 'INSTAGRAM',
      platformUserId,
      username,
      accessToken,
      tokenExpiresAt,
      status,
    })

    return {
      connected: saved.status === 'CONNECTED',
      username: saved.username,
      platform: saved.platform,
      status: saved.status,
      subscriptionError: status === 'SUBSCRIPTION_FAILED' ? subscriptionError : null,
      returnUrl,
    }
  },

  async disconnectAccount(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const acc = await instagramRepo.getByCreatorId(creatorId)
    if (acc?.accessToken && !acc.accessToken.startsWith('meta_tok_') && !acc.accessToken.startsWith('mock_')) {
      try {
        const apiVersion = process.env.META_API_VERSION || 'v21.0'
        await fetch(`https://graph.instagram.com/${apiVersion}/me/subscribed_apps?access_token=${encodeURIComponent(acc.accessToken)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${acc.accessToken}` },
        })
      } catch (e) {
        console.warn('Instagram unsubscribe on disconnect warning:', e.message)
      }
    }
    await instagramRepo.deleteByCreatorId(creatorId)
    return { success: true }
  }
}

function getAutomationHealth(auto, igAcc) {
  if (auto.status === 'PAUSED') return 'PAUSED'
  if (!igAcc || igAcc.status !== 'CONNECTED') return 'INSTAGRAM_DISCONNECTED'
  if (igAcc.tokenExpiresAt && new Date(igAcc.tokenExpiresAt) < new Date()) return 'TOKEN_EXPIRED'
  return 'ACTIVE'
}

export const automationService = {
  async listAutomations(creatorId) {
    if (!creatorId) return []
    const items = await automationsRepo.list(creatorId)
    const igAcc = await instagramRepo.getByCreatorId(creatorId)

    return await Promise.all(items.map(async (item) => {
      const metrics = await automationEventsRepo.getMetricsForAutomation(item.id)
      const healthStatus = getAutomationHealth(item, igAcc)
      return {
        ...item,
        healthStatus,
        metrics,
      }
    }))
  },

  async getAutomation(id, creatorId) {
    if (!id || !creatorId) throw httpError(400, 'Automation ID and Creator ID required')
    const item = await automationsRepo.getForCreator(id, creatorId)
    if (!item) throw httpError(404, 'Automation not found')

    const igAcc = await instagramRepo.getByCreatorId(creatorId)
    const metrics = await automationEventsRepo.getMetricsForAutomation(item.id)
    const healthStatus = getAutomationHealth(item, igAcc)
    return {
      ...item,
      healthStatus,
      metrics,
    }
  },

  async getAutomationEvents(id, creatorId, { limit = 20, offset = 0 } = {}) {
    if (!id || !creatorId) throw httpError(400, 'Automation ID and Creator ID required')
    const item = await automationsRepo.getForCreator(id, creatorId)
    if (!item) throw httpError(404, 'Automation not found')
    return await automationEventsRepo.listEventsForAutomation(id, creatorId, { limit, offset })
  },

  async createAutomation(creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'automations')

    // Check Instagram connection status
    const igAcc = await instagramRepo.getByCreatorId(creatorId)
    const isConnected = igAcc && igAcc.status === 'CONNECTED' && Boolean(igAcc.accessToken) && (!igAcc.tokenExpiresAt || new Date(igAcc.tokenExpiresAt) > new Date())
    if (!isConnected) {
      throw httpError(403, 'Connect your Instagram account before creating an automation.', 'INSTAGRAM_NOT_CONNECTED')
    }

    // Plan Entitlement Check: AutoDM Campaign limits
    const subStatus = await creatorSubscriptionService.getStatus(creatorId).catch(() => null)
    const planId = subStatus?.planId || 'UNSUBSCRIBED'
    if (planId === 'UNSUBSCRIBED' || (subStatus?.status !== 'ACTIVE' && subStatus?.status !== 'TRIALING')) {
      const pricing = getSubscriptionPricing()
      throw httpError(403, `A paid plan (Creator ${pricing.CREATOR.priceFormatted}/mo or Pro ${pricing.PRO.priceFormatted}/mo) is required to activate live Instagram AutoDM campaigns.`)
    }
    const limit = getEntitlementLimit(planId, 'autoDmCampaignsLimit')
    const currentAutomations = await automationsRepo.list(creatorId)
    if (currentAutomations && currentAutomations.length >= limit) {
      const pricing = getSubscriptionPricing()
      throw httpError(403, `Creator plan is limited to 3 AutoDM campaigns. Upgrade to Pro (${pricing.PRO.priceFormatted}/mo) for unlimited campaigns.`)
    }

    const name = sanitizeText(data.name || '').trim()
    const rawKeywords = Array.isArray(data.keywords) && data.keywords.length > 0
      ? data.keywords.map(k => String(k).trim()).filter(Boolean)
      : (data.triggerValue ? String(data.triggerValue).split(',').map(k => k.trim()).filter(Boolean) : [])

    const triggerValue = rawKeywords.length > 0 ? rawKeywords.join(', ') : sanitizeText(data.triggerValue || '').trim()
    const destinationType = (data.destinationType || 'PRODUCT').toUpperCase()
    const isCustomLink = destinationType === 'CUSTOM_LINK'

    if (!name) throw httpError(400, 'Automation name is required')
    if (rawKeywords.length === 0 && !triggerValue) throw httpError(400, 'Trigger keyword cannot be empty')

    let productId = null
    let customUrl = null

    if (isCustomLink) {
      const validated = validateCustomUrl(data.customUrl)
      if (!validated) throw httpError(400, 'Please enter a valid custom HTTPS URL')
      customUrl = validated
    } else {
      productId = data.productId
      if (!productId) throw httpError(400, 'Product selection is required')
      const product = await productsRepo.getForCreator(productId, creatorId)
      if (!product) {
        throw httpError(403, 'Selected product was not found or does not belong to you')
      }
    }

    const message = sanitizeText(data.message || '').trim()

    return await automationsRepo.create({
      creatorId,
      name,
      platform: 'INSTAGRAM',
      triggerType: 'COMMENT_KEYWORD',
      triggerValue,
      actionType: 'SEND_DM',
      productId: productId || null,
      customUrl: customUrl || null,
      destinationType: isCustomLink ? 'CUSTOM_LINK' : 'PRODUCT',
      message: message || (isCustomLink ? "Here's the link you requested 👇" : "Here's the resource you requested 👇"),
      mediaId: data.mediaId || null,
      mediaType: data.mediaType || 'ALL',
      mediaUrl: data.mediaUrl || null,
      mediaCaption: data.mediaCaption || null,
      keywords: rawKeywords,
      commentReply: data.commentReply ? sanitizeText(data.commentReply).trim() : null,
      openingMessageEnabled: Boolean(data.openingMessageEnabled),
      openingMessage: data.openingMessage ? sanitizeText(data.openingMessage).trim() : null,
      openingButtonText: data.openingButtonText ? sanitizeText(data.openingButtonText).trim() : 'Send me the link',
      buttonText: data.buttonText ? sanitizeText(data.buttonText).trim() : (isCustomLink ? 'Get it here' : 'Get access'),
      responses: Array.isArray(data.responses) ? data.responses : [],
      status: data.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
    })
  },

  async updateAutomation(id, creatorId, data) {
    if (!id || !creatorId) throw httpError(400, 'Missing automation ID')
    const existing = await automationsRepo.getForCreator(id, creatorId)
    if (!existing) throw httpError(404, 'Automation not found')

    const updateData = {}
    if (data.name !== undefined) {
      const name = sanitizeText(data.name || '').trim()
      if (!name) throw httpError(400, 'Automation name cannot be empty')
      updateData.name = name
    }
    if (data.keywords !== undefined || data.triggerValue !== undefined) {
      const rawKeywords = Array.isArray(data.keywords) && data.keywords.length > 0
        ? data.keywords.map(k => String(k).trim()).filter(Boolean)
        : (data.triggerValue ? String(data.triggerValue).split(',').map(k => k.trim()).filter(Boolean) : [])

      const keyword = rawKeywords.length > 0 ? rawKeywords.join(', ') : sanitizeText(data.triggerValue || '').trim()
      if (rawKeywords.length === 0 && !keyword) throw httpError(400, 'Trigger keyword cannot be empty')
      updateData.keywords = rawKeywords
      updateData.triggerValue = keyword
    }

    if (data.destinationType !== undefined) {
      const dest = String(data.destinationType).toUpperCase()
      updateData.destinationType = dest === 'CUSTOM_LINK' ? 'CUSTOM_LINK' : 'PRODUCT'
    }

    const effectiveDest = updateData.destinationType || existing.destinationType || 'PRODUCT'

    if (effectiveDest === 'CUSTOM_LINK') {
      if (data.customUrl !== undefined) {
        const validated = validateCustomUrl(data.customUrl)
        if (!validated) throw httpError(400, 'Please enter a valid custom HTTPS URL')
        updateData.customUrl = validated
      }
      if (data.productId !== undefined) {
        updateData.productId = null
      }
    } else {
      if (data.productId !== undefined) {
        if (!data.productId) throw httpError(400, 'Product selection is required')
        const product = await productsRepo.getForCreator(data.productId, creatorId)
        if (!product) throw httpError(403, 'Selected product does not belong to you')
        updateData.productId = data.productId
      }
      if (data.customUrl !== undefined) {
        updateData.customUrl = null
      }
    }

    if (data.message !== undefined) {
      updateData.message = sanitizeText(data.message || '').trim()
    }
    if (data.mediaId !== undefined) updateData.mediaId = data.mediaId
    if (data.mediaType !== undefined) updateData.mediaType = data.mediaType
    if (data.mediaUrl !== undefined) updateData.mediaUrl = data.mediaUrl
    if (data.mediaCaption !== undefined) updateData.mediaCaption = data.mediaCaption
    if (data.commentReply !== undefined) updateData.commentReply = data.commentReply ? sanitizeText(data.commentReply).trim() : null
    if (data.openingMessageEnabled !== undefined) updateData.openingMessageEnabled = Boolean(data.openingMessageEnabled)
    if (data.openingMessage !== undefined) updateData.openingMessage = data.openingMessage ? sanitizeText(data.openingMessage).trim() : null
    if (data.openingButtonText !== undefined) updateData.openingButtonText = data.openingButtonText ? sanitizeText(data.openingButtonText).trim() : 'Send me the link'
    if (data.buttonText !== undefined) updateData.buttonText = data.buttonText ? sanitizeText(data.buttonText).trim() : 'Get access'
    if (data.responses !== undefined) updateData.responses = Array.isArray(data.responses) ? data.responses : []

    if (data.status !== undefined && !data.statusOnly) {
      updateData.status = data.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    } else if (data.statusOnly && data.status) {
      updateData.status = data.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    }

    if (updateData.status === 'ACTIVE') {
      const igAcc = await instagramRepo.getByCreatorId(creatorId)
      const isConnected = igAcc && igAcc.status === 'CONNECTED' && Boolean(igAcc.accessToken) && (!igAcc.tokenExpiresAt || new Date(igAcc.tokenExpiresAt) > new Date())
      if (!isConnected) {
        throw httpError(403, 'Connect your Instagram account before creating an automation.', 'INSTAGRAM_NOT_CONNECTED')
      }
    }

    return await automationsRepo.update(id, creatorId, updateData)
  },

  async toggleStatus(id, creatorId, newStatus) {
    if (!id || !creatorId) throw httpError(400, 'Automation ID required')
    const status = String(newStatus || '').toUpperCase()
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw httpError(400, 'Invalid status')

    // Check IG account if activating
    if (status === 'ACTIVE') {
      const igAcc = await instagramRepo.getByCreatorId(creatorId)
      const isConnected = igAcc && igAcc.status === 'CONNECTED' && Boolean(igAcc.accessToken) && (!igAcc.tokenExpiresAt || new Date(igAcc.tokenExpiresAt) > new Date())
      if (!isConnected) {
        throw httpError(403, 'Connect your Instagram account before creating an automation.', 'INSTAGRAM_NOT_CONNECTED')
      }
    }

    return await automationsRepo.update(id, creatorId, { status })
  },

  async deleteAutomation(id, creatorId) {
    if (!id || !creatorId) throw httpError(400, 'Automation ID required')
    const existing = await automationsRepo.getForCreator(id, creatorId)
    if (!existing) throw httpError(404, 'Automation not found')
    return await automationsRepo.delete(id, creatorId)
  }
}

export function matchKeyword(commentText, keyword) {
  if (!commentText || !keyword) return false
  const cleanComment = String(commentText).toLowerCase().trim()
  const cleanKeyword = String(keyword).toLowerCase().trim()
  if (!cleanComment || !cleanKeyword) return false

  const escaped = cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundaryRegex = new RegExp(`\\b${escaped}\\b`, 'i')
  return boundaryRegex.test(cleanComment)
}

export const instagramMessagingService = {
  async processWebhookEvent(payload) {
    console.log('[INSTAGRAM_WEBHOOK] Received Webhook Payload:', JSON.stringify(payload, null, 2))
    if (!payload || !payload.entry) return { processed: false, reason: 'Invalid payload' }

    let processedCount = 0
    let skippedCount = 0

    for (const entry of payload.entry || []) {
      const platformUserId = entry.id || entry.uid
      console.log('[INSTAGRAM_WEBHOOK] Processing entry for platformUserId:', platformUserId)

      // 1. Resolve Creator from Instagram Account ID (platformUserId)
      let igAcc = null
      if (platformUserId) {
        igAcc = await instagramRepo.getByPlatformUserId(platformUserId)
      }

      for (const change of entry.changes || []) {
        if (change.field === 'comments' && change.value) {
          const commentVal = change.value
          const commentText = (commentVal.text || '').trim()
          const senderId = commentVal.from?.id || commentVal.from_id
          const commentId = commentVal.id || commentVal.comment_id
          const mediaId = commentVal.media?.id || commentVal.post_id || commentVal.media_id

          console.log('[INSTAGRAM_WEBHOOK_PARSED_COMMENT]', {
            platformUserId,
            commentId,
            commentText,
            senderId,
            mediaId
          })

          if (!commentText || !commentId) continue

          // Fallback if platformUserId was on comment value
          const targetPlatformId = platformUserId || commentVal.recipient_id
          if (!igAcc && targetPlatformId) {
            igAcc = await instagramRepo.getByPlatformUserId(targetPlatformId)
          }

          const isMatched = !!igAcc && igAcc.status === 'CONNECTED'
          console.log('[INSTAGRAM_WEBHOOK_ACCOUNT_MATCH]', {
            incomingPlatformUserId: platformUserId,
            matched: isMatched,
            matchedAccountId: igAcc ? igAcc.id : null,
            matchedUsername: igAcc ? igAcc.username : null,
            ACCOUNT_MATCH: isMatched ? 'YES' : 'NO'
          })

          // If no connected Instagram account found or status is not CONNECTED, ignore safely
          if (!igAcc || igAcc.status !== 'CONNECTED') {
            console.log(`[INSTAGRAM_WEBHOOK] Ignored comment ${commentId}: Instagram account not connected`)
            skippedCount++
            continue
          }

          const creatorId = igAcc.creatorId

          // 2. Fetch active automations belonging strictly to THIS creator
          const activeAutomations = await automationsRepo.findActiveByCreatorId(creatorId)
          console.log(`[INSTAGRAM_WEBHOOK_AUTOMATIONS_FOUND] Total active automations for creator ${creatorId}: ${activeAutomations.length}`)

          // 3. Filter automations matching keyword and mediaId
          const matchingAutomations = activeAutomations.filter(auto => {
            const rawKw = Array.isArray(auto.keywords) && auto.keywords.length > 0
              ? auto.keywords
              : (auto.triggerValue ? String(auto.triggerValue).split(',').map(k => k.trim()).filter(Boolean) : [])

            const matchesKeyword = rawKw.some(kw => {
              const cleanKw = String(kw).trim().toLowerCase()
              return cleanKw && commentText.toLowerCase().includes(cleanKw)
            })

            if (!matchesKeyword) return false

            if (auto.mediaId && auto.mediaId !== 'ALL' && mediaId && auto.mediaId !== mediaId) {
              return false
            }

            return true
          })

          if (matchingAutomations.length === 0) {
            console.log(`[INSTAGRAM_WEBHOOK_NO_MATCH] Comment ${commentId} "${commentText}" did not match any active automation keywords/media.`)
            skippedCount++
            continue
          }

          // Sort matching automations: prioritize specific mediaId match over 'ALL'
          matchingAutomations.sort((a, b) => {
            const aSpecific = a.mediaId && a.mediaId !== 'ALL' ? 1 : 0
            const bSpecific = b.mediaId && b.mediaId !== 'ALL' ? 1 : 0
            return bSpecific - aSpecific
          })

          // Execute ONLY ONE automation for the comment
          const auto = matchingAutomations[0]

          const isCustomLink = auto.destinationType === 'CUSTOM_LINK' || auto.destinationType === 'CUSTOM_URL'
          const product = auto.product
          const store = auto.creator?.store
          const creatorProfile = auto.creator?.creatorProfile

          let destinationUrl = ''
          let defaultButtonLabel = ''
          let productTitle = ''
          let targetProductId = null

          const appUrl = getAppUrl()

          if (isCustomLink) {
            const validatedUrl = validateCustomUrl(auto.customUrl)
            if (!validatedUrl) {
              console.error(`[INSTAGRAM_WEBHOOK_INVALID_CUSTOM_URL] Automation ${auto.id} has invalid customUrl: "${auto.customUrl}"`)
              skippedCount++
              continue
            }

            // CUSTOM URL DESTINATION RULE:
            // Use the creator's validated customUrl directly on the DM button target
            destinationUrl = validatedUrl
            defaultButtonLabel = 'Get it here'
            productTitle = 'Resource'
          } else {
            if (!product || product.creatorId !== creatorId) {
              console.log(`[INSTAGRAM_WEBHOOK_PRODUCT_MISMATCH] Product missing or does not belong to creator`)
              skippedCount++
              continue
            }
            targetProductId = product.id
            productTitle = product.title || 'Product'

            const refToken = attributionService.generateAttributionToken({ creatorId, automationId: auto.id, productId: product.id })
            destinationUrl = `${appUrl}/r/${refToken}`

            const isFree = Number(product.price || 0) === 0
            defaultButtonLabel = isFree ? `Get ${productTitle}`.slice(0, 20) : `Get ${productTitle}`.slice(0, 20)
          }

          // 4. ATOMIC IDEMPOTENCY CHECK BEFORE ANY SIDE EFFECTS (PUBLIC REPLY OR PRIVATE DM)
          const claimResult = await automationEventsRepo.claimCommentEvent({
            creatorId,
            automationId: auto.id,
            instagramAccountId: igAcc.id,
            productId: targetProductId,
            commentId,
          })

          if (!claimResult.claimed) {
            console.log('[INSTAGRAM_WEBHOOK_DEDUP]', {
              commentId,
              automationId: auto.id,
              action: 'SKIP_DUPLICATE'
            })
            skippedCount++
            continue
          }

          const creatorName = creatorProfile?.name || store?.storeName || 'Creator'
          const buttonTitle = (auto.buttonText || defaultButtonLabel).trim().slice(0, 20)

          let dmText = ''
          if (auto.openingMessageEnabled && auto.openingMessage) {
            dmText = auto.openingMessage.trim()
              .replace(/\{\{\s*product_name\s*\}\}/g, productTitle)
              .replace(/\{\{\s*creator_name\s*\}\}/g, creatorName)
              .replace(/\{\{\s*link\s*\}\}/g, '')
              .replace(/\{\{\s*product_link\s*\}\}/g, '')
              .trim()
          } else {
            const defaultTemplate = `Here's the {{product_name}} you requested 👇`
            const template = (auto.message || defaultTemplate).trim()
            dmText = template
              .replace(/\{\{\s*product_name\s*\}\}/g, productTitle)
              .replace(/\{\{\s*creator_name\s*\}\}/g, creatorName)
              .replace(/\{\{\s*link\s*\}\}/g, '')
              .replace(/\{\{\s*product_link\s*\}\}/g, '')
              .trim()
          }

          if (!dmText) {
            dmText = `Here's the ${productTitle} you requested 👇`
          }

          // 5. ENQUEUE TO DURABLE BACKGROUND QUEUE (FAIR PACING & RATE LIMIT PROTECTION)
          console.log(`[INSTAGRAM_WEBHOOK_QUEUE_ENQUEUE] Comment ${commentId} -> Recipient ${senderId}: Enqueueing Auto-DM job...`)
          const { autoDmQueueService } = await import('./auto-dm-queue-service.js')
          const queueRes = await autoDmQueueService.enqueueFromWebhook({
            creatorId,
            instagramAccountId: igAcc.id,
            automationId: auto.id,
            commentId,
            mediaId,
            senderId,
            recipientUsername: commentVal.from?.username || 'user',
            message: dmText,
            buttonTitle,
            destinationUrl,
            commentReply: auto.commentReply || null,
            quickReplies: auto.responses || [],
          })

          if (queueRes.enqueued) {
            processedCount++
            console.log(`[INSTAGRAM_WEBHOOK_ENQUEUED] Successfully enqueued comment ${commentId} as Job ${queueRes.job?.id}`)

            // Optional synchronous dispatch for local test harnesses requesting synchronous execution
            if (process.env.AUTO_DM_SYNC_SEND === 'true' && queueRes.job) {
              await autoDmQueueService.processJob(queueRes.job, 'sync-webhook-worker')
            }
          } else if (queueRes.duplicate) {
            skippedCount++
            console.log(`[INSTAGRAM_WEBHOOK_DUPLICATE_JOB] Comment ${commentId} already enqueued/processed.`)
          } else {
            console.warn(`[INSTAGRAM_WEBHOOK_ENQUEUE_FAILED] Comment ${commentId}: ${queueRes.reason || queueRes.error}`)
            skippedCount++
          }
        }
      }
    }

    return { processed: true, count: processedCount, skipped: skippedCount }
  },

  async sendPublicCommentReply({ commentId, message, accessToken }) {
    if (!commentId || !message) return { sent: false, reason: 'Missing commentId or message' }
    if (accessToken && !accessToken.startsWith('meta_tok_')) {
      try {
        const apiVersion = process.env.META_API_VERSION || 'v21.0'
        const endpoint = `https://graph.instagram.com/${apiVersion}/${commentId}/replies`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ message }),
        })
        const data = await res.json()
        const httpStatus = res.status

        if (res.ok && data.id) {
          console.log('[INSTAGRAM_COMMENT_REPLY]', {
            commentId,
            success: true,
            httpStatus,
            replyId: data.id,
          })
          return { sent: true, id: data.id, httpStatus }
        } else {
          const err = data.error || {}
          console.error('[INSTAGRAM_COMMENT_REPLY]', {
            commentId,
            success: false,
            httpStatus,
            code: err.code || null,
            type: err.type || null,
            message: err.message || 'Unknown Meta API error',
          })
          return { sent: false, httpStatus, error: err.message || 'Meta API error', code: err.code, type: err.type }
        }
      } catch (err) {
        console.error('[INSTAGRAM_COMMENT_REPLY]', {
          commentId,
          success: false,
          httpStatus: 500,
          error: err.message,
        })
        return { sent: false, httpStatus: 500, error: err.message }
      }
    } else {
      console.log('[INSTAGRAM_COMMENT_REPLY]', {
        commentId,
        success: true,
        httpStatus: 200,
        devMode: true,
      })
      return { sent: true, devMode: true, httpStatus: 200 }
    }
  },

  async sendDirectMessage({ commentId, recipientId, text, buttonTitle, buttonUrl, message, accessToken, platformUserId, instagramAccountId }) {
    const messageText = text || message
    if (!messageText && !buttonUrl) return { sent: false, reason: 'Missing message content' }

    if (accessToken && !accessToken.startsWith('meta_tok_')) {
      const apiVersion = process.env.META_API_VERSION || 'v21.0'
      const igUserId = platformUserId || 'me'
      const endpoint = `https://graph.instagram.com/${apiVersion}/${igUserId}/messages`

      const cleanButtonTitle = (buttonTitle || 'Get Access').trim().slice(0, 20)

      // Define recipient formats to attempt: comment_id first (for 7-day private reply window), then id (IGSID)
      const recipientOptions = []
      if (commentId) recipientOptions.push({ type: 'comment_id', recipient: { comment_id: commentId } })
      if (recipientId) recipientOptions.push({ type: 'user_id', recipient: { id: recipientId } })

      // Attempt 1 & 2: Structured Templates (Generic & Button)
      if (buttonUrl && cleanButtonTitle) {
        for (const opt of recipientOptions) {
          // A. Generic Template
          try {
            const genericPayload = {
              recipient: opt.recipient,
              message: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'generic',
                    elements: [
                      {
                        title: (messageText || 'Here is your requested resource 👇').trim().slice(0, 80),
                        buttons: [
                          {
                            type: 'web_url',
                            url: buttonUrl,
                            title: cleanButtonTitle,
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            }

            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify(genericPayload),
            })

            const data = await res.json()
            if (res.ok && (data.message_id || data.id)) {
              console.log(`[INSTAGRAM_DM_SUCCESS] Format: generic_template, RecipientType: ${opt.type}, MessageId: ${data.message_id || data.id}`)
              return { sent: true, messageId: data.message_id || data.id, format: `generic_template_${opt.type}` }
            } else {
              const err = data.error || {}
              console.warn(`[INSTAGRAM_DM_ATTEMPT_FAILED] Format: generic_template, RecipientType: ${opt.type}, Status: ${res.status}`, {
                code: err.code,
                type: err.type,
                message: err.message,
                subcode: err.error_subcode,
              })
            }
          } catch (e) {
            console.warn(`[INSTAGRAM_DM_GENERIC_TEMPLATE_ERROR] RecipientType: ${opt.type}`, e.message)
          }

          // B. Button Template
          try {
            const buttonPayload = {
              recipient: opt.recipient,
              message: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'button',
                    text: (messageText || 'Here is your requested resource 👇').trim().slice(0, 640),
                    buttons: [
                      {
                        type: 'web_url',
                        url: buttonUrl,
                        title: cleanButtonTitle,
                      },
                    ],
                  },
                },
              },
            }

            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify(buttonPayload),
            })

            const data = await res.json()
            if (res.ok && (data.message_id || data.id)) {
              console.log(`[INSTAGRAM_DM_SUCCESS] Format: button_template, RecipientType: ${opt.type}, MessageId: ${data.message_id || data.id}`)
              return { sent: true, messageId: data.message_id || data.id, format: `button_template_${opt.type}` }
            } else {
              const err = data.error || {}
              console.warn(`[INSTAGRAM_DM_ATTEMPT_FAILED] Format: button_template, RecipientType: ${opt.type}, Status: ${res.status}`, {
                code: err.code,
                type: err.type,
                message: err.message,
                subcode: err.error_subcode,
              })
            }
          } catch (e) {
            console.warn(`[INSTAGRAM_DM_BUTTON_TEMPLATE_ERROR] RecipientType: ${opt.type}`, e.message)
          }
        }
      }

      // Attempt 3: Standard Text Message via comment_id (Meta's guaranteed private reply format)
      try {
        const primaryRecipient = commentId ? { comment_id: commentId } : { id: recipientId }
        const formattedMessage = buttonUrl
          ? `${messageText}\n\n[ ${cleanButtonTitle} ]\n${buttonUrl}`
          : messageText

        const textPayload = {
          recipient: primaryRecipient,
          message: { text: formattedMessage },
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(textPayload),
        })

        const data = await res.json()
        if (res.ok && (data.message_id || data.id)) {
          console.log(`[INSTAGRAM_DM_SUCCESS] Format: text, MessageId: ${data.message_id || data.id}`)
          return { sent: true, messageId: data.message_id || data.id, format: 'text' }
        }

        const err = data.error || {}
        console.error('[INSTAGRAM_PRIVATE_REPLY_FAILED]', {
          httpStatus: res.status,
          metaErrorCode: err.code || null,
          metaErrorType: err.type || null,
          metaErrorMessage: err.message || 'Unknown Meta API error',
          commentId: commentId || null,
          instagramAccountId: instagramAccountId || platformUserId || null,
        })

        return {
          sent: false,
          error: err.message || `HTTP ${res.status} Meta API error`,
          code: err.code,
          status: res.status,
        }
      } catch (err) {
        console.error('[INSTAGRAM_PRIVATE_REPLY_NETWORK_ERROR]', {
          message: err.message,
          commentId: commentId || null,
          instagramAccountId: instagramAccountId || platformUserId || null,
        })
        return { sent: false, error: err.message }
      }
    } else {
      console.log(`[INSTAGRAM_DM_DEV_MODE] Private reply posted for comment ${commentId}: "${messageText}"`)
      return { sent: true, devMode: true, messageId: `dev_msg_${Date.now()}` }
    }
  }
}

// ---------- Digital Business Card Service ----------

const contactSubmissionLimiter = new Map()

export const businessCardService = {
  async get(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const store = await storesRepo.getByCreator(creatorId)
    const profile = await profilesRepo.getByCreator(creatorId)
    const user = await usersRepo.findById(creatorId)

    const defaultDisplayName = store?.storeName || profile?.name || (store?.username ? `@${store.username}` : '')
    const defaultColor = '#D2E823' // Reference signature lime
    const rawCard = store?.theme?.businessCard || {}

    return {
      displayName: (rawCard.displayName !== undefined && rawCard.displayName !== null) ? rawCard.displayName : defaultDisplayName,
      backgroundColor: rawCard.backgroundColor || defaultColor,
      allowContactShare: Boolean(rawCard.allowContactShare),
      contactDetails: {
        fullName: rawCard.contactDetails?.fullName || profile?.name || '',
        title: rawCard.contactDetails?.title || '',
        organization: rawCard.contactDetails?.organization || store?.storeName || '',
        email: rawCard.contactDetails?.email || user?.email || '',
        phone: rawCard.contactDetails?.phone || profile?.phone || '',
        website: rawCard.contactDetails?.website || (store?.username ? `https://creatorstore.store/${store.username}` : ''),
        note: rawCard.contactDetails?.note || ''
      },
      storeSlug: store?.slug || store?.username || '',
      username: store?.username || store?.slug || '',
      avatarUrl: profile?.avatarUrl || store?.avatarUrl || '',
      updatedAt: rawCard.updatedAt || store?.updatedAt || new Date().toISOString()
    }
  },

  async save(creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')

    // Validation
    const displayName = String(data.displayName || '').trim().slice(0, 80)
    let backgroundColor = String(data.backgroundColor || '').trim()
    // Validate hex color (#RGB, #RRGGBB, #RRGGBBAA)
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(backgroundColor)) {
      backgroundColor = '#D2E823'
    }

    const allowContactShare = Boolean(data.allowContactShare)
    const rawContact = data.contactDetails || {}
    const contactDetails = {
      fullName: String(rawContact.fullName || '').trim().slice(0, 100),
      title: String(rawContact.title || '').trim().slice(0, 100),
      organization: String(rawContact.organization || '').trim().slice(0, 100),
      email: String(rawContact.email || '').trim().slice(0, 120),
      phone: String(rawContact.phone || '').trim().slice(0, 30),
      website: String(rawContact.website || '').trim().slice(0, 200),
      note: String(rawContact.note || '').trim().slice(0, 250)
    }

    if (contactDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDetails.email)) {
      throw httpError(400, 'Invalid contact email address')
    }

    const store = await storesRepo.getByCreator(creatorId)
    if (!store) throw httpError(404, 'Store not found')

    const cardPayload = {
      displayName,
      backgroundColor,
      allowContactShare,
      contactDetails,
      updatedAt: new Date().toISOString()
    }

    const existingTheme = store.theme || {}
    const updatedTheme = {
      ...existingTheme,
      businessCard: cardPayload
    }

    await storesRepo.update(creatorId, { theme: updatedTheme })

    return {
      success: true,
      businessCard: cardPayload
    }
  },

  async submitVisitorContact(data, clientIp = 'unknown') {
    const creatorId = data.creatorId
    const username = data.username
    let targetCreatorId = creatorId

    if (!targetCreatorId && username) {
      const store = await storesRepo.getBySlug(username)
      if (store) targetCreatorId = store.creatorId
    }

    if (!targetCreatorId) throw httpError(400, 'Creator not found')

    // Rate limiting: max 5 requests per 10 minutes per IP
    const now = Date.now()
    const windowMs = 10 * 60 * 1000
    const timestamps = (contactSubmissionLimiter.get(clientIp) || []).filter(t => now - t < windowMs)
    if (timestamps.length >= 5) {
      throw httpError(429, 'Too many submissions. Please try again later.')
    }
    timestamps.push(now)
    contactSubmissionLimiter.set(clientIp, timestamps)

    // Verify creator has contact sharing enabled
    const store = await storesRepo.getByCreator(targetCreatorId)
    const card = store?.theme?.businessCard || {}
    if (!card.allowContactShare) {
      throw httpError(403, 'Contact sharing is not enabled for this creator')
    }

    const name = String(data.name || '').trim().slice(0, 100)
    const email = String(data.email || '').trim().toLowerCase().slice(0, 120)
    const phone = String(data.phone || '').trim().slice(0, 30)
    const message = String(data.message || '').trim().slice(0, 500)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw httpError(400, 'A valid email address is required')
    }

    // Capture into leads system
    const lead = await leadService.capture(targetCreatorId, {
      name,
      email,
      phone,
      source: 'Business Card',
      leadMagnetTitle: 'Digital Business Card',
      metadata: {
        capturedVia: 'digital_business_card',
        message,
        clientIp: String(clientIp).slice(0, 45),
        submittedAt: new Date().toISOString()
      }
    })

    return {
      success: true,
      message: 'Thank you! Your contact details have been shared with the creator.'
    }
  },

  async getVCard({ username, creatorId }) {
    let store = null
    if (creatorId) {
      store = await storesRepo.getByCreator(creatorId)
    } else if (username) {
      store = await storesRepo.getBySlug(username)
    }
    if (!store) throw httpError(404, 'Store not found')

    const profile = await profilesRepo.getByCreator(store.creatorId)
    const card = store.theme?.businessCard || {}
    const c = card.contactDetails || {}

    const fullName = c.fullName || card.displayName || profile?.name || store.storeName || store.username
    const title = c.title || ''
    const org = c.organization || store.storeName || ''
    const email = c.email || ''
    const phone = c.phone || profile?.phone || ''
    const website = c.website || `https://creatorstore.store/${store.username || store.slug}`
    const note = c.note || `Digital Business Card for ${fullName} on CreatorStore`

    // Generate RFC 6350 / 2426 vCard 3.0
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${fullName.replace(/\n/g, ' ')}`,
      `N:${fullName.split(' ').slice(1).join(' ') || ''};${fullName.split(' ')[0] || ''};;;`,
    ]
    if (title) lines.push(`TITLE:${title.replace(/\n/g, ' ')}`)
    if (org) lines.push(`ORG:${org.replace(/\n/g, ' ')}`)
    if (email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${email}`)
    if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`)
    if (website) lines.push(`URL:${website}`)
    if (note) lines.push(`NOTE:${note.replace(/\n/g, ' ')}`)
    lines.push('REV:' + new Date().toISOString())
    lines.push('END:VCARD')

    const cleanFilename = `${(store.username || 'creator').replace(/[^a-zA-Z0-9_-]/g, '_')}_contact.vcf`
    return {
      filename: cleanFilename,
      content: lines.join('\r\n')
    }
  }
}

// ---------- Support & Help Center Service ----------

const supportTicketRateLimiter = new Map()

export const supportService = {
  getCategories() {
    return HELP_CATEGORIES
  },

  getArticles(params = null, queryParam = '') {
    let categoryId = null
    let query = ''
    if (params && typeof params === 'object') {
      categoryId = params.category || params.categoryId || null
      query = params.search || params.query || ''
    } else {
      categoryId = params
      query = queryParam || ''
    }
    let list = HELP_ARTICLES
    if (categoryId && categoryId !== 'all') {
      list = list.filter((a) => a.categoryId === categoryId)
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((a) => {
        return (
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.categoryId.toLowerCase().includes(q) ||
          (a.keywords && a.keywords.some((k) => k.toLowerCase().includes(q)))
        )
      })
    }
    return list
  },

  getArticleBySlug(slug) {
    if (!slug) return null
    return HELP_ARTICLES.find((a) => a.slug === slug || a.id === slug) || null
  },

  async createTicket(creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')

    const subject = String(data.subject || '').trim()
    const category = String(data.category || '').trim()
    const description = String(data.description || '').trim()
    const relatedPage = String(data.relatedPage || '').trim()

    if (!subject || subject.length < 3) {
      throw httpError(400, 'Subject is required and must be at least 3 characters long')
    }
    if (subject.length > 200) {
      throw httpError(400, 'Subject cannot exceed 200 characters')
    }
    if (!category) {
      throw httpError(400, 'Please select a relevant category')
    }
    if (!description || description.length < 10) {
      throw httpError(400, 'Description is required and must be at least 10 characters long')
    }
    if (description.length > 5000) {
      throw httpError(400, 'Description cannot exceed 5000 characters')
    }

    // Rate limiting: max 5 tickets per 10 minutes per creator
    const now = Date.now()
    const windowMs = 10 * 60 * 1000
    const timestamps = (supportTicketRateLimiter.get(creatorId) || []).filter((t) => now - t < windowMs)
    if (timestamps.length >= 5) {
      throw httpError(429, 'Too many support tickets submitted recently. Please wait before creating another request.')
    }
    timestamps.push(now)
    supportTicketRateLimiter.set(creatorId, timestamps)

    const ticket = await supportTicketsRepo.create({
      creatorId,
      subject,
      category,
      description,
      relatedPage,
    })

    // Non-blocking notification email
    try {
      const creatorUser = await usersRepo.findById(creatorId).catch(() => null)
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      if (creatorUser?.email) {
        await emailService.sendMail({
          to: creatorUser.email,
          subject: `[${ticket.ticketNumber}] We received your support request: ${ticket.subject}`,
          text: `Hi ${profile?.name || 'Creator'},\n\nWe have received your support request "${ticket.subject}" (Reference: ${ticket.ticketNumber}).\n\nOur support team will investigate and respond within 24 to 48 business hours.\n\nYou can track your ticket in your CreatorStore dashboard.\n\nBest regards,\nCreatorStore Support Team`,
        }).catch(() => null)
      }
    } catch (e) {
      console.warn('[supportService.createTicket] Non-blocking email notification error:', e?.message || e)
    }

    return ticket
  },

  async listTickets(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return supportTicketsRepo.listByCreator(creatorId)
  },

  async getTicket(creatorId, ticketId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const ticket = await supportTicketsRepo.getById(ticketId, creatorId)
    if (!ticket) throw httpError(404, 'Support ticket not found')
    return ticket
  },
}

// ---------- Bundles Service ----------
export const bundlesService = {
  async validateBundleData(creatorId, data) {
    const title = (data.title || '').trim()
    if (!title) {
      throw httpError(400, 'Title is required for product bundle')
    }
    if (title.length > 255) {
      throw httpError(400, 'Title must be 255 characters or less')
    }

    const description = (data.description || '').trim()
    if (description.length > 500) {
      throw httpError(400, 'Description must be 500 characters or less')
    }

    const productIds = Array.isArray(data.productIds) ? data.productIds : []
    if (productIds.length === 0) {
      throw httpError(400, 'At least 1 product must be selected for the bundle')
    }
    if (productIds.length > 10) {
      throw httpError(400, 'You can select up to 10 products per bundle')
    }

    const uniqueIds = [...new Set(productIds)]
    if (uniqueIds.length !== productIds.length) {
      throw httpError(400, 'Duplicate products are not allowed in a bundle')
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        creatorId,
        NOT: { status: 'ARCHIVED' },
      },
    })

    if (products.length !== uniqueIds.length) {
      throw httpError(400, 'One or more selected products are invalid, archived, or do not belong to you')
    }

    const hasBundle = products.some((p) => p.type === 'BUNDLE')
    if (hasBundle) {
      throw httpError(400, 'A bundle cannot contain another bundle')
    }

    const bookingProducts = products.filter((p) => p.type === 'COACHING')
    if (bookingProducts.length > 1) {
      throw httpError(400, '1 booking per bundle. Remove your booking to add another.')
    }

    const currencies = [...new Set(products.map((p) => (p.currency || 'USD').toUpperCase()))]
    if (currencies.length > 1) {
      throw httpError(400, `All products in a bundle must use the same currency. Found: ${currencies.join(', ')}`)
    }

    return {
      title,
      description,
      productIds: uniqueIds,
      products,
      currency: currencies[0] || 'USD',
      totalPrice: products.reduce((sum, p) => sum + Number(p.price || 0), 0),
    }
  },

  async create(creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'products')

    const validated = await this.validateBundleData(creatorId, data)

    const bundle = await bundlesRepo.createBundle(creatorId, {
      title: validated.title,
      description: validated.description,
      thumbnail: data.thumbnail || null,
      productIds: validated.productIds,
      displayMode: data.displayMode || 'classic',
      status: 'PUBLISHED',
      storePublished: data.storePublished !== false,
    })

    if (data.addToStore !== false && bundle?.id) {
      try {
        const sections = await storeSectionsRepo.getForCreator(creatorId)
        const hasSection = sections.some((s) => s.props?.productId === bundle.id)
        if (!hasSection) {
          await storeSectionsRepo.addSection(creatorId, {
            type: 'product',
            pageId: data.pageId || null,
            hidden: false,
            props: { productId: bundle.id, layout: bundle.displayMode || 'classic' },
          })
        }
      } catch (err) {
        console.warn('Could not auto-add bundle to store sections:', err)
      }
    }

    return bundle
  },

  async update(creatorId, id, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const existing = await bundlesRepo.getBundle(id, creatorId)
    if (!existing) throw httpError(404, 'Bundle not found')

    if (data.productIds !== undefined || data.title !== undefined) {
      await this.validateBundleData(creatorId, {
        title: data.title !== undefined ? data.title : existing.title,
        description: data.description !== undefined ? data.description : existing.description,
        productIds: data.productIds !== undefined ? data.productIds : existing.bundleProductIds,
      })
    }

    const updated = await bundlesRepo.updateBundle(creatorId, id, {
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      productIds: data.productIds,
      displayMode: data.displayMode,
      status: data.status,
      storePublished: data.storePublished,
    })

    return updated
  },

  async get(creatorId, id) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const bundle = await bundlesRepo.getBundle(id, creatorId)
    if (!bundle) throw httpError(404, 'Bundle not found')
    return bundle
  },

  async getPublic(id) {
    if (!id) throw httpError(400, 'Bundle ID required')
    const bundle = await bundlesRepo.getBundle(id)
    if (!bundle || bundle.status === 'ARCHIVED') {
      throw httpError(404, 'Bundle not found')
    }
    return {
      bundle,
      products: bundle.bundleProducts || [],
    }
  },

  async remove(creatorId, id) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    await bundlesRepo.deleteBundle(creatorId, id)
    try {
      const sections = await storeSectionsRepo.getForCreator(creatorId)
      for (const sec of sections) {
        if (sec.props?.productId === id) {
          await storeSectionsRepo.deleteSection(creatorId, sec.id)
        }
      }
    } catch (e) { }
    return { success: true }
  },
}


// ---------------- helpers ----------------

function pick(obj, keys) {
  const out = {}
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k] })
  return out
}
export function httpError(status, message, code) {
  const e = new Error(message)
  e.status = status
  if (code) e.code = code
  return e
}

// ------------------------------------------------------------------------------
// FORMS & RESPONSES SERVICE
const publicFormRateLimiter = new Map()
function checkPublicFormRateLimit(clientIp, maxSubmissions = 20, windowSeconds = 60) {
  if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost') return true
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const timestamps = (publicFormRateLimiter.get(clientIp) || []).filter(t => now - t < windowMs)
  if (timestamps.length >= maxSubmissions) {
    const err = httpError(429, 'Too many form submissions. Please wait a moment before trying again.')
    err.code = 'RATE_LIMIT_EXCEEDED'
    throw err
  }
  timestamps.push(now)
  publicFormRateLimiter.set(clientIp, timestamps)
  return true
}

export const formsService = {
  async listForms(creatorId, options = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.listForms(creatorId, options)
  },

  async getForm(id, creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const form = await formsRepo.getForm(id, creatorId)
    if (!form) throw httpError(404, 'Form not found')
    return form
  },

  async createForm(creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    if (!data.title || !data.title.trim()) {
      throw httpError(400, 'Form title is required')
    }
    const formType = (data.formType || 'contact').toLowerCase()
    if (!['contact', 'feedback', 'newsletter', 'qa'].includes(formType)) {
      throw httpError(400, 'Invalid form type')
    }

    if (data.notificationEmail && data.notificationEmail.trim()) {
      const email = data.notificationEmail.trim()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw httpError(400, 'Invalid notification email address')
      }
    }

    const created = await formsRepo.createForm(creatorId, data)

    // Optionally create or associate linked StoreSection if requested or if addToStore is true
    if (data.addToStore !== false && !data.sectionId) {
      try {
        await storeService.getOrCreate(creatorId)
        const currentSections = await storeSectionsRepo.getForCreator(creatorId)
        const newSection = {
          id: uuidv4(),
          type: 'form',
          hidden: data.status === 'DRAFT',
          pageId: null,
          position: currentSections.length,
          props: {
            formId: created.id,
            formType: created.formType,
            title: created.title,
            subtitle: created.description || '',
            buttonText: created.buttonText || '',
            successMessage: created.successMessage || '',
            notificationEmail: created.notificationEmail || '',
            settings: created.settings || {},
          },
        }
        await storeSectionsRepo.upsertSection(creatorId, newSection)
        await formsRepo.updateForm(created.id, creatorId, { sectionId: newSection.id })
        created.sectionId = newSection.id
      } catch (err) {
        console.warn('[formsService.createForm] could not add store section:', err)
      }
    }

    return created
  },

  async updateForm(id, creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    if (data.title !== undefined && !data.title.trim()) {
      throw httpError(400, 'Form title cannot be empty')
    }
    if (data.notificationEmail && data.notificationEmail.trim()) {
      const email = data.notificationEmail.trim()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw httpError(400, 'Invalid notification email address')
      }
    }

    const updated = await formsRepo.updateForm(id, creatorId, data)

    // Synchronize linked StoreSection props if exists
    try {
      const sections = await storeSectionsRepo.getForCreator(creatorId)
      const matchingSection = sections.find((s) => s.id === updated.sectionId || s.props?.formId === id)
      if (matchingSection) {
        const newProps = {
          ...(matchingSection.props || {}),
          formId: updated.id,
          formType: updated.formType,
          title: updated.title,
          subtitle: updated.description || '',
          buttonText: updated.buttonText || '',
          successMessage: updated.successMessage || '',
          notificationEmail: updated.notificationEmail || '',
          settings: updated.settings || {},
        }
        await storeSectionsRepo.updateSection(creatorId, matchingSection.id, {
          props: newProps,
          hidden: updated.status === 'DRAFT',
        })
      }
    } catch (err) {
      console.warn('[formsService.updateForm] sync store section warning:', err)
    }

    return updated
  },

  async deleteForm(id, creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const form = await formsRepo.getForm(id, creatorId)
    if (!form) throw httpError(404, 'Form not found')

    await formsRepo.deleteForm(id, creatorId)

    // Remove corresponding store section if present
    try {
      const sections = await storeSectionsRepo.getForCreator(creatorId)
      for (const s of sections) {
        if (s.id === form.sectionId || s.props?.formId === id) {
          await storeSectionsRepo.deleteSection(creatorId, s.id)
        }
      }
    } catch (err) { }

    return { success: true }
  },

  async listSubmissions(creatorId, options = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.listSubmissions(creatorId, options)
  },

  async getSubmission(id, creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const sub = await formsRepo.getSubmission(id, creatorId)
    if (!sub) throw httpError(404, 'Submission not found')
    return sub
  },

  async markSubmissionRead(id, creatorId, isRead = true) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.markSubmissionRead(id, creatorId, isRead)
  },

  async updateSubmission(id, creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.updateSubmission(id, creatorId, data)
  },

  async deleteSubmission(id, creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.deleteSubmission(id, creatorId)
  },

  async markAllRead(creatorId, body = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.markAllSubmissionsRead(creatorId, body?.formId || null)
  },

  async listSubscribers(creatorId, options = {}) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.listSubscribers(creatorId, options)
  },

  async updateSubscriber(id, creatorId, data) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const status = data.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUBSCRIBED'
    return formsRepo.updateSubscriberStatus(id, creatorId, status)
  },

  async getUnreadCount(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    const unreadCount = await formsRepo.getUnreadSubmissionsCount(creatorId)
    return { unreadCount }
  },

  async getStats(creatorId) {
    if (!creatorId) throw httpError(401, 'Unauthorized')
    return formsRepo.getFormsStats(creatorId)
  },

  // ===== PUBLIC SUBMISSION =====
  async submitPublicForm(payload, clientIp = '') {
    if (!payload || typeof payload !== 'object') {
      throw httpError(400, 'Invalid submission payload')
    }
    checkPublicFormRateLimit(clientIp)

    const {
      formId,
      sectionId,
      username,
      formType: rawFormType,
      name,
      email,
      message,
      rating,
      consent,
      answers = {},
    } = payload

    // 1. Resolve Target Form & Creator
    let targetForm = null
    let creatorId = null

    if (formId) {
      targetForm = await formsRepo.getForm(formId)
      if (targetForm) creatorId = targetForm.creatorId
    }

    if (!targetForm && sectionId) {
      // Find by store section
      const section = await prisma.storeSection.findUnique({
        where: { id: sectionId },
        include: { creator: true },
      })
      if (section) {
        creatorId = section.creatorId
        targetForm = await formsRepo.getFormBySection(sectionId, creatorId)
        if (!targetForm) {
          const sProps = section.props || {}
          targetForm = await formsRepo.createForm(creatorId, {
            sectionId,
            formType: sProps.formType || rawFormType || 'contact',
            title: sProps.title || 'Store Form',
            description: sProps.subtitle || '',
            buttonText: sProps.buttonText || '',
            successMessage: sProps.successMessage || '',
            notificationEmail: sProps.notificationEmail || '',
            settings: sProps.settings || {},
          })
        }
      }
    }

    if (!targetForm && username) {
      const store = await storesRepo.getByUsername(username)
      if (store) {
        creatorId = store.creatorId
        const forms = await formsRepo.listForms(creatorId)
        targetForm = forms.find((f) => f.formType === (rawFormType || 'contact')) || forms[0]
      }
    }

    if (!targetForm || !creatorId) {
      throw httpError(404, 'Form not found or no longer available')
    }

    // 2. Form Availability & Status Check
    if (targetForm.status === 'DRAFT' || targetForm.status === 'ARCHIVED') {
      throw httpError(400, 'This form is not currently accepting responses')
    }

    // Check store published status
    const store = await storesRepo.getByCreator(creatorId)
    if (!store || !store.published) {
      throw httpError(400, 'The store hosting this form is currently unpublished')
    }

    // 3. Form Type and Field Validations
    const formType = (targetForm.formType || rawFormType || 'contact').toLowerCase()
    const settings = targetForm.settings || {}

    const cleanName = name ? String(name).trim().slice(0, 200) : ''
    const cleanEmail = email ? String(email).trim().toLowerCase().slice(0, 254) : ''
    const cleanMessage = message ? String(message).trim().slice(0, 5000) : ''
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    // Contact Form Validation
    if (formType === 'contact') {
      if (!cleanEmail) throw httpError(400, 'Email address is required')
      if (!emailRegex.test(cleanEmail)) throw httpError(400, 'Please provide a valid email address')
      if (!cleanMessage) throw httpError(400, 'Message cannot be empty')
      if (settings.nameRequired !== false && !cleanName) {
        throw httpError(400, 'Name is required')
      }
    }

    // Feedback Form Validation
    else if (formType === 'feedback') {
      const numRating = parseInt(rating, 10)
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        throw httpError(400, 'Please select a valid rating from 1 to 5 stars')
      }
      if (settings.commentsRequired !== false && !cleanMessage) {
        throw httpError(400, 'Feedback comments are required')
      }
      if (cleanEmail && !emailRegex.test(cleanEmail)) {
        throw httpError(400, 'Please provide a valid email address')
      }
    }

    // Newsletter Signup Validation
    else if (formType === 'newsletter') {
      if (!cleanEmail) throw httpError(400, 'Email address is required to subscribe')
      if (!emailRegex.test(cleanEmail)) throw httpError(400, 'Please provide a valid email address')
      if (settings.requireConsent !== false && consent !== true && consent !== 'true') {
        throw httpError(400, 'Consent is required to subscribe to marketing updates')
      }
    }

    // Q&A / Ask Me Anything Validation
    else if (formType === 'qa') {
      if (!cleanMessage) throw httpError(400, 'Please enter your question')
      if (settings.allowAnonymous === false && !cleanName) {
        throw httpError(400, 'Name is required to submit a question')
      }
      if (cleanEmail && !emailRegex.test(cleanEmail)) {
        throw httpError(400, 'Please provide a valid email address')
      }
    }

    // 4. Persistence
    const submissionStatus = formType === 'qa' && settings.requireApproval !== false ? 'PENDING' : 'ACTIVE'

    const submission = await formsRepo.createSubmission({
      formId: targetForm.id,
      creatorId,
      formType,
      name: cleanName || null,
      email: cleanEmail || null,
      message: cleanMessage || null,
      rating: formType === 'feedback' ? parseInt(rating, 10) : null,
      status: submissionStatus,
      answers: {
        ...answers,
        ...(cleanName ? { name: cleanName } : {}),
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(cleanMessage ? { message: cleanMessage } : {}),
        ...(rating ? { rating: parseInt(rating, 10) } : {}),
        ...(consent !== undefined ? { consent: Boolean(consent) } : {}),
      },
      metadata: {
        clientIp: clientIp ? String(clientIp).slice(0, 45) : undefined,
        submittedAt: new Date().toISOString(),
      },
    })

    // If newsletter form, also upsert the newsletter subscriber record
    if (formType === 'newsletter' && cleanEmail) {
      await formsRepo.upsertSubscriber({
        creatorId,
        formId: targetForm.id,
        email: cleanEmail,
        name: cleanName || null,
        consentGiven: true,
        consentText: settings.consentText || 'Agreed to receive email updates and marketing communications.',
        source: 'storefront_form',
      })
    }

    // 5. Optional Email Notification to Creator
    if (targetForm.notificationEmail && targetForm.notificationEmail.trim()) {
      try {
        const notifRecipient = targetForm.notificationEmail.trim()
        const senderLabel = cleanName || cleanEmail || 'A store visitor'
        let contentSummary = ''
        if (formType === 'contact') contentSummary = `<p><strong>Message:</strong></p><blockquote>${cleanMessage}</blockquote>`
        else if (formType === 'feedback') contentSummary = `<p><strong>Rating:</strong> ${rating} / 5 stars</p><p><strong>Feedback:</strong> ${cleanMessage || '(No comment provided)'}</p>`
        else if (formType === 'newsletter') contentSummary = `<p>New subscriber joined your newsletter list: <strong>${cleanEmail}</strong></p>`
        else if (formType === 'qa') contentSummary = `<p><strong>Question:</strong></p><blockquote>${cleanMessage}</blockquote>`

        await emailService.sendEmail({
          to: notifRecipient,
          subject: `New submission: ${targetForm.title} from ${senderLabel}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1F1F1F;">
              <h2 style="margin-top: 0; color: #111;">New Response Received</h2>
              <p style="color: #666; font-size: 14px;">Someone submitted a response on your store's <strong>${targetForm.title}</strong>.</p>
              <div style="background: #F4F4F5; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>From:</strong> ${senderLabel} ${cleanEmail ? `(&lt;${cleanEmail}&gt;)` : ''}</p>
                ${contentSummary}
              </div>
              <p style="font-size: 12px; color: #888;">You can manage and view all responses in your CreatorStore dashboard under Forms & Responses.</p>
            </div>
          `,
        })
      } catch (emailErr) {
        console.warn('[formsService.submitPublicForm] Email notification note:', emailErr.message)
      }
    }

    const returnMsg = targetForm.successMessage || 'Thank you! Your response has been submitted successfully.'
    return {
      success: true,
      message: returnMsg,
      successMessage: returnMsg,
      submissionId: submission.id,
      submission,
    }
  },

  async unsubscribePublicNewsletter(payload) {
    if (!payload?.email) throw httpError(400, 'Email address is required')
    const email = String(payload.email).toLowerCase().trim()
    let creatorId = payload.creatorId

    if (!creatorId && payload.username) {
      const store = await storesRepo.getByUsername(payload.username)
      if (store) creatorId = store.creatorId
    }

    if (!creatorId) {
      throw httpError(404, 'Creator not found')
    }

    const success = await formsRepo.unsubscribeNewsletter(creatorId, email)
    return { success, message: 'You have been successfully unsubscribed from this creator newsletter.' }
  },
}

export {
  entitlementService,
  getEffectiveSubscription,
  getPlanEntitlements,
  requireEntitlement,
  mapProviderPlanToInternalPlan,
} from './entitlement-service.js'



