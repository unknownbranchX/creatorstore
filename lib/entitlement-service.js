/**
 * CreatorStore Centralized Subscription & Entitlement Foundation
 *
 * Universal server-side service responsible for:
 * 1. Resolving a creator's authoritative subscription independent of payment provider (Razorpay vs Dodo).
 * 2. Mapping provider-specific plan and product IDs to canonical internal plans ('creator', 'pro', 'unsubscribed').
 * 3. Enforcing verified billing state, paid-through periods, grace periods, and trial lifecycles.
 * 4. Providing robust, server-authoritative entitlement checks and guards.
 */

import { prisma } from './prisma.js'
import { usersRepo, creatorSubscriptionsRepo } from './repos.js'
import {
  PLAN_IDS,
  PLAN_FEATURES,
  normalizePlanId,
  hasEntitlement as checkPlanEntitlement,
  getPlanConfig,
} from './plans.js'
import { getBillingCatalog, PLAN_KEYS, BILLING_PROVIDERS } from './billing/config.js'
import { identifyProductPlan } from './subscription-reconciliation.js'

export const CANONICAL_PLANS = {
  CREATOR: 'CREATOR',
  PRO: 'PRO',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
}

export const INTERNAL_PLAN_KEYS = {
  CREATOR: 'creator',
  PRO: 'pro',
  UNSUBSCRIBED: 'unsubscribed',
}

/**
 * Maps any provider-specific product, price, or plan identifier to canonical internal plans:
 * - 'CREATOR' / 'creator'
 * - 'PRO' / 'pro'
 * - 'UNSUBSCRIBED' / 'unsubscribed'
 *
 * @param {string} provider - 'RAZORPAY', 'DODO', 'PAYPAL' (case-insensitive)
 * @param {string} providerPlanId - Provider's plan or product ID
 * @returns {string} Canonical plan ID: 'CREATOR', 'PRO', or 'UNSUBSCRIBED'
 */
export function mapProviderPlanToInternalPlan(provider, providerPlanId) {
  if (!providerPlanId) return CANONICAL_PLANS.UNSUBSCRIBED

  const rawId = String(providerPlanId).trim()
  const lowerId = rawId.toLowerCase()
  const normProvider = String(provider || '').toUpperCase().trim()

  // 1. Direct canonical names or common aliases
  if (lowerId === 'creator' || lowerId === 'creator_monthly' || lowerId === 'starter') {
    return CANONICAL_PLANS.CREATOR
  }
  if (lowerId === 'pro' || lowerId === 'creator_pro' || lowerId === 'max') {
    return CANONICAL_PLANS.PRO
  }
  if (lowerId === 'unsubscribed' || lowerId === 'free' || lowerId === 'none') {
    return CANONICAL_PLANS.UNSUBSCRIBED
  }

  // 2. Razorpay Plan IDs
  if (normProvider === 'RAZORPAY' || rawId.startsWith('plan_')) {
    const catalog = getBillingCatalog()
    const rzpCreatorMonthly = catalog[PLAN_KEYS.CREATOR]?.INDIA?.monthly?.planIdRazorpay
    const rzpCreatorAnnual = catalog[PLAN_KEYS.CREATOR]?.INDIA?.annual?.planIdRazorpay
    const rzpProMonthly = catalog[PLAN_KEYS.PRO]?.INDIA?.monthly?.planIdRazorpay
    const rzpProAnnual = catalog[PLAN_KEYS.PRO]?.INDIA?.annual?.planIdRazorpay

    if (rawId === rzpCreatorMonthly || rawId === rzpCreatorAnnual) return CANONICAL_PLANS.CREATOR
    if (rawId === rzpProMonthly || rawId === rzpProAnnual) return CANONICAL_PLANS.PRO

    // Fallback checks from env
    if (typeof process !== 'undefined' && process.env) {
      if (
        rawId === process.env.RAZORPAY_CREATOR_PLAN_ID ||
        rawId === process.env.RAZORPAY_STARTER_PLAN_ID ||
        rawId === process.env.RAZORPAY_CREATOR_ANNUAL_PLAN_ID ||
        rawId === process.env.RAZORPAY_CREATOR_USD_PLAN_ID
      ) {
        return CANONICAL_PLANS.CREATOR
      }
      if (
        rawId === process.env.RAZORPAY_PRO_PLAN_ID ||
        rawId === process.env.RAZORPAY_PRO_ANNUAL_PLAN_ID ||
        rawId === process.env.RAZORPAY_PRO_USD_PLAN_ID
      ) {
        return CANONICAL_PLANS.PRO
      }
    }

    if (lowerId.includes('pro')) return CANONICAL_PLANS.PRO
    if (lowerId.includes('creator') || lowerId.includes('starter')) return CANONICAL_PLANS.CREATOR

    return CANONICAL_PLANS.UNSUBSCRIBED
  }

  // 3. Dodo Payments Product IDs
  if (normProvider === 'DODO' || rawId.startsWith('pdt_') || rawId.startsWith('p_')) {
    const identified = identifyProductPlan(rawId)
    if (identified && identified.planId && identified.planId !== 'UNKNOWN') {
      return identified.planId === 'PRO' ? CANONICAL_PLANS.PRO : CANONICAL_PLANS.CREATOR
    }

    if (lowerId.includes('pro')) return CANONICAL_PLANS.PRO
    if (lowerId.includes('creator') || lowerId.includes('starter')) return CANONICAL_PLANS.CREATOR

    return CANONICAL_PLANS.UNSUBSCRIBED
  }

  // 4. PayPal Plan IDs
  if (normProvider === 'PAYPAL' || rawId.startsWith('P-')) {
    if (rawId === 'P-19001753VV158844WNLFB3ZA' || lowerId.includes('pro')) return CANONICAL_PLANS.PRO
    if (rawId === 'P-06L05256BW4479128NLFBZCA' || lowerId.includes('creator')) return CANONICAL_PLANS.CREATOR
  }

  // Generic heuristic
  if (lowerId.includes('pro')) return CANONICAL_PLANS.PRO
  if (lowerId.includes('creator') || lowerId.includes('starter')) return CANONICAL_PLANS.CREATOR

  return CANONICAL_PLANS.UNSUBSCRIBED
}

