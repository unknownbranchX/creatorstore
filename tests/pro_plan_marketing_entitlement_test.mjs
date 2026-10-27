import { marketingService, emailMarketingService, leadService, couponService } from '../lib/services.js'
import { leadsRepo, couponsRepo, emailRepo, productsRepo, profilesRepo, usersRepo, customersRepo, creatorSubscriptionsRepo } from '../lib/repos.js'
import { hasEntitlement, getPlanConfig, getSubscriptionPricing, PLAN_FEATURES } from '../lib/plans.js'
import { v4 as uuidv4 } from 'uuid'

async function runProPlanMarketingEntitlementTests() {
  console.log('=== STARTING PRO PLAN MARKETING ENTITLEMENT & PRICING TESTS ===\n')
  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`❌ FAIL: ${message}`)
      failed++
    }
  }

  try {
    // 1. Static Configuration & Pricing Tests
    const pricing = getSubscriptionPricing()
    assert(pricing.CREATOR.priceInr === 499, 'Creator plan default price is ₹499')
    assert(pricing.PRO.priceInr === 999, 'Pro plan default price is ₹999')

    const proConfig = getPlanConfig('PRO')
    assert(proConfig.displayFeatures.includes('Advanced analytics'), 'Pro displayFeatures contains Advanced analytics')
    assert(proConfig.displayFeatures.includes('Data export'), 'Pro displayFeatures contains Data export')
    assert(proConfig.displayFeatures.includes('Remove CreatorStore branding'), 'Pro displayFeatures contains Remove CreatorStore branding')
    assert(proConfig.displayFeatures.includes('Unlimited pages on your storefront'), 'Pro displayFeatures contains Unlimited pages on your storefront')
    assert(!proConfig.displayFeatures.includes('Discount coupons & promo codes'), 'Pro displayFeatures does NOT contain removed coupons feature')
    assert(!proConfig.displayFeatures.includes('Unlimited Instagram Auto-DMs'), 'Pro displayFeatures does NOT contain removed Instagram Auto-DMs feature')
    assert(!proConfig.displayFeatures.includes('Custom branded domain connection'), 'Pro displayFeatures does NOT contain removed domain connection feature')
    assert(!proConfig.displayFeatures.some(f => f.toLowerCase().includes('ai feature')), 'Pro displayFeatures does NOT contain AI feature line')

    // Entitlement tests
    assert(hasEntitlement('PRO', 'leadCollection') === true, 'Pro has leadCollection entitlement')
    assert(hasEntitlement('PRO', 'leadMagnets') === true, 'Pro has leadMagnets entitlement')
    assert(hasEntitlement('PRO', 'couponCodes') === true, 'Pro has couponCodes entitlement')
    assert(hasEntitlement('PRO', 'emailBroadcasts') === true, 'Pro has emailBroadcasts entitlement')

    assert(hasEntitlement('UNSUBSCRIBED', 'couponCodes') === false, 'Unsubscribed does NOT have couponCodes entitlement')
    assert(hasEntitlement('UNSUBSCRIBED', 'emailBroadcasts') === false, 'Unsubscribed does NOT have emailBroadcasts entitlement')

    // 2. Setup Pro Creator
    const proCreatorId = uuidv4()
    await usersRepo.create({
      id: proCreatorId,
      email: `pro_creator_${Date.now()}@example.com`,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'CREATOR',
    })
    await profilesRepo.upsert(proCreatorId, { name: 'Pro Test Creator' })
    await creatorSubscriptionsRepo.upsert(proCreatorId, {
      plan: 'PRO',
      status: 'ACTIVE',
      amount: 999,
      currency: 'INR',
    })

    // 3. Pro Creator: Test Leads
    const proLead = await leadService.capture(proCreatorId, {
      name: 'Pro Lead',
      email: 'pro.lead@example.com',
      source: 'Storefront',
      leadMagnetTitle: 'Pro Guide',
    })
    assert(proLead && proLead.email === 'pro.lead@example.com', 'Pro creator successfully captures lead')

    // 4. Pro Creator: Test Coupons
    const proCoupon = await couponService.create(proCreatorId, {
      code: `PRO${Date.now().toString().slice(-4)}`,
      type: 'PERCENTAGE',
      discount: 25,
      scope: 'ALL',
      minOrderPrice: 0,
      validityHours: 48,
    })
    assert(proCoupon && proCoupon.discount === 25, 'Pro creator successfully creates coupon')

    // 5. Pro Creator: Test Email Broadcast
    const proBroadcast = await emailMarketingService.sendBroadcast(proCreatorId, {
      name: 'Pro Product Update',
      subject: 'New Pro Course Released',
      content: 'Hello to all our subscribers from the Pro creator!',
      audience: 'ALL_CUSTOMERS',
    })
    assert(proBroadcast && proBroadcast.status === 'SENT', 'Pro creator successfully sends email broadcast')

    // 6. Pro Creator: Marketing Overview
    const proOverview = await marketingService.getOverview(proCreatorId)
    assert(proOverview.totalLeads === 1, 'Pro overview reports 1 lead')
    assert(proOverview.activeCoupons === 1, 'Pro overview reports 1 active coupon')
    assert(proOverview.totalCampaigns === 1, 'Pro overview reports 1 campaign')

    // 7. Setup Unsubscribed Creator
    const unsubCreatorId = uuidv4()
    await usersRepo.create({
      id: unsubCreatorId,
      email: `unsub_creator_${Date.now()}@example.com`,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'CREATOR',
    })
    await profilesRepo.upsert(unsubCreatorId, { name: 'Unsub Creator' })
    await creatorSubscriptionsRepo.upsert(unsubCreatorId, {
      plan: 'UNSUBSCRIBED',
      status: 'INACTIVE',
    })

    // 8. Unsubscribed Creator: Attempt Coupon Creation (Must Fail with 403)
    let couponRestricted = false
    try {
      await couponService.create(unsubCreatorId, {
        code: `FAIL${Date.now().toString().slice(-4)}`,
        type: 'PERCENTAGE',
        discount: 10,
        scope: 'ALL',
      })
    } catch (err) {
      if (err.status === 403) couponRestricted = true
    }
    assert(couponRestricted, 'Unsubscribed creator coupon creation blocked with 403')

    // 9. Unsubscribed Creator: Attempt Email Broadcast (Must Fail with 403)
    let emailRestricted = false
    try {
      await emailMarketingService.sendBroadcast(unsubCreatorId, {
        subject: 'Blocked Broadcast',
        content: 'This should not send',
        audience: 'ALL_CUSTOMERS',
      })
    } catch (err) {
      if (err.status === 403) emailRestricted = true
    }
    assert(emailRestricted, 'Unsubscribed creator email broadcast blocked with 403')

    console.log(`\n========================================`)
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
    console.log(`========================================\n`)

    if (failed > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error('Unhandled test error:', err)
    process.exit(1)
  }
}

runProPlanMarketingEntitlementTests()
