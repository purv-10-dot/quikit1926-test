/**
 * In-process cron driver — polls QuikSocial's two cron routes on a timer.
 *
 *   /api/cron/publish-scheduled  — every 30s — moves approved + scheduled
 *                                  posts to "published".
 *   /api/cron/auto-reply-monitor — every 60s — kicks the Meta Graph
 *                                  comment-poll → reply pipeline (which
 *                                  in turn fans out to the Python AI
 *                                  service on Railway).
 *
 * QuikSocial deploys to Vercel where serverless functions don't have a
 * persistent process. In production cron is driven by `vercel.json`.
 * For local/UAT/staging where the Node server stays up, this in-process
 * timer keeps scheduled posts + auto-reply ticking without external infra.
 *
 * Boot path: `instrumentation.ts` -> `register()` -> `startCronScheduler()`.
 */

const PUBLISH_INTERVAL_MS = 30_000;
const AUTO_REPLY_INTERVAL_MS = 60_000;

let started = false;
let publishTimer: NodeJS.Timeout | null = null;
let autoReplyTimer: NodeJS.Timeout | null = null;

function resolveBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${process.env.PORT || "3007"}`
  );
}

async function callCronRoute(path: string, label: string): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return;

  const url = `${resolveBaseUrl().replace(/\/$/, "")}${path}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[cron-scheduler] ${label} returned ${res.status} from ${url}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[cron-scheduler] ${label} failed: ${message}`);
  }
}

export function startCronScheduler(): void {
  if (started) return;
  started = true;

  console.log(
    `[cron-scheduler] starting in-process cron driver (publish ${PUBLISH_INTERVAL_MS}ms, auto-reply ${AUTO_REPLY_INTERVAL_MS}ms)`,
  );

  publishTimer = setInterval(() => {
    void callCronRoute("/api/cron/publish-scheduled", "publish tick");
  }, PUBLISH_INTERVAL_MS);

  autoReplyTimer = setInterval(() => {
    void callCronRoute("/api/cron/auto-reply-monitor", "auto-reply tick");
  }, AUTO_REPLY_INTERVAL_MS);

  if (typeof publishTimer.unref === "function") publishTimer.unref();
  if (typeof autoReplyTimer.unref === "function") autoReplyTimer.unref();
}

export function stopCronScheduler(): void {
  if (publishTimer) {
    clearInterval(publishTimer);
    publishTimer = null;
  }
  if (autoReplyTimer) {
    clearInterval(autoReplyTimer);
    autoReplyTimer = null;
  }
  started = false;
}