/**
 * Resolves the creator's current authoritative subscription and effective access state.
 *
 * Rules:
 * - Never trusts client-supplied plans or flags.
 * - Respects the stored provider on existing subscriptions (does NOT re-infer provider from current user country).
 * - Grants paid entitlements during paid-through periods even if cancellation was requested.
 * - Enforces grace periods for pending retries without premature revocation.
 * - Withholds paid entitlements for newly created, unverified checkouts.
 * - Preserves Creator entitlements during in-flight upgrades until Pro is confirmed.
 *
 * @param {string} userId - Creator account ID
 * @returns {Promise<object>} Effective subscription record
 */
export async function getEffectiveSubscription(userId) {
  if (!userId) {
    return createUnsubscribedRecord(null)
  }

  const user = await usersRepo.findById(userId).catch(() => null)
  if (!user) {
    return createUnsubscribedRecord(userId)
  }

  const sub = await creatorSubscriptionsRepo.getByCreator(userId).catch(() => null)
  if (!sub) {
    return createUnsubscribedRecord(userId, user)
  }

  const now = new Date()
  let effectiveStatus = sub.status || 'INACTIVE'
  const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
  const currentPeriodStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null
  const gracePeriodEndsAt = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt) : null
  const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null
  const trialStartedAt = sub.trialStartedAt ? new Date(sub.trialStartedAt) : null
  const trialStatus = sub.trialStatus || 'NOT_STARTED'

  let isTrial = false
  let isTrialExpired = false
  let inGracePeriod = false
  let isPastDue = false

  const hasPaidPeriod = Boolean(
    sub.razorpayPaymentId ||
    sub.dodoPaymentId ||
    sub.providerSubscriptionId ||
    (sub.price && Number(sub.price) > 0) ||
    (sub.amount && Number(sub.amount) > 0)
  )

  // 1. ACTIVE PAID SUBSCRIPTION
  if (sub.status === 'ACTIVE' && currentPeriodEnd && currentPeriodEnd > now) {
    effectiveStatus = 'ACTIVE'
    isTrial = false
  }
  // 2. CANCELLED / PENDING / HALTED BUT WITHIN PAID-THROUGH PERIOD
  else if (
    (sub.status === 'CANCELLED' || sub.status === 'PENDING' || sub.status === 'HALTED' || sub.canceledAt) &&
    hasPaidPeriod &&
    currentPeriodEnd &&
    currentPeriodEnd > now
  ) {
    effectiveStatus = 'ACTIVE'
    isTrial = false
    isPastDue = sub.status === 'PENDING' || sub.status === 'HALTED'
  }
  // 3. GRACE PERIOD FOR RECURRING RETRIES
  else if (
    (sub.status === 'PENDING' || sub.status === 'HALTED') &&
    gracePeriodEndsAt &&
    gracePeriodEndsAt > now
  ) {
    effectiveStatus = 'ACTIVE'
    isTrial = false
    inGracePeriod = true
    isPastDue = true
  }
  // 4. EXPIRED / HALTED / CANCELLED PAST PAID PERIOD
  else if (sub.status === 'ACTIVE' && currentPeriodEnd && now >= currentPeriodEnd) {
    effectiveStatus = 'EXPIRED'
    isTrial = false
  } else if (sub.status === 'HALTED') {
    effectiveStatus = 'HALTED'
    isTrial = false
  } else if (sub.status === 'CANCELLED') {
    effectiveStatus = 'CANCELLED'
    isTrial = false
  }
  // 5. TRIAL EVALUATION
  else if (trialStartedAt || trialStatus === 'ACTIVE' || sub.status === 'TRIALING') {
    if (trialEndsAt && now >= trialEndsAt) {
      effectiveStatus = 'EXPIRED'
      isTrial = false
      isTrialExpired = true
    } else if (trialEndsAt && now < trialEndsAt && (trialStatus === 'ACTIVE' || sub.status === 'TRIALING')) {
      effectiveStatus = 'TRIALING'
      isTrial = true
      isTrialExpired = false
    } else {
      effectiveStatus = 'INACTIVE'
      isTrial = false
    }
  }
  // 6. NEW UNVERIFIED PENDING CHECKOUT OR INACTIVE
  else {
    if (sub.status === 'PENDING') {
      effectiveStatus = 'PENDING'
    } else {
      effectiveStatus = 'INACTIVE'
    }
    isTrial = false
  }

  // Determine canonical plan
  let planId = CANONICAL_PLANS.UNSUBSCRIBED
  if (isTrial) {
    planId = CANONICAL_PLANS.PRO
  } else if (effectiveStatus === 'ACTIVE') {
    planId = mapProviderPlanToInternalPlan(sub.provider, sub.plan)
    if (planId === CANONICAL_PLANS.UNSUBSCRIBED) {
      planId = normalizePlanId(sub.plan, 'ACTIVE')
    }
  } else {
    planId = CANONICAL_PLANS.UNSUBSCRIBED
  }

  const isAnnual = String(sub.billingInterval || sub.billingCycle || '').toUpperCase().trim() === 'ANNUAL'
  const billingInterval = isAnnual ? 'ANNUAL' : 'MONTHLY'
  const subCurrency = (sub.currency || 'USD').toUpperCase()

  // Entitlements from central plan definition
  const planConfig = getPlanConfig(planId, isTrial ? 'TRIALING' : effectiveStatus, isAnnual ? 'annual' : 'monthly', subCurrency)

  // Stored provider preservation: always use stored provider for existing records
  const provider = (sub.provider || 'DODO').toUpperCase()

  return {
    userId,
    creatorId: userId,
    planId,
    internalPlan: planId.toLowerCase(),
    status: effectiveStatus,
    rawStatus: sub.status || 'INACTIVE',
    provider,
    providerSubscriptionId: sub.providerSubscriptionId || sub.dodoSubscriptionId || sub.razorpayOrderId || null,
    dodoSubscriptionId: sub.dodoSubscriptionId || (provider === 'DODO' ? sub.providerSubscriptionId : null),
    razorpaySubscriptionId: sub.razorpayOrderId || (provider === 'RAZORPAY' ? sub.providerSubscriptionId : null),
    currency: subCurrency,
    amount: Number(sub.amount || sub.price || planConfig.price || 0),
    billingInterval,
    isAnnual,
    currentPeriodStart: currentPeriodStart ? currentPeriodStart.toISOString() : null,
    currentPeriodEnd: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
    canceledAt: sub.canceledAt ? new Date(sub.canceledAt).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd || sub.status === 'CANCELLED' || sub.canceledAt),
    trialStatus,
    trialStartedAt: trialStartedAt ? trialStartedAt.toISOString() : null,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    isTrial,
    isTrialExpired,
    inGracePeriod,
    isPastDue,
    isPaid: effectiveStatus === 'ACTIVE' && !isTrial,
    hasAccess: effectiveStatus === 'ACTIVE' || effectiveStatus === 'TRIALING',
    pendingUpgrade: sub.pendingUpgradePlan ? {
      targetPlan: sub.pendingUpgradePlan,
      status: sub.pendingUpgradeStatus,
      paymentId: sub.pendingUpgradePaymentId,
    } : null,
    entitlements: planConfig.entitlements,
  }
}

