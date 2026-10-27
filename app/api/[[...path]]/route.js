import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { Readable } from 'stream'
import { supabaseAdmin, ensureBucket, resolveDigitalProductStoragePath } from '@/lib/supabase'
import { SESSION_COOKIE } from '@/lib/auth'
import { dodoProvider } from '@/lib/dodo'
import { productsRepo, ordersRepo, customersRepo, lessonsRepo, coursesRepo, entitlementsRepo, webhookEventsRepo, automationEventsRepo, profilesRepo, storesRepo, creatorSubscriptionsRepo, usersRepo, subscriptionInvoicesRepo, autoDmQueueRepo, autoDmRateLimitsRepo, instagramRepo } from '@/lib/repos'
import { isValidCountryCode, normalizeCountryCode } from '@/lib/countries'
import { auditCustomerSubscriptions } from '@/lib/subscription-reconciliation'
import { razorpaySubscriptionLifecycleService } from '@/lib/razorpay-subscription-lifecycle'
import {
  authService, meService, storeService, storeSectionsService, productService, publicService,

  checkoutService, webhookService, downloadService, guestAccessService, analyticsService, attributionService,
  razorpayAccountService, payoutService, earningsService, courseService, publicCourseService, learningService, certificateService, coachingService, communityService, webinarService, membershipService, customService, externalLink, customerAccountService, creatorSubscriptionService, accountUpgradeService, checkoutFieldsService,
  leadService, couponService, marketingService, emailMarketingService, onboardingService, successCenterService,
  instagramService, automationService, instagramMessagingService, httpError,
  emailService, businessCardService, supportService, bundlesService, formsService,
} from '@/lib/services'
import { exportService } from '@/lib/export-service'
import { notificationService } from '@/lib/notificationService'
import { purchaseOtpService, PURCHASE_SESSION_COOKIE } from '@/lib/purchaseOtpService'
import { getAppUrl } from '@/config/site'
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  normalizeCurrency,
  getCurrencyConfig,
  getExchangeRate,
  convertCurrency,
  validateMinimumAmount,
  previewDodoPrice,
} from '@/lib/currencies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // Phase 5 builder updated

import { applyCors, isOriginAllowed, getAllowedOrigins } from '@/lib/cors'
import { validateCronSecret } from '@/lib/cron'
export { applyCors, isOriginAllowed, getAllowedOrigins, validateCronSecret }

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

function errorResponse(e) {
  const status = e?.status || 500
  const message = e?.message || 'Something went wrong. Please try again.'
  const code = e?.code || (status === 403 ? 'FORBIDDEN' : (status === 401 ? 'UNAUTHORIZED' : (status === 404 ? 'NOT_FOUND' : 'ERROR')))
  if (status >= 500) {
    console.error('API error:', e)
  }
  return json({
    success: false,
    error: message,
    message,
    code,
    currentCount: e?.currentCount,
    limit: e?.limit,
    plan: e?.plan,
    details: process.env.NODE_ENV === 'development' ? (e?.stack || e?.message || JSON.stringify(e)) : undefined,
  }, status)
}

export async function OPTIONS(request) {
  const res = new NextResponse(null, { status: 204 })
  return applyCors(res, request)
}

