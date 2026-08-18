/**
 * Report scheduling — client wrapper over the existing insights APIs.
 *
 * The server side was already complete (`/api/insights/settings` GET+PUT with
 * validation, `/api/insights/send` POST) and both crons read the same
 * QiEmailReportSettings row. Nothing in the UI called any of it, so the schedule
 * that actually drives the emails was unreachable and unviewable. This is that
 * missing layer.
 */

export type ReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReportSettings {
  enabled: boolean;
  recipients: string[];
  frequency: ReportFrequency;
  /** ISO timestamp of the last successful send, or null if never sent. */
  lastSentAt: string | null;
}

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/** Mirrors the server's validation so the UI can reject before a round-trip. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export async function getReportSettings(): Promise<ReportSettings> {
  const res = await fetch("/api/insights/settings", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, `Failed to load report settings (${res.status})`));
  const body = (await res.json()) as { settings: ReportSettings };
  return body.settings;
}

export async function saveReportSettings(input: {
  enabled: boolean;
  recipients: string[];
  frequency: ReportFrequency;
}): Promise<ReportSettings> {
  const res = await fetch("/api/insights/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // The server returns a specific message for the useful failures (bad address,
  // enabling with no recipients) — surface it rather than a generic error.
  if (!res.ok) throw new Error(await readError(res, `Failed to save report settings (${res.status})`));
  const body = (await res.json()) as { settings: ReportSettings };
  return body.settings;
}

export interface SendResult {
  sent: boolean;
  recipients: string[];
  /** Set when the server declined to send, e.g. no connected platforms. */
  reason?: string;
}

/**
 * Send the report immediately.
 *
 * With no `to`, the server falls back to the saved recipients and then to the
 * signed-in user's own address, so "Send now" always has somewhere to go.
 *
 * NOTE: a 200 does not mean it sent. The route answers 200 with
 * `{ sent: false, reason }` when there are no connected platforms, so the
 * caller must check `sent` rather than assume success from the status code.
 */
export async function sendReportNow(to?: string[]): Promise<SendResult> {
  const res = await fetch("/api/insights/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(to?.length ? { to } : {}),
  });
  if (!res.ok) throw new Error(await readError(res, `Failed to send report (${res.status})`));

  const body = (await res.json().catch(() => ({}))) as {
    sent?: boolean;
    recipients?: string[];
    reason?: string;
  };
  return {
    sent: body.sent === true,
    recipients: Array.isArray(body.recipients) ? body.recipients : to ?? [],
    reason: body.reason,
  };
}
