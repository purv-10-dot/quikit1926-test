/**
 * In-process cron driver — polls the publish-scheduled route every 30s.
 *
 * QuikSocial deploys to Vercel where serverless functions don't have a
 * persistent process. In production cron is driven by `vercel.json`.
 * For local/UAT/staging where the Node server stays up, this in-process
 * timer keeps scheduled posts moving without an external scheduler.
 *
 * Boot path: `instrumentation.ts` -> `register()` -> `startCronScheduler()`.
 */

const POLL_INTERVAL_MS = 30_000;

let started = false;
let timer: NodeJS.Timeout | null = null;

function resolveBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${process.env.PORT || "3006"}`
  );
}

async function tick(): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return;
  }

  const url = `${resolveBaseUrl().replace(/\/$/, "")}/api/cron/publish-scheduled`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[cron-scheduler] tick returned ${res.status} from ${url}`,
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[cron-scheduler] tick failed: ${message}`);
  }
}

export function startCronScheduler(): void {
  if (started) return;
  started = true;

  console.log(
    `[cron-scheduler] starting in-process cron driver (interval ${POLL_INTERVAL_MS}ms)`,
  );

  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function stopCronScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