function setSession(res, token) {
  const isSecure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
async function requireAuth(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const user = token ? await authService.userFromToken(token) : null
  if (!user) throw httpError(401, 'Please sign in to continue')
  if (user.emailVerified === false) {
    throw httpError(403, 'Please verify your email address before accessing this resource', 'EMAIL_NOT_VERIFIED')
  }
  return user
}
function requireCreator(user) {
  if (!user || user.role !== 'CREATOR') {
    throw httpError(403, 'Creator access required')
  }
  return user
}

async function processRoute(request, context = {}) {
  const url = new URL(request.url)
  const route = (url.pathname.replace(/^\/api/, '') || '/').toLowerCase()
  const normalizedRoute = route.endsWith('/') && route.length > 1 ? route.slice(0, -1) : route
  const rawPath = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean)
  const path = rawPath.map(p => decodeURIComponent(p))
  const method = request.method

  // ===== DODO PAYMENTS WEBHOOK (raw body, verifies Dodo signature via standardwebhooks) =====
  if ((normalizedRoute === '/webhooks/dodo' || normalizedRoute === '/payments/dodo/webhook') && method === 'POST') {
    const rawBody = await request.text()
    const headers = Object.fromEntries(request.headers.entries())
    let verifiedEvent
    try {
      verifiedEvent = dodoProvider.verifyWebhook({ rawBody, headers })
    } catch (e) {
      console.error('[Dodo Webhook] Signature verification failed:', e.message)
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
    }
    try {
      await webhookService.handle(verifiedEvent)
      return NextResponse.json({ received: true })
    } catch (e) {
      console.error('[Dodo Webhook] Processing error:', e.message)
      return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
    }
  }

  // ===== RAZORPAY SUBSCRIPTION WEBHOOK (India) =====
  if ((normalizedRoute === '/webhooks/razorpay' || normalizedRoute === '/payments/webhook') && method === 'POST') {
    const rawBody = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing Razorpay webhook signature' }, { status: 400 })
    }

    const isValid = webhookService.verifySignature(rawBody, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid Razorpay webhook signature' }, { status: 400 })
    }

    try {
      const event = JSON.parse(rawBody)
      const res = await webhookService.handle(event)
      return NextResponse.json({ status: 'ok', ...res })
    } catch (err) {
      console.error('[Razorpay Webhook] Processing error:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // Legacy PayPal decommissioned
  if ((normalizedRoute === '/webhooks/paypal' || normalizedRoute === '/payments/paypal/webhook') && method === 'POST') {
    return NextResponse.json({ message: 'PayPal webhook decommissioned.' }, { status: 410 })
  }

  // ===== META INSTAGRAM WEBHOOK (raw body / challenge verification) =====
  if (normalizedRoute === '/integrations/instagram/webhook') {
    if (method === 'GET') {
      const mode = (url.searchParams.get('hub.mode') || '').trim()
      const token = (url.searchParams.get('hub.verify_token') || '').trim()
      const challenge = url.searchParams.get('hub.challenge')
      const verifyToken = (
        process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
        process.env.META_WEBHOOK_VERIFY_TOKEN ||
        process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
        ''
      ).trim()

      if (!mode || !token || challenge === null || challenge === undefined) {
        return new NextResponse('Missing required parameters', { status: 400 })
      }

      if (!verifyToken) {
        console.error('[Meta Webhook] META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN environment variable is not configured.')
        return new NextResponse('Verify token not configured', { status: 500 })
      }

      let tokenMatches = false
      if (token && verifyToken && token.length === verifyToken.length) {
        const crypto = require('crypto')
        try {
          tokenMatches = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(verifyToken))
        } catch (e) {
          tokenMatches = (token === verifyToken)
        }
      } else {
        tokenMatches = (token === verifyToken)
      }

      if (mode === 'subscribe' && tokenMatches) {
        return new NextResponse(challenge, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      }

      return new NextResponse('Forbidden', { status: 403 })
    }

    if (method === 'POST') {
      try {
        const rawBody = await request.text()
        const crypto = require('crypto')
        const signature = request.headers.get('x-hub-signature-256')
        const appSecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET

        if (appSecret && signature) {
          const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
          if (signature !== expectedSig) {
            return new NextResponse('Invalid signature', { status: 401 })
          }
        }

        const payload = JSON.parse(rawBody)
        const eventId = request.headers.get('x-meta-event-id') || crypto.createHash('md5').update(rawBody).digest('hex')

        const alreadyProcessed = await webhookEventsRepo.isProcessed(eventId)
        if (alreadyProcessed) {
          return NextResponse.json({ received: true, deduplicated: true })
        }

        await webhookEventsRepo.recordEvent(eventId, 'META_INSTAGRAM', payload)
        const result = await instagramMessagingService.processWebhookEvent(payload)

        return NextResponse.json({ received: true, ...result })
      } catch (err) {
        console.error('Meta webhook handling error:', err)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
      }
    }
  }

  try {
    // ===== Health =====
    if ((route === '/' || route === '/root') && method === 'GET') return json({ message: 'CreatorZero API', ok: true })
    if (path[0] === 'health' && path[1] === 'db' && method === 'GET') {
      let prismaOk = false
      let supabaseOk = false
      try {
        const { data, error } = await supabaseAdmin.from('users').select('id').limit(1)
        if (!error) supabaseOk = true
      } catch (err) { }
      return json({ status: 'ok', database: 'postgresql', provider: 'supabase', checks: { supabase: supabaseOk ? 'connected' : 'offline_fallback' } })
    }

    // ===== File Upload & Serving =====
    if ((route === '/upload' || path[0] === 'upload') && method === 'POST') {
      const user = await requireAuth(request).catch(() => null)
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400)

      const mime = file.type || 'image/jpeg'
      const isVideo = mime.startsWith('video/')
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
      const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']
      if (!validImageTypes.includes(mime) && !validVideoTypes.includes(mime) && mime !== 'application/pdf') {
        return json({ error: 'Please upload a supported image (JPG, PNG, WebP) or video (MP4, WebM).' }, 400)
      }

      const arrayBuffer = await file.arrayBuffer()
      const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
      if (arrayBuffer.byteLength > maxBytes) {
        return json({ error: `File size must be less than ${isVideo ? '50MB' : '10MB'}.` }, 400)
      }

      const buffer = Buffer.from(arrayBuffer)
      const sanitizedName = (file.name || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '')
      const userId = user ? user.id : 'pub'
      const fileKey = `${userId}/media/${Date.now()}_${sanitizedName}`

      let bucketName = 'creator-assets'
      let uploadRes = await supabaseAdmin.storage.from(bucketName).upload(fileKey, buffer, { contentType: mime, upsert: true })
      if (uploadRes.error) {
        bucketName = 'public-assets'
        uploadRes = await supabaseAdmin.storage.from(bucketName).upload(fileKey, buffer, { contentType: mime, upsert: true })
      }

      if (uploadRes.error) {
        return json({ error: `Upload failed: ${uploadRes.error.message}` }, 500)
      }

      const { data: pubUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileKey)
      const publicUrl = pubUrlData?.publicUrl || `/api/files/${encodeURIComponent(fileKey)}`

      return json({ success: true, url: publicUrl, fileId: fileKey, path: fileKey, bucket: bucketName, fileName: file.name, fileSize: arrayBuffer.byteLength, mimeType: mime })
    }

    if (path[0] === 'files' && method === 'GET') {
      try {
        const rawKey = path.slice(1).join('/')
        const key = decodeURIComponent(rawKey)
        if (!key) return json({ error: 'File path missing' }, 400)

        let { data: fileBuffer, error } = await supabaseAdmin.storage.from('creator-assets').download(key)
        if (error || !fileBuffer) {
          const res = await supabaseAdmin.storage.from('public-assets').download(key)
          fileBuffer = res.data
          error = res.error
        }

        if (error || !fileBuffer) return json({ error: 'File not found' }, 404)

        const ext = key.split('.').pop()?.toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'avif' ? 'image/avif' : ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg'
        const headers = {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
        }
        return new NextResponse(fileBuffer, { status: 200, headers })
      } catch (err) {
        return json({ error: 'File not found' }, 404)
      }
    }

    // ===== Auth =====
    if (route === '/auth/signup' && method === 'POST') {
      const body = await request.json()
      const result = await authService.signup(body)
      return json(result, 201)
    }
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { token, user } = await authService.login(body)
      return setSession(json({ user }), token)
    }
    if (route === '/auth/logout' && method === 'POST') {
      const res = json({ ok: true })
      const isProd = process.env.NODE_ENV === 'production'
      res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 0, expires: new Date(0) })
      return res
    }
    if (route === '/auth/forgot-password' && method === 'POST') {
      const body = await request.json()
      return json(await authService.forgotPassword(body))
    }
    if (route === '/auth/reset-password' && method === 'POST') {
      const body = await request.json()
      return json(await authService.resetPassword(body))
    }
    if (route === '/auth/resend-verification' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await authService.resendVerification(body))
    }
    if (route === '/auth/verify-email' && (method === 'POST' || method === 'GET')) {
      const body = method === 'POST'
        ? await request.json().catch(() => ({}))
        : { email: url.searchParams.get('email'), otp: url.searchParams.get('otp') || url.searchParams.get('token') }
      const result = await authService.verifyEmail(body)
      if (result.token && !result.alreadyVerified) {
        return setSession(json(result), result.token)
      }
      return json(result)
    }

    if ((route === '/cron/cleanup-otps' || (path[0] === 'cron' && path[1] === 'cleanup-otps')) && (method === 'GET' || method === 'POST')) {
      if (!validateCronSecret(request)) {
        return json({ ok: false, error: 'Unauthorized' }, 401)
      }
      const res = await otpVerificationsRepo.cleanupExpired()
      return json({ ok: true, deleted: res?.count || 0, timestamp: new Date().toISOString() })
    }

    // ===== Public / Optional Auth =====
    if ((normalizedRoute === '/store/username/check' || (path[0] === 'store' && path[1] === 'username' && path[2] === 'check')) && method === 'GET') {
      const u = url.searchParams.get('u') || url.searchParams.get('username')
      if (!u) return json({ available: false, isCurrent: false, error: 'Username required' }, 400)
      const token = request.cookies.get(SESSION_COOKIE)?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      const user = token ? await authService.userFromToken(token).catch(() => null) : null
      const creatorId = user?.id || null
      return json(await storeService.checkUsername(creatorId, u))
    }
    if (path[0] === 'store' && path[1] === 'policies' && method === 'GET') {
      const username = url.searchParams.get('username')
      if (!username) return json({ error: 'Username is required' }, 400)
      return json(await storeService.getPublicPolicies(username))
    }
    if (path[0] === 'store' && path[1] === 'public' && method === 'GET') {
      const username = url.searchParams.get('username')
      if (!username) return json({ error: 'Username is required' }, 400)
      const pageSlug = url.searchParams.get('page') || null
      const result = await publicService.resolveStorefront(username, { pageSlug })
      if (result.status === 'error') return json({ error: 'Store lookup failed' }, 500)
      if (result.status === 'unpublished') return json({ error: 'This storefront isn’t live yet.', status: 'unpublished' }, 403)
      if (result.status !== 'ok') return json({ error: 'Store not found' }, 404)
      return json(result.data)
    }
    if (route.startsWith('/public/store/') && method === 'GET') {
      const rest = path.slice(2)
      if (rest.length === 1) {
        const pageSlug = url.searchParams.get('page') || null
        const result = await publicService.resolveStorefront(rest[0], { pageSlug })
        if (result.status === 'error') return json({ error: 'Store lookup failed' }, 500)
        if (result.status === 'unpublished') return json({ error: 'This storefront isn’t live yet.', status: 'unpublished' }, 403)
        if (result.status !== 'ok') return json({ error: 'Store not found' }, 404)
        return json(result.data)
      }
    }

    if (route.startsWith('/public/product/') && method === 'GET') {
      const rest = path.slice(2)
      if (rest.length === 2) {
        const data = await publicService.getProduct(rest[0], rest[1])
        if (!data) return json({ error: 'Product not found' }, 404)
        return json(data)
      }
    }
    if (route.startsWith('/public/course/') && method === 'GET') {
      const rest = path.slice(2)
      if (rest.length === 2) {
        const data = await publicCourseService.getCourseBySlug(rest[0], rest[1])
        if (!data) return json({ error: 'Course not found' }, 404)
        return json(data)
      }
    }
    if (path[0] === 'certificates' && path[1] && method === 'GET') {
      return json(await certificateService.getCertificate(path[1]))
    }
    if (route === '/public/stats' && method === 'GET') {
      const stats = await publicService.getPublicStats()
      return json(stats)
    }
    if (route === '/checkout/product' && method === 'GET') {
      const data = await publicService.getCheckoutProduct(url.searchParams.get('productId'))
      if (!data) return json({ error: 'Product not available' }, 404)
      return json(data)
    }
    if (route === '/track' && method === 'POST') {
      const body = await request.json()
      const allowed = ['store_view', 'product_view']
      if (allowed.includes(body.type) && body.creatorId) {
        const meta = body.metadata && typeof body.metadata === 'object' ? { ...body.metadata } : {}
        if (body.referrer && !meta.referrer) meta.referrer = String(body.referrer).slice(0, 500)
        if (body.source && !meta.source) meta.source = String(body.source).slice(0, 100)
        await analyticsService.track({
          creatorId: body.creatorId,
          productId: body.productId || null,
          type: body.type,
          sessionId: body.sessionId || null,
          metadata: meta,
        })
      }
      return json({ ok: true })
    }
    if (path[0] === 'bundles' && path[1] && path[2] === 'public' && method === 'GET') {
      return json(await bundlesService.getPublic(path[1]))
    }
    // ===== Coaching Public & Student Routes =====
    if (path[0] === 'coaching' && path[1] === 'public' && path[2] && method === 'GET') {
      const config = await coachingService.getConfig(null, path[2])
      return json({ config })
    }
    if (path[0] === 'coaching' && path[1] === 'slots' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const date = url.searchParams.get('date')
      const duration = url.searchParams.get('duration') || url.searchParams.get('durationMinutes')
      const bookingTypeId = url.searchParams.get('bookingTypeId')
      const timezone = url.searchParams.get('timezone')
      return json(await coachingService.getAvailableSlots({
        productId,
        date,
        timezone,
        durationMinutes: duration ? parseInt(duration, 10) : undefined,
        bookingTypeId,
      }))
    }
    if (path[0] === 'coaching' && path[1] === 'month-availability' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const year = url.searchParams.get('year')
      const month = url.searchParams.get('month')
      const duration = url.searchParams.get('duration') || url.searchParams.get('durationMinutes')
      const bookingTypeId = url.searchParams.get('bookingTypeId')
      const timezone = url.searchParams.get('timezone')
      return json(await coachingService.getAvailableMonthDates({
        productId,
        year,
        month,
        durationMinutes: duration ? parseInt(duration, 10) : undefined,
        bookingTypeId,
        timezone,
      }))
    }
    if (path[0] === 'coaching' && path[1] === 'book' && method === 'POST') {
      const body = await request.json()
      const booking = await coachingService.createBookingHold(body)
      return json({ booking })
    }
    if (path[0] === 'coaching' && path[1] === 'student' && path[2] === 'bookings' && method === 'GET') {
      const email = url.searchParams.get('email')
      if (!email) return json({ bookings: [] })
      return json({ bookings: await coachingService.listStudentBookings(email) })
    }
    if (path[0] === 'coaching' && path[1] === 'bookings' && path[2] && !path[3] && method === 'GET') {
      const email = url.searchParams.get('email')
      return json({ booking: await coachingService.getBooking(path[2], email, null) })
    }
    if (path[0] === 'coaching' && path[1] === 'bookings' && path[2] && path[3] === 'reschedule' && method === 'POST') {
      const body = await request.json()
      const user = await requireAuth(request).catch(() => null)
      return json({
        booking: await coachingService.rescheduleBooking({
          bookingId: path[2],
          customerEmail: body.customerEmail || body.email,
          creatorId: user?.id,
          newStartTime: body.newStartTime,
          newEndTime: body.newEndTime,
        })
      })
    }
    if (path[0] === 'coaching' && path[1] === 'bookings' && path[2] && path[3] === 'cancel' && method === 'POST') {
      const body = await request.json()
      const user = await requireAuth(request).catch(() => null)
      return json({
        booking: await coachingService.cancelBooking({
          bookingId: path[2],
          customerEmail: body.customerEmail || body.email,
          creatorId: user?.id,
          reason: body.reason,
        })
      })
    }


    // Community (Public & Student)
    if (path[0] === 'community' && path[1] !== 'config' && path[1] !== 'creator') {
      if (path[1] === 'public' && path[2] && method === 'GET') {
        return json(await communityService.getPublicDetails(path[2]))
      }

      const user = await requireAuth(request).catch(() => null)
      const email = url.searchParams.get('email') || user?.email

      if (path[1] && path[2] === 'feed' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '30', 10)
        const skip = parseInt(url.searchParams.get('skip') || '0', 10)
        return json(await communityService.listPosts(path[1], email, user?.id, { limit, skip }))
      }
      if (path[1] && path[2] === 'posts' && !path[3] && method === 'POST') {
        const body = await request.json()
        return json({ post: await communityService.createPost(path[1], email, user, body) })
      }

      if (path[1] && path[2] === 'resources' && method === 'GET') {
        return json({ resources: await communityService.listResources(path[1], email, user?.id) })
      }
      if (path[1] && path[2] === 'resources' && method === 'POST') {
        const body = await request.json()
        return json({ resource: await communityService.createResource(path[1], email, user?.id, body) }, 201)
      }
      if (path[1] && path[2] === 'resources' && path[3] && method === 'DELETE') {
        return json(await communityService.deleteResource(path[1], path[3], email, user?.id))
      }
      if (path[1] && path[2] === 'posts' && path[3] && path[4] === 'pin' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json({ post: await communityService.pinPost(path[1], path[3], email, user?.id, body.isPinned !== false) })
      }
      if (path[1] && path[2] === 'posts' && path[3] && path[4] === 'hide' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json({ post: await communityService.hidePost(path[1], path[3], email, user?.id, body.isHidden !== false) })
      }

      if (path[1] === 'posts' && path[2] && method === 'DELETE') {
        return json({ success: await communityService.deletePost(path[2], email, user?.id) })
      }
      if (path[1] === 'posts' && path[2] && path[3] === 'comments' && method === 'GET') {
        return json({ comments: await communityService.listComments(path[2], email, user?.id) })
      }
      if (path[1] === 'posts' && path[2] && path[3] === 'comments' && method === 'POST') {
        const body = await request.json()
        return json({ comment: await communityService.createComment(path[2], email, user, body.content) })
      }
      if (path[1] === 'comments' && path[2] && method === 'DELETE') {
        return json({ success: await communityService.deleteComment(path[2], email, user?.id) })
      }
      if (path[1] === 'posts' && path[2] && path[3] === 'react' && method === 'POST') {
        return json(await communityService.toggleReaction(path[2], email))
      }
      if (path[1] && path[2] === 'members' && method === 'GET') {
        const search = url.searchParams.get('search') || ''
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)
        const skip = parseInt(url.searchParams.get('skip') || '0', 10)
        return json(await communityService.listMembers(path[1], email, user?.id, { search, limit, skip }))
      }
    }

    // Webinar (Public & Student)
    if (path[0] === 'webinar' && path[1] !== 'config' && path[1] !== 'creator') {
      if (path[1] === 'public' && path[2] && method === 'GET') {
        return json(await webinarService.getPublicDetails(path[2]))
      }
      if (path[1] === 'register-free' && method === 'POST') {
        const body = await request.json()
        return json({ registration: await webinarService.registerFree(body.productId, { name: body.name, email: body.email }, body.answers) })
      }
      if (path[1] === 'student' && path[2] === 'registrations' && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ items: await webinarService.listCustomerWebinars(email) })
      }
      if (path[1] === 'registrations' && path[2] && path[3] === 'access' && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        return json(await webinarService.verifyAccess(path[2], email, user?.id))
      }
      if (path[1] === 'registrations' && path[2] && path[3] === 'cancel' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ registration: await webinarService.cancelRegistration(email, path[2]) })
      }
    }

    // ===== Instagram OAuth & Account =====
    if (route === '/integrations/instagram/oauth' && method === 'GET') {
      const user = await requireAuth(request)
      requireCreator(user)
      const returnUrl = url.searchParams.get('returnUrl')
      const oauthUrl = instagramService.getOAuthUrl(user.id, returnUrl)
      return json({ url: oauthUrl })
    }

    if (route === '/integrations/instagram/callback' && method === 'GET') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      const appUrl = getAppUrl()

      if (!code || !state) {
        return NextResponse.redirect(`${appUrl}/dashboard/settings/connected-accounts?error=missing_code_or_state`)
      }

      try {
        const result = await instagramService.handleCallback(code, state)
        let target = result?.returnUrl || '/dashboard/settings/connected-accounts'
        if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
          target = '/dashboard/settings/connected-accounts'
        }
        let redirectTarget = target
        if (result.status === 'SUBSCRIPTION_FAILED') {
          const sep = redirectTarget.includes('?') ? '&' : '?'
          redirectTarget = `${redirectTarget}${sep}warning=webhook_subscription_failed&message=${encodeURIComponent(result.subscriptionError || 'Webhook subscription pending')}`
        } else {
          const sep = redirectTarget.includes('?') ? '&' : '?'
          redirectTarget = `${redirectTarget}${sep}connected=1`
        }
        const safeTarget = redirectTarget
        return NextResponse.redirect(`${appUrl}${safeTarget}`)
      } catch (err) {
        console.error('Instagram callback error:', err)
        return NextResponse.redirect(`${appUrl}/dashboard/settings/connected-accounts?error=${encodeURIComponent(err.message || 'connection_failed')}`)
      }
    }

    if ((route === '/integrations/instagram/status' || route === '/integrations/instagram/account') && method === 'GET') {
      const user = await requireAuth(request)
      requireCreator(user)
      return json(await instagramService.getStatus(user.id))
    }

    if (route === '/integrations/instagram/subscribe' && method === 'POST') {
      const user = await requireAuth(request)
      requireCreator(user)
      return json(await instagramService.retrySubscription(user.id))
    }

    if (route === '/integrations/instagram/account' && method === 'DELETE') {
      const user = await requireAuth(request)
      requireCreator(user)
      return json(await instagramService.disconnectAccount(user.id))
    }

    if (route === '/integrations/instagram/profile' && method === 'GET') {
      const user = await requireAuth(request)
      requireCreator(user)
      const forceRefresh = url.searchParams.get('refresh') === '1'
      return json(await instagramService.getProfile(user.id, { forceRefresh }))
    }

    if ((route === '/integrations/instagram/sync' || route === '/integrations/instagram/profile/refresh') && method === 'POST') {
      const user = await requireAuth(request)
      requireCreator(user)
      const profile = await instagramService.getProfile(user.id, { forceRefresh: true })
      const media = await instagramService.getMedia(user.id, { forceRefresh: true })
      return json({ success: true, profile, media })
    }

    if (route === '/integrations/instagram/media' && method === 'GET') {
      const user = await requireAuth(request)
      requireCreator(user)
      const forceRefresh = url.searchParams.get('refresh') === '1'
      return json(await instagramService.getMedia(user.id, { forceRefresh }))
    }

    // ===== Automations =====
    if (path[0] === 'automations') {
      const user = await requireAuth(request)
      requireCreator(user)

      // GET /api/automations
      if (path.length === 1 && method === 'GET') {
        return json(await automationService.listAutomations(user.id))
      }
      // POST /api/automations
      if (path.length === 1 && method === 'POST') {
        const body = await request.json()
        return json(await automationService.createAutomation(user.id, body), 201)
      }
      // GET /api/automations/[id]
      if (path.length === 2 && method === 'GET') {
        return json(await automationService.getAutomation(path[1], user.id))
      }
      // PATCH /api/automations/[id]
      if (path.length === 2 && method === 'PATCH') {
        const body = await request.json()
        if (body.statusOnly) {
          return json(await automationService.toggleStatus(path[1], user.id, body.status))
        }
        return json(await automationService.updateAutomation(path[1], user.id, body))
      }
      // GET /api/automations/[id]/events
      if (path.length === 3 && path[2] === 'events' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        return json(await automationService.getAutomationEvents(path[1], user.id, { limit, offset }))
      }
      // GET /api/automations/queue
      if (path.length === 2 && path[1] === 'queue' && method === 'GET') {
        const status = url.searchParams.get('status') || null
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        const [jobsResult, stats] = await Promise.all([
          autoDmQueueRepo.listJobsForCreator(user.id, { status, limit, offset }),
          autoDmQueueRepo.getStatsForCreator(user.id),
        ])
        const igAcc = await instagramRepo.getByCreatorId(user.id)
        let rateLimitStatus = null
        if (igAcc?.id) {
          rateLimitStatus = await autoDmRateLimitsRepo.getStatus(igAcc.id, user.id)
        }
        return json({
          ...jobsResult,
          stats,
          rateLimitStatus,
        })
      }

      // POST /api/automations/queue/[id]/retry
      if (path.length === 4 && path[1] === 'queue' && path[3] === 'retry' && method === 'POST') {
        const result = await autoDmQueueRepo.retryJob(path[2], user.id)
        if (!result.success) return json({ error: result.reason }, 400)
        return json(result)
      }

      // POST /api/automations/queue/[id]/cancel
      if (path.length === 4 && path[1] === 'queue' && path[3] === 'cancel' && method === 'POST') {
        const result = await autoDmQueueRepo.cancelJob(path[2], user.id)
        if (!result.success) return json({ error: result.reason }, 400)
        return json(result)
      }

      // POST /api/automations/queue/account/pause
      if (path.length === 4 && path[1] === 'queue' && path[2] === 'account' && path[3] === 'pause' && method === 'POST') {
        const igAcc = await instagramRepo.getByCreatorId(user.id)
        if (!igAcc?.id) return json({ error: 'No connected Instagram account found' }, 400)
        const body = await request.json().catch(() => ({}))
        const pauseMinutes = Number(body.pauseMinutes) || 30
        const updated = await autoDmRateLimitsRepo.pauseAccount(igAcc.id, {
          pauseMinutes,
          reason: body.reason || 'Manually paused by creator from dashboard',
        })
        return json({ success: true, rateLimit: updated })
      }

      // POST /api/automations/queue/account/resume
      if (path.length === 4 && path[1] === 'queue' && path[2] === 'account' && path[3] === 'resume' && method === 'POST') {
        const igAcc = await instagramRepo.getByCreatorId(user.id)
        if (!igAcc?.id) return json({ error: 'No connected Instagram account found' }, 400)
        const result = await autoDmRateLimitsRepo.resumeAccount(igAcc.id, user.id)
        if (!result.success) return json({ error: result.reason }, 400)
        return json({ success: true, rateLimit: result.record })
      }

      // DELETE /api/automations/[id]
      if (path.length === 2 && method === 'DELETE') {
        return json(await automationService.deleteAutomation(path[1], user.id))
      }
    }

    // Memberships (Public / Student)
    if (path[0] === 'membership') {
      if (path[1] === 'public' && path[2] && method === 'GET') {
        return json(await membershipService.getPublicDetails(path[2]))
      }
      if (path[1] === 'subscribe-free' && method === 'POST') {
        const body = await request.json()
        const subscription = await membershipService.subscribeFree(body.productId, { name: body.name, email: body.email })
        return json({ subscription })
      }
      if (path[1] === 'student' && path[2] === 'subscriptions' && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ items: [] })
        return json({ items: await membershipService.listSubscriptionsForCustomer(email) })
      }
      if (path[1] === 'subscriptions' && path[2] && path[3] === 'cancel' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ subscription: await membershipService.cancelSubscription(path[2], email) })
      }
      if (path[1] === 'subscriptions' && path[2] && path[3] === 'resume' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ subscription: await membershipService.resumeSubscription(path[2], email) })
      }
    }

    // Custom Service (Public & Student)
    if (path[0] === 'custom-service') {
      if (path[1] === 'public' && path[2] && method === 'GET') {
        return json(await customService.getPublicDetails(path[2]))
      }
      if (path[1] === 'submit-free' && method === 'POST') {
        const body = await request.json()
        const req = await customService.submitFreeRequest(body.productId, { name: body.name, email: body.email }, body.answers)
        return json({ request: req })
      }
      if (path[1] === 'student' && path[2] === 'requests' && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ items: await customService.listRequestsForCustomer(email) })
      }
      if (path[1] === 'requests' && path[2] && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        return json(await customService.verifyAccess(path[2], email))
      }
      if (path[1] === 'requests' && path[2] && path[3] === 'clarification-response' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        const body = await request.json()
        return json({ request: await customService.respondClarification(email, path[2], body.message, body.files) })
      }
      if (path[1] === 'requests' && path[2] && path[3] === 'revision' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        const body = await request.json()
        return json({ request: await customService.requestRevision(email, path[2], body.message) })
      }
      if (path[1] === 'requests' && path[2] && path[3] === 'accept' && method === 'POST') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ request: await customService.acceptDelivery(email, path[2]) })
      }
    }

    // External Link (Public & Student)
    if (path[0] === 'external-link') {
      if (path[1] === 'public' && path[2] && method === 'GET') {
        return json(await externalLink.getPublicDetails(path[2]))
      }
      if (path[1] === 'access' && path[2] && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        return json(await externalLink.getAuthorizedAccess(path[2], email, user?.id))
      }
      if (path[1] === 'access-free' && method === 'POST') {
        const body = await request.json()
        return json(await externalLink.submitFreeAccess(body.productId, { name: body.name, email: body.email }))
      }
      if (path[1] === 'student' && path[2] === 'purchases' && method === 'GET') {
        const user = await requireAuth(request).catch(() => null)
        const email = url.searchParams.get('email') || user?.email
        if (!email) return json({ error: 'Email required' }, 400)
        return json({ items: await externalLink.listPurchasesForCustomer(email) })
      }
    }

    if ((route === '/checkout/supported-currencies' || (path[0] === 'checkout' && path[1] === 'supported-currencies')) && method === 'GET') {
      return json({
        currencies: Object.values(SUPPORTED_CURRENCIES),
      })
    }

    if ((route === '/checkout/preview-currency' || (path[0] === 'checkout' && path[1] === 'preview-currency')) && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const targetCurrency = url.searchParams.get('currency') || 'USD'
      const country = url.searchParams.get('country') || undefined

      if (!productId) return json({ error: 'productId is required' }, 400)
      const product = await productsRepo.getById(productId)
      if (!product) return json({ error: 'Product not found' }, 404)

      const originalPrice = Number(product.price || 0)
      const originalCurrency = (product.currency || 'USD').toUpperCase()
      const normalizedTarget = normalizeCurrency(targetCurrency, originalCurrency)

      const conversion = await convertCurrency({
        amount: originalPrice,
        fromCurrency: originalCurrency,
        toCurrency: normalizedTarget,
      })

      const targetConfig = getCurrencyConfig(normalizedTarget)
      const minCheck = validateMinimumAmount(conversion.convertedAmount, normalizedTarget)

      // Optional authoritative preview from Dodo
      let dodoPreview = null
      try {
        let dodoProductId = null
        if (product.id) {
          dodoProductId = await dodoProvider.ensureProduct({
            productId: product.id,
            title: product.title,
            amount: originalPrice,
            currency: originalCurrency,
          }).catch(() => null)
        }
        if (dodoProductId) {
          dodoPreview = await previewDodoPrice({
            dodoProductId,
            billingCurrency: normalizedTarget,
            billingCountry: country,
          })
        }
      } catch (e) {}

      return json({
        productId: product.id,
        originalPrice,
        originalCurrency,
        targetCurrency: normalizedTarget,
        convertedAmount: dodoPreview?.total ?? conversion.convertedAmount,
        subtotal: dodoPreview?.subtotal ?? conversion.convertedAmount,
        tax: dodoPreview?.tax ?? 0,
        rate: conversion.rate,
        rateTimestamp: conversion.rateTimestamp,
        symbol: targetConfig.symbol,
        isEstimated: !dodoPreview?.isAuthoritative,
        isAuthoritative: Boolean(dodoPreview?.isAuthoritative),
        minAmount: targetConfig.minAmount,
        isValidMinimum: minCheck.valid,
        minErrorMessage: minCheck.valid ? null : minCheck.message,
        supportedCurrencies: Object.values(SUPPORTED_CURRENCIES),
      })
    }

    if ((route === '/checkout' || route === '/checkout/process' || route === '/checkout/create-order' || route === '/payments/create-order' || (path[0] === 'checkout' && (path[1] === 'create-order' || path[1] === 'process'))) && method === 'POST') {
      const body = await request.json()
      const targetEmail = body.email || body.customerEmail
      const result = await checkoutService.createSession({
        productId: body.productId,
        creatorId: body.creatorId || null,
        username: body.username || url.searchParams.get('username') || null,
        email: targetEmail,
        customerName: body.name || body.customerName,
        bookingId: body.bookingId,
        bookingDetails: body.bookingDetails,
        customResponses: body.customResponses,
        ref: body.ref || body.attributionToken || url.searchParams.get('ref'),
        couponCode: body.couponCode || body.code || null,
        currency: body.currency || body.billingCurrency || url.searchParams.get('currency') || null,
        country: body.country || body.billingCountry || null,
        billingCountry: body.billingCountry || body.country || null,
      })

      const res = json(result)
      const resEmail = targetEmail || result?.order?.customerEmail
      if (result?.alreadyPurchased && resEmail) {
        const sessionToken = purchaseOtpService.createSessionToken(resEmail)
        if (sessionToken) {
          const isProd = process.env.NODE_ENV === 'production'
          res.cookies.set(PURCHASE_SESSION_COOKIE, sessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        return res
      }
      if (result?.isFree && resEmail) {
        const sessionToken = purchaseOtpService.createSessionToken(resEmail)
        if (sessionToken) {
          const isProd = process.env.NODE_ENV === 'production'
          res.cookies.set(PURCHASE_SESSION_COOKIE, sessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        const sessionCookieValue = guestAccessService.createGuestSessionToken({
          email: resEmail,
          customerId: result?.order?.customerId || null,
          productId: body.productId,
        })
        if (sessionCookieValue) {
          const isProd = process.env.NODE_ENV === 'production'
          res.cookies.set('creatorstore_guest_session', sessionCookieValue, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          })
        }
      }
      return res
    }

    if ((route === '/checkout/dodo/return' || (path[0] === 'checkout' && path[1] === 'dodo' && path[2] === 'return')) && method === 'GET') {
      const orderId = url.searchParams.get('order_id')
      const sessionId = url.searchParams.get('session_id')
      const paymentId = url.searchParams.get('payment_id')
      if (orderId || sessionId) {
        try {
          await checkoutService.verifyPayment({ orderId, sessionId, paymentId })
        } catch (e) {
          console.warn('[Dodo Product Return] Verification note:', e.message)
        }
      }
      const redirectBase = getAppUrl().replace(/0\.0\.0\.0/g, 'localhost')
      const targetOrder = orderId ? await ordersRepo.getById(orderId) : (sessionId ? await ordersRepo.getByDodoSessionId(sessionId) : null)
      const destination = new URL(targetOrder ? `/checkout/success?order_id=${targetOrder.id}` : '/dashboard', redirectBase)
      return NextResponse.redirect(destination)
    }

    if ((route === '/checkout/verify' || route === '/payments/verify') && method === 'POST') {
      const body = await request.json()
      const result = await checkoutService.verifyPayment({
        orderId: body.orderId || body.order_id,
        sessionId: body.sessionId || body.session_id,
        paymentId: body.paymentId || body.payment_id,
        razorpayOrderId: body.razorpay_order_id || body.razorpayOrderId,
        razorpayPaymentId: body.razorpay_payment_id || body.razorpayPaymentId,
        razorpaySignature: body.razorpay_signature || body.razorpaySignature,
      })
      const res = json(result)
      const resEmail = result?.order?.customerEmail || result?.customerEmail || result?.email
      if (result?.success && resEmail) {
        const purchaseSessionToken = purchaseOtpService.createSessionToken(resEmail)
        if (purchaseSessionToken) {
          const isProd = process.env.NODE_ENV === 'production'
          res.cookies.set(PURCHASE_SESSION_COOKIE, purchaseSessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        const sessionCookieValue = guestAccessService.createGuestSessionToken({
          email: resEmail,
          customerId: result?.order?.customerId || null,
          productId: result?.order?.productId || null,
        })
        if (sessionCookieValue) {
          const isProd = process.env.NODE_ENV === 'production'
          res.cookies.set('creatorstore_guest_session', sessionCookieValue, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          })
        }
      }
      return res
    }
    if (route === '/checkout/check-access' && method === 'GET') {
      const emailParam = url.searchParams.get('email')
      const productId = url.searchParams.get('productId')
      const courseId = url.searchParams.get('courseId')

      let targetEmail = emailParam
      const guestCookie = request.cookies?.get('creatorstore_guest_session')?.value
      if (guestCookie) {
        const guestSession = guestAccessService.verifyGuestSession(guestCookie)
        if (guestSession?.email) {
          targetEmail = guestSession.email
        }
      }

      if (!targetEmail) return json({ hasAccess: false })

      let targetProductId = productId
      if (!targetProductId && courseId) {
        const c = await coursesRepo.getById(courseId)
        if (c) targetProductId = c.productId
      }

      if (!targetProductId) return json({ hasAccess: false })

      let hasAccess = false
      let matchedCustomerId = null

      const hasAccessDirect = await entitlementsRepo.has(null, targetProductId, targetEmail)
      if (hasAccessDirect) {
        hasAccess = true
      } else {
        const customers = await customersRepo.listByEmail(targetEmail)
        if (customers && customers.length > 0) {
          for (const cust of customers) {
            const ent = await entitlementsRepo.has(cust.id, targetProductId, targetEmail)
            if (ent) {
              hasAccess = true
              matchedCustomerId = cust.id
              break
            }
          }
        }
      }

      if (hasAccess) {
        const res = json({ hasAccess: true, email: targetEmail, productId: targetProductId })
        // Synchronize guest session cookie if not present
        if (!guestCookie) {
          const sessionCookieValue = guestAccessService.createGuestSessionToken({
            email: targetEmail,
            customerId: matchedCustomerId || null,
            productId: targetProductId,
          })
          if (sessionCookieValue) {
            const isProd = process.env.NODE_ENV === 'production'
            res.cookies.set('creatorstore_guest_session', sessionCookieValue, {
              httpOnly: true,
              secure: isProd,
              sameSite: 'lax',
              path: '/',
              maxAge: 30 * 24 * 60 * 60,
            })
          }
        }
        return res
      }

      return json({ hasAccess: false, email: targetEmail, productId: targetProductId })
    }
    if ((route === '/checkout/status' || route.startsWith('/payments/')) && method === 'GET') {
      const orderId = url.searchParams.get('order_id') || url.searchParams.get('session_id') || path[1]
      let email = url.searchParams.get('email')

      if (!email) {
        const guestCookie = request.cookies?.get('creatorstore_guest_session')?.value
        if (guestCookie) {
          const guestSession = guestAccessService.verifyGuestSession(guestCookie)
          if (guestSession?.email) {
            email = guestSession.email
          }
        }
      }

      const status = await checkoutService.getStatus(orderId, email)
      if (!status) return json({ error: 'Order not found' }, 404)
      return json(status)
    }

    // ===== Claim Free Digital Product Download (Linktree-inspired flow) =====
    if ((route === '/products/claim-download' || (path[0] === 'products' && path[1] === 'claim-download')) && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { productId, name, email, mailingListOptIn, consentAccepted } = body

      if (!name || typeof name !== 'string' || !name.trim()) {
        throw httpError(400, 'Name is required.')
      }
      const cleanName = name.trim()

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw httpError(400, 'A valid email address is required.')
      }
      const cleanEmail = email.trim().toLowerCase()

      if (!consentAccepted) {
        throw httpError(400, 'You must agree to the email updates and terms.')
      }

      if (!productId) {
        throw httpError(400, 'Product ID is required.')
      }

      const product = await productsRepo.getById(productId)
      if (!product) {
        throw httpError(404, 'Product not found.')
      }

      // CRITICAL SERVER-SIDE PROTECTION: Only free products (price <= 0) can be claimed here!
      const productPrice = Number(product.price || 0)
      if (productPrice > 0) {
        throw httpError(400, 'This product requires payment. Please complete checkout to access.')
      }

      // Check if already entitled
      const alreadyEntitled = await entitlementsRepo.has(null, productId, cleanEmail)
      let orderId = null
      let isAlreadyOwned = false

      if (alreadyEntitled) {
        isAlreadyOwned = true
      } else {
        const customer = await customersRepo.upsert(product.creatorId, cleanEmail, cleanName).catch(() => null)
        const newOrderId = crypto.randomUUID()
        const orderData = {
          id: newOrderId,
          creatorId: product.creatorId,
          productId: product.id,
          customerId: customer?.id || null,
          customerName: cleanName,
          customerEmail: cleanEmail,
          amount: 0,
          currency: product.currency || 'USD',
          status: 'PAID',
          paymentMode: 'FREE',
          customResponses: {
            mailingListOptIn: Boolean(mailingListOptIn),
            consentAccepted: true,
            claimedAt: new Date().toISOString(),
          },
          razorpayOrderId: `free_${newOrderId.slice(0, 12)}`,
          razorpayPaymentId: `free_pay_${newOrderId.slice(0, 12)}`,
        }
        await ordersRepo.create(orderData).catch((e) => console.warn('Order create note:', e.message))

        await entitlementsRepo.create({
          id: crypto.randomUUID(),
          orderId: newOrderId,
          customerId: customer?.id || null,
          customerEmail: cleanEmail,
          productId: product.id,
          status: 'ACTIVE',
          startsAt: new Date(),
        }).catch((e) => console.warn('Entitlement create note:', e.message))

        orderId = newOrderId

        try {
          await analyticsService.track({
            creatorId: product.creatorId,
            productId: product.id,
            type: 'download_completed',
          })
        } catch { }
      }

      // Set guest access session cookie and purchase session cookie
      const sessionCookieValue = guestAccessService.createGuestSessionToken({
        email: cleanEmail,
        customerId: null,
        productId,
      })
      const purchaseSessionToken = purchaseOtpService.createSessionToken(cleanEmail)

      // Send access email with secure download link (non-blocking)
      try {
        const effectiveOrderId = orderId || `order_${productId.slice(0, 8)}`
        const guestAccess = await guestAccessService.createAccessToken({
          orderId: effectiveOrderId,
          entitlementId: null,
          productId: product.id,
          customerEmail: cleanEmail,
        })
        if (guestAccess?.accessUrl) {
          await emailService.sendProductAccessEmail({
            to: cleanEmail,
            customerName: cleanName || cleanEmail.split('@')[0],
            productTitle: product.title,
            accessUrl: guestAccess.accessUrl,
            isExisting: isAlreadyOwned,
            isPaid: false,
          })
        }
      } catch (mailErr) {
        console.error('[ClaimDownload] Access email error:', mailErr.message)
      }

      const responsePayload = {
        success: true,
        alreadyOwned: isAlreadyOwned,
        orderId: orderId || `order_${productId.slice(0, 8)}`,
        productId,
        productTitle: product.title,
        customerName: cleanName,
        customerEmail: cleanEmail,
        redirectUrl: `/notifications/settings?listingId=${productId}`,
      }

      const res = json(responsePayload)
      const isProd = process.env.NODE_ENV === 'production'
      if (sessionCookieValue) {
        res.cookies.set('creatorstore_guest_session', sessionCookieValue, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        })
      }
      if (purchaseSessionToken) {
        res.cookies.set(PURCHASE_SESSION_COOKIE, purchaseSessionToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 60,
        })
      }
      return res
    }

    // ===== Purchase Recovery: Check Access Status =====
    if ((route === '/purchases/access/status' || (path[0] === 'purchases' && path[1] === 'access' && path[2] === 'status')) && method === 'GET') {
      let verifiedEmail = null

      // Check purchase access session cookie (strictly browser/session scoped)
      const purchaseCookie = request.cookies?.get(PURCHASE_SESSION_COOKIE)?.value
      if (purchaseCookie) {
        const pSession = purchaseOtpService.verifySessionToken(purchaseCookie)
        if (pSession?.email) {
          verifiedEmail = pSession.email.toLowerCase().trim()
        }
      }

      if (!verifiedEmail) {
        const guestCookie = request.cookies?.get('creatorstore_guest_session')?.value
        if (guestCookie) {
          const gSession = guestAccessService.verifyGuestSession(guestCookie)
          if (gSession?.email) {
            verifiedEmail = gSession.email.toLowerCase().trim()
          }
        }
      }

      if (verifiedEmail) {
        const res = json({
          success: true,
          authenticated: true,
          hasAccess: true,
          verified: true,
          email: verifiedEmail,
        })
        const sessionToken = purchaseOtpService.createSessionToken(verifiedEmail)
        if (sessionToken) {
          res.cookies.set(PURCHASE_SESSION_COOKIE, sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        return res
      }
      return json({
        success: true,
        authenticated: false,
        hasAccess: false,
        verified: false,
        email: null,
      })
    }

    // ===== Product Purchase Check (Product-specific & Normalized Email) =====
    if ((route === '/purchases/check' || (path[0] === 'purchases' && path[1] === 'check')) && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = body?.email
      const productId = body?.productId

      if (!productId || typeof productId !== 'string') {
        return json({ success: false, error: 'Product ID is required.' }, 400)
      }

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return json({ success: false, error: 'Please enter a valid email address.' }, 400)
      }

      const cleanEmail = email.trim().toLowerCase()
      const { prisma } = await import('@/lib/prisma')

      const product = await prisma.product.findUnique({
        where: { id: productId },
      })

      if (!product) {
        return json({ success: false, error: 'Product not found.' }, 404)
      }

      const rawPrice = Number(product.price || 0)
      const isPaid = rawPrice > 0

      // Check database for active entitlement for THIS specific product and THIS normalized email
      const entitlement = await prisma.entitlement.findFirst({
        where: {
          productId: product.id,
          status: 'ACTIVE',
          OR: [
            { customerEmail: { equals: cleanEmail, mode: 'insensitive' } },
            { order: { customerEmail: { equals: cleanEmail, mode: 'insensitive' }, status: 'PAID' } },
            { customer: { email: { equals: cleanEmail, mode: 'insensitive' } } }
          ]
        },
        include: {
          order: true,
        },
      })

      let hasValidExistingPurchase = false
      if (entitlement) {
        // If an order is attached, verify it is in a completed paid status
        if (!entitlement.order || entitlement.order.status === 'PAID') {
          hasValidExistingPurchase = true
        }
      }

      if (hasValidExistingPurchase) {
        // Create/refresh server-side access session cookie for this browser
        const sessionToken = purchaseOtpService.createSessionToken(cleanEmail)
        const res = json({
          success: true,
          exists: true,
          isPaid,
          price: rawPrice,
          productTitle: product.title,
        })

        if (sessionToken) {
          res.cookies.set(PURCHASE_SESSION_COOKIE, sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }

        // Send existing purchase access email with secure download link (non-blocking)
        try {
          let orderId = entitlement.orderId
          if (!orderId) {
            const matchedOrder = await prisma.order.findFirst({
              where: {
                productId: product.id,
                customerEmail: { equals: cleanEmail, mode: 'insensitive' },
                status: 'PAID',
              }
            })
            orderId = matchedOrder?.id
          }

          if (orderId) {
            const guestAccess = await guestAccessService.createAccessToken({
              orderId,
              entitlementId: entitlement.id,
              productId: product.id,
              customerEmail: cleanEmail,
            })
            if (guestAccess?.accessUrl) {
              await emailService.sendProductAccessEmail({
                to: cleanEmail,
                customerName: entitlement.order?.customerName || cleanEmail.split('@')[0],
                productTitle: product.title,
                accessUrl: guestAccess.accessUrl,
                isExisting: true,
                isPaid,
              })
            }
          }
        } catch (mailErr) {
          console.error('[PurchaseCheck] Resend access email error:', mailErr.message)
        }

        return res
      }

      // No existing purchase found for this product
      return json({
        success: true,
        exists: false,
        isPaid,
        price: rawPrice,
        productTitle: product.title,
      })
    }

    // ===== Purchase Recovery: Request OTP =====
    if ((route === '/purchases/access/request-otp' || (path[0] === 'purchases' && path[1] === 'access' && path[2] === 'request-otp')) && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = body?.email

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return json({ success: false, error: 'Please enter a valid email address' }, 400)
      }

      const result = await purchaseOtpService.requestOtp(email)
      if (!result.success) {
        const isCooldown = result.cooldownRemaining || result.error?.includes?.('wait') || result.error?.includes?.('Wait')
        return json({
          success: false,
          error: result.error,
          cooldownSeconds: result.cooldownRemaining || 0,
        }, isCooldown ? 429 : 400)
      }

      // Send the OTP via email
      try {
        const mailRes = await emailService.sendPurchaseAccessOtpEmail({
          to: result.cleanEmail,
          otp: result.rawOtp,
          expiryMinutes: result.expiryMinutes,
        })
        if (mailRes && mailRes.delivered === false) {
          console.error('[PurchaseAccessOtp] Delivery rejected:', mailRes.reason || mailRes.error)
          return json({
            success: false,
            error: 'Unable to send verification code. Please try again.',
          }, 500)
        }
      } catch (mailErr) {
        console.error('[PurchaseAccessOtp] Failed to send OTP email:', mailErr?.message || mailErr)
        return json({
          success: false,
          error: 'Unable to send verification code. Please try again.',
        }, 500)
      }

      // Security requirement: Generic success response prevents enumeration
      return json({
        success: true,
        message: 'If eligible, a verification code has been sent to this email.',
        cooldownSeconds: result.cooldownSeconds,
      })
    }

    // ===== Purchase Recovery: Verify OTP =====
    if ((route === '/purchases/access/verify-otp' || (path[0] === 'purchases' && path[1] === 'access' && path[2] === 'verify-otp')) && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = body?.email
      const otp = body?.otp

      if (!email || !otp) {
        return json({ success: false, error: 'Email and verification code are required' }, 400)
      }

      const result = await purchaseOtpService.verifyOtp(email, otp)
      if (!result.success) {
        return json({
          success: false,
          error: result.error,
          expired: result.expired || false,
          maxAttemptsExceeded: result.maxAttemptsExceeded || false,
        }, 400)
      }

      // Set HttpOnly signed session cookie
      const res = json({
        success: true,
        verified: true,
        email: result.email,
        message: 'Email successfully verified.',
      })

      const maxAgeSeconds = (result.expiresInMinutes || 30) * 60
      res.cookies.set(PURCHASE_SESSION_COOKIE, result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeSeconds,
      })

      return res
    }

    // ===== Secure Email Direct Access / Download Endpoint =====
    if (path[0] === 'purchases' && path[1] === 'email-access' && method === 'GET') {
      const rawToken = path[2]
      if (!rawToken) {
        return NextResponse.redirect(getAppUrl('/notifications/settings?expired=true'), 302)
      }

      const result = await guestAccessService.validateTokenAndResolve(rawToken)
      if (!result.success) {
        return NextResponse.redirect(getAppUrl(`/notifications/settings?expired=true&error=${encodeURIComponent(result.message || 'Access link expired')}`), 302)
      }

      const isProd = process.env.NODE_ENV === 'production'
      const purchaseSessionToken = purchaseOtpService.createSessionToken(result.customerEmail)

      // Try streaming the secure file directly
      try {
        const fileResult = await downloadService.authorizeAndGetDownloadFile({
          productId: result.product.id,
          guestEmail: result.customerEmail,
          guestCustomerId: result.order?.customerId || null,
        })

        const headers = new Headers({
          'Content-Type': fileResult.fileMime || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileResult.fileName)}"; filename*=UTF-8''${encodeURIComponent(fileResult.fileName)}`,
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        })
        if (fileResult.fileSize) {
          headers.set('Content-Length', String(fileResult.fileSize))
        }

        const dlResponse = new NextResponse(fileResult.fileBuffer, {
          status: 200,
          headers,
        })

        if (purchaseSessionToken) {
          dlResponse.cookies.set(PURCHASE_SESSION_COOKIE, purchaseSessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        if (result.sessionCookieValue) {
          dlResponse.cookies.set('creatorstore_guest_session', result.sessionCookieValue, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          })
        }

        return dlResponse
      } catch (dlErr) {
        console.warn('[EmailAccess] File stream note:', dlErr.message)
        // If file not directly streamable (or multiple files), redirect to Notifications page with product modal open
        const fallbackRes = NextResponse.redirect(getAppUrl(`/notifications/settings?listingId=${result.product.id}`), 302)
        if (purchaseSessionToken) {
          fallbackRes.cookies.set(PURCHASE_SESSION_COOKIE, purchaseSessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60,
          })
        }
        if (result.sessionCookieValue) {
          fallbackRes.cookies.set('creatorstore_guest_session', result.sessionCookieValue, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          })
        }
        return fallbackRes
      }
    }

    // ===== List Customer Purchases (Verified Session ONLY) =====
    if ((route === '/purchases' || path[0] === 'purchases') && method === 'GET') {
      let targetEmail = null

      // Check purchase access session cookie (strictly browser/session scoped)
      const purchaseCookie = request.cookies?.get(PURCHASE_SESSION_COOKIE)?.value
      if (purchaseCookie) {
        const pSession = purchaseOtpService.verifySessionToken(purchaseCookie)
        if (pSession?.email) {
          targetEmail = pSession.email.toLowerCase().trim()
        }
      }

      if (!targetEmail) {
        const guestCookie = request.cookies?.get('creatorstore_guest_session')?.value
        if (guestCookie) {
          const gSession = guestAccessService.verifyGuestSession(guestCookie)
          if (gSession?.email) {
            targetEmail = gSession.email.toLowerCase().trim()
          }
        }
      }

      // Security requirement: Never trust a client-supplied email without a verified session!
      if (!targetEmail) {
        return json({
          success: true,
          authenticated: false,
          hasAccess: false,
          verified: false,
          purchases: [],
          email: null,
        })
      }

      const { prisma } = await import('@/lib/prisma')
      const entitlements = await prisma.entitlement.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { customerEmail: { equals: targetEmail, mode: 'insensitive' } },
            { order: { customerEmail: { equals: targetEmail, mode: 'insensitive' }, status: 'PAID' } },
            { customer: { email: { equals: targetEmail, mode: 'insensitive' } } }
          ]
        },
        include: {
          order: true,
          product: {
            include: {
              creator: {
                include: {
                  creatorProfile: true,
                  store: true,
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }).catch((err) => {
        console.warn('Prisma entitlements query note:', err.message)
        return []
      })

      const seenProductIds = new Set()
      const purchases = []

      for (const ent of entitlements) {
        const p = ent.product
        if (!p) continue
        if (seenProductIds.has(p.id)) continue

        // If an order is attached, verify it is in a completed paid status
        if (ent.order && ent.order.status !== 'PAID') {
          continue
        }

        seenProductIds.add(p.id)
        const profile = p.creator?.creatorProfile
        const store = p.creator?.store

        const rawFileName = p.fileName || `${p.slug || 'product-asset'}.jpg`
        const ext = rawFileName.split('.').pop()?.toUpperCase() || 'FILE'

        purchases.push({
          id: p.id,
          productId: p.id,
          title: p.title,
          description: p.description || p.shortDescription || '',
          thumbnail: p.thumbnail || p.coverImage || null,
          coverImage: p.coverImage || p.thumbnail || null,
          price: Number(p.price || 0),
          currency: p.currency || 'USD',
          creator: {
            id: p.creatorId,
            name: profile?.name || store?.storeName || 'Creator',
            username: store?.username || store?.slug || 'creator',
            avatarUrl: profile?.avatarUrl || store?.avatarUrl || null,
          },
          files: [
            {
              id: p.fileId || `file_${p.id}`,
              fileName: rawFileName,
              fileExtension: ext,
              fileSize: p.fileSize || 18472,
              fileMime: p.fileMime || 'application/octet-stream',
              downloadUrl: `/api/download?productId=${p.id}`,
            }
          ],
          purchasedAt: ent.createdAt,
        })
      }

      const res = json({
        success: true,
        authenticated: true,
        hasAccess: true,
        verified: true,
        purchases,
        email: targetEmail,
      })

      const sessionToken = purchaseOtpService.createSessionToken(targetEmail)
      if (sessionToken) {
        res.cookies.set(PURCHASE_SESSION_COOKIE, sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 60,
        })
      }

      return res
    }

    // ===== Protected download (Streams actual binary file directly - NEVER exposes Supabase signed URL) =====
    if ((route === '/download' || path[0] === 'download') && (method === 'GET' || method === 'POST')) {
      let productId = null
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        productId = body?.productId || body?.product_id
      } else {
        productId = url.searchParams.get('productId') || url.searchParams.get('product_id') || url.searchParams.get('id')
      }

      if (!productId) {
        throw httpError(400, 'Product ID is required')
      }

      // 1. Check for HttpOnly purchase access session cookie
      const purchaseCookie = request.cookies.get(PURCHASE_SESSION_COOKIE)?.value
      const purchaseSession = purchaseCookie ? purchaseOtpService.verifySessionToken(purchaseCookie) : null

      // 2. Check for HttpOnly guest session cookie
      const guestCookie = request.cookies.get('creatorstore_guest_session')?.value
      const guestSession = guestAccessService.verifyGuestSession(guestCookie)

      // 3. Or check for creator user session
      const creatorUser = await requireAuth(request).catch(() => null)

      // 4. Or check for token parameter from secure email link
      const emailToken = url.searchParams.get('token')
      let tokenEmail = null
      let tokenCustomerId = null
      if (emailToken) {
        const tokenResult = await guestAccessService.validateTokenAndResolve(emailToken)
        if (tokenResult.success && tokenResult.customerEmail) {
          tokenEmail = tokenResult.customerEmail
          tokenCustomerId = tokenResult.order?.customerId || null
        }
      }

      if (!purchaseSession && !guestSession && !creatorUser && !tokenEmail) {
        throw httpError(401, 'Unauthorized. Please access using your purchase link from your email or verify your email.')
      }

      const fileResult = await downloadService.authorizeAndGetDownloadFile({
        productId,
        guestEmail: purchaseSession?.email || guestSession?.email || tokenEmail,
        guestCustomerId: guestSession?.customerId || tokenCustomerId,
        creatorUserId: creatorUser?.id || null,
      })

      // Delivery via signed URL redirect
      const deliveryMode = url.searchParams.get('delivery')
      const isSignedRequested = url.searchParams.get('signed') === 'true' || deliveryMode === 'redirect' || deliveryMode === 'signed'
      if (isSignedRequested) {
        const signedUrl = await fileResult.getSignedUrl(120)
        return NextResponse.redirect(signedUrl, 307)
      }

      // Delivery via JSON metadata
      if (url.searchParams.get('json') === 'true') {
        const signedUrl = await fileResult.getSignedUrl(120)
        return json({
          success: true,
          downloadUrl: signedUrl,
          fileName: fileResult.fileName,
          fileSize: fileResult.fileSize,
          fileMime: fileResult.fileMime,
          expiresIn: 120,
        })
      }

      // Range request support for resumable downloads
      const rangeHeader = request.headers.get('range')
      const totalSize = fileResult.fileSize || (fileResult.fileBuffer ? fileResult.fileBuffer.length : 0)

      if (rangeHeader && fileResult.fileBuffer && totalSize > 0) {
        const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        if (matches) {
          const rawStart = matches[1]
          const rawEnd = matches[2]
          let start = rawStart ? parseInt(rawStart, 10) : 0
          let end = rawEnd ? parseInt(rawEnd, 10) : totalSize - 1

          if (isNaN(start)) start = 0
          if (isNaN(end) || end >= totalSize) end = totalSize - 1

          if (start >= totalSize || start > end) {
            return new NextResponse(null, {
              status: 416,
              headers: {
                'Content-Range': `bytes */${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
              },
            })
          }

          const chunk = fileResult.fileBuffer.subarray(start, end + 1)
          const rangeHeaders = new Headers({
            'Content-Type': fileResult.fileMime || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileResult.fileName)}"; filename*=UTF-8''${encodeURIComponent(fileResult.fileName)}`,
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': String(chunk.length),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          })

          return new NextResponse(chunk, {
            status: 206,
            headers: rangeHeaders,
          })
        }
      }

      const headers = new Headers({
        'Content-Type': fileResult.fileMime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileResult.fileName)}"; filename*=UTF-8''${encodeURIComponent(fileResult.fileName)}`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Accept-Ranges': 'bytes',
      })
      if (fileResult.fileSize) {
        headers.set('Content-Length', String(fileResult.fileSize))
      }

      return new NextResponse(fileResult.fileBuffer, {
        status: 200,
        headers,
      })
    }

    // ===== Student / Learning Routes =====
    if (path[0] === 'learning') {
      const user = await requireAuth(request).catch(() => null)
      const studentEmail = user ? user.email : url.searchParams.get('email')
      if (!studentEmail) return json({ error: 'Authentication required' }, 401)

      if (path[1] === 'my-courses' && method === 'GET') {
        return json({ courses: await learningService.getStudentCourses(studentEmail) })
      }
      if (path[1] === 'courses' && path[2] && !path[3] && method === 'GET') {
        return json(await learningService.getCoursePlayer(studentEmail, path[2]))
      }
      if (path[1] === 'courses' && path[2] && path[3] === 'lessons' && path[4] && path[5] === 'pdf' && method === 'GET') {
        const course = await coursesRepo.getById(path[2])
        if (!course) return json({ error: 'Course not found' }, 404)
        const { hasAccess } = await learningService.verifyCourseAccess(studentEmail, course.id)
        const lesson = await lessonsRepo.getById(path[4])
        if (!lesson || lesson.courseId !== course.id) return json({ error: 'Lesson not found' }, 404)
        if (!hasAccess && !lesson.isPreview) return json({ error: 'Access denied' }, 403)
        if (!lesson.pdfFileId) return json({ error: 'PDF file not attached' }, 404)

        const { data: fileBuffer, error } = await supabaseAdmin.storage.from('product-files').download(lesson.pdfFileId)
        if (error || !fileBuffer) return json({ error: 'PDF file not found' }, 404)
        const headers = {
          'Content-Type': lesson.pdfFileMime || 'application/pdf',
          'Content-Disposition': `attachment; filename="${(lesson.pdfFileName || 'lesson.pdf').replace(/"/g, '')}"`,
        }
        if (lesson.pdfFileSize) headers['Content-Length'] = String(lesson.pdfFileSize)
        return new NextResponse(fileBuffer, { status: 200, headers })
      }
      if (path[1] === 'courses' && path[2] && path[3] === 'lessons' && path[4] && !path[5] && method === 'GET') {
        return json(await learningService.getLesson(studentEmail, path[2], path[4]))
      }
      if (path[1] === 'courses' && path[2] && path[3] === 'lessons' && path[4] && path[5] === 'progress' && method === 'POST') {
        const body = await request.json()
        return json(await learningService.trackProgress(studentEmail, path[2], path[4], body.completed, body.lastPosition))
      }
      if (path[1] === 'courses' && path[2] && path[3] === 'progress' && method === 'POST') {
        const body = await request.json()
        return json(await learningService.trackProgress(studentEmail, path[2], body.lessonId, body.completed ?? true, body.lastPosition))
      }
      if (path[1] === 'courses' && path[2] && path[3] === 'lessons' && path[4] && path[5] === 'complete' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await learningService.trackProgress(studentEmail, path[2], path[4], true, body.lastPosition || 0))
      }
    }

    // ===== Creator Subscription Endpoints =====
    if (path[0] === 'creator' && path[1] === 'subscription') {
      // ===== Dodo Subscription Return Callback =====
      if (path[2] === 'dodo' && path[3] === 'return' && method === 'GET') {
        const sessionId = url.searchParams.get('session_id')
        const subscriptionId = url.searchParams.get('subscription_id')
        const paymentId = url.searchParams.get('payment_id')
        const effectiveId = subscriptionId || sessionId
        let authUser = null
        try { authUser = await requireAuth(request) } catch (e) { }

        let targetSub = effectiveId ? await creatorSubscriptionsRepo.getByProviderSubscriptionId(effectiveId) : null
        if (!targetSub && paymentId) {
          targetSub = await creatorSubscriptionsRepo.getByDodoPaymentId(paymentId).catch(() => null)
        }
        if (!targetSub && authUser?.id) {
          targetSub = await creatorSubscriptionsRepo.getByCreator(authUser.id).catch(() => null)
        }
        const targetCreatorId = authUser?.id || targetSub?.creatorId

        let verifySuccess = false
        let isPending = false
        let errorReason = null

        if (targetCreatorId && (effectiveId || paymentId)) {
          try {
            const result = await creatorSubscriptionService.verifySubscriptionPayment(targetCreatorId, {
              provider: 'dodo',
              sessionId,
              subscriptionId,
              paymentId,
            })
            if (result?.pending || result?.status === 'PENDING_PAYMENT') {
              isPending = true
            } else {
              verifySuccess = Boolean(result && result.status === 'ACTIVE')
            }
          } catch (err) {
            console.error('[Dodo Return] Verification error:', err.message)
            verifySuccess = false
            errorReason = err.message
          }
        } else {
          errorReason = 'Missing subscription identifier or creator session'
        }

        const redirectBase = getAppUrl().replace(/0\.0\.0\.0/g, 'localhost')
        const destination = new URL('/dashboard/settings/billing', redirectBase)
        if (verifySuccess) {
          destination.searchParams.set('success', 'true')
        } else if (isPending) {
          destination.searchParams.set('processing', 'true')
        } else {
          destination.searchParams.set('error', 'dodo_verification_failed')
          if (errorReason) {
            destination.searchParams.set('reason', encodeURIComponent(errorReason.slice(0, 100)))
          }
        }
        return NextResponse.redirect(destination)
      }


      const user = await requireAuth(request)
      if (path[2] === 'status' && method === 'GET') {
        return json(await creatorSubscriptionService.getStatus(user.id))
      }
      if (path[2] === 'select-plan' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.selectPlan(user.id, body))
      }
      if (path[2] === 'start-trial' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.startTrial(user.id, body))
      }
      if (path[2] === 'checkout' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.createCheckoutSession(user.id, body))
      }
      if (path[2] === 'verify' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.verifySubscriptionPayment(user.id, body))
      }
      if (path[2] === 'update-payment-method' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.updatePaymentMethod(user.id, body))
      }
      if (path[2] === 'cancel' && method === 'POST') {
        return json(await creatorSubscriptionService.cancelSubscription(user.id))
      }
      if (path[2] === 'cancel-downgrade' && method === 'POST') {
        return json(await creatorSubscriptionService.cancelScheduledDowngrade(user.id))
      }
      if (path[2] === 'audit' && method === 'GET') {
        return json(await auditCustomerSubscriptions({ creatorId: user.id }))
      }
    }

    // ===== Trial Endpoints =====
    if (path[0] === 'trial') {
      const user = await requireAuth(request)
      if (path[1] === 'start' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await creatorSubscriptionService.startTrial(user.id, body))
      }
      if (path[1] === 'status' && method === 'GET') {
        return json(await creatorSubscriptionService.getStatus(user.id))
      }
    }

    // ===== Public & Marketing Endpoints =====
    if (path[0] === 'leads' && path[1] === 'capture' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json({ lead: await leadService.capture(body.creatorId, body) })
    }
    if (path[0] === 'checkout' && path[1] === 'validate-coupon' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await couponService.validate(body.creatorId, body.code, body.productId, body.basePrice))
    }
    // ===== Public Form Submissions & Newsletter =====
    if ((route === '/public/forms/submit' || route === '/forms/submit') && method === 'POST') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'
      const body = await request.json().catch(() => ({}))
      const result = await formsService.submitPublicForm(body, ip)
      return json(result)
    }
    if (path[0] === 'public' && path[1] === 'forms' && path[2] && path[3] === 'submit' && method === 'POST') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'
      const body = await request.json().catch(() => ({}))
      const result = await formsService.submitPublicForm({ ...body, formId: path[2] }, ip)
      return json(result)
    }
    if (path[0] === 'public' && path[1] === 'newsletter' && path[2] === 'unsubscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      if (!body.creatorId || !body.email) {
        throw httpError(400, 'creatorId and email required')
      }
      const result = await formsRepo.unsubscribeNewsletter(body.creatorId, body.email)
      return json({ success: true, result })
    }

    function requireCreator(user) {
      if (!user || user.role !== 'CREATOR') {
        throw httpError(403, 'Creator access required')
      }
      return user
    }
    async function requireCreatorUser(request) {
      const user = await requireAuth(request)
      return requireCreator(user)
    }

    // ===== Authenticated Store & Marketing Endpoints =====
    if (path[0] === 'creator' && path[1] === 'store' && path[2] === 'sections') {
      const user = await requireCreatorUser(request)
      if (!path[3] && method === 'GET') {
        return json({ sections: await storeSectionsService.getSections(user.id) })
      }
      if (!path[3] && method === 'POST') {
        const body = await request.json()
        return json({ section: await storeSectionsService.createSection(user.id, body) }, 201)
      }
      if (!path[3] && method === 'DELETE') {
        const body = await request.json().catch(() => ({}))
        const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds : []
        return json(await storeSectionsService.deleteManySections(user.id, sectionIds))
      }
      if (path[3] === 'batch-delete' && (method === 'POST' || method === 'DELETE')) {
        const body = await request.json().catch(() => ({}))
        const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds : []
        return json(await storeSectionsService.deleteManySections(user.id, sectionIds))
      }
      if (path[3] === 'reorder' && method === 'POST') {
        const body = await request.json()
        return json({ sections: await storeSectionsService.reorderSections(user.id, body.orderedSectionIds) })
      }
      if (path[3] && method === 'PATCH') {
        const body = await request.json()
        return json({ section: await storeSectionsService.updateSection(user.id, path[3], body) })
      }
      if (path[3] && method === 'DELETE') {
        return json(await storeSectionsService.deleteSection(user.id, path[3]))
      }
    }

    if (path[0] === 'creator' && path[1] === 'store' && path[2] === 'settings') {
      const user = await requireCreatorUser(request)
      if (method === 'GET') {
        return json(await storeService.getSettings(user.id))
      }
      if (method === 'PATCH' || method === 'PUT') {
        const body = await request.json()
        return json(await storeService.updateSettings(user.id, body))
      }
    }


    if (path[0] === 'creator' && path[1] === 'onboarding') {
      const user = await requireCreatorUser(request)
      if (!path[2] && method === 'GET') {
        return json(await onboardingService.getStatus(user.id))
      }
      if (path[2] === 'complete-step' && method === 'POST') {
        const body = await request.json()
        return json(await onboardingService.completeStep(user.id, body.stepId))
      }
    }
    if (path[0] === 'creator' && path[1] === 'success-center' && method === 'GET') {
      await requireCreatorUser(request)
      return json(await successCenterService.getResources())
    }

    if (path[0] === 'support') {
      if (path[1] === 'categories' && method === 'GET') {
        return json({ success: true, categories: await supportService.getCategories() })
      }
      if (path[1] === 'articles') {
        if (!path[2] && method === 'GET') {
          const category = url.searchParams.get('category')
          const search = url.searchParams.get('search')
          return json({ success: true, articles: await supportService.getArticles({ category, search }) })
        }
        if (path[2] && method === 'GET') {
          const article = await supportService.getArticleBySlug(path[2])
          if (!article) throw httpError(404, 'Help article not found')
          return json({ success: true, article })
        }
      }
      if (path[1] === 'tickets') {
        const user = await requireCreatorUser(request)
        if (!path[2] && method === 'GET') {
          return json({ success: true, tickets: await supportService.listTickets(user.id) })
        }
        if (!path[2] && method === 'POST') {
          const body = await request.json()
          const ticket = await supportService.createTicket(user.id, body)
          return json({ success: true, ticket }, 201)
        }
        if (path[2] && method === 'GET') {
          const ticket = await supportService.getTicket(user.id, path[2])
          if (!ticket) throw httpError(404, 'Support ticket not found')
          return json({ success: true, ticket })
        }
      }
    }

    if (path[0] === 'business-card') {
      if (!path[1] && method === 'GET') {
        const user = await requireCreatorUser(request)
        return json(await businessCardService.get(user.id))
      }
      if (!path[1] && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
        const user = await requireCreatorUser(request)
        const body = await request.json()
        return json(await businessCardService.save(user.id, body))
      }
      if (path[1] === 'contact' && method === 'POST') {
        const body = await request.json()
        const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        return json(await businessCardService.submitVisitorContact(body, clientIp))
      }
      if (path[1] === 'vcard' && method === 'GET') {
        const username = url.searchParams.get('username')
        const creatorId = url.searchParams.get('creatorId')
        const vcard = await businessCardService.getVCard({ username, creatorId })
        return new Response(vcard.content, {
          status: 200,
          headers: {
            'Content-Type': 'text/vcard; charset=utf-8',
            'Content-Disposition': `attachment; filename="${vcard.filename}"`,
            'Cache-Control': 'no-store, max-age=0'
          }
        })
      }
    }

    if (path[0] === 'leads') {
      const user = await requireCreatorUser(request)
      if (path[1] === 'export' && method === 'GET') {
        await creatorSubscriptionService.requireEntitlement(user.id, 'dataExport')
        const search = url.searchParams.get('search')
        const tag = url.searchParams.get('tag')
        const res = await leadService.list(user.id, { search, tag })
        const leads = Array.isArray(res) ? res : (res.items || [])
        const headers = 'Name,Email,Source,Lead Magnet,Created At\n'
        const rows = leads.map(l => `"${l.name || ''}","${l.email}","${l.source || 'Storefront'}","${l.leadMagnetTitle || 'Lead Magnet'}","${l.createdAt}"`).join('\n')
        return new NextResponse(headers + rows, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="creatorstore-leads.csv"',
          },
        })
      }
      if (!path[1] && method === 'GET') {
        const search = url.searchParams.get('search')
        const tag = url.searchParams.get('tag')
        return json(await leadService.list(user.id, { search, tag }))
      }
    }
    if (path[0] === 'coupons') {
      const user = await requireCreatorUser(request)
      if (!path[1] && method === 'GET') return json({ coupons: await couponService.list(user.id) })
      if (!path[1] && method === 'POST') {
        const body = await request.json()
        return json({ coupon: await couponService.create(user.id, body) })
      }
      if (path[1] === 'cleanup' && method === 'POST') {
        return json(await couponService.cleanupExpired(user.id))
      }
      if (path[1] && method === 'DELETE') {
        return json(await couponService.delete(user.id, path[1]))
      }
    }
    if (path[0] === 'marketing' && path[1] === 'overview' && method === 'GET') {
      const user = await requireCreatorUser(request)
      return json(await marketingService.getOverview(user.id))
    }
    if (path[0] === 'email' && path[1] === 'broadcasts') {
      const user = await requireCreatorUser(request)
      if (method === 'GET') return json({ broadcasts: await emailMarketingService.listBroadcasts(user.id) })
      if (method === 'POST') {
        const body = await request.json()
        return json({ broadcast: await emailMarketingService.sendBroadcast(user.id, body) })
      }
    }
    if (path[0] === 'email' && path[1] === 'audience-estimate' && method === 'GET') {
      const user = await requireCreatorUser(request)
      const segment = url.searchParams.get('segment') || 'ALL_CUSTOMERS'
      return json(await emailMarketingService.getAudienceEstimate(user.id, segment))
    }
    if (path[0] === 'email' && path[1] === 'test' && method === 'POST') {
      const user = await requireCreatorUser(request)
      const body = await request.json()
      return json(await emailMarketingService.sendTestEmail(user.id, body))
    }

    // ===== Creator Forms & Submissions Management =====
    if (path[0] === 'forms') {
      const user = await requireCreatorUser(request)

      if (path.length === 1 && method === 'GET') {
        const formType = url.searchParams.get('formType') || undefined
        const status = url.searchParams.get('status') || undefined
        const forms = await formsService.listForms(user.id, { formType, status })
        return json({ forms })
      }

      if (path.length === 1 && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const form = await formsService.createForm(user.id, body)
        return json({ form }, 201)
      }

      if (path[1] === 'unread-count' && method === 'GET') {
        return json(await formsService.getUnreadCount(user.id))
      }

      if (path[1] === 'stats' && method === 'GET') {
        return json({ stats: await formsService.getStats(user.id) })
      }

      if (path[1] === 'submissions') {
        if (!path[2] && method === 'GET') {
          const formId = url.searchParams.get('formId') || undefined
          const formType = url.searchParams.get('formType') || undefined
          const status = url.searchParams.get('status') || undefined
          const isRead = url.searchParams.get('isRead') || undefined
          const search = url.searchParams.get('search') || undefined
          const page = url.searchParams.get('page') ? parseInt(url.searchParams.get('page'), 10) : 1
          const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 20
          const result = await formsService.listSubmissions(user.id, { formId, formType, status, isRead, search, page, limit })
          return json(result)
        }
        if (path[2] === 'mark-all-read' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const result = await formsService.markAllRead(user.id, body)
          return json({ success: true, ...result })
        }
        if (path[2] && method === 'GET') {
          const submission = await formsService.getSubmission(path[2], user.id)
          return json({ submission })
        }
        if (path[2] && (method === 'PATCH' || method === 'PUT')) {
          const body = await request.json().catch(() => ({}))
          if (body.isRead !== undefined && body.status === undefined) {
            const result = await formsService.markSubmissionRead(path[2], user.id, body.isRead)
            return json(result)
          }
          const updated = await formsService.updateSubmission(path[2], user.id, body)
          return json({ submission: updated })
        }
        if (path[2] && method === 'DELETE') {
          const result = await formsService.deleteSubmission(path[2], user.id)
          return json({ success: true, ...result })
        }
      }

      if (path[1] === 'subscribers') {
        if (!path[2] && method === 'GET') {
          const status = url.searchParams.get('status') || undefined
          const search = url.searchParams.get('search') || undefined
          const page = url.searchParams.get('page') ? parseInt(url.searchParams.get('page'), 10) : 1
          const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 20
          const result = await formsService.listSubscribers(user.id, { status, search, page, limit })
          return json(result)
        }
        if (path[2] && (method === 'PATCH' || method === 'PUT')) {
          const body = await request.json().catch(() => ({}))
          const updated = await formsService.updateSubscriber(path[2], user.id, body)
          return json({ subscriber: updated })
        }
      }

      if (path[1] && path.length === 2) {
        if (method === 'GET') {
          const form = await formsService.getForm(path[1], user.id)
          return json({ form })
        }
        if (method === 'PATCH' || method === 'PUT') {
          const body = await request.json().catch(() => ({}))
          const form = await formsService.updateForm(path[1], user.id, body)
          return json({ form })
        }
        if (method === 'DELETE') {
          const result = await formsService.deleteForm(path[1], user.id)
          return json({ success: true, ...result })
        }
      }
    }

    // ===== Customer Account Routes (authenticated customer/user) =====
    if (path[0] === 'account') {
      const user = await requireAuth(request)
      if (path[1] === 'overview' && method === 'GET') {
        return json(await customerAccountService.getOverview(user.email))
      }
      if (path[1] === 'library' && method === 'GET') {
        const type = url.searchParams.get('type')
        const search = url.searchParams.get('search')
        return json({ items: await customerAccountService.getLibrary(user.email, { type, search }) })
      }
      if (path[1] === 'orders' && !path[2] && method === 'GET') {
        return json({ orders: await customerAccountService.getOrders(user.email) })
      }
      if (path[1] === 'orders' && path[2] && method === 'GET') {
        return json({ order: await customerAccountService.getOrderById(user.email, path[2]) })
      }
      if (path[1] === 'downloads' && method === 'GET') {
        return json({ downloads: await customerAccountService.getDownloads(user.email) })
      }
      if (path[1] === 'notifications' && method === 'GET') {
        return json(await customerAccountService.getNotifications(user.email))
      }
      if (path[1] === 'upgrade-to-creator' && method === 'POST') {
        return json(await accountUpgradeService.upgradeToCreator(user.id))
      }
    }

    // ===== Session Probe Route (Public / Auth check) =====
    if (route === '/me' && method === 'GET') {
      const token = request.cookies.get(SESSION_COOKIE)?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      const user = token ? await authService.userFromToken(token).catch(() => null) : null
      if (!user || user.emailVerified === false) {
        return json({ user: null, profile: null, store: null })
      }
      const me = await meService.getMe(user.id, { user })
      return json({ user, ...me })
    }

    // ===== Authenticated User Routes (CUSTOMER or CREATOR) =====
    const user = await requireAuth(request)

    if (route === '/me/profile' && method === 'PATCH') {
      const body = await request.json()
      const existingStore = await storesRepo.getByCreator(user.id).catch(() => null)
      const profile = await meService.updateProfile(user.id, body)
      const updatedStore = await storesRepo.getByCreator(user.id).catch(() => null)
      if (existingStore && updatedStore && (existingStore.username !== updatedStore.username || existingStore.slug !== updatedStore.slug)) {
        try {
          if (existingStore.username) revalidatePath(`/${existingStore.username}`)
          if (existingStore.slug && existingStore.slug !== existingStore.username) revalidatePath(`/${existingStore.slug}`)
          if (updatedStore.username) revalidatePath(`/${updatedStore.username}`)
          if (updatedStore.slug && updatedStore.slug !== updatedStore.username) revalidatePath(`/${updatedStore.slug}`)
          revalidatePath('/dashboard/store')
          revalidatePath('/dashboard/settings')
        } catch (e) { }
      }
      return json({ profile, store: updatedStore })
    }

    if ((route === '/me/country' || route === '/user/country') && (method === 'PATCH' || method === 'POST')) {
      const body = await request.json().catch(() => ({}))
      const rawCountry = body?.country || body?.countryCode
      const cleanCountry = normalizeCountryCode(rawCountry)
      if (!cleanCountry || !isValidCountryCode(cleanCountry)) {
        return json({ error: 'Valid ISO 3166-1 alpha-2 country code is required (e.g. IN, US, GB, CA)' }, 400)
      }
      await usersRepo.update(user.id, { country: cleanCountry })
      await profilesRepo.upsert(user.id, { country: cleanCountry })
      return json({ success: true, country: cleanCountry })
    }

    // ===== Everything below requires CREATOR role =====
    requireCreator(user)
    const creatorId = user.id

    // Creator Notifications Center
    if ((normalizedRoute === '/notifications' || normalizedRoute === '/creator/notifications') && method === 'GET') {
      const category = url.searchParams.get('category') || 'All'
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      return json(await notificationService.getNotifications(creatorId, { category, limit }))
    }
    if ((normalizedRoute === '/notifications/unread-count' || normalizedRoute === '/creator/notifications/unread-count') && method === 'GET') {
      const count = await notificationService.getUnreadCount(creatorId)
      return json({ unreadCount: count })
    }
    if ((normalizedRoute === '/notifications/mark-all-read' || normalizedRoute === '/notifications/mark-all-as-read' || normalizedRoute === '/creator/notifications/mark-all-read') && method === 'POST') {
      const result = await notificationService.markAllAsRead(creatorId)
      return json(result)
    }
    if (path[0] === 'notifications' && path[1] && (path[2] === 'read' || method === 'PATCH') && (method === 'PATCH' || method === 'POST')) {
      const notifId = path[1]
      const result = await notificationService.markAsRead(creatorId, notifId)
      return json(result)
    }

    // Creator Setup Checklist Status
    if ((route === '/creator/setup-status' || route === '/setup/status') && method === 'GET') {
      const status = await meService.getCreatorSetupStatus(creatorId)
      return json(status)
    }

    // Creator Payouts & Marketplace Payments
    if ((route === '/payouts/status' || route === '/payouts/settings' || route === '/integrations/razorpay' || route === '/payouts/account/status') && method === 'GET') {
      return json(await payoutService.getStatus(creatorId))
    }
    if (route === '/payouts/config' && method === 'GET') {
      return json(payoutService.getGatewayConfig())
    }
    if ((route === '/payouts/settings' || route === '/payouts/onboard' || route === '/payouts/save-details' || route === '/integrations/razorpay/connect' || route === '/payouts/account') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await payoutService.onboard(creatorId, body))
    }
    if ((route === '/payouts/retry' || route === '/payouts/account/retry') && method === 'POST') {
      return json(await payoutService.resumeOnboarding(creatorId))
    }
    if (route === '/payouts/resume' && method === 'GET') {
      return json(await payoutService.resumeOnboarding(creatorId))
    }
    if ((route === '/payouts/withdraw' || route === '/payments/withdraw') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await payoutService.requestWithdrawal(creatorId, body))
    }
    if (route === '/admin/payouts' && method === 'GET') {
      return json(await payoutService.getAdminPayoutAccounts())
    }
    if ((route === '/admin/payouts/mark-paid' || route.startsWith('/admin/payouts/') && route.endsWith('/mark-paid')) && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const targetCreatorId = body.creatorId || path[2] || creatorId
      return json(await payoutService.adminMarkAsPaid(targetCreatorId, body))
    }
    if ((route === '/payouts/dashboard' || route === '/payments/dashboard') && method === 'GET') {
      return json(await payoutService.getDashboard(creatorId))
    }
    if ((route === '/earnings/summary' || route === '/earnings/stats') && method === 'GET') {
      return json(await earningsService.getSummary(creatorId))
    }
    if ((route === '/earnings/ledger' || route === '/earnings/transactions') && method === 'GET') {
      const page = url.searchParams.get('page')
      const limit = url.searchParams.get('limit')
      const type = url.searchParams.get('type')
      const status = url.searchParams.get('status')
      return json(await earningsService.getLedger(creatorId, { page, limit, type, status, paginate: true }))
    }
    if (route === '/refunds' && method === 'POST') {
      const body = await request.json()
      return json(await payoutService.createRefund(creatorId, body))
    }
    if (route === '/admin/payments' && method === 'GET') {
      return json(await payoutService.getAdminPaymentsOverview())
    }
    if (route === '/admin/email/test' && method === 'POST') {
      const user = await authService.userFromToken(token)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const type = body.type || 'verify_connection'
      const targetEmail = user.email
      const appUrl = getAppUrl()
      if (type === 'verification') {
        const sendRes = await emailService.sendVerificationEmail({
          to: targetEmail,
          name: user.email.split('@')[0],
          otp: '482901',
        })
        return json({ ok: true, type, targetEmail, sendResult: sendRes })
      } else if (type === 'purchase') {
        const sendRes = await emailService.sendPurchaseConfirmation({
          to: targetEmail,
          customerName: user.email.split('@')[0],
          creatorName: 'CreatorStore Demo',
          productTitle: 'Sample Masterclass',
          amount: 499,
          currency: 'INR',
          orderId: 'ord_admin_test',
          accessUrl: `${appUrl}/dashboard`,
        })
        return json({ ok: true, type, targetEmail, sendResult: sendRes })
      } else if (type === 'lead') {
        const sendRes = await emailService.sendNewLeadCreatorEmail({
          to: targetEmail,
          creatorName: 'Admin Creator',
          leadName: 'Test Lead',
          leadEmail: 'lead@example.com',
          leadPhone: '+91 9876543210',
          formName: 'Test Contact Form',
          submittedAt: new Date().toLocaleString(),
          dashboardUrl: `${appUrl}/dashboard/leads`,
        })
        return json({ ok: true, type, targetEmail, sendResult: sendRes })
      } else {
        const verifyRes = await emailService.verifyConnection()
        return json({ ok: verifyRes.ok, isConfigured: emailService.isConfigured(), connection: verifyRes })
      }
    }

    // ===== Creator Subscriptions =====
    if ((route === '/creator/subscription/status' || route === '/subscription/status' || route === '/trial/status') && method === 'GET') {
      return json(await creatorSubscriptionService.getStatus(creatorId))
    }
    if ((route === '/creator/subscription/select-plan' || route === '/subscription/select-plan') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.selectPlan(creatorId, body))
    }
    if ((route === '/creator/subscription/checkout' || route === '/subscription/checkout') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.createCheckoutSession(creatorId, body))
    }
    if ((route === '/creator/subscription/verify' || route === '/subscription/verify') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.verifySubscriptionPayment(creatorId, body))
    }
    if ((route === '/creator/subscription/start-trial' || route === '/subscription/start-trial' || route === '/trial/start') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.startTrial(creatorId, body))
    }
    if ((route === '/creator/subscription/status' || route === '/subscription/status') && method === 'PATCH') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.updateSubscriptionStatus(creatorId, body.status))
    }
    if ((route === '/creator/subscription/update-payment-method' || route === '/subscription/update-payment-method') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await creatorSubscriptionService.updatePaymentMethod(creatorId, body))
    }
    if ((route === '/creator/subscription/cancel-downgrade' || route === '/subscription/cancel-downgrade') && method === 'POST') {
      return json(await creatorSubscriptionService.cancelScheduledDowngrade(creatorId))
    }
    if ((route === '/creator/subscription/audit' || route === '/subscription/audit') && method === 'GET') {
      return json(await auditCustomerSubscriptions({ creatorId }))
    }
    if ((route === '/creator/subscription/reconcile' || route === '/subscription/reconcile') && method === 'POST') {
      const sub = await creatorSubscriptionsRepo.getByCreator(creatorId)
      const subId = sub?.providerSubscriptionId || sub?.razorpayOrderId
      if (!subId) return json({ error: 'No provider subscription ID to reconcile' }, 400)
      return json(await razorpaySubscriptionLifecycleService.reconcileSubscription(subId))
    }
    if (route === '/admin/subscription-invoices' && method === 'GET') {
      const invoices = await subscriptionInvoicesRepo.listOutstanding({ limit: 100 })
      return json({ invoices })
    }
    if (route === '/admin/subscription-invoices/manual-recovery' && method === 'POST') {
      const user = await authService.userFromToken(token)
      if (!user) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const res = await razorpaySubscriptionLifecycleService.recordManualInvoiceRecovery({
        razorpayInvoiceId: body.razorpayInvoiceId,
        paymentId: body.paymentId,
        adminEmail: user.email,
        notes: body.notes,
      })
      return json(res)
    }

    // Store
    if (route === '/store' && method === 'GET') return json({ store: await storeService.getOrCreate(creatorId) })
    if (route === '/store/sections' && method === 'DELETE') {
      const body = await request.json().catch(() => ({}))
      const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds : []
      return json(await storeSectionsService.deleteManySections(creatorId, sectionIds))
    }
    if (route === '/store' && method === 'PATCH') {
      const body = await request.json()
      const existingStore = await storesRepo.getByCreator(creatorId).catch(() => null)
      const updatedStore = await storeService.update(creatorId, body)
      if (updatedStore) {
        try {
          if (existingStore?.username) revalidatePath(`/${existingStore.username}`)
          if (existingStore?.slug && existingStore.slug !== existingStore.username) revalidatePath(`/${existingStore.slug}`)
          if (updatedStore.username) revalidatePath(`/${updatedStore.username}`)
          if (updatedStore.slug && updatedStore.slug !== updatedStore.username) revalidatePath(`/${updatedStore.slug}`)
          revalidatePath('/dashboard/store')
          revalidatePath('/dashboard/settings')
        } catch (e) { }
      }
      return json({ store: updatedStore })
    }
    if (route === '/store/username' && method === 'POST') {
      const body = await request.json()
      const existingStore = await storesRepo.getByCreator(creatorId).catch(() => null)
      const updatedStore = await storeService.setUsername(creatorId, body.username)
      if (updatedStore) {
        try {
          if (existingStore?.username) revalidatePath(`/${existingStore.username}`)
          if (existingStore?.slug && existingStore.slug !== existingStore.username) revalidatePath(`/${existingStore.slug}`)
          if (updatedStore.username) revalidatePath(`/${updatedStore.username}`)
          if (updatedStore.slug && updatedStore.slug !== updatedStore.username) revalidatePath(`/${updatedStore.slug}`)
          revalidatePath('/dashboard/store')
          revalidatePath('/dashboard/settings')
        } catch (e) { }
      }
      return json({ store: updatedStore })
    }
    // Storefront Activation & Deactivation (Authorized Paid Plan Check)
    if ((route === '/store/publish' || route === '/storefront/activate' || route === '/store/activate') && method === 'POST') {
      const result = await storeService.publish(creatorId)
      if (result?.slug) {
        try {
          revalidatePath(`/${result.slug}`)
        } catch (e) { }
      }
      return json(result)
    }
    if ((route === '/store/unpublish' || route === '/storefront/deactivate' || route === '/store/deactivate') && method === 'POST') {
      const result = await storeService.unpublish(creatorId)
      return json(result)
    }
    // Direct Link & Section creation endpoints (Protected by active plan entitlement)
    if ((route === '/links' || route === '/link' || route === '/store/links' || (path[0] === 'store' && path[1] === 'links')) && method === 'POST') {
      await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'links')
      const body = await request.json().catch(() => ({}))
      const store = await storeService.getOrCreate(creatorId)
      const sections = Array.isArray(store.sections) ? [...store.sections] : []
      const newSection = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `link_${Date.now()}`,
        type: 'button',
        hidden: false,
        props: {
          label: body.title || body.label || 'Link',
          url: body.url || '',
          layout: body.layout || 'classic',
          thumbnail: body.thumbnail || '',
        },
      }
      sections.push(newSection)
      const updatedStore = await storeService.update(creatorId, { sections })
      return json({ success: true, link: newSection, store: updatedStore }, 201)
    }
    if (route === '/store/sections' && method === 'POST') {
      await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'store_sections')
      const body = await request.json().catch(() => ({}))
      return json(await storeSectionsService.createSection(creatorId, body), 201)
    }

    // YouTube Video Metadata Fetching (oEmbed)
    if (route === '/media/youtube/metadata' && (method === 'GET' || method === 'POST')) {
      let rawUrl = ''
      if (method === 'GET') {
        rawUrl = url.searchParams.get('url') || ''
      } else {
        const body = await request.json().catch(() => ({}))
        rawUrl = body.url || ''
      }
      if (!rawUrl || typeof rawUrl !== 'string') {
        throw httpError(400, 'YouTube URL is required')
      }
      const trimmed = rawUrl.trim()
      try {
        const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`)
        const validHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com']
        if (!validHosts.includes(parsed.hostname.toLowerCase())) {
          throw httpError(400, 'Invalid YouTube host. Only youtube.com and youtu.be URLs are supported.')
        }
      } catch (e) {
        if (e.status) throw e
        throw httpError(400, 'Invalid URL format.')
      }

      const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/)
      if (!match || !match[1]) {
        throw httpError(400, 'Invalid YouTube video URL. Please provide a valid watch, shorts, or youtu.be URL.')
      }
      const videoId = match[1]
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`
      const defaultThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`

      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)
        const oembedRes = await fetch(oembedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'CreatorStore-MediaService/1.0' },
          cache: 'no-store',
        })
        clearTimeout(timeoutId)

        if (oembedRes.ok) {
          const data = await oembedRes.json()
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: data.title || 'YouTube Video',
            thumbnailUrl: data.thumbnail_url || defaultThumbnail,
            authorName: data.author_name || 'YouTube',
          })
        } else {
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: 'YouTube Video',
            thumbnailUrl: defaultThumbnail,
            authorName: 'YouTube',
            fallback: true,
            warning: 'Could not fetch title automatically. You can customize the title below.',
          })
        }
      } catch (err) {
        return json({
          success: true,
          videoId,
          canonicalUrl,
          title: 'YouTube Video',
          thumbnailUrl: defaultThumbnail,
          authorName: 'YouTube',
          fallback: true,
          warning: 'Could not reach YouTube. You can customize the title below.',
        })
      }
    }

    // TikTok Video Metadata Fetching (oEmbed)
    if (route === '/media/tiktok/metadata' && (method === 'GET' || method === 'POST')) {
      let rawUrl = ''
      if (method === 'GET') {
        rawUrl = url.searchParams.get('url') || ''
      } else {
        const body = await request.json().catch(() => ({}))
        rawUrl = body.url || ''
      }
      if (!rawUrl || typeof rawUrl !== 'string') {
        throw httpError(400, 'TikTok video URL is required')
      }
      const trimmed = rawUrl.trim()
      try {
        const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`)
        const ALLOWED_TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com', 'vt.tiktok.com']
        if (!ALLOWED_TIKTOK_HOSTS.includes(parsed.hostname.toLowerCase())) {
          throw httpError(400, 'Invalid TikTok host. Only tiktok.com URLs are supported.')
        }
      } catch (e) {
        if (e.status) throw e
        throw httpError(400, 'Invalid URL format.')
      }

      // Extract ID or fallback to cleaned URL
      const idMatch = trimmed.match(/(?:\/video\/|\/v\/)(\d+)/) || trimmed.match(/(?:vm\.tiktok\.com|tiktok\.com\/t)\/([A-Za-z0-9_-]+)/)
      const videoId = idMatch ? idMatch[1] : 'tiktok_video'
      const canonicalUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`

      try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)
        const oembedRes = await fetch(oembedUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          cache: 'no-store',
        })
        clearTimeout(timeoutId)

        if (oembedRes.ok) {
          const data = await oembedRes.json()
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: data.title || 'TikTok Video',
            thumbnailUrl: data.thumbnail_url || null,
            authorName: data.author_name || 'TikTok',
          })
        } else {
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: 'TikTok Video',
            thumbnailUrl: null,
            authorName: 'TikTok',
            fallback: true,
            warning: 'Could not fetch TikTok metadata automatically. You can customize the title and thumbnail below.',
          })
        }
      } catch (err) {
        return json({
          success: true,
          videoId,
          canonicalUrl,
          title: 'TikTok Video',
          thumbnailUrl: null,
          authorName: 'TikTok',
          fallback: true,
          warning: 'Could not reach TikTok oEmbed. You can customize the title and thumbnail below.',
        })
      }
    }

    // Vimeo Video Metadata Fetching (oEmbed)
    if (route === '/media/vimeo/metadata' && (method === 'GET' || method === 'POST')) {
      let rawUrl = ''
      if (method === 'GET') {
        rawUrl = url.searchParams.get('url') || ''
      } else {
        const body = await request.json().catch(() => ({}))
        rawUrl = body.url || ''
      }
      if (!rawUrl || typeof rawUrl !== 'string') {
        throw httpError(400, 'Vimeo video URL is required')
      }
      const trimmed = rawUrl.trim()
      try {
        const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`)
        const ALLOWED_VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']
        if (!ALLOWED_VIMEO_HOSTS.includes(parsed.hostname.toLowerCase())) {
          throw httpError(400, 'Invalid Vimeo host. Only vimeo.com URLs are supported.')
        }
      } catch (e) {
        if (e.status) throw e
        throw httpError(400, 'Invalid URL format.')
      }

      const match = trimmed.match(/(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|))(\d+)/)
      if (!match || !match[1]) {
        throw httpError(400, 'Invalid Vimeo video URL. Please provide a valid Vimeo video link.')
      }
      const videoId = match[1]
      const canonicalUrl = `https://vimeo.com/${videoId}`

      try {
        const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonicalUrl)}`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 6000)
        const oembedRes = await fetch(oembedUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'CreatorStore-MediaService/1.0' },
          cache: 'no-store',
        })
        clearTimeout(timeoutId)

        if (oembedRes.ok) {
          const data = await oembedRes.json()
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: data.title || 'Vimeo Video',
            thumbnailUrl: data.thumbnail_url || null,
            authorName: data.author_name || 'Vimeo',
          })
        } else {
          return json({
            success: true,
            videoId,
            canonicalUrl,
            title: 'Vimeo Video',
            thumbnailUrl: null,
            authorName: 'Vimeo',
            fallback: true,
            warning: 'Could not fetch Vimeo metadata automatically. You can customize the title and thumbnail below.',
          })
        }
      } catch (err) {
        return json({
          success: true,
          videoId,
          canonicalUrl,
          title: 'Vimeo Video',
          thumbnailUrl: null,
          authorName: 'Vimeo',
          fallback: true,
          warning: 'Could not reach Vimeo. You can customize the title and thumbnail below.',
        })
      }
    }

    // Direct / Hosted Video Metadata (Loom / Direct files)
    if (route === '/media/video/metadata' && (method === 'GET' || method === 'POST')) {
      let rawUrl = ''
      if (method === 'GET') {
        rawUrl = url.searchParams.get('url') || ''
      } else {
        const body = await request.json().catch(() => ({}))
        rawUrl = body.url || ''
      }
      if (!rawUrl || typeof rawUrl !== 'string') {
        throw httpError(400, 'Video URL is required')
      }
      const trimmed = rawUrl.trim()
      const canonicalUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`

      // Check Loom
      if (canonicalUrl.includes('loom.com/share') || canonicalUrl.includes('loom.com/embed')) {
        try {
          const oembedUrl = `https://www.loom.com/v1/oembed?url=${encodeURIComponent(canonicalUrl)}`
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 6000)
          const oembedRes = await fetch(oembedUrl, { signal: controller.signal, cache: 'no-store' })
          clearTimeout(timeoutId)
          if (oembedRes.ok) {
            const data = await oembedRes.json()
            return json({
              success: true,
              canonicalUrl,
              title: data.title || 'Loom Video',
              thumbnailUrl: data.thumbnail_url || null,
              authorName: data.author_name || 'Loom',
            })
          }
        } catch {}
      }

      // Check direct file (.mp4, .webm, .mov)
      const pathname = new URL(canonicalUrl).pathname
      const filename = pathname.split('/').pop() || 'video'
      const cleanTitle = decodeURIComponent(filename)
        .replace(/\.[a-zA-Z0-9]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

      return json({
        success: true,
        canonicalUrl,
        title: cleanTitle || 'Video',
        thumbnailUrl: null,
        isDirect: true,
      })
    }
    if (route === '/storefront/status' && method === 'GET') {
      const store = await storeService.getOrCreate(creatorId)
      const sub = await creatorSubscriptionService.get(creatorId).catch(() => null)
      const isPaid = Boolean(sub && (sub.status === 'ACTIVE' || sub.status === 'TRIALING') && (sub.planId === 'CREATOR' || sub.planId === 'PRO') && sub.entitlements?.canPublish)
      return json({
        success: true,
        storefrontEnabled: Boolean(store.published),
        published: Boolean(store.published),
        status: store.published ? 'LIVE' : 'OFFLINE',
        isPaid,
        plan: sub?.plan || 'Free Account',
        planId: sub?.planId || 'UNSUBSCRIBED',
        slug: store.slug || store.username,
        publicUrl: store.slug ? `/${store.slug}` : (store.username ? `/${store.username}` : ''),
      })
    }

    // Store Entitlements
    if (route === '/store/entitlements' && method === 'GET') {
      const entitlements = await storeService.assertCanCreateStorePage(creatorId).catch(err => ({
        allowed: false,
        limit: err.limit ?? 3,
        currentCount: err.currentCount ?? 3,
        plan: err.plan ?? 'CREATOR',
        code: err.code
      }))
      const sub = await creatorSubscriptionService.getStatus(creatorId)
      return json({
        plan: sub.planId,
        planName: sub.plan,
        isPaid: sub.isPaid,
        maxStorefrontPages: entitlements.limit,
        currentStorefrontPages: entitlements.currentCount,
        canCreateStorePage: entitlements.allowed,
      })
    }

    // Store Pages CRUD
    if (route === '/store/pages' && method === 'GET') return json({ pages: await storeService.listPages(creatorId) })
    if (route === '/store/pages' && method === 'POST') {
      const body = await request.json()
      return json(await storeService.addPage(creatorId, { name: body.name }), 201)
    }
    if (path[0] === 'store' && path[1] === 'pages' && path[2] && path[3] === 'duplicate' && method === 'POST') {
      return json(await storeService.duplicatePage(creatorId, path[2]), 201)
    }
    if (route === '/store/pages/reorder' && method === 'POST') {
      const body = await request.json()
      return json(await storeService.reorderPages(creatorId, body.orderedPageIds))
    }
    if (path[0] === 'store' && path[1] === 'pages' && path[2] && !path[3] && method === 'PATCH') {
      const body = await request.json()
      return json(await storeService.renamePage(creatorId, path[2], { name: body.name }))
    }
    if (path[0] === 'store' && path[1] === 'pages' && path[2] && !path[3] && method === 'DELETE') {
      return json(await storeService.deletePage(creatorId, path[2]))
    }
    // Products
    if (route === '/products' && method === 'GET') {
      const page = url.searchParams.get('page')
      const limit = url.searchParams.get('limit')
      if (page || limit) {
        const res = await productService.list(creatorId, { page, limit, paginate: true })
        return json({ products: res.items, ...res })
      }
      return json({ products: await productService.list(creatorId) })
    }
    if (route === '/products' && method === 'POST') {
      const body = await request.json()
      return json({ product: await productService.create(creatorId, body) }, 201)
    }
    if (path[0] === 'products' && path[1] && path[2] === 'management' && method === 'GET') {
      return json(await productService.getManagementData(creatorId, path[1]))
    }
    if (path[0] === 'products' && path[1] && !path[2] && method === 'GET') {
      return json({ product: await productService.get(creatorId, path[1]) })
    }
    if (path[0] === 'products' && path[1] && !path[2] && (method === 'PATCH' || method === 'PUT')) {
      const body = await request.json()
      return json({ product: await productService.update(creatorId, path[1], body) })
    }
    if (path[0] === 'products' && path[1] && !path[2] && method === 'DELETE') {
      return json(await productService.remove(creatorId, path[1]))
    }
    if (path[0] === 'products' && path[1] && path[2] === 'publish' && method === 'POST') {
      return json({ product: await productService.publish(creatorId, path[1]) })
    }
    if (path[0] === 'products' && path[1] && path[2] === 'archive' && method === 'POST') {
      return json({ product: await productService.archive(creatorId, path[1]) })
    }
    if (path[0] === 'products' && path[1] && path[2] === 'file' && method === 'POST') {
      await productService.get(creatorId, path[1]) // ownership check
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400)
      if (file.size > 250 * 1024 * 1024) return json({ error: 'File size must be less than 250MB.' }, 400)
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const fileId = `prod_${path[1]}_${Date.now()}_${(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '')}`
      await ensureBucket('product-files', false)
      const { error: uploadErr } = await supabaseAdmin.storage.from('product-files').upload(fileId, buffer, { contentType: file.type || 'application/octet-stream', upsert: true })
      if (uploadErr) {
        console.error('Error uploading product file to storage:', uploadErr)
        throw httpError(500, `Storage upload failed: ${uploadErr.message || 'Unknown error'}`)
      }
      const product = await productService.attachFile(creatorId, path[1], {
        fileId, fileName: file.name || 'upload', fileSize: buffer.length, fileMime: file.type || 'application/octet-stream',
      })
      return json({ product })
    }

    // ===== Bundles (Creator) =====
    if (route === '/bundles' && method === 'POST') {
      const body = await request.json()
      const bundle = await bundlesService.create(creatorId, body)
      return json({ bundle }, 201)
    }
    if (path[0] === 'bundles' && path[1] && !path[2] && method === 'GET') {
      const bundle = await bundlesService.get(creatorId, path[1])
      return json({ bundle })
    }
    if (path[0] === 'bundles' && path[1] && !path[2] && (method === 'PATCH' || method === 'PUT')) {
      const body = await request.json()
      const bundle = await bundlesService.update(creatorId, path[1], body)
      return json({ bundle })
    }
    if (path[0] === 'bundles' && path[1] && !path[2] && method === 'DELETE') {
      return json(await bundlesService.remove(creatorId, path[1]))
    }

    // Custom Checkout Fields (Creator)
    const isCreatorFieldsRoute = (path[0] === 'creator' && path[1] === 'products' && path[2] && path[3] === 'checkout-fields') ||
      (path[0] === 'products' && path[1] && path[2] === 'checkout-fields')
    if (isCreatorFieldsRoute) {
      const prodId = path[0] === 'creator' ? path[2] : path[1]
      const subPath = path[0] === 'creator' ? path[4] : path[3]
      if (!subPath && method === 'GET') {
        return json({ fields: await checkoutFieldsService.getForCreator(creatorId, prodId) })
      }
      if (!subPath && method === 'POST') {
        const body = await request.json()
        return json({ field: await checkoutFieldsService.addField(creatorId, prodId, body) }, 201)
      }
      if (subPath === 'reorder' && method === 'POST') {
        const body = await request.json()
        return json({ fields: await checkoutFieldsService.reorderFields(creatorId, prodId, body.orderedFieldIds) })
      }
      if (subPath && method === 'PATCH') {
        const body = await request.json()
        return json({ field: await checkoutFieldsService.updateField(creatorId, prodId, subPath, body) })
      }
      if (subPath && method === 'DELETE') {
        return json(await checkoutFieldsService.deleteField(creatorId, prodId, subPath))
      }
    }

    // Coaching (Creator)
    if (path[0] === 'coaching' && path[1] === 'config' && path[2] && method === 'GET') {
      return json({ config: await coachingService.getConfig(creatorId, path[2]) })
    }
    if (path[0] === 'coaching' && path[1] === 'config' && path[2] && (method === 'POST' || method === 'PUT')) {
      const body = await request.json()
      return json({ config: await coachingService.saveConfig(creatorId, path[2], body) })
    }
    if (path[0] === 'coaching' && path[1] === 'creator' && path[2] === 'bookings' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const status = url.searchParams.get('status')
      const fromDate = url.searchParams.get('fromDate')
      const toDate = url.searchParams.get('toDate')
      return json({ bookings: await coachingService.listCreatorBookings(creatorId, { productId, status, fromDate, toDate }) })
    }

    // Calendar Endpoints (Creator)
    if (path[0] === 'calendar' && path[1] === 'bookings' && !path[2] && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const status = url.searchParams.get('status')
      const fromDate = url.searchParams.get('start') || url.searchParams.get('startDate') || url.searchParams.get('fromDate')
      const toDate = url.searchParams.get('end') || url.searchParams.get('endDate') || url.searchParams.get('toDate')
      const bookings = await coachingService.listCreatorBookings(creatorId, { productId, status, fromDate, toDate })
      const profile = await profilesRepo.getByCreator(creatorId).catch(() => null)
      return json({ bookings, timezone: profile?.timezone || 'Asia/Kolkata', total: bookings.length })
    }
    if (path[0] === 'calendar' && path[1] === 'availability' && method === 'GET') {
      return json(await coachingService.getCreatorAvailability(creatorId))
    }
    if (path[0] === 'calendar' && path[1] === 'availability' && (method === 'POST' || method === 'PUT')) {
      const body = await request.json()
      return json(await coachingService.saveCreatorAvailability(creatorId, body))
    }
    if (path[0] === 'calendar' && path[1] === 'bookings' && path[2] && path[3] === 'reschedule' && method === 'POST') {
      const body = await request.json()
      return json({
        booking: await coachingService.rescheduleBooking({
          bookingId: path[2],
          creatorId,
          newStartTime: body.startTime || body.newStartTime,
          newEndTime: body.endTime || body.newEndTime,
        })
      })
    }
    if (path[0] === 'calendar' && path[1] === 'bookings' && path[2] && path[3] === 'cancel' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json({
        booking: await coachingService.cancelBooking({
          bookingId: path[2],
          creatorId,
          reason: body.reason,
        })
      })
    }

    // Community (Creator)
    if (path[0] === 'community' && path[1] === 'config' && path[2] && method === 'GET') {
      return json({ config: await communityService.getConfig(creatorId, path[2]) })
    }
    if (path[0] === 'community' && path[1] === 'config' && path[2] && method === 'POST') {
      const body = await request.json()
      return json({ config: await communityService.saveConfig(creatorId, path[2], body) })
    }
    if (path[0] === 'community' && path[1] === 'creator' && path[2] === 'stats' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      return json(await communityService.getStats(creatorId, productId))
    }
    if (path[0] === 'community' && path[1] === 'creator' && path[2] === 'members' && path[3] === 'manage' && method === 'POST') {
      const body = await request.json()
      return json({ membership: await communityService.manageMember(creatorId, body.communityId, body) })
    }

    // Webinar (Creator)
    if (path[0] === 'webinar' && path[1] === 'config' && path[2] && method === 'GET') {
      return json({ config: await webinarService.getConfig(creatorId, path[2]) })
    }
    if (path[0] === 'webinar' && path[1] === 'config' && path[2] && method === 'POST') {
      const body = await request.json()
      return json({ config: await webinarService.saveConfig(creatorId, path[2], body) })
    }
    if (path[0] === 'webinar' && path[1] === 'creator' && path[2] === 'attendees' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const status = url.searchParams.get('status')
      const search = url.searchParams.get('search') || ''
      const limit = parseInt(url.searchParams.get('limit') || '100', 10)
      const skip = parseInt(url.searchParams.get('skip') || '0', 10)
      return json(await webinarService.listRegistrationsForCreator(creatorId, productId, { status, search, limit, skip }))
    }
    if (path[0] === 'webinar' && path[1] === 'creator' && path[2] === 'attendance' && method === 'POST') {
      const body = await request.json()
      return json({ registration: await webinarService.updateAttendance(creatorId, body.registrationId, body.status) })
    }
    if (path[0] === 'webinar' && path[1] === 'creator' && path[2] === 'cancel' && method === 'POST') {
      const body = await request.json()
      return json(await webinarService.cancelWebinar(creatorId, body.productId, body.reason))
    }

    // Memberships (Creator)
    if (path[0] === 'membership' && path[1] === 'config' && path[2]) {
      if (method === 'GET') {
        return json({ config: await membershipService.getConfig(path[2]) })
      }
      if (method === 'POST') {
        const body = await request.json()
        return json({ config: await membershipService.saveConfig(path[2], creatorId, body) })
      }
    }
    if (path[0] === 'membership' && path[1] === 'creator' && path[2] === 'members' && method === 'GET') {
      const productId = url.searchParams.get('productId')
      const status = url.searchParams.get('status')
      const search = url.searchParams.get('search')
      return json(await membershipService.listSubscriptionsForCreator(creatorId, { productId, status, search }))
    }
    if (path[0] === 'membership' && path[1] === 'creator' && path[2] === 'analytics' && method === 'GET') {
      return json(await membershipService.getCreatorAnalytics(creatorId))
    }

    // Membership Posts (Creator)
    if (path[0] === 'membership' && path[1] === 'creator' && path[2] === 'posts') {
      const productId = url.searchParams.get('productId') || path[3]
      if (method === 'GET' && !path[3]) {
        const status = url.searchParams.get('status')
        const search = url.searchParams.get('search')
        return json(await membershipService.listPosts(productId, creatorId, { status, search }))
      }
      if (method === 'POST' && !path[3]) {
        const body = await request.json()
        return json({ post: await membershipService.createPost(body.productId || productId, creatorId, body) })
      }
      if (path[3] && method === 'PATCH') {
        const body = await request.json()
        const pId = url.searchParams.get('productId') || body.productId
        return json({ post: await membershipService.updatePost(pId, creatorId, path[3], body) })
      }
      if (path[3] && method === 'DELETE') {
        const pId = url.searchParams.get('productId')
        return json(await membershipService.deletePost(pId, creatorId, path[3]))
      }
      if (path[3] && path[4] === 'publish' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const pId = url.searchParams.get('productId') || body.productId
        return json({ post: await membershipService.publishPost(pId, creatorId, path[3]) })
      }
      if (path[3] && path[4] === 'duplicate' && method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const pId = url.searchParams.get('productId') || body.productId
        return json({ post: await membershipService.duplicatePost(pId, creatorId, path[3]) })
      }
    }

    // Membership Tiers (Creator)
    if (path[0] === 'membership' && path[1] === 'creator' && path[2] === 'tiers') {
      const productId = url.searchParams.get('productId') || path[3]
      if (method === 'GET' && !path[3]) {
        return json({ tiers: await membershipService.listTiers(productId) })
      }
      if (method === 'POST' && !path[3]) {
        const body = await request.json()
        return json({ tier: await membershipService.saveTier(body.productId || productId, creatorId, body) })
      }
      if (path[3] && method === 'PATCH') {
        const body = await request.json()
        const pId = url.searchParams.get('productId') || body.productId
        return json({ tier: await membershipService.saveTier(pId, creatorId, { ...body, id: path[3] }) })
      }
      if (path[3] && method === 'DELETE') {
        const pId = url.searchParams.get('productId')
        return json(await membershipService.deleteTier(pId, creatorId, path[3]))
      }
      if (path[3] === 'reorder' && method === 'POST') {
        const body = await request.json()
        return json({ tiers: await membershipService.reorderTiers(body.productId, creatorId, body.orderedIds) })
      }
    }

    // Membership Member Management (Creator)
    if (path[0] === 'membership' && path[1] === 'creator' && path[2] === 'members' && path[3] && method === 'PATCH') {
      const body = await request.json()
      return json({ subscription: await membershipService.updateMember(creatorId, path[3], body.action, body.tierId) })
    }


    if (path[0] === 'custom-service' && path[1] === 'config' && path[2]) {
      if (method === 'GET') {
        return json({ config: await customService.getConfig(path[2]) })
      }
      if (method === 'POST') {
        const body = await request.json()
        return json({ config: await customService.saveConfig(path[2], creatorId, body) })
      }
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'requests') {
      if (method === 'GET') {
        const productId = url.searchParams.get('productId')
        const status = url.searchParams.get('status')
        const search = url.searchParams.get('search')
        return json(await customService.listRequestsForCreator(creatorId, { productId, status, search }))
      }
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'requests' && path[3] && method === 'GET') {
      return json(await customService.verifyAccess(path[3], null, creatorId))
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'clarification' && method === 'POST') {
      const body = await request.json()
      return json({ request: await customService.requestClarification(creatorId, body.requestId, body.message) })
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'delivery' && method === 'POST') {
      const body = await request.json()
      return json({ request: await customService.submitDelivery(creatorId, body.requestId, body.message, body.files) })
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'notes' && method === 'POST') {
      const body = await request.json()
      return json({ request: await customService.updateInternalNotes(creatorId, body.requestId, body.internalNotes) })
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'status' && method === 'POST') {
      const body = await request.json()
      return json({ request: await customService.updateStatus(creatorId, body.requestId, body.status) })
    }
    if (path[0] === 'custom-service' && path[1] === 'creator' && path[2] === 'analytics' && method === 'GET') {
      return json(await customService.getCreatorAnalytics(creatorId))
    }

    // External Link (Creator)
    if (path[0] === 'external-link' && path[1] === 'config' && path[2]) {
      if (method === 'GET') {
        return json({ config: await externalLink.getConfig(path[2]) })
      }
      if (method === 'POST') {
        const body = await request.json()
        return json({ config: await externalLink.saveConfig(path[2], creatorId, body) })
      }
    }
    if (path[0] === 'external-link' && path[1] === 'creator' && path[2] === 'analytics' && method === 'GET') {
      return json(await externalLink.getCreatorAnalytics(creatorId))
    }

    // Courses (Creator)
    if (route === '/courses' && method === 'GET') {
      const page = url.searchParams.get('page')
      const limit = url.searchParams.get('limit')
      if (page || limit) {
        const res = await courseService.list(creatorId, { page, limit, paginate: true })
        return json({ courses: res.items, ...res })
      }
      return json({ courses: await courseService.list(creatorId) })
    }
    if (route === '/courses' && method === 'POST') {
      return json({ error: 'The Courses feature has been permanently retired. New courses cannot be created.' }, 410)
    }
    if (path[0] === 'courses' && path[1] && !path[2] && method === 'GET') {
      return json(await courseService.get(creatorId, path[1]))
    }
    if (path[0] === 'courses' && path[1] && !path[2] && method === 'PATCH') {
      const body = await request.json()
      return json({ course: await courseService.update(creatorId, path[1], body) })
    }
    if (path[0] === 'courses' && path[1] && !path[2] && method === 'DELETE') {
      return json(await courseService.remove(creatorId, path[1]))
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'publish' && method === 'POST') {
      return json({ course: await courseService.publish(creatorId, path[1]) })
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'unpublish' && method === 'POST') {
      return json({ course: await courseService.archive(creatorId, path[1]) })
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'archive' && method === 'POST') {
      return json({ course: await courseService.archive(creatorId, path[1]) })
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'students' && method === 'GET') {
      return json({ students: await courseService.getStudents(creatorId, path[1]) })
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'analytics' && method === 'GET') {
      return json(await courseService.getAnalytics(creatorId, path[1]))
    }

    // Modules
    if (path[0] === 'courses' && path[1] && path[2] === 'modules' && method === 'POST') {
      const body = await request.json()
      return json({ module: await courseService.addModule(creatorId, path[1], body) }, 201)
    }
    if (path[0] === 'courses' && path[1] && path[2] === 'modules' && path[3] === 'reorder' && method === 'POST') {
      const body = await request.json()
      return json({ modules: await courseService.reorderModules(creatorId, path[1], body.moduleIds) })
    }
    if (path[0] === 'modules' && path[1] && !path[2] && method === 'PATCH') {
      const body = await request.json()
      return json({ module: await courseService.updateModule(creatorId, path[1], body) })
    }
    if (path[0] === 'modules' && path[1] && !path[2] && method === 'DELETE') {
      return json(await courseService.deleteModule(creatorId, path[1]))
    }

    // Lessons
    if (path[0] === 'modules' && path[1] && path[2] === 'lessons' && method === 'POST') {
      const body = await request.json()
      return json({ lesson: await courseService.addLesson(creatorId, path[1], body) }, 201)
    }
    if (path[0] === 'modules' && path[1] && path[2] === 'lessons' && path[3] === 'reorder' && method === 'POST') {
      const body = await request.json()
      return json({ lessons: await courseService.reorderLessons(creatorId, path[1], body.lessonIds) })
    }
    if (path[0] === 'lessons' && path[1] && !path[2] && method === 'PATCH') {
      const body = await request.json()
      return json({ lesson: await courseService.updateLesson(creatorId, path[1], body) })
    }
    if (path[0] === 'lessons' && path[1] && !path[2] && method === 'DELETE') {
      return json(await courseService.deleteLesson(creatorId, path[1]))
    }
    if (path[0] === 'lessons' && path[1] && path[2] === 'file' && method === 'POST') {
      const existingLesson = await lessonsRepo.getForCreator(path[1], creatorId)
      if (!existingLesson) throw httpError(404, 'Lesson not found')
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400)
      if (!file.type || !file.type.includes('pdf')) return json({ error: 'Only PDF files are allowed' }, 400)
      if (file.size > 50 * 1024 * 1024) return json({ error: 'File size must be less than 50MB.' }, 400)
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const fileId = `lesson_${path[1]}_${Date.now()}_${(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '')}`
      await supabaseAdmin.storage.from('product-files').upload(fileId, buffer, { contentType: file.type || 'application/pdf' })
      const lesson = await courseService.attachLessonPdf(creatorId, path[1], {
        fileId, fileName: file.name || 'lesson.pdf', fileSize: buffer.length, fileMime: file.type,
      })
      return json({ lesson })
    }

    // Orders / Customers / Analytics (tenant-scoped)
    if (route === '/orders' && method === 'GET') {
      const page = url.searchParams.get('page')
      const limit = url.searchParams.get('limit')
      if (page || limit) {
        const res = await ordersRepo.list(creatorId, { page, limit, paginate: true })
        return json({ orders: res.items, ...res })
      }
      return json({ orders: await ordersRepo.list(creatorId) })
    }
    if (path[0] === 'orders' && path[1] && !path[2] && method === 'GET') {
      const order = await ordersRepo.getForCreator(path[1], creatorId)
      if (!order) throw httpError(404, 'Order not found')
      return json({ order })
    }
    if (route === '/customers' && method === 'GET') {
      const page = url.searchParams.get('page')
      const limit = url.searchParams.get('limit')
      if (page || limit) {
        const res = await customersRepo.list(creatorId, { page, limit, paginate: true })
        return json({ customers: res.items, ...res })
      }
      return json({ customers: await customersRepo.list(creatorId) })
    }
    if (path[0] === 'customers' && path[1] && !path[2] && method === 'GET') {
      const customer = await customersRepo.get(path[1], creatorId)
      if (!customer) throw httpError(404, 'Customer not found')
      return json({ customer })
    }
    if (route === '/analytics/overview' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '30', 10)
      const productId = url.searchParams.get('productId') || undefined
      const from = url.searchParams.get('from') || undefined
      const to = url.searchParams.get('to') || undefined
      const view = url.searchParams.get('view')

      await creatorSubscriptionService.requireEntitlement(creatorId, 'basicAnalytics')
      if (days > 30 || productId || from || to || view === 'advanced') {
        await creatorSubscriptionService.requireEntitlement(creatorId, 'advancedAnalytics')
      }
      return json(await analyticsService.overview(creatorId, days, { productId, from, to }))
    }
    if (route === '/analytics/advanced' && method === 'GET') {
      await creatorSubscriptionService.requireEntitlement(creatorId, 'advancedAnalytics')
      const days = parseInt(url.searchParams.get('days') || '30', 10)
      const productId = url.searchParams.get('productId') || undefined
      const from = url.searchParams.get('from') || undefined
      const to = url.searchParams.get('to') || undefined
      return json(await analyticsService.overview(creatorId, days, { productId, from, to }))
    }
    if (route === '/export' && method === 'GET') {
      await creatorSubscriptionService.requireEntitlement(creatorId, 'dataExport')
      const dataset = url.searchParams.get('dataset') || 'products'
      const from = url.searchParams.get('from') || undefined
      const to = url.searchParams.get('to') || undefined
      const { csv, filename } = await exportService.exportDataset(creatorId, dataset, { from, to })
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (e) {
    return errorResponse(e)
  }
}

async function handleRoute(request, context = {}) {
  try {
    const res = await processRoute(request, context)
    return applyCors(res, request)
  } catch (e) {
    return applyCors(errorResponse(e), request)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const PATCH = handleRoute
export const DELETE = handleRoute

