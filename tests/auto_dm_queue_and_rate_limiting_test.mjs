/**
 * CreatorStore: Durable Auto-DM Queue and Rate Limiting Test Suite
 *
 * Comprehensive end-to-end and unit testing for:
 * 1. Webhook Ingestion & Idempotency
 * 2. Per-Account Rate Limiting & Pacing
 * 3. Atomic Job Claiming & Concurrency Protection
 * 4. Error Classification & Exponential Backoff
 * 5. Messaging Policy Verification (7-day window, entitlements, account status)
 * 6. Abandoned Job / Lease Recovery
 * 7. Creator Scoping & Authorization Protection
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { autoDmQueueRepo, autoDmRateLimitsRepo, automationsRepo, instagramRepo, creatorSubscriptionsRepo } from '../lib/repos.js'
import { autoDmQueueService } from '../lib/auto-dm-queue-service.js'

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    passed++
    console.log(`  ✅ PASS: ${message}`)
  } else {
    failed++
    console.error(`  ❌ FAIL: ${message}`)
  }
}

async function runTestSuite() {
  console.log('\n======================================================')
  console.log('AUTO-DM DURABLE QUEUE & RATE LIMITING TEST SUITE')
  console.log('======================================================\n')

  let creatorA, creatorB, igAccountA, igAccountB, automationA

  try {
    // -------------------------------------------------------------------------
    // Setup Test Creators, Instagram Accounts, and Automations
    // -------------------------------------------------------------------------
    const ts = Date.now()
    creatorA = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `creator_queue_a_${ts}@test.com`,
        passwordHash: 'dummy_hashed_password',
        role: 'CREATOR',
      },
    })

    creatorB = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `creator_queue_b_${ts}@test.com`,
        passwordHash: 'dummy_hashed_password',
        role: 'CREATOR',
      },
    })

    // Setup active subscription for Creator A
    await prisma.creatorSubscription.create({
      data: {
        id: uuidv4(),
        creatorId: creatorA.id,
        plan: 'CREATOR',
        status: 'ACTIVE',
      },
    })

    // Setup connected Instagram account for Creator A
    igAccountA = await prisma.instagramAccount.create({
      data: {
        id: uuidv4(),
        creatorId: creatorA.id,
        platformUserId: `ig_user_a_${ts}`,
        username: `ig_creator_a_${ts}`,
        accessToken: `meta_tok_valid_${ts}`,
        status: 'CONNECTED',
      },
    })

    // Setup connected Instagram account for Creator B
    igAccountB = await prisma.instagramAccount.create({
      data: {
        id: uuidv4(),
        creatorId: creatorB.id,
        platformUserId: `ig_user_b_${ts}`,
        username: `ig_creator_b_${ts}`,
        accessToken: `meta_tok_b_${ts}`,
        status: 'CONNECTED',
      },
    })

    // Setup active automation for Creator A
    automationA = await prisma.automation.create({
      data: {
        id: uuidv4(),
        creatorId: creatorA.id,
        name: 'Lead Magnet AutoDM',
        triggerType: 'COMMENT_KEYWORD',
        triggerValue: 'PRO',
        message: 'Here is your link!',
        status: 'ACTIVE',
      },
    })

    // -------------------------------------------------------------------------
    // 1. Webhook Ingestion & Idempotency Deduplication
    // -------------------------------------------------------------------------
    console.log('--- 1. Webhook Ingestion & Idempotency Deduplication ---')

    const commentId1 = `comm_id_1_${ts}`
    const enqueue1 = await autoDmQueueService.enqueueFromWebhook({
      creatorId: creatorA.id,
      instagramAccountId: igAccountA.id,
      automationId: automationA.id,
      commentId: commentId1,
      mediaId: 'media_post_100',
      senderId: 'ig_sender_101',
      recipientUsername: 'alice',
      message: 'Here is your free guide: https://creatorstore.com/p/guide',
      buttonTitle: 'Get Guide',
      destinationUrl: 'https://creatorstore.com/p/guide',
    })

    assert(enqueue1.enqueued === true, 'Valid comment event enqueues queue job successfully')
    assert(enqueue1.duplicate === false, 'First ingestion marks duplicate as false')
    assert(enqueue1.job && enqueue1.job.status === 'PENDING', 'Enqueued job is in PENDING state')
    assert(enqueue1.job.dedupeKey === `ig:dm:${commentId1}:${automationA.id}`, 'Job has deterministic composite dedupeKey')

    // Repeated webhook delivery with identical comment & automation
    const enqueueDuplicate = await autoDmQueueService.enqueueFromWebhook({
      creatorId: creatorA.id,
      instagramAccountId: igAccountA.id,
      automationId: automationA.id,
      commentId: commentId1,
      mediaId: 'media_post_100',
      senderId: 'ig_sender_101',
      recipientUsername: 'alice',
      message: 'Here is your free guide: https://creatorstore.com/p/guide',
    })

    assert(enqueueDuplicate.enqueued === false, 'Duplicate webhook delivery rejected from enqueuing second job')
    assert(enqueueDuplicate.duplicate === true, 'Duplicate webhook returns duplicate: true')
    assert(enqueueDuplicate.job.id === enqueue1.job.id, 'Duplicate webhook resolves to existing job ID')

    // -------------------------------------------------------------------------
    // 2. Atomic Job Claiming & Concurrency Protection
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Atomic Job Claiming & Concurrency Protection ---')

    const worker1 = 'worker-node-1'
    const worker2 = 'worker-node-2'

    // First claim by Worker 1
    const claimedJob1 = await autoDmQueueRepo.claimNextJob(worker1, { lockDurationSeconds: 30 })
    assert(claimedJob1 !== null, 'Worker 1 atomically claims pending job')
    assert(claimedJob1.id === enqueue1.job.id, 'Claimed job matches enqueued job ID')
    assert(claimedJob1.status === 'PROCESSING', 'Job status transitions to PROCESSING upon claim')
    assert(claimedJob1.lockedBy === worker1, 'Job is locked by worker 1')
    assert(claimedJob1.attemptCount === 1, 'Job attempt count increments to 1')

    // Simultaneous claim by Worker 2 while Job 1 is PROCESSING and lock is valid
    const claimedJob2 = await autoDmQueueRepo.claimNextJob(worker2, { lockDurationSeconds: 30 })
    assert(claimedJob2 === null, 'Worker 2 cannot claim actively leased job (concurrency lock protected)')

    // -------------------------------------------------------------------------
    // 3. Per-Account Rate Limiting & Pacing
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Per-Account Rate Limiting & Pacing ---')

    // Initialize rate limit for Account A
    await autoDmRateLimitsRepo.getOrInit(igAccountA.id, creatorA.id)

    // A. First check should be allowed
    const canSendInitial = await autoDmRateLimitsRepo.canSend(igAccountA.id, creatorA.id)
    assert(canSendInitial.allowed === true, 'Account A initially allowed to send')

    // Record send for Account A
    await autoDmRateLimitsRepo.recordSend(igAccountA.id, creatorA.id)

    // B. Immediate second check should be paced by 3-second safety interval
    const canSendImmediate = await autoDmRateLimitsRepo.canSend(igAccountA.id, creatorA.id)
    assert(canSendImmediate.allowed === false, 'Account A immediately paced by 3-second minimum interval')
    assert(canSendImmediate.reason === 'INTERVAL_PACING', 'Pacing reason is INTERVAL_PACING')
    assert(canSendImmediate.waitMs > 0 && canSendImmediate.waitMs <= 3000, 'Calculates waitMs within 3-second window')

    // C. Independent Account Pacing: Account B should NOT be blocked by Account A
    await autoDmRateLimitsRepo.getOrInit(igAccountB.id, creatorB.id)
    const canSendAccountB = await autoDmRateLimitsRepo.canSend(igAccountB.id, creatorB.id)
    assert(canSendAccountB.allowed === true, 'Account B progresses independently (per-account pacing)')

    // D. Meta Throttling / Pause behavior
    await autoDmRateLimitsRepo.pauseAccount(igAccountA.id, {
      pauseMinutes: 15,
      reason: 'Calls to this api have exceeded the rate limit (Meta Code 613)',
    })

    const canSendWhilePaused = await autoDmRateLimitsRepo.canSend(igAccountA.id, creatorA.id)
    assert(canSendWhilePaused.allowed === false, 'Account A blocked while paused')
    assert(canSendWhilePaused.reason === 'PAUSED', 'Reason reflects PAUSED state')
    assert(String(canSendWhilePaused.pauseReason).includes('613'), 'Preserves Meta rate limit error description')

    // E. Manual resume
    const resumeRes = await autoDmRateLimitsRepo.resumeAccount(igAccountA.id, creatorA.id)
    assert(resumeRes.success === true, 'Creator can resume account queue')
    const canSendAfterResume = await autoDmRateLimitsRepo.canSend(igAccountA.id, creatorA.id)
    assert(canSendAfterResume.allowed === true || canSendAfterResume.reason === 'INTERVAL_PACING', 'Account queue unpaused')

    // -------------------------------------------------------------------------
    // 4. Retry and Failure Classification
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Retry and Failure Classification ---')

    // Transient network error classification
    const transientClassification = autoDmQueueService.classifyMetaError({
      status: 503,
      error: 'Service Temporarily Unavailable',
    })
    assert(transientClassification.permanent === false, 'HTTP 503 classified as transient / retryable')
    assert(transientClassification.category === 'SERVER_ERROR', 'Category is SERVER_ERROR')

    // Rate limit code 613 classification
    const rateLimitClassification = autoDmQueueService.classifyMetaError({
      code: 613,
      error: 'Calls to this api have exceeded the rate limit',
    })
    assert(rateLimitClassification.permanent === false, 'Meta Code 613 classified as retryable')
    assert(rateLimitClassification.rateLimited === true, 'Flags rateLimited = true for backoff pause')

    // Permanent auth revoked code 190 classification
    const authRevokedClassification = autoDmQueueService.classifyMetaError({
      code: 190,
      error: 'Error validating access token: Session has expired',
    })
    assert(authRevokedClassification.permanent === true, 'Meta Code 190 (token expired) classified as permanent failure')
    assert(authRevokedClassification.category === 'AUTH_EXPIRED', 'Category is AUTH_EXPIRED')

    // Exponential backoff calculation
    const delay1 = autoDmQueueService.calculateBackoff(1)
    const delay2 = autoDmQueueService.calculateBackoff(2)
    const delay3 = autoDmQueueService.calculateBackoff(3)

    assert(delay1 >= 5000 && delay1 <= 7000, `Attempt 1 delay in expected range (~5-7s): ${delay1}ms`)
    assert(delay2 >= 10000 && delay2 <= 12000, `Attempt 2 delay in expected range (~10-12s): ${delay2}ms`)
    assert(delay3 >= 20000 && delay3 <= 22000, `Attempt 3 delay in expected range (~20-22s): ${delay3}ms`)
    assert(delay3 > delay2 && delay2 > delay1, 'Delays increase exponentially with attempt count')

    // Test markRetry & markFailed on queue job
    const retryJobRecord = await autoDmQueueRepo.markRetry(claimedJob1.id, {
      errorCategory: 'NETWORK_TIMEOUT',
      errorMessage: 'Network timeout connecting to Meta Graph API',
      attemptCount: 1,
      maxAttempts: 5,
    })
    assert(retryJobRecord.status === 'RETRYING', 'Job transitioned to RETRYING after transient failure')
    assert(retryJobRecord.lastErrorCategory === 'NETWORK_TIMEOUT', 'Preserves error category')

    // Test max attempts exhaustion transitions to FAILED
    const exhaustedJob = await autoDmQueueRepo.markRetry(claimedJob1.id, {
      errorCategory: 'SERVER_ERROR',
      errorMessage: 'Persistent server error',
      attemptCount: 5,
      maxAttempts: 5,
    })
    assert(exhaustedJob.status === 'FAILED', 'Job transitions to FAILED when max attempts exhausted')
    assert(exhaustedJob.failedAt !== null, 'Sets failedAt timestamp upon exhaustion')

    // -------------------------------------------------------------------------
    // 5. Messaging Policy Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Messaging Policy Verification ---')

    // A. 7-day Policy Window Expiration
    const expiredJobData = {
      ...claimedJob1,
      createdAt: new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)), // 8 days old
    }
    const policyCheckExpired = await autoDmQueueService.verifyMessagingEligibility(expiredJobData)
    assert(policyCheckExpired.eligible === false, 'Job older than 7 days rejected under Meta messaging policy')
    assert(policyCheckExpired.category === 'POLICY_WINDOW_EXPIRED', 'Rejection category is POLICY_WINDOW_EXPIRED')
    assert(policyCheckExpired.permanent === true, '7-day policy violation is permanently non-retryable')

    // B. Inactive / Revoked Creator Subscription
    await prisma.creatorSubscription.update({
      where: { creatorId: creatorA.id },
      data: { status: 'CANCELLED', plan: 'UNSUBSCRIBED' },
    })

    const unentitledJobData = {
      ...claimedJob1,
      createdAt: new Date(),
    }
    const policyCheckEntitlement = await autoDmQueueService.verifyMessagingEligibility(unentitledJobData)
    assert(policyCheckEntitlement.eligible === false, 'Unsubscribed creator rejected from sending Auto-DMs')
    assert(policyCheckEntitlement.category === 'ENTITLEMENT_REVOKED', 'Rejection category is ENTITLEMENT_REVOKED')

    // Restore subscription for subsequent tests
    await prisma.creatorSubscription.update({
      where: { creatorId: creatorA.id },
      data: { status: 'ACTIVE', plan: 'CREATOR' },
    })

    // C. Disconnected Instagram Account
    await prisma.instagramAccount.update({
      where: { id: igAccountA.id },
      data: { status: 'DISCONNECTED' },
    })
    const policyCheckDisconnected = await autoDmQueueService.verifyMessagingEligibility(unentitledJobData)
    assert(policyCheckDisconnected.eligible === false, 'Disconnected account rejected from sending')
    assert(policyCheckDisconnected.category === 'ACCOUNT_DISCONNECTED', 'Rejection category is ACCOUNT_DISCONNECTED')

    // Restore account status
    await prisma.instagramAccount.update({
      where: { id: igAccountA.id },
      data: { status: 'CONNECTED' },
    })

    // -------------------------------------------------------------------------
    // 6. Abandoned Job / Lease Recovery
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Abandoned Job / Lease Recovery ---')

    // Create a job simulated as crashed/stuck in PROCESSING with expired lease
    const stuckJob = await prisma.autoDmQueueJob.create({
      data: {
        id: uuidv4(),
        creatorId: creatorA.id,
        instagramAccountId: igAccountA.id,
        automationId: automationA.id,
        dedupeKey: `ig:dm:stuck_test_${ts}`,
        message: 'Stuck test message',
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 300000), // 5 minutes ago
        lockedBy: 'worker-crashed',
        lockExpiresAt: new Date(Date.now() - 10000), // expired 10s ago
        attemptCount: 1,
        maxAttempts: 5,
      },
    })

    const recoveredCount = await autoDmQueueRepo.recoverStuckJobs(60)
    assert(recoveredCount >= 1, 'Recovers abandoned job whose lease timed out')

    const recheckedStuck = await prisma.autoDmQueueJob.findUnique({
      where: { id: stuckJob.id },
    })
    assert(recheckedStuck.status === 'RETRYING', 'Abandoned job restored to RETRYING for another attempt')
    assert(recheckedStuck.lockedAt === null && recheckedStuck.lockedBy === null, 'Locks cleared on recovered job')

    // -------------------------------------------------------------------------
    // 7. Creator Scoping & Authorization (IDOR Protection)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Creator Scoping & Authorization (IDOR Protection) ---')

    // Creator A lists jobs
    const creatorAJobs = await autoDmQueueRepo.listJobsForCreator(creatorA.id)
    assert(creatorAJobs.items.length > 0, 'Creator A retrieves own queued jobs')
    assert(creatorAJobs.items.every((j) => !j.accessToken), 'No access tokens exposed in job records')

    // Creator B attempts to list jobs (should be empty for Creator B)
    const creatorBJobs = await autoDmQueueRepo.listJobsForCreator(creatorB.id)
    assert(creatorBJobs.items.length === 0, 'Creator B cannot view Creator A queue jobs (isolated)')

    // Creator B attempts to cancel Creator A's job
    const cancelAttack = await autoDmQueueRepo.cancelJob(enqueue1.job.id, creatorB.id)
    assert(cancelAttack.success === false, 'Creator B cannot cancel Creator A job (unauthorized)')

    // Creator B attempts to retry Creator A's job
    const retryAttack = await autoDmQueueRepo.retryJob(enqueue1.job.id, creatorB.id)
    assert(retryAttack.success === false, 'Creator B cannot retry Creator A job (unauthorized)')

    // Creator A legitimately cancels an eligible job
    const pendingJobForCancel = await prisma.autoDmQueueJob.create({
      data: {
        id: uuidv4(),
        creatorId: creatorA.id,
        instagramAccountId: igAccountA.id,
        automationId: automationA.id,
        dedupeKey: `ig:dm:cancel_test_${ts}`,
        message: 'Cancel test message',
        status: 'PENDING',
      },
    })
    const legitimateCancel = await autoDmQueueRepo.cancelJob(pendingJobForCancel.id, creatorA.id)
    assert(legitimateCancel.success === true, 'Creator A can legitimately cancel own pending job')
    assert(legitimateCancel.job.status === 'CANCELLED', 'Job status updated to CANCELLED')

    // Creator A legitimately retries the cancelled job
    const legitimateRetry = await autoDmQueueRepo.retryJob(pendingJobForCancel.id, creatorA.id)
    assert(legitimateRetry.success === true, 'Creator A can legitimately retry own cancelled/failed job')
    assert(legitimateRetry.job.status === 'PENDING', 'Job status reset to PENDING')

    // Stats aggregation
    const statsA = await autoDmQueueRepo.getStatsForCreator(creatorA.id)
    assert(typeof statsA.total === 'number' && statsA.total > 0, 'Stats aggregator computes total jobs')
    assert(typeof statsA.oldestPendingAgeSec === 'number', 'Stats aggregator computes oldestPendingAgeSec')

  } catch (err) {
    console.error('Test suite failed with unexpected error:', err)
    failed++
  } finally {
    // Clean up test records
    try {
      if (creatorA) {
        await prisma.autoDmQueueJob.deleteMany({ where: { creatorId: creatorA.id } })
        await prisma.autoDmRateLimit.deleteMany({ where: { creatorId: creatorA.id } })
        await prisma.automation.deleteMany({ where: { creatorId: creatorA.id } })
        await prisma.instagramAccount.deleteMany({ where: { creatorId: creatorA.id } })
        await prisma.creatorSubscription.deleteMany({ where: { creatorId: creatorA.id } })
        await prisma.user.deleteMany({ where: { id: creatorA.id } })
      }
      if (creatorB) {
        await prisma.autoDmQueueJob.deleteMany({ where: { creatorId: creatorB.id } })
        await prisma.autoDmRateLimit.deleteMany({ where: { creatorId: creatorB.id } })
        await prisma.instagramAccount.deleteMany({ where: { creatorId: creatorB.id } })
        await prisma.user.deleteMany({ where: { id: creatorB.id } })
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message)
    }
  }

  console.log('\n======================================================')
  console.log(`AUTO-DM QUEUE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('======================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runTestSuite()