function createUnsubscribedRecord(userId, user = null) {
  const unsubscribedConfig = PLAN_FEATURES.UNSUBSCRIBED
  return {
    userId,
    creatorId: userId,
    planId: CANONICAL_PLANS.UNSUBSCRIBED,
    internalPlan: INTERNAL_PLAN_KEYS.UNSUBSCRIBED,
    status: 'INACTIVE',
    rawStatus: 'INACTIVE',
    provider: null,
    providerSubscriptionId: null,
    dodoSubscriptionId: null,
    razorpaySubscriptionId: null,
    currency: 'USD',
    amount: 0,
    billingInterval: 'MONTHLY',
    isAnnual: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    trialStatus: 'NOT_STARTED',
    trialStartedAt: null,
    trialEndsAt: null,
    isTrial: false,
    isTrialExpired: false,
    inGracePeriod: false,
    isPastDue: false,
    isPaid: false,
    hasAccess: false,
    pendingUpgrade: null,
    entitlements: unsubscribedConfig.entitlements,
  }
}

/**
 * Returns canonical entitlements dictionary for a plan or user ID.
 *
 * @param {string} userIdOrPlan - Plan name ('creator', 'pro') or Creator User ID
 * @returns {Promise<object>|object} Entitlements map
 */
export async function getPlanEntitlements(userIdOrPlan) {
  if (!userIdOrPlan) return PLAN_FEATURES.UNSUBSCRIBED.entitlements

  const str = String(userIdOrPlan).trim()
  const upper = str.toUpperCase()

  if (upper === 'CREATOR' || upper === 'PRO' || upper === 'UNSUBSCRIBED') {
    return PLAN_FEATURES[upper].entitlements
  }

  // Otherwise assume userId
  const sub = await getEffectiveSubscription(str)
  return sub.entitlements
}

