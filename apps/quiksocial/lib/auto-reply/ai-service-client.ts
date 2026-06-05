/**
 * Outbound client for calling the Python AI service from the Next.js cron.
 * Mirrors the X-QS-Internal-Token pattern used by tasks.py:_post_notify_complete.
 *
 * Wire-format note: the Python AI service still expects `tenant_id` in
 * the request body (matches its existing Pydantic models). We accept
 * `orgId` on the JS side and forward it as `tenant_id` on the wire — same
 * approach we use across other Python-bound clients in QuikIT.
 */

const TIMEOUT_MS = 10_000;

export async function enqueueAutoReplyMonitor(
  orgId: string,
  socialAccountId: string,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const baseUrl = (process.env.AI_SERVICE_URL || "").trim();
  const token = (process.env.QS_INTERNAL_TOKEN || "").trim();
  if (!baseUrl) return { ok: false, error: "AI_SERVICE_URL not configured" };
  if (!token) return { ok: false, error: "QS_INTERNAL_TOKEN not configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auto-reply/enqueue-monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": token,
      },
      // Python side still reads `tenant_id` — keep the wire field name
      // until that codepath is migrated. JS-side variable is `orgId`.
      body: JSON.stringify({ tenantId: orgId, socialAccountId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `AI service HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => null)) as { taskId?: string } | null;
    return { ok: true, taskId: data?.taskId || "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
