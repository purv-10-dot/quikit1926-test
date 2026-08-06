import { Queue, type JobsOptions } from "bullmq";
import { getQueueRedis } from "@/lib/db/redis";

export interface AutomationJobData {
  tenantId: string;
  workflowId: string;
  leadId: string;
  startNodeId: string;
  /** Provided when a wait-resume creates a child job, so the audit row can be tied back. */
  pendingStepId?: string;
  /** Step index for cycle detection across BullMQ-spanned executions. */
  step?: number;
  /** Attribution (SPEC §8): trigger event id, trigger type, and the trigger-time
   *  field snapshot, threaded from the emit site through to runFrom. */
  triggerEventId?: string;
  triggerType?: string;
  triggerSnapshot?: Record<string, unknown>;
}

const QUEUE_NAME = "automation";

let _queue: Queue<AutomationJobData> | null = null;

export function getAutomationQueue(): Queue<AutomationJobData> {
  if (_queue) return _queue;
  _queue = new Queue<AutomationJobData>(QUEUE_NAME, {
    connection: getQueueRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return _queue;
}

export async function enqueueAutomation(
  data: AutomationJobData,
  opts: JobsOptions = {},
): Promise<string> {
  const queue = getAutomationQueue();
  const jobId = opts.jobId ?? `${data.workflowId}:${data.leadId}:${data.startNodeId}:${data.step ?? 0}`;
  const job = await queue.add("run", data, { ...opts, jobId });
  return String(job.id);
}

export const AUTOMATION_QUEUE_NAME = QUEUE_NAME;
