#!/usr/bin/env node

/**
 * CreatorStore Auto-DM Background Worker
 *
 * Dedicated persistent worker for processing queued Instagram Auto-DMs.
 * Designed for Railway deployment as a standalone service.
 *
 * Features:
 * - Persistent execution loop with configurable polling interval.
 * - Atomic job claiming with PostgreSQL FOR UPDATE SKIP LOCKED.
 * - Per-connected-account rate limiting and pacing.
 * - Automatic recovery of abandoned jobs past their lease timeout.
 * - Graceful shutdown on SIGTERM / SIGINT signals.
 * - Heartbeat health reporting.
 */

import { autoDmQueueService } from '../lib/auto-dm-queue-service.js'
import { prisma } from '../lib/prisma.js'

const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}-${Date.now().toString(36)}`
const POLL_INTERVAL_MS = Number(process.env.AUTO_DM_POLL_INTERVAL_MS) || 1500
const BATCH_SIZE = Number(process.env.AUTO_DM_BATCH_SIZE) || 5
const HEARTBEAT_INTERVAL_MS = 60000

let isRunning = true
let isProcessing = false

console.log('======================================================')
console.log(`[AUTO_DM_WORKER] Starting CreatorStore Auto-DM Worker`)
console.log(`[AUTO_DM_WORKER] Worker ID: ${WORKER_ID}`)
console.log(`[AUTO_DM_WORKER] Node Env:  ${process.env.NODE_ENV || 'development'}`)
console.log(`[AUTO_DM_WORKER] Poll Rate: ${POLL_INTERVAL_MS}ms | Batch: ${BATCH_SIZE}`)
console.log('======================================================')

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[AUTO_DM_WORKER] Received ${signal}. Initiating graceful shutdown...`)
  isRunning = false

  const forceExitTimer = setTimeout(() => {
    console.error('[AUTO_DM_WORKER] Force shutdown timeout reached (15s). Exiting.')
    process.exit(1)
  }, 15000)

  const checkInterval = setInterval(() => {
    if (!isProcessing) {
      clearInterval(checkInterval)
      clearTimeout(forceExitTimer)
      console.log('[AUTO_DM_WORKER] All in-flight jobs completed. Worker terminated cleanly.')
      process.exit(0)
    } else {
      console.log('[AUTO_DM_WORKER] Waiting for in-flight job to finish before exiting...')
    }
  }, 500)
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))

// Heartbeat logging
setInterval(async () => {
  if (!isRunning) return
  try {
    const counts = await prisma.autoDmQueueJob.groupBy({
      by: ['status'],
      _count: { status: true },
    })
    const summary = {}
    for (const c of counts) {
      summary[c.status] = c._count.status
    }
    console.log(`[AUTO_DM_WORKER_HEARTBEAT] Worker: ${WORKER_ID} | Queue Status:`, JSON.stringify(summary))
  } catch (err) {
    console.warn(`[AUTO_DM_WORKER_HEARTBEAT] Health check error: ${err.message}`)
  }
}, HEARTBEAT_INTERVAL_MS)

const IS_SIMULATION_WORKER = process.env.AUTO_DM_SIMULATION_MODE === 'true'

// Main polling loop
async function runLoop() {
  while (isRunning) {
    isProcessing = true
    let batchResult = { processed: 0, failed: 0, delayed: 0 }

    try {
      batchResult = await autoDmQueueService.processBatch(WORKER_ID, BATCH_SIZE, {
        isSimulation: process.env.AUTO_DM_PROCESS_ALL === 'true' ? null : IS_SIMULATION_WORKER,
      })
    } catch (loopErr) {
      console.error('[AUTO_DM_WORKER_ERROR] Unexpected error in processing loop:', loopErr)
    } finally {
      isProcessing = false
    }

    if (!isRunning) break

    // If we processed items, immediately poll again for the next batch;
    // otherwise wait for the poll interval to conserve database queries.
    const hasWork = batchResult.processed > 0
    const delay = hasWork ? 200 : POLL_INTERVAL_MS
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

// Start worker
runLoop().catch((fatalErr) => {
  console.error('[AUTO_DM_WORKER_FATAL] Worker crashed with uncaught error:', fatalErr)
  process.exit(1)
})
