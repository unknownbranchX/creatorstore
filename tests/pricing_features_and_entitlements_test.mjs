import fs from 'node:fs'
import { CREATOR_FEATURES, PRO_FEATURES, getPlanConfig, getSubscriptionPricing, hasEntitlement, PLAN_FEATURES, COMPARISON_TABLE_ROWS } from '../lib/plans.js'

async function runPricingVerificationTests() {
  console.log('=== RUNNING PRICING FEATURES & ENTITLEMENTS VERIFICATION TEST ===\n')
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

  // 1. Verify CREATOR_FEATURES has exactly 10 features in exact order
  const expectedCreatorFeatures = [
    'Single bio link storefront',
    'Unlimited digital products & sales',
    'Instant checkout & digital delivery',
    '0% CreatorStore platform transaction fees',
    'Built-in UPI, card & PayPal payment support',
    'Basic analytics',
    'Unlimited Instagram Auto-DMs',
    'Custom storefront designs',
    'Mailing list integration',
    'Up to 3 pages on your storefront',
  ]

  assert(CREATOR_FEATURES.length === 10, `Creator features count is exactly 10 (actual: ${CREATOR_FEATURES.length})`)
  expectedCreatorFeatures.forEach((feat, i) => {
    assert(CREATOR_FEATURES[i] === feat, `Creator feature #${i + 1} is "${feat}" (actual: "${CREATOR_FEATURES[i]}")`)
  })

  // 2. Verify payment wording does NOT mention Stripe
  const creatorFeaturesString = CREATOR_FEATURES.join(' ')
  assert(!creatorFeaturesString.toLowerCase().includes('stripe'), 'Creator features do not mention Stripe')
  assert(CREATOR_FEATURES.includes('Built-in UPI, card & PayPal payment support'), 'Creator includes exact payment wording')

  // 3. Verify PRO_FEATURES has exactly 4 Pro-specific benefits
  const expectedProFeatures = [
    'Advanced analytics',
    'Data export',
    'Remove CreatorStore branding',
    'Unlimited pages on your storefront',
  ]

  assert(PRO_FEATURES.length === 4, `Pro features count is exactly 4 (actual: ${PRO_FEATURES.length})`)
  expectedProFeatures.forEach((feat, i) => {
    assert(PRO_FEATURES[i] === feat, `Pro feature #${i + 1} is "${feat}" (actual: "${PRO_FEATURES[i]}")`)
  })

  // 4. Verify removed features from Pro are absent
  const proFeaturesString = PRO_FEATURES.join(' ')
  assert(!proFeaturesString.includes('Unlimited Instagram Auto-DMs'), 'Pro card removed standalone Instagram Auto-DMs')
  assert(!proFeaturesString.includes('Custom branded domain connection'), 'Pro card removed Custom branded domain connection')
  assert(!proFeaturesString.includes('Discount coupons & promo codes'), 'Pro card removed Discount coupons & promo codes')

  // 5. Verify no duplicates across Pro and Creator
  const duplicateInPro = PRO_FEATURES.filter(f => CREATOR_FEATURES.includes(f))
  assert(duplicateInPro.length === 0, `No duplicates between Creator and Pro lists (duplicates: ${duplicateInPro.join(', ') || 'none'})`)

  // 6. Pricing configuration verification
  const inrPricing = getSubscriptionPricing('INR', 'monthly')
  assert(inrPricing.CREATOR.priceInr === 499, 'Creator monthly INR price is 499')
  assert(inrPricing.CREATOR.priceFormatted === '₹499', 'Creator monthly price formatted is ₹499')
  assert(inrPricing.PRO.priceInr === 999, 'Pro monthly INR price is 999')
  assert(inrPricing.PRO.priceFormatted === '₹999', 'Pro monthly price formatted is ₹999')

  // 7. Entitlements verification
  // Storefront pages
  assert(PLAN_FEATURES.CREATOR.entitlements.storePagesLimit === 3, 'Creator plan has storePagesLimit = 3')
  assert(PLAN_FEATURES.PRO.entitlements.storePagesLimit === Infinity, 'Pro plan has storePagesLimit = Infinity')

  // Branding
  assert(hasEntitlement('CREATOR', 'removeBranding') === false, 'Creator does NOT have removeBranding')
  assert(hasEntitlement('PRO', 'removeBranding') === true, 'Pro has removeBranding')

  // Analytics
  assert(hasEntitlement('CREATOR', 'advancedAnalytics') === false, 'Creator does NOT have advancedAnalytics')
  assert(hasEntitlement('PRO', 'advancedAnalytics') === true, 'Pro has advancedAnalytics')
  assert(PLAN_FEATURES.CREATOR.entitlements.creatorAnalytics === 'basic', 'Creator analytics level is basic')
  assert(PLAN_FEATURES.PRO.entitlements.creatorAnalytics === 'advanced', 'Pro analytics level is advanced')

  // Data Export
  assert(hasEntitlement('CREATOR', 'dataExport') === false, 'Creator does NOT have dataExport')
  assert(hasEntitlement('PRO', 'dataExport') === true, 'Pro has dataExport')

  // Instagram Auto-DMs
  assert(hasEntitlement('CREATOR', 'automations') === true, 'Creator has automations entitlement')
  assert(hasEntitlement('CREATOR', 'instagram_autodm') === true, 'Creator has instagram_autodm entitlement')
  assert(hasEntitlement('PRO', 'automations') === true, 'Pro has automations entitlement')
  assert(hasEntitlement('PRO', 'instagram_autodm') === true, 'Pro has instagram_autodm entitlement')

  // Platform fees
  assert(PLAN_FEATURES.CREATOR.entitlements.platformFeePercent === 0, 'Creator has 0% platform fee')
  assert(PLAN_FEATURES.PRO.entitlements.platformFeePercent === 0, 'Pro has 0% platform fee')

  // 8. Comparison Table Rows
  const tableKeys = COMPARISON_TABLE_ROWS.map(r => r.key)
  assert(tableKeys.includes('data_export'), 'Comparison table contains data_export row')
  assert(tableKeys.includes('remove_branding'), 'Comparison table contains remove_branding row')

  console.log(`\n========================================`)
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log(`========================================\n`)

  if (failed > 0) process.exit(1)
}

runPricingVerificationTests()
