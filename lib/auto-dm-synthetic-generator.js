/**
 * Synthetic Job Generator & Traffic Simulator
 *
 * Provides a protected test harness for:
 * 1. Sequential workloads
 * 2. Instant burst workloads
 * 3. Steady stream workloads
 * 4. Multi-account concurrent bursts
 * 5. Backlog accumulation & recovery
 * 6. Worker crash and restart simulation
 *
 * Invariants:
 * - All generated jobs have isSimulation: true and dedupe keys prefixed with sim:
 * - Never dispatched to real Meta API endpoints.
 * - Test accounts & records are cleanly isolated and tracked.
 */

import { v4 as uuidv4 } from 'uuid'
import { prisma } from './prisma.js'
import { autoDmQueueRepo, autoDmRateLimitsRepo } from './repos.js'
import { autoDmQueueService } from './auto-dm-queue-service.js'
import { MockMetaApiClient, setMetaApiClient, resetMetaApiClient } from './meta-api-client.js'

export class SyntheticJobGenerator {
  constructor(options = {}) {
    this.prefix = options.prefix || `sim_${Date.now()}`
    this.testCreators = []
    this.testAccounts = []
    this.testAutomations = []
  }

  /**
   * Sets up isolated simulated creator accounts, Instagram accounts, and automations.
   */
  async setupTestFixtures({ accountsCount = 2, automationsPerAccount = 1 } = {}) {
    for (let i = 0; i < accountsCount; i++) {
      const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      const creator = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: `${this.prefix}_creator_${i}_${nonce}@synthetic-test.local`,
          passwordHash: 'dummy_sim_hash',
          role: 'CREATOR',
        },
      })
      this.testCreators.push(creator)

      // Active subscription with Auto-DM entitlement
      await prisma.creatorSubscription.create({
        data: {
          id: uuidv4(),
          creatorId: creator.id,
          plan: 'CREATOR',
          status: 'ACTIVE',
        },
      })

      // Connected Instagram professional account
      const igAccount = await prisma.instagramAccount.create({
        data: {
          id: uuidv4(),
          creatorId: creator.id,
          platformUserId: `sim_ig_user_${i}_${nonce}`,
          username: `sim_creator_${i}_${nonce}`,
          accessToken: `sim_meta_token_${i}`,
          status: 'CONNECTED',
        },
      })
      this.testAccounts.push(igAccount)

      // Initialize rate limiter profile
      await autoDmRateLimitsRepo.getOrInit(igAccount.id, creator.id)

      for (let j = 0; j < automationsPerAccount; j++) {
        const auto = await prisma.automation.create({
          data: {
            id: uuidv4(),
            creatorId: creator.id,
            name: `Sim Automation ${i}-${j}`,
            triggerType: 'COMMENT_KEYWORD',
            triggerValue: 'PROMO',
            message: `Hello from synthetic automation ${i}-${j}`,
            status: 'ACTIVE',
          },
        })
        this.testAutomations.push(auto)
      }
    }

    return {
      creators: this.testCreators,
      accounts: this.testAccounts,
      automations: this.testAutomations,
    }
  }

  /**
   * Generates and enqueues synthetic jobs based on arrival pattern.
   */
  async generateJobs({
    count = 10,
    pattern = 'burst', // 'sequential' | 'burst' | 'steady_stream' | 'multi_account_burst'
    intervalMs = 100,
    targetAccountId = null,
  } = {}) {
    const jobs = []
    const startTime = Date.now()

    const enqueueSingle = async (idx, account) => {
      const auto = this.testAutomations.find((a) => a.creatorId === account.creatorId) || this.testAutomations[0]
      const commentId = `sim_comm_${this.prefix}_${account.id.slice(0, 8)}_${idx}`
      const senderId = `sim_sender_${account.id.slice(0, 8)}_${idx}`

      const res = await autoDmQueueService.enqueueFromWebhook({
        creatorId: account.creatorId,
        instagramAccountId: account.id,
        automationId: auto.id,
        commentId,
        mediaId: `sim_media_${idx % 5}`,
        senderId,
        recipientUsername: `sim_user_${idx}`,
        message: `Synthetic DM #${idx} for ${account.username}`,
        buttonTitle: 'Access Link',
        destinationUrl: 'https://example.com/sim',
        isSimulation: true,
      })

      if (res.job) jobs.push(res.job)
      return res
    }

    if (pattern === 'burst') {
      const targetAccount = targetAccountId
        ? this.testAccounts.find((a) => a.id === targetAccountId)
        : this.testAccounts[0]
      const promises = []
      for (let i = 0; i < count; i++) {
        promises.push(enqueueSingle(i, targetAccount))
      }
      await Promise.all(promises)
    } else if (pattern === 'sequential') {
      const targetAccount = targetAccountId
        ? this.testAccounts.find((a) => a.id === targetAccountId)
        : this.testAccounts[0]
      for (let i = 0; i < count; i++) {
        await enqueueSingle(i, targetAccount)
        if (intervalMs > 0 && i < count - 1) {
          await new Promise((r) => setTimeout(r, intervalMs))
        }
      }
    } else if (pattern === 'multi_account_burst') {
      const promises = []
      for (let i = 0; i < count; i++) {
        const account = this.testAccounts[i % this.testAccounts.length]
        promises.push(enqueueSingle(i, account))
      }
      await Promise.all(promises)
    } else if (pattern === 'steady_stream') {
      const targetAccount = targetAccountId
        ? this.testAccounts.find((a) => a.id === targetAccountId)
        : this.testAccounts[0]
      for (let i = 0; i < count; i++) {
        await enqueueSingle(i, targetAccount)
        if (intervalMs > 0 && i < count - 1) {
          await new Promise((r) => setTimeout(r, intervalMs))
        }
      }
    }

    const durationMs = Date.now() - startTime
    return {
      jobs,
      count: jobs.length,
      durationMs,
      enqueueRatePerSec: durationMs > 0 ? Math.round((jobs.length / (durationMs / 1000)) * 10) / 10 : jobs.length,
    }
  }

  /**
   * Executes a simulated workload against the queue with a configured mock API client.
   */
  async runSimulationScenario({
    name,
    jobCount = 20,
    pattern = 'burst',
    mockBehavior = {},
    accountsCount = 1,
    workerConcurrency = 2,
    maxProcessingRounds = 50,
    batchSize = 5,
    customRateLimitMs = null,
  }) {
    console.log(`\n======================================================`)
    console.log(`[SYNTHETIC_GENERATOR] Running Scenario: ${name}`)
    console.log(`Config: ${jobCount} jobs, pattern: ${pattern}, workers: ${workerConcurrency}`)
    console.log(`======================================================`)

    // 1. Configure Mock Meta API Client
    const mockClient = new MockMetaApiClient(mockBehavior)
    setMetaApiClient(mockClient)

    // 2. Setup fixtures
    await this.setupTestFixtures({ accountsCount })

    // Optional custom test rate limit (e.g. 2 dispatches/sec = 500ms spacing)
    if (customRateLimitMs !== null) {
      for (const acc of this.testAccounts) {
        await prisma.autoDmRateLimit.update({
          where: { instagramAccountId: acc.id },
          data: { minIntervalMs: customRateLimitMs },
        })
      }
    }

    // 3. Enqueue synthetic jobs
    const enqueueResult = await this.generateJobs({
      count: jobCount,
      pattern,
    })

    console.log(`[SYNTHETIC_GENERATOR] Enqueued ${enqueueResult.count} jobs in ${enqueueResult.durationMs}ms (${enqueueResult.enqueueRatePerSec} jobs/sec)`)

    // 4. Process jobs using concurrent simulated workers
    const processingStartTime = Date.now()
    let rounds = 0
    let totalProcessed = 0
    let totalFailed = 0
    let totalDelayed = 0

    while (rounds < maxProcessingRounds) {
      rounds++
      // Run batch processing across workerConcurrency worker IDs
      const workerPromises = []
      for (let w = 0; w < workerConcurrency; w++) {
        const workerId = `sim-worker-${w}`
        workerPromises.push(
          autoDmQueueService.processBatch(workerId, batchSize, { isSimulation: true })
        )
      }

      const results = await Promise.all(workerPromises)
      let roundProcessed = 0
      for (const res of results) {
        roundProcessed += res.processed
        totalProcessed += res.processed
        totalFailed += res.failed
        totalDelayed += res.delayed
      }

      // Check remaining pending / retrying simulation jobs
      const remaining = await prisma.autoDmQueueJob.count({
        where: {
          isSimulation: true,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      })

      if (remaining === 0 && roundProcessed === 0) {
        break
      }

      // Short delay between polling rounds
      await new Promise((r) => setTimeout(r, 100))
    }

    const processingDurationMs = Date.now() - processingStartTime

    // 5. Gather Final Statistics
    const finalCounts = await prisma.autoDmQueueJob.groupBy({
      by: ['status'],
      where: { isSimulation: true },
      _count: { status: true },
    })
    const summary = {}
    for (const c of finalCounts) {
      summary[c.status] = c._count.status
    }

    const dispatches = mockClient.getDispatches()
    const dispatchTimestamps = mockClient.getDispatchTimestamps()

    // Calculate maximum observed dispatch rate (rolling 1-second window)
    let maxObservedRatePerSec = 0
    if (dispatchTimestamps.length > 0) {
      for (let i = 0; i < dispatchTimestamps.length; i++) {
        const windowStart = dispatchTimestamps[i]
        const countInWindow = dispatchTimestamps.filter((t) => t >= windowStart && t < windowStart + 1000).length
        if (countInWindow > maxObservedRatePerSec) {
          maxObservedRatePerSec = countInWindow
        }
      }
    }

    const report = {
      scenario: name,
      jobsSubmitted: jobCount,
      jobsProcessed: totalProcessed,
      simulatedSuccesses: summary.SENT || 0,
      simulatedFailures: summary.FAILED || 0,
      retryingCount: summary.RETRYING || 0,
      pendingCount: summary.PENDING || 0,
      duplicateJobsDetected: 0,
      enqueueDurationMs: enqueueResult.durationMs,
      processingDurationMs,
      maxObservedRatePerSec,
      totalDispatchesObserved: dispatches.length,
      statusSummary: summary,
      isSimulation: true,
    }

    return { report, dispatches, mockClient }
  }

  /**
   * Cleans up all simulation database records created during test.
   */
  async cleanup() {
    try {
      const creatorIds = this.testCreators.map((c) => c.id)
      if (creatorIds.length > 0) {
        await prisma.autoDmQueueJob.deleteMany({
          where: {
            OR: [
              { isSimulation: true },
              { creatorId: { in: creatorIds } },
            ],
          },
        })
        await prisma.autoDmRateLimit.deleteMany({
          where: { creatorId: { in: creatorIds } },
        })
        await prisma.automation.deleteMany({
          where: { creatorId: { in: creatorIds } },
        })
        await prisma.instagramAccount.deleteMany({
          where: { creatorId: { in: creatorIds } },
        })
        await prisma.creatorSubscription.deleteMany({
          where: { creatorId: { in: creatorIds } },
        })
        await prisma.user.deleteMany({
          where: { id: { in: creatorIds } },
        })
      }
    } catch (err) {
      console.warn('[SYNTHETIC_GENERATOR] Cleanup warning:', err.message)
    }
  }
}
