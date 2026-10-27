import { prisma } from './prisma.js'
import { getPaymentProvider } from './payments.js'
import {
  creatorSubscriptionsRepo,
  subscriptionInvoicesRepo,
  subscriptionAuditLogsRepo,
  usersRepo,
} from './repos.js'
import { withPaymentLock, withBoundedBackoff } from './payment-lifecycle.js'
import { getEmailService } from './email.js'
import { identifyProductPlan } from './subscription-reconciliation.js'
import { mapProviderPlanToInternalPlan } from './entitlement-service.js'

/**
 * Returns configurable timeout for initial subscription checkout abandonment (minutes).
 * Default: 30 minutes.
 */
export function getRazorpayPendingSubscriptionTimeoutMinutes() {
  const val = process.env.RAZORPAY_PENDING_SUBSCRIPTION_TIMEOUT_MINUTES
  if (val) {
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return 30
}

/**
 * Returns configurable grace period for failed recurring subscriptions (days).
 * Default: 3 days.
 */
export function getRazorpayGracePeriodDays() {
  const val = process.env.RAZORPAY_SUBSCRIPTION_GRACE_PERIOD_DAYS
  if (val) {
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed >= 0) return parsed
  }
  return 3
}

/**
 * Production-ready Razorpay Subscription Lifecycle & Failure Handling Service
 */