/**
 * Checks whether a creator or plan is entitled to a specific feature.
 *
 * @param {string} userIdOrPlan - Plan identifier ('CREATOR', 'PRO') or User ID
 * @param {string} featureKey - Canonical feature key
 * @returns {Promise<boolean>|boolean}
 */
export async function hasEntitlement(userIdOrPlan, featureKey) {
  if (!userIdOrPlan || !featureKey) return false

  const str = String(userIdOrPlan).trim()
  const upper = str.toUpperCase()

  if (upper === 'CREATOR' || upper === 'PRO' || upper === 'UNSUBSCRIBED') {
    return checkPlanEntitlement(upper, featureKey, 'ACTIVE')
  }

  // Treat as user ID
  const sub = await getEffectiveSubscription(str)
  if (!sub || !sub.hasAccess) return false

  return checkPlanEntitlement(sub.planId, featureKey, sub.isTrial ? 'TRIALING' : sub.status)
}

/**
 * Server-side entitlement assertion guard. Throws HTTP 403 error if creator lacks entitlement.
 *
 * @param {string} userId - Creator account ID
 * @param {string} featureKey - Feature being accessed
 * @returns {Promise<{allowed: boolean, subscription: object}>}
 */
export async function requireEntitlement(userId, featureKey = 'mutation') {
  if (!userId) {
    const err = new Error('Authentication required')
    err.status = 401
    err.statusCode = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }

  const sub = await getEffectiveSubscription(userId)

  if (!sub.hasAccess) {
    const err = new Error('An active paid subscription or trial is required to access this feature.')
    err.status = 403
    err.statusCode = 403
    err.code = 'PLAN_UPGRADE_REQUIRED'
    err.planId = sub.planId
    err.trialStatus = sub.trialStatus
    throw err
  }

  if (featureKey && featureKey !== 'mutation' && featureKey !== 'read' && featureKey !== 'any') {
    const allowed = checkPlanEntitlement(sub.planId, featureKey, sub.isTrial ? 'TRIALING' : sub.status)
    if (!allowed) {
      let msg = 'Upgrade your plan to unlock this feature.'
      if (featureKey === 'removeBranding') {
        msg = 'An active Pro subscription is required to remove CreatorStore footer branding.'
      } else if (featureKey === 'advancedAnalytics') {
        msg = 'An active Pro subscription is required to view advanced analytics.'
      } else if (featureKey === 'dataExport') {
        msg = 'An active Pro subscription is required to export store data.'
      }

      const err = new Error(msg)
      err.status = 403
      err.statusCode = 403
      err.code = 'PLAN_UPGRADE_REQUIRED'
      err.planId = sub.planId
      err.feature = featureKey
      throw err
    }
  }

  return { allowed: true, subscription: sub }
}

export const entitlementService = {
  CANONICAL_PLANS,
  INTERNAL_PLAN_KEYS,
  mapProviderPlanToInternalPlan,
  getEffectiveSubscription,
  getPlanEntitlements,
  hasEntitlement,
  requireEntitlement,
}
