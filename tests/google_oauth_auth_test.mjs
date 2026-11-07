import assert from 'assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { authService } from '../lib/services.js'
import { verifyPassword, signToken, verifyToken, SESSION_COOKIE } from '../lib/auth.js'
import { getSafeRedirect, getPostAuthDestination } from '../lib/redirectUtils.js'
import { usersRepo, profilesRepo, storesRepo, creatorSubscriptionsRepo } from '../lib/repos.js'

async function runTests() {
  console.log('======================================================================')
  console.log('CREATORSTORE — GOOGLE OAUTH 2.0 LOGIN & REGISTRATION VERIFICATION SUITE')
  console.log('======================================================================\n')

  let passed = 0
  let failed = 0

  function test(name, fn) {
    try {
      fn()
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err) {
      console.error(`  ❌ ${name}:`, err.message)
      failed++
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn()
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err) {
      console.error(`  ❌ ${name}:`, err.message)
      failed++
    }
  }

  // 1. Password Verification Security
  console.log('--- 1. Password Verification & Security Invariants ---')
  test('verifyPassword safely rejects [GOOGLE_OAUTH] placeholder', () => {
    assert.strictEqual(verifyPassword('password123', '[GOOGLE_OAUTH]'), false)
    assert.strictEqual(verifyPassword('password123', '[GOOGLE_OAUTH]:extra'), false)
    assert.strictEqual(verifyPassword('', '[GOOGLE_OAUTH]'), false)
    assert.strictEqual(verifyPassword('password123', '[SUPABASE_AUTH]'), false)
  })

  test('SESSION_COOKIE matches platform standard', () => {
    assert.strictEqual(SESSION_COOKIE, 'creatorzero_session')
  })

  test('Open redirect protection sanitizes external URLs', () => {
    assert.strictEqual(getSafeRedirect('https://attacker.com/evil', '/dashboard'), '/dashboard')
    assert.strictEqual(getSafeRedirect('//evil.com', '/dashboard'), '/dashboard')
    assert.strictEqual(getSafeRedirect('javascript:alert(1)', '/dashboard'), '/dashboard')
    assert.strictEqual(getSafeRedirect('/dashboard/products', '/dashboard'), '/dashboard/products')
    assert.strictEqual(getSafeRedirect('/login', '/dashboard'), '/dashboard')
  })

  // 2. Google OAuth URL Generation & State Signing
  console.log('\n--- 2. Google OAuth URL Generation & CSRF Protection ---')
  await asyncTest('authService.getGoogleAuthUrl generates valid URL and signed CSRF state', async () => {
    const origClientId = process.env.GOOGLE_CLIENT_ID
    try {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
      const res = await authService.getGoogleAuthUrl({
        returnTo: '/dashboard/settings',
        username: 'test_creator_123',
        action: 'signup',
      })

      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.mode, 'native')
      assert.ok(res.url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'))
      assert.ok(res.url.includes('client_id=test-client-id.apps.googleusercontent.com'))
      assert.ok(res.url.includes('response_type=code'))
      assert.ok(res.url.includes('scope=openid+email+profile'))
      assert.ok(res.state)

      const statePayload = verifyToken(res.state)
      assert.ok(statePayload)
      assert.strictEqual(statePayload.type, 'google_oauth_state')
      assert.strictEqual(statePayload.returnTo, '/dashboard/settings')
      assert.strictEqual(statePayload.username, 'test_creator_123')
      assert.strictEqual(statePayload.action, 'signup')
    } finally {
      process.env.GOOGLE_CLIENT_ID = origClientId
    }
  })

  await asyncTest('authService.getGoogleAuthUrl throws 503 when credentials missing and no supabase', async () => {
    const origClientId = process.env.GOOGLE_CLIENT_ID
    const origPublicClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const origSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const origSbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    try {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      let threw = false
      try {
        await authService.getGoogleAuthUrl()
      } catch (err) {
        threw = true
        assert.strictEqual(err.status, 503)
      }
      assert.strictEqual(threw, true, 'Should have thrown 503')
    } finally {
      if (origClientId) process.env.GOOGLE_CLIENT_ID = origClientId
      if (origPublicClientId) process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = origPublicClientId
      if (origSbUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origSbUrl
      if (origSbKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origSbKey
    }
  })

  // 3. Callback State Validation & Email Verification Requirement
  console.log('\n--- 3. State Validation & Email Verification Enforcement ---')
  await asyncTest('handleGoogleCallback rejects missing state or code', async () => {
    let threwState = false
    try {
      await authService.handleGoogleCallback({ code: 'abc' })
    } catch (err) {
      threwState = true
      assert.strictEqual(err.status, 400)
    }
    assert.strictEqual(threwState, true)

    let threwCode = false
    try {
      const validState = signToken({ type: 'google_oauth_state', returnTo: '/dashboard' })
      await authService.handleGoogleCallback({ state: validState })
    } catch (err) {
      threwCode = true
      assert.strictEqual(err.status, 400)
    }
    assert.strictEqual(threwCode, true)
  })

  await asyncTest('handleGoogleCallback rejects invalid or tampered state', async () => {
    let threwTampered = false
    try {
      await authService.handleGoogleCallback({ code: 'valid-code', state: 'tampered-signature.state.123' })
    } catch (err) {
      threwTampered = true
      assert.strictEqual(err.status, 400)
    }
    assert.strictEqual(threwTampered, true)
  })

  // 4. User Provisioning & Account Linking via handleGoogleAuthProfile
  console.log('\n--- 4. Account Provisioning, Linking, and Store Setup ---')
  const testNewEmail = `google_test_${Date.now()}@example.com`
  let createdUserId = null

  await asyncTest('handleGoogleAuthProfile provisions a brand-new creator account', async () => {
    const res = await authService.handleGoogleAuthProfile({
      email: testNewEmail,
      name: 'Google Test Creator',
      picture: 'https://lh3.googleusercontent.com/test-pic',
      googleSub: 'google-sub-12345',
      username: `gtc_${Date.now().toString().slice(-6)}`,
      role: 'CREATOR',
      action: 'signup',
      returnTo: '/dashboard',
    })

    assert.strictEqual(res.isNewUser, true)
    assert.ok(res.user)
    assert.strictEqual(res.user.email, testNewEmail)
    assert.strictEqual(res.user.role, 'CREATOR')
    assert.strictEqual(res.user.emailVerified, true)
    assert.ok(res.token)
    assert.ok(res.profile)
    assert.strictEqual(res.profile.name, 'Google Test Creator')
    assert.strictEqual(res.profile.avatarUrl, 'https://lh3.googleusercontent.com/test-pic')
    assert.ok(res.store)
    assert.ok(res.store.username)
    assert.strictEqual(res.target, '/onboarding') // new creator must complete onboarding

    createdUserId = res.user.id

    // Verify token can be decoded and maps back to user
    const tokenPayload = verifyToken(res.token)
    assert.strictEqual(tokenPayload.userId, createdUserId)
    assert.strictEqual(tokenPayload.role, 'CREATOR')

    // Verify database record has safe password hash
    const dbUser = await usersRepo.findById(createdUserId)
    assert.strictEqual(dbUser.passwordHash, '[GOOGLE_OAUTH]')
  })

  await asyncTest('authService.login gracefully rejects password login on [GOOGLE_OAUTH] user', async () => {
    let threw = false
    try {
      await authService.login({ email: testNewEmail, password: 'WrongPassword123!' })
    } catch (err) {
      threw = true
      assert.strictEqual(err.status, 401)
      assert.ok(err.message.includes('registered with Google Sign-In'))
    }
    assert.strictEqual(threw, true)
  })

  await asyncTest('handleGoogleAuthProfile links existing account without destroying data', async () => {
    // Simulate existing user logging in with Google
    const res = await authService.handleGoogleAuthProfile({
      email: testNewEmail,
      name: 'Google Test Creator Updated',
      picture: 'https://lh3.googleusercontent.com/test-pic',
      googleSub: 'google-sub-12345',
      role: 'CREATOR',
      action: 'login',
      returnTo: '/dashboard/products',
    })

    assert.strictEqual(res.isNewUser, false)
    assert.strictEqual(res.user.id, createdUserId)
    assert.strictEqual(res.user.email, testNewEmail)
    assert.strictEqual(res.user.emailVerified, true)

    // Verify password hash remained intact
    const dbUser = await usersRepo.findById(createdUserId)
    assert.strictEqual(dbUser.passwordHash, '[GOOGLE_OAUTH]')
  })

  // 5. Customer Role Support
  console.log('\n--- 5. Customer Google Authentication Flow ---')
  const testCustomerEmail = `google_customer_${Date.now()}@example.com`
  await asyncTest('handleGoogleAuthProfile correctly provisions a customer user', async () => {
    const res = await authService.handleGoogleAuthProfile({
      email: testCustomerEmail,
      name: 'Google Customer User',
      role: 'CUSTOMER',
      action: 'login',
      returnTo: '/account/orders',
    })

    assert.strictEqual(res.isNewUser, true)
    assert.strictEqual(res.user.role, 'CUSTOMER')
    assert.strictEqual(res.user.emailVerified, true)
    assert.strictEqual(res.target, '/account/orders')
  })

  // 6. Source Code Integrity & Route Registrations
  console.log('\n--- 6. Source Code Integrity & Route Verification ---')
  test('API route file registers all Google OAuth handlers', () => {
    const routeContent = fs.readFileSync(path.join(process.cwd(), 'app/api/[[...path]]/route.js'), 'utf8')
    assert.ok(routeContent.includes("route === '/auth/google'"), 'Must handle /auth/google')
    assert.ok(routeContent.includes("route === '/auth/callback/google'"), 'Must handle /auth/callback/google')
    assert.ok(routeContent.includes("route === '/auth/google/callback'"), 'Must handle /auth/google/callback')
    assert.ok(routeContent.includes("route === '/auth/google/session'"), 'Must handle /auth/google/session')
    assert.ok(routeContent.includes('authService.getGoogleAuthUrl'), 'Must invoke getGoogleAuthUrl')
    assert.ok(routeContent.includes('authService.handleGoogleCallback'), 'Must invoke handleGoogleCallback')
    assert.ok(routeContent.includes('authService.handleSupabaseGoogleSession'), 'Must invoke handleSupabaseGoogleSession')
    assert.ok(routeContent.includes('setSession'), 'Must set session cookie on callback')
  })

  test('Client OAuth helper initiates native flow and falls back to Supabase bridge', () => {
    const clientContent = fs.readFileSync(path.join(process.cwd(), 'lib/googleAuthClient.js'), 'utf8')
    assert.ok(clientContent.includes('export async function startGoogleOAuth'), 'Must export startGoogleOAuth')
    assert.ok(clientContent.includes('/api/auth/google'), 'Must request native endpoint')
    assert.ok(clientContent.includes('signInWithOAuth'), 'Must support Supabase fallback')
  })

  test('Supabase callback bridge page handles hash tokens and mints session', () => {
    const callbackContent = fs.readFileSync(path.join(process.cwd(), 'app/auth/callback/page.js'), 'utf8')
    assert.ok(callbackContent.includes('/api/auth/google/session'), 'Must post token to session endpoint')
    assert.ok(callbackContent.includes('access_token'), 'Must extract access_token')
  })

  test('Login and Signup pages are integrated with Google OAuth', () => {
    const loginContent = fs.readFileSync(path.join(process.cwd(), 'app/login/page.js'), 'utf8')
    assert.ok(loginContent.includes('startGoogleOAuth'), 'Login page must import startGoogleOAuth')
    assert.ok(loginContent.includes('Continue with Google'), 'Login page must render Continue with Google')
    assert.ok(loginContent.includes('google_cancelled'), 'Login page must handle OAuth cancellation/errors')

    const signupContent = fs.readFileSync(path.join(process.cwd(), 'app/signup/page.js'), 'utf8')
    assert.ok(signupContent.includes('startGoogleOAuth'), 'Signup page must import startGoogleOAuth')
    assert.ok(signupContent.includes('Continue with Google'), 'Signup page must render Continue with Google')
    assert.ok(signupContent.includes('action: \'signup\''), 'Signup page must set action to signup')
  })

  test('Documentation files include Google OAuth configuration', () => {
    const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8')
    assert.ok(envExample.includes('GOOGLE_CLIENT_ID='), '.env.example must specify GOOGLE_CLIENT_ID')
    assert.ok(envExample.includes('GOOGLE_CLIENT_SECRET='), '.env.example must specify GOOGLE_CLIENT_SECRET')
    assert.ok(envExample.includes('GOOGLE_REDIRECT_URI='), '.env.example must specify GOOGLE_REDIRECT_URI')

    const railwayDoc = fs.readFileSync(path.join(process.cwd(), 'ENV_RAILWAY_WEB.md'), 'utf8')
    assert.ok(railwayDoc.includes('GOOGLE_CLIENT_ID'), 'ENV_RAILWAY_WEB.md must document GOOGLE_CLIENT_ID')
    assert.ok(railwayDoc.includes('GOOGLE_CLIENT_SECRET'), 'ENV_RAILWAY_WEB.md must document GOOGLE_CLIENT_SECRET')
  })

  console.log(`\n========================================`)
  console.log(`Test Run Finished: ${passed} Passed, ${failed} Failed`)
  console.log(`========================================\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err)
  process.exit(1)
})
