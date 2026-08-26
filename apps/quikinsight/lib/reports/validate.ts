/**
 * Validation for saved reports, shared by POST /api/reports and
 * PATCH /api/reports/[id].
 *
 * Lives in lib/ rather than in the route: a Next.js route file may only export
 * route handlers and a small set of config symbols, so exporting helpers from
 * one route and importing them in another is a build error.
 */
export const REPORT_TYPES = ["executive", "custom"] as const;
export const REPORT_RANGES = ["7", "30", "90", "365"] as const;
export const REPORT_AUDIENCES = ["internal", "client"] as const;
export const REPORT_FREQUENCIES = ["none", "daily", "weekly", "monthly"] as const;
export const REPORT_CHANNELS = ["paid", "organic", "email", "leads"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared validation for POST and PATCH. Returns a clean message on failure. */
export function validateReportInput(body: Record<string, unknown>): { error: string } | { data: {
  name: string; type: string; workspaceId: string | null; dateRange: string; channels: string[];
  audience: string; customSummary: string | null; customMetrics: string[];
  recipients: string[]; frequency: string;
} } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "Report name is required" };
  if (name.length > 200) return { error: "Report name is too long" };

  const type = REPORT_TYPES.includes(body.type as never) ? String(body.type) : "executive";
  const dateRange = REPORT_RANGES.includes(body.dateRange as never) ? String(body.dateRange) : "30";
  const audience = REPORT_AUDIENCES.includes(body.audience as never) ? String(body.audience) : "internal";
  const frequency = REPORT_FREQUENCIES.includes(body.frequency as never) ? String(body.frequency) : "none";

  const channels = Array.isArray(body.channels)
    ? body.channels.filter((c): c is string => typeof c === "string" && REPORT_CHANNELS.includes(c as never))
    : [];
  const customMetrics = Array.isArray(body.customMetrics)
    ? body.customMetrics.filter((m): m is string => typeof m === "string").slice(0, 100)
    : [];

  const recipients = Array.isArray(body.recipients)
    ? Array.from(new Set(
        body.recipients
          .filter((r): r is string => typeof r === "string")
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean),
      ))
    : [];
  if (recipients.some((r) => !EMAIL_RE.test(r))) {
    return { error: "Every recipient must be a valid email address" };
  }
  // A schedule with nobody to send to would silently never deliver.
  if (frequency !== "none" && recipients.length === 0) {
    return { error: "Add at least one recipient before setting a send frequency" };
  }

  return {
    data: {
      name,
      type,
      workspaceId: typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : null,
      dateRange,
      channels,
      audience,
      customSummary: typeof body.customSummary === "string" && body.customSummary.trim()
        ? body.customSummary.trim()
        : null,
      customMetrics,
      recipients,
      frequency,
    },
  };
}

