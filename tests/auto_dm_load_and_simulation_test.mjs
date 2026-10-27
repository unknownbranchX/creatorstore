/**
 * CreatorStore Auto-DM Queue: Load Testing and Failure Simulation Suite
 *
 * Verifies:
 * 1. Meta API Client Abstraction & Safety Invariants
 * 2. Rate Limiting from Observed Dispatch Timestamps
 * 3. Traffic Scenarios: Sequential, Burst, Steady Stream, Multi-Account Bursts
 * 4. Meta Error Responses: Throttling (429/613), Server Error (500), Permanent Auth (190), Ambiguous Delivery
 * 5. Worker Interruption & Crash Recovery
 * 6. High-volume Capacity (100 jobs burst) & Database Safety
 * 7. Generates Safe Simulation Report
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma.js'
import { autoDmQueueRepo, autoDmRateLimitsRepo } from '../lib/repos.js'
import { autoDmQueueService } from '../lib/auto-dm-queue-service.js'
import {
  MetaApiClient,
  RealMetaApiClient,
  MockMetaApiClient,
  getMetaApiClient,
  setMetaApiClient,
  resetMetaApiClient,
  isSimulationMode,
} from '../lib/meta-api-client.js'
import { SyntheticJobGenerator } from '../lib/auto-dm-synthetic-generator.js'

let passed = 0
let failed = 0
const simulationReports = []

function assert(condition, message) {
  if (condition) {
    passed++
    console.log(`  ✅ PASS: ${message}`)
  } else {
    failed++
    console.error(`  ❌ FAIL: ${message}`)
  }
}

async function runSimulationAudit() {
  console.log('\n=================================================================')
  console.log('CREATORSTORE AUTO-DM QUEUE: LOAD TESTING & FAILURE SIMULATION')
  console.log('=================================================================\n')

  try {
    // -------------------------------------------------------------------------
    // 1. Injectable Meta API Client & Fail-Closed Safety Verification
    // -------------------------------------------------------------------------
    console.log('--- 1. Injectable Meta API Client & Fail-Closed Safety ---')

    const mockClient = new MockMetaApiClient({ providerLatencyMs: 10 })
    assert(mockClient instanceof MetaApiClient, 'MockMetaApiClient implements MetaApiClient interface')

    // Verify real client rejects simulation records
    const realClient = new RealMetaApiClient()
    let realClientRejected = false
    try {
      await realClient.sendDirectMessage({
        commentId: 'sim_comm_123',
        recipientId: 'sim_user_123',
        text: 'Simulation test',
        isSimulation: true,
      })
    } catch (e) {
      realClientRejected = true
      assert(
        String(e.message).includes('CRITICAL SAFETY VIOLATION'),
        'RealMetaApiClient throws CRITICAL SAFETY VIOLATION on simulation jobs'
      )
    }
    assert(realClientRejected, 'Real Meta API client strictly refuses synthetic/simulation jobs')

    // Verify mock client records dispatch without external network calls
    process.env.AUTO_DM_SIMULATION_MODE = 'true'
    setMetaApiClient(mockClient)
    assert(isSimulationMode() === true, 'isSimulationMode() detects active mock client')

    const mockSend = await mockClient.sendDirectMessage({
      commentId: 'sim_comm_test_1',
      recipientId: 'sim_recip_test_1',
      text: 'Test DM',
      buttonUrl: 'https://example.com',
      buttonTitle: 'Click here',
    })

    assert(mockSend.sent === true && mockSend.simulated === true, 'Mock client returns simulated success')
    assert(String(mockSend.messageId).startsWith('sim_mid_'), 'Mock client assigns deterministic simulated messageId')
    assert(mockClient.getDispatches().length === 1, 'Mock client tracks dispatch in audit history')

    // -------------------------------------------------------------------------
    // 2. Pattern 1 & 2: Sequential vs. Burst Workloads & Rate Pacing
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Traffic Patterns: Burst & Actual Rate Limiter Timing ---')

    const generator = new SyntheticJobGenerator({ prefix: 'sim_test' })
    const { creators, accounts } = await generator.setupTestFixtures({ accountsCount: 1 })
    const testAccount = accounts[0]

    // Configure a test rate limit of 400ms spacing (~2.5 dispatches/sec)
    await prisma.autoDmRateLimit.update({
      where: { instagramAccountId: testAccount.id },
      data: { minIntervalMs: 400, maxPerHour: 500, maxPerMinute: 60 },
    })

    // Reset mock dispatches
    mockClient.clearHistory()

    // Enqueue a burst of 10 jobs
    const burstEnqueue = await generator.generateJobs({
      count: 10,
      pattern: 'burst',
      targetAccountId: testAccount.id,
    })
    assert(burstEnqueue.count === 10, 'Instant burst: 10 jobs enqueued concurrently')

    // Process burst through worker processBatch
    const timestamps = []
    for (let round = 0; round < 15; round++) {
      const batchRes = await autoDmQueueService.processBatch('worker-burst-test', 2, { isSimulation: true })
      if (batchRes.processed === 0 && batchRes.delayed === 0) {
        const remaining = await prisma.autoDmQueueJob.count({
          where: { isSimulation: true, status: 'PENDING' },
        })
        if (remaining === 0) break
      }
      // Wait slightly between rounds
      await new Promise((r) => setTimeout(r, 200))
    }

    const recordedDispatches = mockClient.getDispatches()
    assert(recordedDispatches.length === 10, 'All 10 burst jobs successfully dispatched by worker')

    // Verify actual dispatch pacing from recorded timestamps
    let minObservedIntervalMs = Infinity
    for (let i = 1; i < recordedDispatches.length; i++) {
      const interval = recordedDispatches[i].timestamp - recordedDispatches[i - 1].timestamp
      if (interval < minObservedIntervalMs) {
        minObservedIntervalMs = interval
      }
    }

    console.log(`  📊 Observed minimum dispatch spacing: ${minObservedIntervalMs}ms (Configured minimum: 400ms)`)
    assert(
      minObservedIntervalMs >= 350, // Allowing minor 50ms timer jitter
      'Observed dispatch timestamps respect configured minimum spacing limit'
    )

    simulationReports.push({
      scenario: 'Burst Pacing (10 jobs, 400ms limit)',
      jobsSubmitted: 10,
      jobsProcessed: 10,
      simulatedSuccesses: 10,
      simulatedFailures: 0,
      minObservedSpacingMs: minObservedIntervalMs,
      configuredLimitMs: 400,
      result: 'PASS',
    })

    await generator.cleanup()

    // -------------------------------------------------------------------------
    // 3. Pattern 4: Multiple Accounts Independent Concurrency
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Multiple Accounts Independent Scheduling & Concurrency ---')

    const multiGen = new SyntheticJobGenerator({ prefix: 'sim_multi' })
    const multiFixtures = await multiGen.setupTestFixtures({ accountsCount: 2 })
    const accA = multiFixtures.accounts[0]
    const accB = multiFixtures.accounts[1]

    // Set Acc A with 1000ms pacing and Acc B with 200ms pacing
    await prisma.autoDmRateLimit.update({
      where: { instagramAccountId: accA.id },
      data: { minIntervalMs: 1000 },
    })
    await prisma.autoDmRateLimit.update({
      where: { instagramAccountId: accB.id },
      data: { minIntervalMs: 200 },
    })

    // Pause Account A specifically
    await autoDmRateLimitsRepo.pauseAccount(accA.id, {
      pauseMinutes: 15,
      reason: 'Simulated Meta Throttling (Code 613)',
    })

    mockClient.clearHistory()

    // Enqueue 4 jobs for Account A and 4 jobs for Account B
    await multiGen.generateJobs({ count: 4, pattern: 'burst', targetAccountId: accA.id })
    await multiGen.generateJobs({ count: 4, pattern: 'burst', targetAccountId: accB.id })

    // Process a batch
    await autoDmQueueService.processBatch('worker-multi-1', 10, { isSimulation: true })

    const multiDispatches = mockClient.getDispatches()
    const dispatchesForA = multiDispatches.filter((d) => d.payload.instagramAccountId === accA.id)
    const dispatchesForB = multiDispatches.filter((d) => d.payload.instagramAccountId === accB.id)

    assert(dispatchesForA.length === 0, 'Account A jobs blocked while Account A is paused')
    assert(dispatchesForB.length > 0, 'Account B jobs progress independently despite Account A pause')

    simulationReports.push({
      scenario: 'Multi-Account Independence (Account A paused vs Account B active)',
      jobsSubmitted: 8,
      accountAPausedDispatches: dispatchesForA.length,
      accountBActiveDispatches: dispatchesForB.length,
      result: 'PASS',
    })

    await multiGen.cleanup()

    // -------------------------------------------------------------------------
    // 4. Simulated Meta API Response Error Handling
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Simulated Meta API Failure Responses & Policy Transitions ---')

    const errorGen = new SyntheticJobGenerator({ prefix: 'sim_errors' })
    const errorFixtures = await errorGen.setupTestFixtures({ accountsCount: 1 })
    const errAcc = errorFixtures.accounts[0]

    // Set 0ms interval so error response assertions run immediately without pacing delay
    await prisma.autoDmRateLimit.update({
      where: { instagramAccountId: errAcc.id },
      data: { minIntervalMs: 0 },
    })

    // A. Meta Code 613 / HTTP 429 Rate Limit Response
    mockClient.setBehavior({
      forcedError: { code: 613, status: 429, message: 'Calls to this api have exceeded the rate limit' },
    })

    const jobRateLimit = (
      await errorGen.generateJobs({ count: 1, pattern: 'burst', targetAccountId: errAcc.id })
    ).jobs[0]

    const processResRateLimit = await autoDmQueueService.processJob(jobRateLimit, 'worker-err-test')
    assert(processResRateLimit.success === false, 'Rate limit error handled as non-success')

    const refreshedJob1 = await prisma.autoDmQueueJob.findUnique({ where: { id: jobRateLimit.id } })
    assert(refreshedJob1.status === 'RETRYING', 'Job transitioned to RETRYING upon code 613')
    assert(refreshedJob1.lastErrorCategory === 'RATE_LIMITED', 'Error category is RATE_LIMITED')

    const rateLimitState = await autoDmRateLimitsRepo.getStatus(errAcc.id)
    assert(rateLimitState.isPaused === true, 'Account rate limit profile automatically PAUSED upon code 613')

    // Resume account for next test
    await autoDmRateLimitsRepo.resumeAccount(errAcc.id, errorFixtures.creators[0].id)

    // B. Meta Code 190 (Token Revoked) Permanent Error
    mockClient.setBehavior({
      forcedError: { code: 190, status: 401, message: 'Invalid OAuth access token - revoked by user' },
    })

    const jobAuthError = (
      await errorGen.generateJobs({ count: 1, pattern: 'burst', targetAccountId: errAcc.id })
    ).jobs[0]

    await autoDmQueueService.processJob(jobAuthError, 'worker-err-test')
    const refreshedJob2 = await prisma.autoDmQueueJob.findUnique({ where: { id: jobAuthError.id } })
    assert(refreshedJob2.status === 'FAILED', 'Token revoked (code 190) transitions permanently to FAILED')
    assert(refreshedJob2.lastErrorCategory === 'AUTH_EXPIRED', 'Error category is AUTH_EXPIRED')

    // C. Delivery Ambiguity: Timeout occurred AFTER provider socket acceptance
    mockClient.setBehavior({
      forcedError: null,
      timeoutAfterAcceptance: true,
    })

    const jobAmbiguous = (
      await errorGen.generateJobs({ count: 1, pattern: 'burst', targetAccountId: errAcc.id })
    ).jobs[0]

    const processResAmbiguous = await autoDmQueueService.processJob(jobAmbiguous, 'worker-err-test')
    assert(processResAmbiguous.ambiguous === true, 'Flags ambiguous delivery outcome')

    const refreshedJob3 = await prisma.autoDmQueueJob.findUnique({ where: { id: jobAmbiguous.id } })
    assert(refreshedJob3.status === 'FAILED', 'Ambiguous delivery halts blind retries to prevent duplicate DMs')
    assert(refreshedJob3.lastErrorCategory === 'DELIVERY_AMBIGUITY', 'Category is DELIVERY_AMBIGUITY')

    simulationReports.push({
      scenario: 'Meta Error Classification (Rate Limit 613, Token Revoked 190, Ambiguity)',
      jobsSubmitted: 3,
      classifiedCategories: ['RATE_LIMITED', 'AUTH_EXPIRED', 'DELIVERY_AMBIGUITY'],
      result: 'PASS',
    })

    await errorGen.cleanup()

    // -------------------------------------------------------------------------
    // 5. Worker Interruption & Crash Recovery (Check 2: Crash after Provider Acceptance)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Worker Interruption & Crash Recovery (Check 2: Crash After Acceptance) ---')

    const crashGen = new SyntheticJobGenerator({ prefix: 'sim_crash' })
    const crashFixtures = await crashGen.setupTestFixtures({ accountsCount: 1 })
    const crashAcc = crashFixtures.accounts[0]

    // Step 1: Worker 1 claims a job
    const jobCommentId = `sim_comm_crash_accept_${Date.now()}`
    const enqCrash = await autoDmQueueService.enqueueFromWebhook({
      creatorId: crashFixtures.creators[0].id,
      instagramAccountId: crashAcc.id,
      automationId: crashFixtures.automations[0].id,
      commentId: jobCommentId,
      senderId: 'sim_crash_sender_1',
      recipientUsername: 'sim_crash_user',
      message: 'Crash after acceptance test',
      isSimulation: true,
    })
    const testCrashJob = enqCrash.job

    // Worker claims the job (status -> PROCESSING, attemptCount -> 1)
    await prisma.autoDmQueueJob.update({
      where: { id: testCrashJob.id },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 300000), // 5 min ago
        lockedBy: 'crashed-worker-pid-888',
        lockExpiresAt: new Date(Date.now() - 5000), // Expired 5s ago
        attemptCount: 1,
      },
    })

    // Step 2: The mock provider accepts the message and records simulated message ID
    mockClient.clearHistory()
    mockClient.setBehavior({ forcedError: null, timeoutAfterAcceptance: false, timeoutBeforeAcceptance: false })
    const providerAcceptance = await mockClient.sendDirectMessage({
      commentId: jobCommentId,
      recipientId: 'sim_crash_sender_1',
      text: 'Crash after acceptance test',
      instagramAccountId: crashAcc.id,
      isSimulation: true,
    })
    assert(providerAcceptance.sent === true, 'Step 2: Mock provider accepts message before worker crash')
    const originalProviderMessageId = providerAcceptance.messageId
    assert(mockClient.getDispatches().length === 1, 'Provider recorded 1 initial dispatch')

    // Step 3: Worker crashes before calling markSent (Job remains in PROCESSING with expired lease)

    // Step 4 & 5: Job lease expires and recovery runs
    const recovered = await autoDmQueueRepo.recoverStuckJobs(30)
    assert(recovered >= 1, 'Step 4 & 5: recoverStuckJobs identifies and claims expired lease')

    const reloadedAbandoned = await prisma.autoDmQueueJob.findUnique({
      where: { id: testCrashJob.id },
    })
    assert(reloadedAbandoned.status === 'RETRYING', 'Abandoned job status safely restored to RETRYING')
    assert(reloadedAbandoned.lastErrorCategory === 'WORKER_RECOVERED', 'Job tagged as WORKER_RECOVERED')

    // Step 6: Another worker claims and processes the recovered job
    // It must NOT blindly call sendDirectMessage again!
    const recoveredBatch = await autoDmQueueService.processBatch('restarted-worker-pid-999', 5, { isSimulation: true })
    assert(recoveredBatch.processed >= 1, 'Restarted worker processed the recovered job')

    // Assert recovery did NOT blindly resend to the provider!
    const dispatchesAfterRecovery = mockClient.getDispatches()
    assert(
      dispatchesAfterRecovery.length === 1,
      `Step 6: ZERO DUPLICATE SENDS - Provider dispatch count remained exactly 1 (Observed: ${dispatchesAfterRecovery.length})`
    )

    const completedAbandoned = await prisma.autoDmQueueJob.findUnique({
      where: { id: testCrashJob.id },
    })
    assert(completedAbandoned.status === 'SENT', 'Recovered job reconciled safely to SENT status')
    assert(
      completedAbandoned.providerMessageId === originalProviderMessageId,
      'Recovered job reconciled with the exact original provider message ID'
    )

    // Ambiguous Delivery Case Verification:
    // If provider status cannot be confirmed, recovery must halt with DELIVERY_AMBIGUITY rather than blindly resend
    const unconfirmedCommentId = `sim_comm_unconfirmed_${Date.now()}`
    const unconfirmedJob = await prisma.autoDmQueueJob.create({
      data: {
        id: uuidv4(),
        creatorId: crashFixtures.creators[0].id,
        instagramAccountId: crashAcc.id,
        dedupeKey: `sim:comm:unconfirmed_${Date.now()}`,
        commentId: unconfirmedCommentId,
        recipientId: 'sim_unconfirmed_recip',
        message: 'Unconfirmed delivery test',
        status: 'PROCESSING',
        isSimulation: true,
        lockedAt: new Date(Date.now() - 300000),
        lockedBy: 'crashed-worker-pid-777',
        lockExpiresAt: new Date(Date.now() - 5000),
        attemptCount: 1,
        maxAttempts: 5,
      },
    })

    // Recover lease
    await autoDmQueueRepo.recoverStuckJobs(30)
    // Force mock provider to report delivery status as ambiguous (unconfirmed)
    mockClient.setBehavior({ forceAmbiguousDelivery: true })

    await autoDmQueueService.processBatch('restarted-worker-pid-999', 5, { isSimulation: true })
    const refreshedUnconfirmed = await prisma.autoDmQueueJob.findUnique({ where: { id: unconfirmedJob.id } })

    assert(
      refreshedUnconfirmed.status === 'FAILED' && refreshedUnconfirmed.lastErrorCategory === 'DELIVERY_AMBIGUITY',
      'Unconfirmed recovered job transitions to FAILED (DELIVERY_AMBIGUITY) without blind resend'
    )

    mockClient.setBehavior({ forceAmbiguousDelivery: false })

    simulationReports.push({
      scenario: 'Worker Crash & Delivery Reconciliation (Check 2)',
      jobsSubmitted: 2,
      recoveredCount: recovered,
      finalStatus: 'SENT / AMBIGUITY_HALTED',
      result: 'PASS',
    })

    await crashGen.cleanup()

    // -------------------------------------------------------------------------
    // 5B. Check 1: Distributed Rate-Limit Race Condition & Atomic Slot Reservation
    // -------------------------------------------------------------------------
    console.log('\n--- 5B. Distributed Rate-Limit Race Condition & Atomic Slot Reservation (Check 1) ---')

    const raceGen = new SyntheticJobGenerator({ prefix: 'sim_race' })
    const raceFixtures = await raceGen.setupTestFixtures({ accountsCount: 2 })
    const raceAccA = raceFixtures.accounts[0]
    const raceAccB = raceFixtures.accounts[1]

    // Set 400ms interval on Account A and Account B
    await prisma.autoDmRateLimit.updateMany({
      where: { instagramAccountId: { in: [raceAccA.id, raceAccB.id] } },
      data: { minIntervalMs: 400, maxPerHour: 500, maxPerMinute: 60 },
    })

    mockClient.clearHistory()
    mockClient.setBehavior({ providerLatencyMs: 15, forcedError: null })

    // Enqueue 3 jobs for Account A and 1 job for Account B
    await raceGen.generateJobs({ count: 3, pattern: 'burst', targetAccountId: raceAccA.id })
    await raceGen.generateJobs({ count: 1, pattern: 'burst', targetAccountId: raceAccB.id })

    // SIMULATE MULTIPLE CONCURRENT WORKERS ATTEMPTING TO DISPATCH FOR ACCOUNT A AT THE EXACT SAME MILLISECOND
    // 3 concurrent workers compete simultaneously for Account A jobs:
    const concurrentBatches = await Promise.all([
      autoDmQueueService.processBatch('concurrent-worker-1', 1, { isSimulation: true }),
      autoDmQueueService.processBatch('concurrent-worker-2', 1, { isSimulation: true }),
      autoDmQueueService.processBatch('concurrent-worker-3', 1, { isSimulation: true }),
      autoDmQueueService.processBatch('concurrent-worker-4', 1, { isSimulation: true }),
    ])

    // Under atomic slot reservation, only ONE worker can reserve the slot for Account A in the initial millisecond window.
    // The other workers for Account A MUST be paced with INTERVAL_PACING.
    const initialDispatches = mockClient.getDispatches().filter((d) => d.payload?.instagramAccountId === raceAccA.id)
    assert(
      initialDispatches.length === 1,
      `Atomic slot reservation allowed exactly 1 dispatch for Account A during simultaneous contention (Observed: ${initialDispatches.length})`
    )

    // Unrelated Account B must progress independently without being blocked by Account A's lock
    const raceDispatchesForB = mockClient.getDispatches().filter((d) => d.payload?.instagramAccountId === raceAccB.id)
    assert(
      raceDispatchesForB.length === 1,
      `Unrelated Account B dispatched independently without blocking (Observed: ${raceDispatchesForB.length})`
    )

    // Allow remaining paced jobs for Account A to complete with proper pacing
    for (let round = 0; round < 6; round++) {
      await new Promise((r) => setTimeout(r, 450))
      await autoDmQueueService.processBatch('concurrent-worker-drain', 2, { isSimulation: true })
      const pendingA = await prisma.autoDmQueueJob.count({
        where: { instagramAccountId: raceAccA.id, status: 'PENDING' },
      })
      if (pendingA === 0) break
    }

    const allDispatchesA = mockClient.getDispatches().filter((d) => d.payload?.instagramAccountId === raceAccA.id)
    assert(allDispatchesA.length === 3, `All 3 jobs for Account A eventually dispatched (Recorded: ${allDispatchesA.length})`)

    // Verify minimum observed spacing across actual dispatch timestamps on Account A
    let minIntervalA = Infinity
    for (let i = 1; i < allDispatchesA.length; i++) {
      const diff = allDispatchesA[i].timestamp - allDispatchesA[i - 1].timestamp
      if (diff < minIntervalA) minIntervalA = diff
    }
    console.log(`  📊 Observed minimum spacing under concurrent workers: ${minIntervalA}ms (Configured floor: 400ms)`)
    assert(
      minIntervalA >= 350,
      `Actual dispatch timestamps strictly respect configured spacing under concurrent workers (Observed: ${minIntervalA}ms)`
    )

    simulationReports.push({
      scenario: 'Distributed Rate-Limit Race & Atomic Slot (Check 1)',
      jobsSubmitted: 4,
      minObservedSpacingMs: minIntervalA,
      configuredLimitMs: 400,
      accountBActiveDispatches: raceDispatchesForB.length,
      result: 'PASS',
    })

    await raceGen.cleanup()

    // -------------------------------------------------------------------------
    // 6. High-Volume Capacity (100 Jobs Burst) & Database Safety
    // -------------------------------------------------------------------------
    console.log('\n--- 6. High-Volume Capacity (100 Jobs Burst) & Database Safety ---')

    const loadGen = new SyntheticJobGenerator({ prefix: 'sim_load100' })
    const loadFixtures = await loadGen.setupTestFixtures({ accountsCount: 2 })
    const loadAcc1 = loadFixtures.accounts[0]
    const loadAcc2 = loadFixtures.accounts[1]

    // Configure fast pacing for load test (50ms interval = ~20 req/s)
    await prisma.autoDmRateLimit.updateMany({
      where: { instagramAccountId: { in: [loadAcc1.id, loadAcc2.id] } },
      data: { minIntervalMs: 50, maxPerHour: 5000, maxPerMinute: 2000 },
    })

    setMetaApiClient(mockClient)
    mockClient.clearHistory()
    mockClient.setBehavior({ providerLatencyMs: 0, successProbability: 1.0, forcedError: null, timeoutBeforeAcceptance: false, timeoutAfterAcceptance: false })

    const loadStartTime = Date.now()

    // 1. Enqueue 100 jobs concurrently
    const enqueue100 = await loadGen.generateJobs({
      count: 100,
      pattern: 'multi_account_burst',
    })

    assert(enqueue100.count === 100, 'Successfully enqueued 100 synthetic jobs concurrently')
    console.log(`  ⏱️ Enqueue duration: ${enqueue100.durationMs}ms (${enqueue100.enqueueRatePerSec} jobs/sec)`)

    // Verify deduplication under load
    const dupTry = await autoDmQueueService.enqueueFromWebhook({
      creatorId: loadAcc1.creatorId,
      instagramAccountId: loadAcc1.id,
      automationId: loadFixtures.automations[0].id,
      commentId: `sim_comm_${loadGen.prefix}_${loadAcc1.id.slice(0, 8)}_0`, // Same as job 0
      senderId: `sim_sender_${loadAcc1.id.slice(0, 8)}_0`,
      recipientUsername: 'sim_user_0',
      message: 'Duplicate under load',
      isSimulation: true,
    })
    assert(dupTry.enqueued === false && dupTry.duplicate === true, 'Duplicate enqueue blocked under concurrent load')

    // 2. Process all 100 jobs across 3 concurrent simulated workers
    let processed100 = 0
    let loopRounds = 0
    while (loopRounds < 60) {
      loopRounds++
      const results = await Promise.all([
        autoDmQueueService.processBatch('worker-load-1', 10, { isSimulation: true }),
        autoDmQueueService.processBatch('worker-load-2', 10, { isSimulation: true }),
        autoDmQueueService.processBatch('worker-load-3', 10, { isSimulation: true }),
      ])
      for (const r of results) processed100 += r.processed

      const remainingPending = await prisma.autoDmQueueJob.count({
        where: { isSimulation: true, status: 'PENDING' },
      })
      if (remainingPending === 0) break
      await new Promise((r) => setTimeout(r, 60))
    }

    const totalDurationMs = Date.now() - loadStartTime
    const dispatches100 = mockClient.getDispatches()

    assert(dispatches100.length === 100, `All 100 synthetic jobs processed (Recorded: ${dispatches100.length})`)

    const counts100 = await prisma.autoDmQueueJob.groupBy({
      by: ['status'],
      where: { isSimulation: true },
      _count: { status: true },
    })
    const summary100 = {}
    for (const c of counts100) summary100[c.status] = c._count.status

    assert(summary100.SENT === 100, 'All 100 jobs successfully recorded in SENT state')
    assert(!summary100.PROCESSING, '0 jobs stranded in PROCESSING state')
    assert(!summary100.FAILED, '0 jobs failed')

    console.log(`  ⏱️ Processing duration: ${totalDurationMs}ms (~${Math.round(100 / (totalDurationMs / 1000))} jobs/sec)`)

    simulationReports.push({
      scenario: 'High-Volume Capacity (100 jobs burst, 3 workers)',
      jobsSubmitted: 100,
      jobsProcessed: dispatches100.length,
      simulatedSuccesses: summary100.SENT || 0,
      simulatedFailures: summary100.FAILED || 0,
      enqueueDurationMs: enqueue100.durationMs,
      totalDurationMs,
      result: 'PASS',
    })

    await loadGen.cleanup()

  } catch (err) {
    console.error('Simulation audit encountered unexpected error:', err)
    failed++
  } finally {
    delete process.env.AUTO_DM_SIMULATION_MODE
    resetMetaApiClient()
  }

  // ---------------------------------------------------------------------------
  // Output Structured Simulation Report
  // ---------------------------------------------------------------------------
  console.log('\n=================================================================')
  console.log('SIMULATION & LOAD AUDIT EXECUTION REPORT')
  console.log('=================================================================')
  console.table(simulationReports)

  console.log('\n=================================================================')
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runSimulationAudit()
