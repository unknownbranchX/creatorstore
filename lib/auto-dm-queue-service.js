/**
 * Auto-DM Queue & Rate Limiting Service
 *
 * Provides:
 * 1. Fast, idempotent webhook ingestion and queue enqueueing.
 * 2. Per-connected-account rate limiting with rolling-window safety margins below Meta limits.
 * 3. Atomic job claiming via PostgreSQL `FOR UPDATE SKIP LOCKED`.
 * 4. Verification of Meta messaging policies (7-day private reply window, one-reply-per-comment).
 * 5. Re-verification of creator entitlement and connected account state before dispatch.
 * 6. Error classification into transient vs. permanent failures with exponential backoff & jitter.
 * 7. Recovery of abandoned jobs (lease timeouts).
 */

import { prisma } from './prisma.js'
import { autoDmQueueRepo, autoDmRateLimitsRepo, instagramRepo, automationsRepo, automationEventsRepo, creatorSubscriptionsRepo } from './repos.js'
import { resolveCreatorPlan, hasEntitlement } from './plans.js'
import { instagramMessagingService } from './services.js'
import { getMetaApiClient } from './meta-api-client.js'

// Meta Instagram Private Reply policy constants
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const BASE_RETRY_DELAY_MS = 5000 // 5 seconds base backoff
const MAX_RETRY_DELAY_MS = 3600000 // 1 hour max backoff
const MAX_ATTEMPTS = 5

