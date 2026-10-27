import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma.js'
import { creatorSubscriptionService, storeService, publicService } from '../lib/services.js'

console.log('\n=====================================================================')
console.log('🧪 BRANDED STOREFRONT FOOTER & PRO SUBSCRIPTION TOGGLE TEST SUITE')
console.log('=====================================================================\n')

async function runTests() {
  let passed = 0
  let failed = 0

  function pass(desc) {
    console.log(`  ✅ [PASS] ${desc}`)
    passed++
  }

  function fail(desc, err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err?.message || err}`)
    failed++
  }

  // -------------------------------------------------------------
  // TEST 1: Source Code Audit — Branded Footer & Dashboard Toggle
  // -------------------------------------------------------------
  console.log('--- TEST 1: Source Code Audit — Branded Footer & Dashboard Toggle ---')
  try {
    const rendererPath = path.join(process.cwd(), 'components/storefront/PublicStoreRenderer.jsx')
    const rendererContent = fs.readFileSync(rendererPath, 'utf8')

    // Branded footer
    assert(rendererContent.includes('export function StorefrontFooter'), 'StorefrontFooter export missing in PublicStoreRenderer')
    assert(rendererContent.includes('CreatorStoreMark'), 'CreatorStoreMark logo asset missing in StorefrontFooter')
    assert(rendererContent.includes('CreatorStore'), 'CreatorStore wordmark missing in StorefrontFooter')
    assert(rendererContent.includes('if (showBranding === false) return null'), 'Complete removal logic when showBranding is false missing')

    // Dashboard store page
    const dashboardPath = path.join(process.cwd(), 'app/dashboard/store/page.js')
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8')

    assert(dashboardContent.includes('CreatorStore footer'), 'CreatorStore footer card label missing in dashboard')
    assert(dashboardContent.includes('handleToggleFooterBranding'), 'handleToggleFooterBranding handler missing in dashboard')
    assert(dashboardContent.includes('previewStore'), 'previewStore subscription-gated preview missing')
    assert(dashboardContent.includes('Zap'), 'Zap Pro lightning badge missing')

    pass('StorefrontFooter displays CreatorStore brand mark and wordmark')
    pass('StorefrontFooter returns null when showBranding is false')
    pass('Dashboard Content tab includes CreatorStore footer card with Zap badge & toggle')
    pass('Editor preview enforces subscription policy through previewStore')
  } catch (err) {
    fail('Source code audit', err)
  }

  // -------------------------------------------------------------
  // TEST 2: Authoritative Server-Side Entitlement Check (removeBranding)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Authoritative Server-Side Entitlement Check (removeBranding) ---')
  let testUser = null
  try {
    // Find or create test creator user
    testUser = await prisma.user.findFirst({
      where: { role: 'CREATOR' },
      include: { store: true },
    })
    assert(testUser, 'A test creator user must exist')

    const creatorId = testUser.id

    // 2.1 Unsubscribed creator cannot remove branding
    await prisma.creatorSubscription.deleteMany({ where: { creatorId } }).catch(() => {})
    let unsubsError = null
    try {
      await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
    } catch (err) {
      unsubsError = err
    }
    assert(unsubsError, 'Unsubscribed creator must be rejected')
    assert.strictEqual(unsubsError.status, 403, 'Expected HTTP 403')
    pass('Unsubscribed creator is blocked from removeBranding entitlement with 403')

    // 2.2 Creator-only plan subscriber cannot remove branding
    await prisma.creatorSubscription.upsert({
      where: { creatorId },
      create: {
        creatorId,
        plan: 'CREATOR',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        amount: 6,
        currency: 'USD',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        plan: 'CREATOR',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        amount: 6,
        currency: 'USD',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    let creatorPlanError = null
    try {
      await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
    } catch (err) {
      creatorPlanError = err
    }
    assert(creatorPlanError, 'Creator-only plan creator must be rejected')
    assert.strictEqual(creatorPlanError.status, 403, 'Expected HTTP 403')
    pass('Creator-only subscriber is blocked from removeBranding entitlement with 403')

    // 2.3 Pending checkout does NOT grant removeBranding
    await prisma.creatorSubscription.update({
      where: { creatorId },
      data: {
        plan: 'PRO',
        status: 'PENDING',
        razorpayPaymentId: null,
        dodoPaymentId: null,
        providerSubscriptionId: null,
      },
    })
    let pendingError = null
    try {
      await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
    } catch (err) {
      pendingError = err
    }
    assert(pendingError, 'Pending checkout must not grant removeBranding')
    assert.strictEqual(pendingError.status, 403, 'Expected HTTP 403')
    pass('Pending checkout subscription is blocked from removeBranding entitlement with 403')

    // 2.4 Verified active PRO subscriber is GRANTED removeBranding
    await prisma.creatorSubscription.update({
      where: { creatorId },
      data: {
        plan: 'PRO',
        status: 'ACTIVE',
        amount: 12,
        currency: 'USD',
        dodoSubscriptionId: 'sub_test_pro_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    const proEntitlement = await creatorSubscriptionService.assertActiveEntitlement(creatorId, 'removeBranding')
    assert(proEntitlement.allowed === true, 'Active Pro subscriber must be allowed')
    pass('Verified active Pro subscriber is granted removeBranding entitlement')
  } catch (err) {
    fail('Server-side entitlement check', err)
  }

  // -------------------------------------------------------------
  // TEST 3: Direct API Request Protection (storeService.update)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Direct API Request Protection ---')
  try {
    const creatorId = testUser.id

    // 3.1 Pro user successfully turns footer OFF
    const updatedStore = await storeService.update(creatorId, {
      theme: { showFooterBranding: false },
    })
    assert.strictEqual(updatedStore.theme.showFooterBranding, false, 'Pro user should be able to set showFooterBranding: false')
    pass('Eligible Pro creator can disable footer via storeService.update')

    // 3.2 Pro user successfully turns footer back ON
    const reenabledStore = await storeService.update(creatorId, {
      theme: { showFooterBranding: true },
    })
    assert.strictEqual(reenabledStore.theme.showFooterBranding, true, 'Pro user should be able to set showFooterBranding: true')
    pass('Eligible Pro creator can re-enable footer via storeService.update')

    // 3.3 Downgrade user to Creator plan and attempt direct API request to disable footer
    await prisma.creatorSubscription.update({
      where: { creatorId },
      data: {
        plan: 'CREATOR',
        status: 'ACTIVE',
        amount: 6,
        dodoSubscriptionId: `sub_test_creator_${Date.now()}`,
      },
    })

    let bypassError = null
    try {
      await storeService.update(creatorId, {
        theme: { showFooterBranding: false },
      })
    } catch (err) {
      bypassError = err
    }
    assert(bypassError, 'Ineligible creator direct API request must be rejected')
    assert.strictEqual(bypassError.status, 403, 'Expected HTTP 403 PLAN_UPGRADE_REQUIRED')
    pass('Direct API request to disable footer by Creator-only subscriber is rejected with 403')

    // Verify DB was NOT updated to false
    const checkStore = await prisma.store.findUnique({ where: { creatorId } })
    assert.notStrictEqual(checkStore.theme?.showFooterBranding, false, 'Setting must not be silently saved for ineligible creator')
    pass('Ineligible creator setting was not saved to database')
  } catch (err) {
    fail('Direct API protection test', err)
  }

  // -------------------------------------------------------------
  // TEST 4: Subscription Downgrade / Expiration Auto-Restores Footer
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Subscription Downgrade / Expiration Auto-Restores Footer ---')
  try {
    const creatorId = testUser.id

    // Set store theme showFooterBranding: false directly in DB (simulating setting saved while Pro)
    const existingStore = await prisma.store.findUnique({ where: { creatorId } })
    const slug = existingStore.slug || existingStore.username
    await prisma.store.update({
      where: { creatorId },
      data: {
        published: true,
        theme: {
          ...(existingStore.theme || {}),
          showFooterBranding: false,
          customAccent: '#FF0055', // Other custom settings
        },
      },
    })

    // Case 4.1: Creator currently on CREATOR plan (lost Pro entitlement)
    await prisma.creatorSubscription.update({
      where: { creatorId },
      data: {
        plan: 'CREATOR',
        status: 'ACTIVE',
        amount: 6,
      },
    })

    const resolvedStorefront = await publicService.resolveStorefront(slug)
    assert.strictEqual(resolvedStorefront.status, 'ok', 'Storefront should resolve successfully')
    assert.strictEqual(resolvedStorefront.data.theme.showFooterBranding, true, 'Footer branding MUST be enforced to true for non-Pro creator')
    assert.strictEqual(resolvedStorefront.data.theme.customAccent, '#FF0055', 'Other custom store settings must remain intact')
    pass('Losing Pro eligibility automatically restores footer visibility on public storefront')
    pass('Other store theme settings are preserved without deletion')

    // Case 4.2: Creator re-subscribes / upgrades back to PRO
    await prisma.creatorSubscription.update({
      where: { creatorId },
      data: {
        plan: 'PRO',
        status: 'ACTIVE',
        amount: 12,
      },
    })

    const proStorefront = await publicService.resolveStorefront(slug)
    assert.strictEqual(proStorefront.status, 'ok')
    assert.strictEqual(proStorefront.data.theme.showFooterBranding, false, 'Saved showFooterBranding: false takes effect again for active Pro creator')
    pass('Regaining Pro eligibility restores creator saved footer preference')

    // Clean up
    await prisma.store.update({
      where: { creatorId },
      data: {
        theme: {
          ...(existingStore.theme || {}),
          showFooterBranding: true,
        },
      },
    })
    pass('Cleaned up test store settings')
  } catch (err) {
    fail('Subscription downgrade/expiration test', err)
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=====================================================================')
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Fatal error in branded footer test suite:', err)
  process.exit(1)
})
