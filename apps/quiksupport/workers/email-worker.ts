/**
 * Email queue worker. Run standalone: npx ts-node src/workers/email-worker.ts
 * Add to package.json scripts: "worker:email": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' src/workers/email-worker.ts"
 */

import { redis, EMAIL_QUEUE } from '@/lib/redis'
import { sendEmail, type EmailPayload } from '@/lib/email'

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

async function processQueue() {
  console.log('[email-worker] Starting. Polling every', POLL_INTERVAL_MS, 'ms')

  while (true) {
    try {
      const raw = await redis.lpop(EMAIL_QUEUE)
      if (!raw) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const job = JSON.parse(raw) as EmailPayload & { retries?: number }
      const retries = job.retries || 0

      try {
        await sendEmail(job)
        console.log(`[email-worker] Sent "${job.subject}" to ${Array.isArray(job.to) ? job.to.join(', ') : job.to}`)
      } catch (err) {
        if (retries < MAX_RETRIES) {
          console.warn(`[email-worker] Failed (attempt ${retries + 1}), requeueing`)
          await redis.lpush(EMAIL_QUEUE, JSON.stringify({ ...job, retries: retries + 1 }))
        } else {
          console.error(`[email-worker] Dropped after ${MAX_RETRIES} retries:`, err)
        }
      }
    } catch (err) {
      console.error('[email-worker] Queue error:', err)
      await sleep(POLL_INTERVAL_MS * 5)
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

processQueue().catch(err => {
  console.error('[email-worker] Fatal:', err)
  process.exit(1)
})