export const autoDmQueueService = {
  /**
   * Enqueues a comment event to the durable queue instead of sending synchronously.
   */
  async enqueueFromWebhook({
    creatorId,
    instagramAccountId,
    automationId,
    commentId,
    mediaId,
    senderId,
    recipientUsername,
    message,
    buttonTitle,
    destinationUrl,
    commentReply,
    quickReplies = [],
    isSimulation = false,
  }) {
    if (!creatorId || !commentId || !automationId) {
      return { enqueued: false, reason: 'Missing required parameters' }
    }

    // Stable composite deduplication key: 1 private reply per comment & automation
    const dedupeKey = `ig:dm:${commentId}:${automationId}`

    try {
      const result = await autoDmQueueRepo.enqueueJob({
        creatorId,
        instagramAccountId,
        automationId,
        dedupeKey,
        triggerType: isSimulation ? 'SIMULATION' : 'COMMENT',
        commentId,
        mediaId,
        recipientId: senderId,
        recipientUsername,
        message,
        quickReplies,
        commentReply,
        destinationUrl,
        buttonText: buttonTitle,
        maxAttempts: MAX_ATTEMPTS,
        scheduledAt: new Date(),
        isSimulation: Boolean(isSimulation),
      })

      // Also ensure rate limit tracker is initialized for this account
      if (instagramAccountId) {
        await autoDmRateLimitsRepo.getOrInit(instagramAccountId, creatorId)
      }

      return result
    } catch (err) {
      console.error('[AUTO_DM_QUEUE_SERVICE] Failed to enqueue job:', err)
      return { enqueued: false, error: err.message }
    }
  },

  /**
   * Evaluates if a job is still eligible to be sent under Meta messaging policies and CreatorStore plans.
   */
  async verifyMessagingEligibility(job) {
    const now = Date.now()

    // 1. Meta 7-Day Private Reply Policy Window
    // Private replies to comments on Instagram posts or Reels must be sent within 7 days of the comment.
    if (job.createdAt) {
      const jobAge = now - new Date(job.createdAt).getTime()
      if (jobAge > SEVEN_DAYS_MS) {
        return {
          eligible: false,
          category: 'POLICY_WINDOW_EXPIRED',
          reason: 'Comment is older than Meta 7-day private reply window.',
          permanent: true,
        }
      }
    }

    // 2. Creator Entitlement Verification
    // Re-check that creator currently has active subscription with Auto-DM entitlement
    const sub = await creatorSubscriptionsRepo.getByCreatorId(job.creatorId)
    const plan = resolveCreatorPlan(sub)
    const canAutoDm = hasEntitlement(plan, 'automations', sub?.status || 'ACTIVE')

    if (!canAutoDm) {
      return {
        eligible: false,
        category: 'ENTITLEMENT_REVOKED',
        reason: 'Creator subscription is inactive or plan does not include Instagram Auto-DM.',
        permanent: false, // Could be retried if upgraded within window, but paused for now
      }
    }

    // 3. Instagram Account Connection Status (re-verified fresh from DB)
    let igAcc = null
    if (job.instagramAccountId) {
      igAcc = await prisma.instagramAccount.findUnique({ where: { id: job.instagramAccountId } })
    }
    if (!igAcc && job.creatorId) {
      igAcc = await instagramRepo.getByCreatorId(job.creatorId)
    }

    if (!igAcc || igAcc.status !== 'CONNECTED' || !igAcc.accessToken) {
      return {
        eligible: false,
        category: 'ACCOUNT_DISCONNECTED',
        reason: 'Connected Instagram account is missing, revoked, or disconnected.',
        permanent: true,
      }
    }

    // 4. Automation Status
    if (job.automationId) {
      const auto = await automationsRepo.getById(job.automationId)
      if (!auto || auto.status !== 'ACTIVE') {
        return {
          eligible: false,
          category: 'AUTOMATION_DISABLED',
          reason: 'Target automation is no longer active.',
          permanent: true,
        }
      }
    }

    // 5. Duplicate Check: Ensure comment has not already had a DM sent
    if (job.commentId) {
      const alreadySent = await automationEventsRepo.claimCommentEvent({
        creatorId: job.creatorId,
        automationId: job.automationId,
        instagramAccountId: job.instagramAccountId,
        commentId: job.commentId,
      })
      // If claimed === false and event is already DM_SENT, don't duplicate
      if (!alreadySent.claimed && alreadySent.existing?.eventType === 'DM_SENT') {
        return {
          eligible: false,
          category: 'ALREADY_SENT',
          reason: 'A DM has already been sent for this comment.',
          permanent: true,
        }
      }
    }

    return { eligible: true, igAccount: igAcc }
  },

  /**
   * Processes a single claimed job.
   */
  async processJob(job, workerId = 'worker-default') {
    if (!job || !job.id) return { success: false, reason: 'Invalid job' }

    console.log(`[AUTO_DM_WORKER] Processing Job ${job.id} (Attempt ${job.attemptCount}/${job.maxAttempts}) for creator ${job.creatorId}`)

    // 1. Acquire atomic dispatch slot from shared rate limiter (PostgreSQL row-level lock)
    if (job.instagramAccountId) {
      const limitCheck = await autoDmRateLimitsRepo.acquireDispatchSlot(job.instagramAccountId, job.creatorId)
      if (!limitCheck.allowed) {
        console.warn(`[AUTO_DM_WORKER] Job ${job.id} delayed by rate limiter. Reason: ${limitCheck.reason}`)
        // Reschedule job for when rate limit allows
        const delayMs = limitCheck.waitMs || (limitCheck.remainingSeconds ? limitCheck.remainingSeconds * 1000 : 5000)
        const nextAttempt = new Date(Date.now() + Math.min(delayMs + Math.random() * 500, 3600000))

        await autoDmQueueRepo.markRetry(job.id, {
          errorCategory: limitCheck.reason,
          errorMessage: limitCheck.pauseReason || `Account paced by rate limiter (${limitCheck.reason})`,
          nextAttemptAt: nextAttempt,
          attemptCount: job.attemptCount, // Don't burn attempts for pacing delays
          maxAttempts: job.maxAttempts,
        })
        return { success: false, rateLimited: true, waitMs: delayMs }
      }
    }

    // 2. Messaging Policy & Entitlement Re-Verification
    const eligibility = await this.verifyMessagingEligibility(job)
    if (!eligibility.eligible) {
      console.warn(`[AUTO_DM_WORKER] Job ${job.id} ineligible: ${eligibility.category} - ${eligibility.reason}`)

      if (eligibility.permanent) {
        await autoDmQueueRepo.markFailed(job.id, {
          errorCategory: eligibility.category,
          errorMessage: eligibility.reason,
        })
      } else {
        // Transient policy issue (e.g. grace period or temporary disconnect)
        const backoffMs = this.calculateBackoff(job.attemptCount)
        await autoDmQueueRepo.markRetry(job.id, {
          errorCategory: eligibility.category,
          errorMessage: eligibility.reason,
          nextAttemptAt: new Date(Date.now() + backoffMs),
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
        })
      }
      return { success: false, ineligible: true, reason: eligibility.reason }
    }

    const igAccount = eligibility.igAccount
    const metaClient = getMetaApiClient()

    // 2.5 In-Flight Worker Crash Recovery Reconciliation:
    // If this job was recovered from an active lease interruption, verify if the provider
    // already received and accepted the message before blindly sending again.
    if (job.lastErrorCategory === 'WORKER_RECOVERED' && job.attemptCount >= 1) {
      console.log(`[AUTO_DM_WORKER] Job ${job.id} was recovered after an in-flight worker interruption. Reconciling delivery status before dispatch...`)
      const deliveryStatus = await metaClient.checkDeliveryStatus({
        commentId: job.commentId,
        recipientId: job.recipientId,
        instagramAccountId: job.instagramAccountId,
      })

      if (deliveryStatus.delivered) {
        console.log(`[AUTO_DM_WORKER] Reconciled Job ${job.id}: Provider already accepted message (ID: ${deliveryStatus.providerMessageId}). Marking SENT without duplicate send.`)
        await autoDmQueueRepo.markSent(job.id, {
          providerMessageId: deliveryStatus.providerMessageId,
        })
        return { success: true, reconciled: true, messageId: deliveryStatus.providerMessageId }
      }

      if (deliveryStatus.ambiguous) {
        console.warn(`[AUTO_DM_WORKER] Ambiguous delivery on recovered Job ${job.id}: Provider delivery cannot be confirmed. Halting to prevent duplicate send.`)
        await autoDmQueueRepo.markFailed(job.id, {
          errorCategory: 'DELIVERY_AMBIGUITY',
          errorMessage: 'Worker crashed while job was in-flight and provider delivery outcome cannot be confirmed. Halted to prevent duplicate messaging.',
          errorDetails: { recoveredFromCrash: true, ambiguous: true },
        })
        return { success: false, ambiguous: true, reason: 'Ambiguous delivery outcome' }
      }
    }

    // 3. Optional Public Comment Reply (if configured and not already replied)
    if (job.commentReply && job.commentId) {
      try {
        await metaClient.sendPublicCommentReply({
          commentId: job.commentId,
          message: job.commentReply,
          accessToken: igAccount.accessToken,
          isSimulation: Boolean(job.isSimulation),
        })
      } catch (replyErr) {
        console.warn(`[AUTO_DM_WORKER] Public comment reply warning: ${replyErr.message}`)
      }
    }

    // 4. Outbound Meta Graph API Call via Injectable Client Abstraction
    try {
      const sendResult = await metaClient.sendDirectMessage({
        commentId: job.commentId,
        recipientId: job.recipientId,
        text: job.message,
        buttonTitle: job.buttonText,
        buttonUrl: job.destinationUrl,
        accessToken: igAccount.accessToken,
        platformUserId: igAccount.platformUserId,
        instagramAccountId: igAccount.id,
        isSimulation: Boolean(job.isSimulation),
      })

      if (sendResult.sent) {
        // Record successful send
        await autoDmQueueRepo.markSent(job.id, {
          providerMessageId: sendResult.messageId,
        })

        // Note: Rate limiter metrics were atomically reserved and recorded in acquireDispatchSlot() prior to dispatch.

        // Record automation event
        await automationEventsRepo.recordEvent({
          creatorId: job.creatorId,
          automationId: job.automationId,
          instagramAccountId: job.instagramAccountId,
          commentId: job.commentId,
          eventType: 'DM_SENT',
          metadata: {
            messageId: sendResult.messageId,
            format: sendResult.format,
            jobId: job.id,
            isSimulation: Boolean(job.isSimulation),
          },
        })

        console.log(`[AUTO_DM_WORKER] Successfully sent DM for Job ${job.id}! Provider Message ID: ${sendResult.messageId}`)
        return { success: true, messageId: sendResult.messageId }
      } else if (sendResult.ambiguous) {
        // CRITICAL DELIVERY AMBIGUITY SAFETY POLICY:
        // A timeout occurred after message was submitted/accepted on the socket.
        // Blindly retrying risks duplicate customer DMs. Halt retries and record ambiguity.
        console.error(`[AUTO_DM_WORKER] Critical Delivery Ambiguity on Job ${job.id}: Post-acceptance timeout. Halting blind retries.`)
        await autoDmQueueRepo.markFailed(job.id, {
          errorCategory: 'DELIVERY_AMBIGUITY',
          errorMessage: 'Delivery outcome uncertain: Timeout occurred after provider socket write. Halted to prevent duplicate messaging.',
          errorDetails: { ambiguous: true, rawError: sendResult.error },
        })
        return { success: false, ambiguous: true, error: sendResult.error }
      } else {
        // Classify the failure
        const classification = this.classifyMetaError(sendResult)
        console.error(`[AUTO_DM_WORKER] Meta API Error on Job ${job.id}:`, classification)

        if (classification.rateLimited) {
          // Pause account for 15 minutes when Meta signals throttling
          if (job.instagramAccountId) {
            await autoDmRateLimitsRepo.pauseAccount(job.instagramAccountId, {
              pauseMinutes: 15,
              reason: classification.message,
            })
          }
        }

        if (classification.permanent) {
          await autoDmQueueRepo.markFailed(job.id, {
            errorCategory: classification.category,
            errorMessage: classification.message,
            errorDetails: classification.details,
          })

          await automationEventsRepo.recordEvent({
            creatorId: job.creatorId,
            automationId: job.automationId,
            instagramAccountId: job.instagramAccountId,
            commentId: job.commentId,
            eventType: 'DM_FAILED',
            status: 'FAILED',
            metadata: { error: classification.message, category: classification.category, jobId: job.id },
          })
        } else {
          // Retryable error: schedule next attempt with exponential backoff & jitter
          const backoffMs = this.calculateBackoff(job.attemptCount)
          const nextAttempt = new Date(Date.now() + backoffMs)

          await autoDmQueueRepo.markRetry(job.id, {
            errorCategory: classification.category,
            errorMessage: classification.message,
            errorDetails: classification.details,
            nextAttemptAt: nextAttempt,
            attemptCount: job.attemptCount,
            maxAttempts: job.maxAttempts,
          })
        }

        return { success: false, error: classification.message }
      }
    } catch (networkErr) {
      console.error(`[AUTO_DM_WORKER] Unexpected Network / Request Error on Job ${job.id}:`, networkErr)

      const backoffMs = this.calculateBackoff(job.attemptCount)
      const nextAttempt = new Date(Date.now() + backoffMs)

      await autoDmQueueRepo.markRetry(job.id, {
        errorCategory: 'NETWORK_TIMEOUT',
        errorMessage: networkErr.message || 'Network error communicating with Meta API',
        errorDetails: { stack: networkErr.stack },
        nextAttemptAt: nextAttempt,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
      })

      return { success: false, error: networkErr.message }
    }
  },

  /**
   * Claims and processes up to `batchSize` eligible jobs atomically.
   */
  async processBatch(workerId = 'worker-default', batchSize = 5, { isSimulation = null } = {}) {
    let processed = 0
    let failed = 0
    let delayed = 0

    // First, periodically recover any jobs stuck in PROCESSING past their lock lease
    await autoDmQueueRepo.recoverStuckJobs(120)

    for (let i = 0; i < batchSize; i++) {
      const job = await autoDmQueueRepo.claimNextJob(workerId, { lockDurationSeconds: 60, isSimulation })
      if (!job) {
        break // No eligible jobs waiting in queue
      }

      const outcome = await this.processJob(job, workerId)
      if (outcome.success) {
        processed++
      } else if (outcome.rateLimited) {
        delayed++
      } else {
        failed++
      }
    }

    return { processed, failed, delayed }
  },

  /**
   * Classifies Meta API errors into Retryable vs. Permanent categories.
   */
  classifyMetaError(errorResponse = {}) {
    const code = Number(errorResponse.code || errorResponse.errorCode || 0)
    const status = Number(errorResponse.status || errorResponse.httpStatus || 0)
    const rawMessage = String(errorResponse.error || errorResponse.reason || errorResponse.message || '')

    // 1. Meta Throttling / Rate Limits
    // Code 4: Application request limit reached
    // Code 17: User request limit reached
    // Code 32: Page request limit reached
    // Code 613: Calls to this api have exceeded the rate limit
    if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
      return {
        category: 'RATE_LIMITED',
        message: `Meta API rate limit reached (${code || 429}). Account paused temporarily.`,
        permanent: false,
        rateLimited: true,
        details: { code, status },
      }
    }

    // 2. Authentication & Authorization Failures
    // Code 190: Access token expired, invalid, or revoked
    // Code 10: Missing permission (e.g. instagram_manage_messages)
    if (code === 190 || code === 102) {
      return {
        category: 'AUTH_EXPIRED',
        message: 'Instagram access token expired or revoked. Please reconnect your account.',
        permanent: true,
        rateLimited: false,
        details: { code, status },
      }
    }
    if (code === 10 || code === 200 || code === 298) {
      return {
        category: 'PERMISSION_DENIED',
        message: 'Missing required Instagram permissions for messaging.',
        permanent: true,
        rateLimited: false,
        details: { code, status },
      }
    }

    // 3. Recipient & Policy Violations (Permanent)
    // Code 100: Invalid parameter or recipient cannot receive DM
    // Subcode 2018001 / 2018047: Comment already replied to or recipient cannot be messaged
    if (code === 100 || rawMessage.includes('cannot message') || rawMessage.includes('already replied') || rawMessage.includes('does not exist')) {
      return {
        category: 'RECIPIENT_INELIGIBLE',
        message: 'Recipient or comment cannot receive direct messages under Meta policy.',
        permanent: true,
        rateLimited: false,
        details: { code, status, rawMessage },
      }
    }

    // 4. Temporary Server Errors (HTTP 500, 502, 503, 504)
    if (status >= 500 && status <= 599) {
      return {
        category: 'SERVER_ERROR',
        message: `Meta server error (HTTP ${status}). Retrying with backoff.`,
        permanent: false,
        rateLimited: false,
        details: { status, code },
      }
    }

    // Default: Check if message contains rate limit keywords
    if (/rate limit|throttle|too many requests/i.test(rawMessage)) {
      return {
        category: 'RATE_LIMITED',
        message: 'Rate limit signaled by provider. Backing off.',
        permanent: false,
        rateLimited: true,
        details: { code, status },
      }
    }

    // Unknown error with HTTP 4xx -> treat as permanent to avoid infinite loops
    if (status >= 400 && status < 500) {
      return {
        category: 'INVALID_REQUEST',
        message: rawMessage || `Meta request error (HTTP ${status})`,
        permanent: true,
        rateLimited: false,
        details: { code, status },
      }
    }

    return {
      category: 'TEMPORARY_FAILURE',
      message: rawMessage || 'Unexpected failure from Meta API',
      permanent: false,
      rateLimited: false,
      details: { code, status },
    }
  },

  /**
   * Calculates exponential backoff with randomized jitter.
   * delay = min(MAX_RETRY_DELAY, BASE_DELAY * 2^attempt) + jitter
   */
  calculateBackoff(attemptCount = 1) {
    const exponent = Math.max(0, Math.min(attemptCount - 1, 8))
    const calculated = BASE_RETRY_DELAY_MS * Math.pow(2, exponent)
    const bounded = Math.min(MAX_RETRY_DELAY_MS, calculated)
    const jitter = Math.floor(Math.random() * 2000) // 0-2s jitter
    return bounded + jitter
  },
}