export const razorpaySubscriptionLifecycleService = {
  /**
   * Automatically identify and cancel abandoned initial checkouts (status: 'created' awaiting authorization).
   * Runs via scheduled cron every 15-30 minutes.
   */
  async cleanupAbandonedInitialCheckouts({ timeoutMinutes } = {}) {
    const effectiveTimeoutMinutes = timeoutMinutes || getRazorpayPendingSubscriptionTimeoutMinutes()
    const cutoffDate = new Date(Date.now() - effectiveTimeoutMinutes * 60 * 1000)

    console.log(`[Razorpay Lifecycle] Scanning for abandoned initial checkouts older than ${effectiveTimeoutMinutes}m (Cutoff: ${cutoffDate.toISOString()})...`)

    return await withPaymentLock('razorpay_abandoned_subscription_cleanup', async () => {
      const candidates = await creatorSubscriptionsRepo.findPendingRazorpaySubscriptions(cutoffDate)
      console.log(`[Razorpay Lifecycle] Found ${candidates.length} candidate pending Razorpay subscriptions.`)

      const summary = {
        scanned: candidates.length,
        cancelled: 0,
        cancelledCount: 0,
        reconciledActive: 0,
        skipped: 0,
        errors: [],
      }

      const rzpProvider = getPaymentProvider()

      for (const sub of candidates) {
        const creatorId = sub.creatorId
        const subscriptionId = sub.providerSubscriptionId || sub.razorpayOrderId

        if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
          summary.skipped++
          continue
        }

        try {
          // 1. Re-verify current local database state before acting
          const currentSub = await creatorSubscriptionsRepo.getByCreator(creatorId)
          if (!currentSub || (currentSub.status !== 'PENDING' && currentSub.status !== 'CREATED')) {
            summary.skipped++
            continue
          }

          // 2. Fetch authoritative status directly from Razorpay with bounded backoff
          let rzpSub = null
          try {
            rzpSub = await withBoundedBackoff(async () => {
              return await rzpProvider.fetchSubscription(subscriptionId)
            }, { maxAttempts: 3, initialDelay: 300 })
          } catch (fetchErr) {
            console.warn(`[Razorpay Lifecycle] Failed to fetch subscription ${subscriptionId} for creator ${creatorId}:`, fetchErr.message)
            summary.errors.push({ subscriptionId, creatorId, error: fetchErr.message })
            // Preserve pending state on transient API error, retry in next run
            continue
          }

          if (!rzpSub) {
            summary.skipped++
            continue
          }

          const rzpStatus = String(rzpSub.status || '').toLowerCase()
          console.log(`[Razorpay Lifecycle] Evaluated ${subscriptionId} (Creator: ${creatorId}) -> Razorpay Status: ${rzpStatus}`)

          // A. PROGRESSION CHECK: If subscription became active, authenticated, or charged, DO NOT CANCEL!
          if (rzpStatus === 'active' || rzpStatus === 'authenticated') {
            console.log(`[Razorpay Lifecycle] Subscription ${subscriptionId} progressed to ${rzpStatus}. Reconciling to ACTIVE instead of cancelling.`)
            const currentPeriodEnd = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            const currentPeriodStart = rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : new Date()

            await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
              authStatus: 'ACTIVE',
              lastVerifiedAt: new Date(),
              currentPeriodStart,
              currentPeriodEnd,
              retryCount: 0,
            })

            await subscriptionAuditLogsRepo.record(creatorId, 'SUBSCRIPTION_RECONCILED_ACTIVE_ON_CLEANUP', {
              provider: 'RAZORPAY',
              providerSubscriptionId: subscriptionId,
              razorpayStatus: rzpStatus,
            }).catch(() => {})

            summary.reconciledActive++
            continue
          }

          // B. CONFIRMED ABANDONED (status === 'created' awaiting authorization beyond timeout)
          if (rzpStatus === 'created') {
            console.log(`[Razorpay Lifecycle] Cancelling abandoned created subscription ${subscriptionId} for creator ${creatorId}...`)
            
            // Immediate cancellation on Razorpay (cancel_at_cycle_end: 0)
            await withBoundedBackoff(async () => {
              return await rzpProvider.cancelSubscription(subscriptionId, false)
            }, { maxAttempts: 3, initialDelay: 500 })

            await creatorSubscriptionsRepo.updateStatus(creatorId, 'CANCELLED', {
              authStatus: 'CANCELLED',
              cancellationReason: 'ABANDONED_CHECKOUT_TIMEOUT',
              canceledAt: new Date(),
              lastVerifiedAt: new Date(),
              cancellationDetails: {
                timeoutMinutes: effectiveTimeoutMinutes,
                cancelledBy: 'LIFECYCLE_CLEANUP_JOB',
                razorpayStatusAtCancellation: 'created',
              },
            })

            await subscriptionAuditLogsRepo.record(creatorId, 'ABANDONED_SUBSCRIPTION_CANCELLED', {
              provider: 'RAZORPAY',
              providerSubscriptionId: subscriptionId,
              reason: 'ABANDONED_CHECKOUT_TIMEOUT',
              timeoutMinutes: effectiveTimeoutMinutes,
            }).catch(() => {})

            summary.cancelled++
            continue
          }

          // C. Already cancelled on Razorpay
          if (rzpStatus === 'cancelled') {
            await creatorSubscriptionsRepo.updateStatus(creatorId, 'CANCELLED', {
              authStatus: 'CANCELLED',
              cancellationReason: 'ALREADY_CANCELLED_ON_RAZORPAY',
              canceledAt: rzpSub.ended_at ? new Date(rzpSub.ended_at * 1000) : new Date(),
              lastVerifiedAt: new Date(),
            })
            summary.cancelled++
            continue
          }

          // D. Other states (e.g. pending/halted recurring payments) -> Not abandoned initial checkouts!
          summary.skipped++
        } catch (err) {
          console.error(`[Razorpay Lifecycle] Error processing candidate subscription ${subscriptionId}:`, err.message || err)
          summary.errors.push({ subscriptionId, creatorId, error: err.message })
        }
      }

      summary.cancelledCount = summary.cancelled
      console.log(`[Razorpay Lifecycle] Cleanup finished: ${summary.cancelled} cancelled, ${summary.reconciledActive} reconciled active, ${summary.skipped} skipped, ${summary.errors.length} errors.`)
      return summary
    })
  },

  /**
   * Process Razorpay Webhook Event with full lifecycle state transitions & out-of-order safety.
   */
  async processWebhookEvent(event) {
    const eventType = event.event || event.type
    const eventId = event.event_id || event.id || `evt_${Date.now()}`
    const payload = event.payload || {}
    const subEntity = payload.subscription?.entity
    const paymentEntity = payload.payment?.entity
    const invoiceEntity = payload.invoice?.entity

    const subscriptionId = subEntity?.id || paymentEntity?.subscription_id || invoiceEntity?.subscription_id
    const paymentId = paymentEntity?.id || invoiceEntity?.payment_id
    const invoiceId = invoiceEntity?.id || paymentEntity?.invoice_id
    const creatorIdFromNotes = subEntity?.notes?.creatorId || paymentEntity?.notes?.creatorId || invoiceEntity?.notes?.creatorId

    console.log(`[Razorpay Webhook] Handling ${eventType} (Sub: ${subscriptionId}, Payment: ${paymentId}, Invoice: ${invoiceId})`)

    if (!subscriptionId && !creatorIdFromNotes) {
      return { ok: true, ignored: true, reason: 'missing_subscription_identifiers' }
    }

    let sub = null
    if (subscriptionId) {
      sub = await creatorSubscriptionsRepo.getByRazorpaySubscriptionId(subscriptionId)
    }
    if (!sub && creatorIdFromNotes) {
      sub = await creatorSubscriptionsRepo.getByCreator(creatorIdFromNotes)
    }

    const creatorId = sub?.creatorId || creatorIdFromNotes
    if (!creatorId) {
      console.warn(`[Razorpay Webhook] No matching creator found for subscription ${subscriptionId}`)
      return { ok: true, ignored: true, reason: 'creator_not_found' }
    }

    // Secondary / Older subscription check:
    // If this event is for an old/different subscription and the user has a distinct ACTIVE subscription, do NOT alter the active subscription!
    const activeSubId = sub?.providerSubscriptionId || sub?.razorpayOrderId
    const isPendingUpgrade = Boolean(
      (sub?.pendingUpgradePaymentId && sub.pendingUpgradePaymentId === subscriptionId) ||
      (sub?.pendingUpgradePlan === 'PRO' && subscriptionId && subscriptionId !== activeSubId) ||
      (sub?.plan === 'CREATOR' && subEntity?.plan_id && (identifyProductPlan(subEntity.plan_id).planId === 'PRO' || String(subEntity.plan_id).toLowerCase().includes('pro')))
    )

    if (activeSubId && subscriptionId && activeSubId !== subscriptionId && sub.status === 'ACTIVE' && !isPendingUpgrade) {
      if (eventType === 'subscription.cancelled' && sub.plan === 'PRO') {
        console.log(`[Razorpay Webhook] Cancellation event for superseded subscription ${subscriptionId} received. Active Pro plan ${activeSubId} remains active.`)
        await subscriptionAuditLogsRepo.record(creatorId, 'PREVIOUS_SUBSCRIPTION_CANCELLED_ON_UPGRADE', {
          provider: 'RAZORPAY',
          cancelledSubscriptionId: subscriptionId,
          activeSubscriptionId: activeSubId,
          reason: 'plan_upgraded',
          eventId,
        }).catch(() => {})
        return { ok: true, status: 'SUPERSEDED_CANCELLED', ignored: true }
      }

      console.log(`[Razorpay Webhook] Event for older subscription ${subscriptionId} ignored because active subscription is ${activeSubId}`)
      await subscriptionAuditLogsRepo.record(creatorId, 'SECONDARY_SUBSCRIPTION_EVENT_IGNORED', {
        provider: 'RAZORPAY',
        incomingSubscriptionId: subscriptionId,
        activeSubscriptionId: activeSubId,
        eventType,
      }).catch(() => {})
      return { ok: true, ignored: true, reason: 'secondary_subscription_ignored' }
    }

    const now = new Date()
    const gracePeriodDays = getRazorpayGracePeriodDays()

    // ---------------- 1. SUBSCRIPTION.AUTHENTICATED ----------------
    if (eventType === 'subscription.authenticated') {
      console.log(`[Razorpay Webhook] Subscription mandate authenticated for creator ${creatorId}`)
      await creatorSubscriptionsRepo.updateStatus(creatorId, sub?.status || 'PENDING', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId || sub?.providerSubscriptionId,
        authStatus: 'AUTHENTICATED',
        lastVerifiedAt: now,
      })
      await subscriptionAuditLogsRepo.record(creatorId, 'RAZORPAY_SUBSCRIPTION_AUTHENTICATED', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId,
        eventId,
      }).catch(() => {})
      return { ok: true, status: 'AUTHENTICATED' }
    }

    // ---------------- 2. SUBSCRIPTION.ACTIVATED / SUBSCRIPTION.CHARGED ----------------
    if (eventType === 'subscription.activated' || eventType === 'subscription.charged') {
      const isAnnual = String(sub?.billingInterval || '').toUpperCase() === 'ANNUAL' || subEntity?.period === 'yearly'
      const durationDays = isAnnual ? 365 : 30
      const currentStart = subEntity?.current_start ? new Date(subEntity.current_start * 1000) : now
      const currentEnd = subEntity?.current_end ? new Date(subEntity.current_end * 1000) : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)

      const chargeAmount = paymentEntity?.amount ? (paymentEntity.amount / 100) : (sub?.amount || 0)

      // Resolve plan via canonical plan mapping
      let resolvedPlan = subEntity?.plan_id ? mapProviderPlanToInternalPlan('RAZORPAY', subEntity.plan_id) : null
      if (!resolvedPlan || resolvedPlan === 'UNSUBSCRIBED') {
        resolvedPlan = sub?.plan || 'PRO'
      }

      // Detect upgrade to Pro
      const isUpgrade = Boolean(
        isPendingUpgrade ||
        (sub?.pendingUpgradePlan === 'PRO') ||
        (sub?.plan === 'CREATOR' && resolvedPlan === 'PRO') ||
        (sub?.plan === 'CREATOR' && subscriptionId && subscriptionId !== activeSubId)
      )
      const targetPlan = isUpgrade ? 'PRO' : resolvedPlan
      const oldCreatorSubId = isUpgrade ? (activeSubId && activeSubId !== subscriptionId ? activeSubId : null) : null

      // OUT-OF-ORDER & DELAYED EVENT PROTECTION:
      // A delayed or stale event must never incorrectly downgrade an ACTIVE Pro subscriber.
      if (sub && sub.status === 'ACTIVE' && sub.plan === 'PRO' && targetPlan === 'CREATOR') {
        const isScheduledDowngradeDue = sub.scheduledPlan === 'CREATOR' && sub.scheduledChangeAt && now >= new Date(sub.scheduledChangeAt)
        if (!isScheduledDowngradeDue) {
          console.warn(`[Razorpay Webhook] Out-of-order or stale CREATOR event (${subscriptionId}) rejected: Pro plan is ACTIVE and no scheduled downgrade is due for creator ${creatorId}.`)
          await subscriptionAuditLogsRepo.record(creatorId, 'OUT_OF_ORDER_WEBHOOK_REJECTED', {
            provider: 'RAZORPAY',
            eventId,
            eventType,
            currentPlan: sub.plan,
            attemptedPlan: targetPlan,
            providerSubscriptionId: subscriptionId,
          }).catch(() => {})
          return { ok: true, ignored: true, reason: 'out_of_order_downgrade_rejected' }
        }
      }

      // Record / update invoice record
      if (invoiceId) {
        await subscriptionInvoicesRepo.recordInvoice({
          creatorId,
          subscriptionId,
          razorpayInvoiceId: invoiceId,
          razorpayPaymentId: paymentId || null,
          amount: chargeAmount,
          currency: paymentEntity?.currency || 'INR',
          status: 'PAID',
          billingStart: currentStart,
          billingEnd: currentEnd,
          paidAt: now,
          recoveryStatus: 'RECOVERED',
        })
      }

      const wasInFailure = sub?.status === 'PENDING' && (sub?.authStatus === 'PENDING_RETRY' || sub?.authStatus === 'HALTED' || sub?.lastPaymentFailureReason)
      const wasHalted = sub?.status === 'HALTED' || sub?.authStatus === 'HALTED'

      await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId || sub?.providerSubscriptionId,
        razorpayPaymentId: paymentId || sub?.razorpayPaymentId,
        razorpayOrderId: subscriptionId || sub?.razorpayOrderId,
        authStatus: 'ACTIVE',
        plan: targetPlan,
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        gracePeriodEndsAt: null,
        retryCount: 0,
        lastPaymentFailureReason: null,
        lastInvoiceId: invoiceId || sub?.lastInvoiceId,
        lastInvoiceStatus: 'PAID',
        lastVerifiedAt: now,
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

      // If this was an upgrade, cancel previous Creator subscription on Razorpay API
      if (isUpgrade && oldCreatorSubId) {
        const rzpProvider = getPaymentProvider()
        try {
          console.log(`[Razorpay Upgrade Webhook] Cancelling old Creator subscription ${oldCreatorSubId} on Razorpay...`)
          await rzpProvider.cancelSubscription(oldCreatorSubId, false)
          await subscriptionAuditLogsRepo.record(creatorId, 'SUPERSEDED_SUBSCRIPTION_CANCELLED', {
            provider: 'RAZORPAY',
            oldSubscriptionId: oldCreatorSubId,
            newSubscriptionId: subscriptionId,
            reason: 'plan_upgraded',
            fromPlan: 'CREATOR',
            toPlan: 'PRO',
            eventId,
          }).catch(() => {})
        } catch (cancelErr) {
          console.warn(`[Razorpay Upgrade Webhook] Failed to cancel previous subscription ${oldCreatorSubId}:`, cancelErr.message)
          await subscriptionAuditLogsRepo.record(creatorId, 'UPGRADE_OLD_SUBSCRIPTION_CANCEL_FAILED', {
            provider: 'RAZORPAY',
            oldSubscriptionId: oldCreatorSubId,
            newSubscriptionId: subscriptionId,
            error: cancelErr.message,
            eventId,
          }).catch(() => {})
        }
      }

      await subscriptionAuditLogsRepo.record(creatorId, isUpgrade ? 'PLAN_UPGRADE_COMPLETED' : `RAZORPAY_${eventType.toUpperCase().replace('.', '_')}`, {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId,
        paymentId,
        invoiceId,
        amount: chargeAmount,
        eventId,
        isUpgrade,
        previousSubscriptionId: oldCreatorSubId,
      }).catch(() => {})

      // Send celebration / recovery notification email
      if (isUpgrade) {
        try {
          const user = await usersRepo.findById(creatorId).catch(() => null)
          if (user?.email) {
            const emailService = getEmailService()
            await emailService.sendSubscriptionStatusEmail({
              to: user.email,
              creatorName: user.name || 'Creator',
              planName: 'Pro Plan',
              status: 'ACTIVE (Upgraded)',
              priceDisplay: `₹${chargeAmount}`,
              currentPeriodEnd: currentEnd.toLocaleDateString(),
              message: "Congratulations! You've upgraded to the Pro Plan. Your Pro benefits are now active.",
            }).catch(() => {})
          }
        } catch (emailErr) {}
      } else if (wasInFailure || wasHalted) {
        try {
          const user = await usersRepo.findById(creatorId).catch(() => null)
          if (user?.email) {
            const emailService = getEmailService()
            await emailService.sendSubscriptionStatusEmail({
              to: user.email,
              creatorName: user.name || 'Creator',
              planName: sub?.plan === 'CREATOR' ? 'Creator Plan' : 'Pro Plan',
              status: 'ACTIVE (Payment Recovered)',
              priceDisplay: `₹${chargeAmount}`,
              currentPeriodEnd: currentEnd.toLocaleDateString(),
            }).catch(() => {})
          }
        } catch (emailErr) {}
      }

      return { ok: true, status: 'ACTIVE', isUpgrade, recovered: Boolean(wasInFailure || wasHalted) }
    }

    // ---------------- 3. SUBSCRIPTION.PENDING (Failed recurring payment in retry mode) ----------------
    if (eventType === 'subscription.pending') {
      const incomingCurrentEnd = subEntity?.current_end ? new Date(subEntity.current_end * 1000) : null
      if (sub?.status === 'ACTIVE' && sub?.currentPeriodEnd && incomingCurrentEnd && (new Date(sub.currentPeriodEnd).getTime() - incomingCurrentEnd.getTime() > 60 * 1000)) {
        console.log(`[Razorpay Webhook] Stale subscription.pending event for older billing cycle ignored for active subscription ${subscriptionId}`)
        return { ok: true, ignored: true, reason: 'stale_pending_event_ignored' }
      }

      const failureReason = paymentEntity?.error_description || paymentEntity?.error_reason || 'Recurring payment declined. Razorpay is retrying.'
      console.warn(`[Razorpay Webhook] Subscription ${subscriptionId} moved to PENDING retry mode. Reason: ${failureReason}`)

      // Calculate grace period end (from currentPeriodEnd + gracePeriodDays)
      const currentPeriodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now
      const gracePeriodEndsAt = new Date(Math.max(now.getTime(), currentPeriodEnd.getTime()) + gracePeriodDays * 24 * 60 * 60 * 1000)

      if (invoiceId) {
        await subscriptionInvoicesRepo.recordInvoice({
          creatorId,
          subscriptionId,
          razorpayInvoiceId: invoiceId,
          razorpayPaymentId: paymentId || null,
          amount: paymentEntity?.amount ? (paymentEntity.amount / 100) : sub?.amount,
          currency: paymentEntity?.currency || 'INR',
          status: 'PENDING',
          billingStart: sub?.currentPeriodStart,
          billingEnd: currentPeriodEnd,
          failureReason,
          recoveryStatus: 'RETRY_PENDING',
        })
      }

      await creatorSubscriptionsRepo.updateStatus(creatorId, 'PENDING', {
        authStatus: 'PENDING_RETRY',
        lastPaymentFailureReason: failureReason,
        lastPaymentFailureAt: now,
        gracePeriodEndsAt,
        retryCount: (sub?.retryCount || 0) + 1,
        lastInvoiceId: invoiceId || sub?.lastInvoiceId,
        lastInvoiceStatus: 'PENDING_RETRY',
        lastVerifiedAt: now,
      })

      await subscriptionAuditLogsRepo.record(creatorId, 'RAZORPAY_SUBSCRIPTION_PENDING_RETRY', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId,
        failureReason,
        gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
        eventId,
      }).catch(() => {})

      // Send payment failure warning email to customer with recovery action
      try {
        const user = await usersRepo.findById(creatorId).catch(() => null)
        if (user?.email) {
          const emailService = getEmailService()
          await emailService.sendPaymentFailureEmail({
            to: user.email,
            customerName: user.name || 'Creator',
            productTitle: `${sub?.plan === 'CREATOR' ? 'Creator' : 'Pro'} Plan Subscription`,
            reason: `${failureReason}. Automatic retry is underway. Please ensure sufficient funds are available.`,
            retryUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings/billing`,
          })
        }
      } catch (emailErr) {
        console.warn('[Razorpay Webhook] Failure warning email notice warning:', emailErr.message)
      }

      return { ok: true, status: 'PENDING', inGracePeriod: true, gracePeriodEndsAt }
    }

    // ---------------- 4. SUBSCRIPTION.HALTED (Max retries exhausted) ----------------
    if (eventType === 'subscription.halted') {
      const incomingCurrentEnd = subEntity?.current_end ? new Date(subEntity.current_end * 1000) : null
      if (sub?.status === 'ACTIVE' && sub?.currentPeriodEnd && incomingCurrentEnd && (new Date(sub.currentPeriodEnd).getTime() - incomingCurrentEnd.getTime() > 60 * 1000)) {
        console.log(`[Razorpay Webhook] Stale subscription.halted event ignored for active subscription ${subscriptionId}`)
        return { ok: true, ignored: true, reason: 'stale_halted_event_ignored' }
      }
      const haltReason = paymentEntity?.error_description || 'Payment retries exhausted. Subscription auto-charging has been halted.'
      console.warn(`[Razorpay Webhook] Subscription ${subscriptionId} HALTED for creator ${creatorId}`)

      const currentPeriodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now
      // Under halted, if grace period hasn't already been set, compute from current period end
      const existingGraceEnd = sub?.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt) : null
      const gracePeriodEndsAt = existingGraceEnd || new Date(Math.max(now.getTime(), currentPeriodEnd.getTime()) + gracePeriodDays * 24 * 60 * 60 * 1000)

      if (invoiceId) {
        await subscriptionInvoicesRepo.recordInvoice({
          creatorId,
          subscriptionId,
          razorpayInvoiceId: invoiceId,
          razorpayPaymentId: paymentId || null,
          amount: paymentEntity?.amount ? (paymentEntity.amount / 100) : sub?.amount,
          currency: paymentEntity?.currency || 'INR',
          status: 'HALTED',
          billingStart: sub?.currentPeriodStart,
          billingEnd: currentPeriodEnd,
          failureReason: haltReason,
          recoveryStatus: 'MANUAL_REQUIRED',
        })
      }

      await creatorSubscriptionsRepo.updateStatus(creatorId, 'HALTED', {
        authStatus: 'HALTED',
        lastPaymentFailureReason: haltReason,
        lastPaymentFailureAt: now,
        gracePeriodEndsAt,
        lastInvoiceId: invoiceId || sub?.lastInvoiceId,
        lastInvoiceStatus: 'HALTED',
        lastVerifiedAt: now,
      })

      await subscriptionAuditLogsRepo.record(creatorId, 'RAZORPAY_SUBSCRIPTION_HALTED', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId,
        haltReason,
        eventId,
      }).catch(() => {})

      // Send critical halted notification email to customer
      try {
        const user = await usersRepo.findById(creatorId).catch(() => null)
        if (user?.email) {
          const emailService = getEmailService()
          await emailService.sendPaymentFailureEmail({
            to: user.email,
            customerName: user.name || 'Creator',
            productTitle: `${sub?.plan === 'CREATOR' ? 'Creator' : 'Pro'} Plan Subscription`,
            reason: 'Payment retries were exhausted and automatic recurring charges have stopped. Action is required to keep your store active.',
            retryUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings/billing`,
          })
        }
      } catch (emailErr) {
        console.warn('[Razorpay Webhook] Halted email notice warning:', emailErr.message)
      }

      return { ok: true, status: 'HALTED' }
    }

    // ---------------- 5. SUBSCRIPTION.CANCELLED ----------------
    if (eventType === 'subscription.cancelled') {
      const canceledAt = subEntity?.ended_at ? new Date(subEntity.ended_at * 1000) : now
      console.log(`[Razorpay Webhook] Subscription ${subscriptionId} cancelled for creator ${creatorId}`)

      // If user is currently on an active Pro plan and this cancellation event is for the older/superseded Creator subscription:
      if (sub?.plan === 'PRO' && sub?.status === 'ACTIVE' && sub?.providerSubscriptionId && sub.providerSubscriptionId !== subscriptionId) {
        console.log(`[Razorpay Webhook] Superseded subscription ${subscriptionId} cancelled on Razorpay. Active Pro subscription ${sub.providerSubscriptionId} remains active.`)
        await subscriptionAuditLogsRepo.record(creatorId, 'PREVIOUS_SUBSCRIPTION_CANCELLED_ON_UPGRADE', {
          provider: 'RAZORPAY',
          cancelledSubscriptionId: subscriptionId,
          activeSubscriptionId: sub.providerSubscriptionId,
          reason: 'plan_upgraded',
          eventId,
        }).catch(() => {})
        return { ok: true, status: 'SUPERSEDED_CANCELLED', ignored: true }
      }

      await creatorSubscriptionsRepo.updateStatus(creatorId, 'CANCELLED', {
        authStatus: 'CANCELLED',
        cancellationReason: sub?.cancellationReason || 'CANCELLED_ON_RAZORPAY',
        canceledAt,
        lastVerifiedAt: now,
      })

      await subscriptionAuditLogsRepo.record(creatorId, 'RAZORPAY_SUBSCRIPTION_CANCELLED', {
        provider: 'RAZORPAY',
        providerSubscriptionId: subscriptionId,
        canceledAt: canceledAt.toISOString(),
        eventId,
      }).catch(() => {})

      return { ok: true, status: 'CANCELLED' }
    }

    // ---------------- 6. INVOICE.PAID ----------------
    if (eventType === 'invoice.paid') {
      if (invoiceId) {
        await subscriptionInvoicesRepo.updateInvoiceStatus(invoiceId, 'PAID', {
          razorpayPaymentId: paymentId,
          paidAt: now,
          recoveryStatus: 'RECOVERED',
        })
      }
      return { ok: true, status: 'INVOICE_PAID' }
    }

    // ---------------- 7. PAYMENT.FAILED ----------------
    if (eventType === 'payment.failed') {
      const reason = paymentEntity?.error_description || 'Payment transaction failed'
      if (invoiceId) {
        await subscriptionInvoicesRepo.recordInvoice({
          creatorId,
          subscriptionId,
          razorpayInvoiceId: invoiceId,
          razorpayPaymentId: paymentId,
          amount: paymentEntity?.amount ? (paymentEntity.amount / 100) : sub?.amount,
          currency: paymentEntity?.currency || 'INR',
          status: 'FAILED',
          failureReason: reason,
          recoveryStatus: 'RETRY_PENDING',
        })
      }

      // If this was an upgrade payment failure, keep Creator plan active
      if (isPendingUpgrade || (sub?.status === 'ACTIVE' && sub?.plan === 'CREATOR' && subscriptionId !== sub?.providerSubscriptionId)) {
        console.warn(`[Razorpay Webhook] Upgrade payment failed for creator ${creatorId}. Creator subscription remains active.`)
        await creatorSubscriptionsRepo.updateStatus(creatorId, 'ACTIVE', {
          pendingUpgradeStatus: 'FAILED',
          pendingUpgradeErrorMessage: reason,
        })
        await subscriptionAuditLogsRepo.record(creatorId, 'PLAN_UPGRADE_PAYMENT_FAILED', {
          provider: 'RAZORPAY',
          failedSubscriptionId: subscriptionId,
          paymentId,
          reason,
          activePlan: 'CREATOR',
          eventId,
        }).catch(() => {})
        return { ok: true, status: 'UPGRADE_PAYMENT_FAILED', reason, creatorRetained: true }
      }

      return { ok: true, status: 'PAYMENT_FAILED', reason }
    }

    return { ok: true, ignored: true, reason: 'unhandled_event_type' }
  },

  /**
   * Reconcile an individual Razorpay subscription against live API.
   * Restores paid state if user paid manually via dashboard.
   */
  async reconcileSubscription(subscriptionId) {
    if (!subscriptionId) return { error: 'Subscription ID required' }
    const rzpProvider = getPaymentProvider()
    const rzpSub = await rzpProvider.fetchSubscription(subscriptionId)
    if (!rzpSub) return { error: 'Subscription not found on Razorpay' }

    const sub = await creatorSubscriptionsRepo.getByRazorpaySubscriptionId(subscriptionId)
    if (!sub) return { error: 'No matching subscription record in CreatorStore' }

    const rzpStatus = String(rzpSub.status || '').toLowerCase()
    const now = new Date()

    if (rzpStatus === 'active') {
      const currentPeriodEnd = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const currentPeriodStart = rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : now

      const updated = await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'ACTIVE', {
        authStatus: 'ACTIVE',
        lastVerifiedAt: now,
        currentPeriodStart,
        currentPeriodEnd,
        gracePeriodEndsAt: null,
        retryCount: 0,
        lastPaymentFailureReason: null,
      })

      return { ok: true, status: 'ACTIVE', action: 'RECONCILED_TO_ACTIVE', subscription: updated, reconciled: true }
    }

    if (rzpStatus === 'halted') {
      const updated = await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'HALTED', {
        authStatus: 'HALTED',
        lastVerifiedAt: now,
      })
      return { ok: true, status: 'HALTED', action: 'RECONCILED_TO_HALTED', subscription: updated }
    }

    if (rzpStatus === 'cancelled') {
      const updated = await creatorSubscriptionsRepo.updateStatus(sub.creatorId, 'CANCELLED', {
        authStatus: 'CANCELLED',
        lastVerifiedAt: now,
        canceledAt: rzpSub.ended_at ? new Date(rzpSub.ended_at * 1000) : now,
      })
      return { ok: true, status: 'CANCELLED', action: 'RECONCILED_TO_CANCELLED', subscription: updated }
    }

    return { ok: true, status: rzpStatus, action: `RECONCILED_TO_${rzpStatus.toUpperCase()}` }
  },

  /**
   * Record manual invoice recovery performed by admin/support via Razorpay Dashboard.
   */
  async recordManualInvoiceRecovery({ razorpayInvoiceId, paymentId, adminEmail, notes = '' }) {
    if (!razorpayInvoiceId) throw new Error('Razorpay Invoice ID required')
    const invoice = await subscriptionInvoicesRepo.getByInvoiceId(razorpayInvoiceId)
    if (!invoice) throw new Error(`Invoice ${razorpayInvoiceId} not found in CreatorStore records`)

    // Verify invoice status on Razorpay API if live
    const rzpProvider = getPaymentProvider()
    const rzpInvoice = await rzpProvider.fetchInvoice(razorpayInvoiceId)

    const now = new Date()
    const isConfirmedPaid = rzpInvoice?.status === 'paid' || rzpProvider.isMock || !rzpProvider.isConfigured()

    await subscriptionInvoicesRepo.updateInvoiceStatus(razorpayInvoiceId, isConfirmedPaid ? 'PAID' : 'PENDING', {
      razorpayPaymentId: paymentId || rzpInvoice?.payment_id || invoice.razorpayPaymentId,
      paidAt: isConfirmedPaid ? now : null,
      recoveryStatus: isConfirmedPaid ? 'RECOVERED' : 'MANUAL_REQUIRED',
      metadata: {
        ...invoice.metadata,
        manualRecoveryNote: notes,
        recoveredBy: adminEmail || 'admin',
        recoveredAt: now.toISOString(),
      },
    })

    if (isConfirmedPaid) {
      await this.reconcileSubscription(invoice.subscriptionId)
      await subscriptionAuditLogsRepo.record(invoice.creatorId, 'MANUAL_INVOICE_RECOVERED', {
        provider: 'RAZORPAY',
        providerSubscriptionId: invoice.subscriptionId,
        invoiceId: razorpayInvoiceId,
        paymentId: paymentId || rzpInvoice?.payment_id,
        recoveredBy: adminEmail,
        notes,
      }).catch(() => {})
    }

    return {
      ok: true,
      success: true,
      paid: isConfirmedPaid,
      invoiceId: razorpayInvoiceId,
      message: isConfirmedPaid
        ? 'Invoice confirmed paid and subscription access restored.'
        : 'Manual recovery recorded. Awaiting payment confirmation from Razorpay.',
    }
  }
}
