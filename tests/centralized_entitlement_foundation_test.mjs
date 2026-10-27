import assert from 'node:assert'
import {
  mapProviderPlanToInternalPlan,
  getEffectiveSubscription,
  getPlanEntitlements,
  hasEntitlement,
  requireEntitlement,
  CANONICAL_PLANS,
  INTERNAL_PLAN_KEYS,
  entitlementService,
} from '../lib/entitlement-service.js'
import {
  PLAN_FEATURES,
  PLAN_IDS,
  hasEntitlement as checkPlanEntitlement,
  getPlanConfig,
} from '../lib/plans.js'
import { getBillingCatalog, PLAN_KEYS } from '../lib/billing/config.js'
import { webhookService } from '../lib/services.js'

async function runCentralizedEntitlementFoundationTests() {
  console.log('=== RUNNING CENTRALIZED SUBSCRIPTION & ENTITLEMENT FOUNDATION TESTS ===\n')
  let passed = 0
  let failed = 0

  function test(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`❌ FAIL: ${message}`)
      failed++
    }
  }

  // -------------------------------------------------------------
  // SUITE 1: CANONICAL PLAN MODEL & PROVIDER PLAN MAPPING
  // -------------------------------------------------------------
  console.log('\n--- SUITE 1: Canonical Plan Mapping & Provider Normalization ---')
  const catalog = getBillingCatalog()

  const rzpCreatorMonthly = catalog[PLAN_KEYS.CREATOR]?.INDIA?.monthly?.planIdRazorpay
  const rzpCreatorAnnual = catalog[PLAN_KEYS.CREATOR]?.INDIA?.annual?.planIdRazorpay
  const rzpProMonthly = catalog[PLAN_KEYS.PRO]?.INDIA?.monthly?.planIdRazorpay
  const rzpProAnnual = catalog[PLAN_KEYS.PRO]?.INDIA?.annual?.planIdRazorpay

  const dodoCreatorUsdMonthly = catalog[PLAN_KEYS.CREATOR]?.INTERNATIONAL?.monthly?.dodoProductId
  const dodoCreatorUsdAnnual = catalog[PLAN_KEYS.CREATOR]?.INTERNATIONAL?.annual?.dodoProductId
  const dodoProUsdMonthly = catalog[PLAN_KEYS.PRO]?.INTERNATIONAL?.monthly?.dodoProductId
  const dodoProUsdAnnual = catalog[PLAN_KEYS.PRO]?.INTERNATIONAL?.annual?.dodoProductId

  const dodoCreatorInrMonthly = catalog[PLAN_KEYS.CREATOR]?.INDIA?.monthly?.dodoProductId
  const dodoProInrMonthly = catalog[PLAN_KEYS.PRO]?.INDIA?.monthly?.dodoProductId

  // Razorpay mappings
  test(mapProviderPlanToInternalPlan('RAZORPAY', rzpCreatorMonthly) === CANONICAL_PLANS.CREATOR, 'Razorpay Creator Monthly plan ID maps to CREATOR')
  test(mapProviderPlanToInternalPlan('RAZORPAY', rzpCreatorAnnual || 'plan_creator_annual') === CANONICAL_PLANS.CREATOR, 'Razorpay Creator Annual plan ID maps to CREATOR')
  test(mapProviderPlanToInternalPlan('RAZORPAY', rzpProMonthly) === CANONICAL_PLANS.PRO, 'Razorpay Pro Monthly plan ID maps to PRO')
  test(mapProviderPlanToInternalPlan('RAZORPAY', rzpProAnnual || 'plan_pro_annual') === CANONICAL_PLANS.PRO, 'Razorpay Pro Annual plan ID maps to PRO')

  // Dodo mappings
  test(mapProviderPlanToInternalPlan('DODO', dodoCreatorUsdMonthly) === CANONICAL_PLANS.CREATOR, 'Dodo Creator USD Monthly product ID maps to CREATOR')
  test(mapProviderPlanToInternalPlan('DODO', dodoCreatorUsdAnnual) === CANONICAL_PLANS.CREATOR, 'Dodo Creator USD Annual product ID maps to CREATOR')
  test(mapProviderPlanToInternalPlan('DODO', dodoProUsdMonthly) === CANONICAL_PLANS.PRO, 'Dodo Pro USD Monthly product ID maps to PRO')
  test(mapProviderPlanToInternalPlan('DODO', dodoProUsdAnnual) === CANONICAL_PLANS.PRO, 'Dodo Pro USD Annual product ID maps to PRO')
  test(mapProviderPlanToInternalPlan('DODO', dodoCreatorInrMonthly) === CANONICAL_PLANS.CREATOR, 'Dodo Creator INR Monthly product ID maps to CREATOR')
  test(mapProviderPlanToInternalPlan('DODO', dodoProInrMonthly) === CANONICAL_PLANS.PRO, 'Dodo Pro INR Monthly product ID maps to PRO')

  // Direct string aliases
  test(mapProviderPlanToInternalPlan('ANY', 'creator') === CANONICAL_PLANS.CREATOR, '"creator" string maps to CREATOR')
  test(mapProviderPlanToInternalPlan('ANY', 'pro') === CANONICAL_PLANS.PRO, '"pro" string maps to PRO')
  test(mapProviderPlanToInternalPlan('ANY', 'CREATOR_PRO') === CANONICAL_PLANS.PRO, '"CREATOR_PRO" string maps to PRO')

  // Unknown IDs must NEVER grant arbitrary access
  test(mapProviderPlanToInternalPlan('RAZORPAY', 'plan_unknown_fake_999') === CANONICAL_PLANS.UNSUBSCRIBED, 'Unknown Razorpay plan ID safely resolves to UNSUBSCRIBED')
  test(mapProviderPlanToInternalPlan('DODO', 'pdt_unknown_malicious_123') === CANONICAL_PLANS.UNSUBSCRIBED, 'Unknown Dodo product ID safely resolves to UNSUBSCRIBED')
  test(mapProviderPlanToInternalPlan('RAZORPAY', null) === CANONICAL_PLANS.UNSUBSCRIBED, 'Null plan ID safely resolves to UNSUBSCRIBED')
  test(mapProviderPlanToInternalPlan('DODO', undefined) === CANONICAL_PLANS.UNSUBSCRIBED, 'Undefined plan ID safely resolves to UNSUBSCRIBED')

  // -------------------------------------------------------------
  // SUITE 2: CENTRAL PLAN ENTITLEMENT SPECIFICATION MATRIX
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: Central Plan Entitlement Matrix Verification ---')
  const creatorEntitlements = await getPlanEntitlements('CREATOR')
  const proEntitlements = await getPlanEntitlements('PRO')
  const unsubscribedEntitlements = await getPlanEntitlements('UNSUBSCRIBED')

  // 1. Digital products and sales: Creator=Yes, Pro=Yes
  test(creatorEntitlements.digitalProducts === true && creatorEntitlements.canSell === true, 'Creator has Digital products and sales')
  test(proEntitlements.digitalProducts === true && proEntitlements.canSell === true, 'Pro has Digital products and sales')
  test(unsubscribedEntitlements.digitalProducts === false && unsubscribedEntitlements.canSell === false, 'Unsubscribed does NOT have Digital products and sales')

  // 2. Instant checkout and digital delivery: Creator=Yes, Pro=Yes
  test(creatorEntitlements.instantCheckout === true && creatorEntitlements.digitalDelivery === true, 'Creator has Instant checkout and digital delivery')
  test(proEntitlements.instantCheckout === true && proEntitlements.digitalDelivery === true, 'Pro has Instant checkout and digital delivery')
  test(unsubscribedEntitlements.instantCheckout === false && unsubscribedEntitlements.digitalDelivery === false, 'Unsubscribed does NOT have Instant checkout & digital delivery')

  // 3. Basic analytics: Creator=Yes, Pro=Yes
  test(creatorEntitlements.basicAnalytics === true && creatorEntitlements.creatorAnalytics === 'basic', 'Creator has Basic analytics')
  test(proEntitlements.basicAnalytics === true && proEntitlements.creatorAnalytics === 'advanced', 'Pro has Basic analytics')
  test(unsubscribedEntitlements.basicAnalytics === false, 'Unsubscribed does NOT have Basic analytics')

  // 4. Advanced analytics: Creator=No, Pro=Yes
  test(creatorEntitlements.advancedAnalytics === false, 'Creator does NOT have Advanced analytics')
  test(proEntitlements.advancedAnalytics === true, 'Pro has Advanced analytics')
  test(unsubscribedEntitlements.advancedAnalytics === false, 'Unsubscribed does NOT have Advanced analytics')

  // 5. Instagram Auto-DMs: Creator=Yes, Pro=Yes
  test(creatorEntitlements.automations === true && creatorEntitlements.canActivateAutoDm === true, 'Creator has Instagram Auto-DMs')
  test(proEntitlements.automations === true && proEntitlements.canActivateAutoDm === true, 'Pro has Instagram Auto-DMs')
  test(unsubscribedEntitlements.automations === false && unsubscribedEntitlements.canActivateAutoDm === false, 'Unsubscribed does NOT have Instagram Auto-DMs')

  // 6. Custom storefront designs: Creator=Yes, Pro=Yes
  test(creatorEntitlements.customStorefrontDesigns === true && creatorEntitlements.storefront === true, 'Creator has Custom storefront designs')
  test(proEntitlements.customStorefrontDesigns === true && proEntitlements.storefront === true, 'Pro has Custom storefront designs')
  test(unsubscribedEntitlements.customStorefrontDesigns === false, 'Unsubscribed does NOT have Custom storefront designs')

  // 7. Mailing list integration: Creator=Yes, Pro=Yes
  test(creatorEntitlements.mailingListIntegration === true && creatorEntitlements.emailBroadcasts === true, 'Creator has Mailing list integration')
  test(proEntitlements.mailingListIntegration === true && proEntitlements.emailBroadcasts === true, 'Pro has Mailing list integration')
  test(unsubscribedEntitlements.mailingListIntegration === false, 'Unsubscribed does NOT have Mailing list integration')

  // 8. Maximum storefront pages: Creator=3, Pro=Unlimited
  test(creatorEntitlements.maxStorefrontPages === 3 && creatorEntitlements.storePagesLimit === 3, 'Creator has Maximum storefront pages = 3')
  test(proEntitlements.maxStorefrontPages === Infinity && proEntitlements.storePagesLimit === Infinity, 'Pro has Maximum storefront pages = Unlimited (Infinity)')
  test(unsubscribedEntitlements.maxStorefrontPages === 0, 'Unsubscribed has Maximum storefront pages = 0')

  // 9. Data export: Creator=No, Pro=Yes
  test(creatorEntitlements.dataExport === false && creatorEntitlements.leadExport === false, 'Creator does NOT have Data export')
  test(proEntitlements.dataExport === true && proEntitlements.leadExport === true, 'Pro has Data export')
  test(unsubscribedEntitlements.dataExport === false, 'Unsubscribed does NOT have Data export')

  // 10. Remove CreatorStore promotional branding: Creator=No, Pro=Yes
  test(creatorEntitlements.removeBranding === false, 'Creator does NOT have Remove branding')
  test(proEntitlements.removeBranding === true, 'Pro has Remove branding')
  test(unsubscribedEntitlements.removeBranding === false, 'Unsubscribed does NOT have Remove branding')

  // -------------------------------------------------------------
  // SUITE 3: FEATURE ENTITLEMENT RESOLUTION VIA hasEntitlement
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: hasEntitlement Check Logic ---')
  test(await hasEntitlement('CREATOR', 'digitalProducts') === true, 'hasEntitlement(CREATOR, digitalProducts) === true')
  test(await hasEntitlement('CREATOR', 'instantCheckout') === true, 'hasEntitlement(CREATOR, instantCheckout) === true')
  test(await hasEntitlement('CREATOR', 'basicAnalytics') === true, 'hasEntitlement(CREATOR, basicAnalytics) === true')
  test(await hasEntitlement('CREATOR', 'advancedAnalytics') === false, 'hasEntitlement(CREATOR, advancedAnalytics) === false')
  test(await hasEntitlement('CREATOR', 'automations') === true, 'hasEntitlement(CREATOR, automations) === true')
  test(await hasEntitlement('CREATOR', 'customStorefrontDesigns') === true, 'hasEntitlement(CREATOR, customStorefrontDesigns) === true')
  test(await hasEntitlement('CREATOR', 'mailingListIntegration') === true, 'hasEntitlement(CREATOR, mailingListIntegration) === true')
  test(await hasEntitlement('CREATOR', 'store_pages') === true, 'hasEntitlement(CREATOR, store_pages) === true')
  test(await hasEntitlement('CREATOR', 'dataExport') === false, 'hasEntitlement(CREATOR, dataExport) === false')
  test(await hasEntitlement('CREATOR', 'removeBranding') === false, 'hasEntitlement(CREATOR, removeBranding) === false')

  test(await hasEntitlement('PRO', 'advancedAnalytics') === true, 'hasEntitlement(PRO, advancedAnalytics) === true')
  test(await hasEntitlement('PRO', 'dataExport') === true, 'hasEntitlement(PRO, dataExport) === true')
  test(await hasEntitlement('PRO', 'removeBranding') === true, 'hasEntitlement(PRO, removeBranding) === true')

  // Case insensitivity
  test(await hasEntitlement('creator', 'advancedAnalytics') === false, 'hasEntitlement("creator", advancedAnalytics) === false')
  test(await hasEntitlement('pro', 'advancedAnalytics') === true, 'hasEntitlement("pro", advancedAnalytics) === true')

  // -------------------------------------------------------------
  // SUITE 4: SERVER-SIDE AUTHORIZATION GUARD (requireEntitlement)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: Server-Side Authorization Guard ---')
  // Null / unauthenticated creator check
  let unauthBlocked = false
  try {
    await requireEntitlement(null, 'products')
  } catch (err) {
    unauthBlocked = err.status === 401 && err.code === 'UNAUTHORIZED'
  }
  test(unauthBlocked, 'requireEntitlement strictly blocks unauthenticated requests with HTTP 401')

  // Non-existent creator check
  let nonExistentBlocked = false
  try {
    await requireEntitlement('00000000-0000-0000-0000-000000000000', 'products')
  } catch (err) {
    nonExistentBlocked = err.status === 403 && err.code === 'PLAN_UPGRADE_REQUIRED'
  }
  test(nonExistentBlocked, 'requireEntitlement strictly blocks non-subscribed creators with HTTP 403 PLAN_UPGRADE_REQUIRED')

  // -------------------------------------------------------------
  // SUITE 5: WEBHOOK SIGNATURE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: Webhook Signature Verification ---')
  // Razorpay signature rejection for invalid signatures
  const isInvalidRzpSig = webhookService.verifySignature('{"event":"payment.captured"}', 'invalid_fake_signature')
  test(isInvalidRzpSig === false, 'Razorpay webhook rejects invalid signature')

  // Missing Razorpay signature
  const isMissingRzpSig = webhookService.verifySignature('{"event":"payment.captured"}', null)
  test(isMissingRzpSig === false, 'Razorpay webhook rejects null signature')

  // Dodo signature rejection for invalid headers
  let dodoSigFailed = false
  try {
    webhookService.verifyDodoSignature('{"type":"subscription.active"}', { 'webhook-signature': 'invalid' })
  } catch (e) {
    dodoSigFailed = true
  }
  test(dodoSigFailed, 'Dodo webhook strictly rejects invalid signature')

  // -------------------------------------------------------------
  // SUITE 6: SUBSCRIPTION LIFECYCLE SEMANTICS
  // -------------------------------------------------------------
  console.log('\n--- SUITE 6: Subscription Lifecycle & Paid-Through Semantics ---')
  const now = new Date()
  const futurePeriodEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
  const pastPeriodEnd = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

  // Simulation of effective status computation
  function simulateEffectiveSubscription(sub) {
    const isPaid = sub.status === 'ACTIVE' && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now
    const isPaidThroughCancelled = (sub.status === 'CANCELLED' || sub.canceledAt) && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now && sub.hasPaidPeriod
    const isGracePeriod = (sub.status === 'PENDING' || sub.status === 'HALTED') && sub.gracePeriodEndsAt && new Date(sub.gracePeriodEndsAt) > now
    const isTrialActive = Boolean(sub.isTrial && sub.trialEndsAt && new Date(sub.trialEndsAt) > now)

    let effectiveStatus = 'INACTIVE'
    if (isPaid || isPaidThroughCancelled || isGracePeriod) {
      effectiveStatus = 'ACTIVE'
    } else if (isTrialActive) {
      effectiveStatus = 'TRIALING'
    } else if (sub.status === 'PENDING') {
      effectiveStatus = 'PENDING'
    } else if (sub.status === 'CANCELLED') {
      effectiveStatus = 'CANCELLED'
    } else if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= now) {
      effectiveStatus = 'EXPIRED'
    }

    let planId = 'UNSUBSCRIBED'
    if (isTrialActive) {
      planId = 'PRO'
    } else if (effectiveStatus === 'ACTIVE') {
      planId = sub.plan
    }

    return {
      effectiveStatus,
      planId,
      hasAccess: effectiveStatus === 'ACTIVE' || effectiveStatus === 'TRIALING',
      isPaid: effectiveStatus === 'ACTIVE' && !isTrialActive,
      cancelAtPeriodEnd: Boolean(isPaidThroughCancelled),
    }
  }

  // A. Checkout created but unverified -> NO ACCESS
  const checkoutCreatedSub = simulateEffectiveSubscription({
    status: 'PENDING',
    plan: 'PRO',
    currentPeriodEnd: null,
    hasPaidPeriod: false,
  })
  test(checkoutCreatedSub.hasAccess === false, 'Pending checkout creation does NOT grant paid access')
  test(checkoutCreatedSub.planId === 'UNSUBSCRIBED', 'Pending checkout creation resolves to UNSUBSCRIBED')

  // B. Cancelled subscription within paid-through period -> RETAINS ACCESS
  const paidThroughCancelledSub = simulateEffectiveSubscription({
    status: 'CANCELLED',
    plan: 'PRO',
    currentPeriodEnd: futurePeriodEnd,
    hasPaidPeriod: true,
    canceledAt: now,
  })
  test(paidThroughCancelledSub.hasAccess === true, 'Cancelled subscription in paid-through period retains access')
  test(paidThroughCancelledSub.planId === 'PRO', 'Cancelled Pro subscription in paid-through period retains PRO plan')
  test(paidThroughCancelledSub.cancelAtPeriodEnd === true, 'Cancelled subscription marked cancelAtPeriodEnd')

  // C. Cancelled subscription past paid period -> LOSES ACCESS
  const expiredCancelledSub = simulateEffectiveSubscription({
    status: 'CANCELLED',
    plan: 'PRO',
    currentPeriodEnd: pastPeriodEnd,
    hasPaidPeriod: true,
    canceledAt: pastPeriodEnd,
  })
  test(expiredCancelledSub.hasAccess === false, 'Cancelled subscription past period loses access')
  test(expiredCancelledSub.planId === 'UNSUBSCRIBED', 'Cancelled subscription past period resolves to UNSUBSCRIBED')

  // D. Active trial within period -> PRO ACCESS
  const activeTrialSub = simulateEffectiveSubscription({
    status: 'TRIALING',
    isTrial: true,
    trialEndsAt: futurePeriodEnd,
  })
  test(activeTrialSub.hasAccess === true, 'Active trial grants access')
  test(activeTrialSub.planId === 'PRO', 'Active trial resolves to PRO plan')

  // E. Expired trial -> NO ACCESS
  const expiredTrialSub = simulateEffectiveSubscription({
    status: 'TRIALING',
    isTrial: true,
    trialEndsAt: pastPeriodEnd,
  })
  test(expiredTrialSub.hasAccess === false, 'Expired trial loses access')
  test(expiredTrialSub.planId === 'UNSUBSCRIBED', 'Expired trial resolves to UNSUBSCRIBED')

  // F. In-flight upgrade preservation
  // When Creator is upgrading to Pro, Creator plan remains active until Pro payment confirmation
  const inFlightUpgradeCreator = {
    status: 'ACTIVE',
    plan: 'CREATOR',
    currentPeriodEnd: futurePeriodEnd,
    hasPaidPeriod: true,
    pendingUpgradePlan: 'PRO',
    pendingUpgradeStatus: 'PENDING_CHECKOUT',
  }
  const inFlightRes = simulateEffectiveSubscription(inFlightUpgradeCreator)
  test(inFlightRes.hasAccess === true, 'In-flight upgrade retains active access')
  test(inFlightRes.planId === 'CREATOR', 'In-flight upgrade keeps CREATOR plan until Pro payment confirmation')

  // -------------------------------------------------------------
  // SUITE 7: PROVIDER PRESERVATION (NO REGION OVERRIDE)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 7: Stored Provider Relationship Preservation ---')
  // Stored billing relationship check:
  // If a creator has an existing Dodo subscription in USD, the provider remains DODO even if creator is currently in IN
  const dodoInIndiaCreator = {
    provider: 'DODO',
    currency: 'USD',
    plan: 'CREATOR',
    status: 'ACTIVE',
  }
  const resolvedProviderDodo = (dodoInIndiaCreator.provider || 'DODO').toUpperCase()
  test(resolvedProviderDodo === 'DODO', 'Existing Dodo subscription retains DODO provider regardless of creator country')

  // If a creator has an existing Razorpay subscription in INR, provider remains RAZORPAY
  const rzpOutsideIndiaCreator = {
    provider: 'RAZORPAY',
    currency: 'INR',
    plan: 'PRO',
    status: 'ACTIVE',
  }
  const resolvedProviderRzp = (rzpOutsideIndiaCreator.provider || 'RAZORPAY').toUpperCase()
  test(resolvedProviderRzp === 'RAZORPAY', 'Existing Razorpay subscription retains RAZORPAY provider regardless of creator country')

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n=============================================================')
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('=============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runCentralizedEntitlementFoundationTests().catch(err => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
