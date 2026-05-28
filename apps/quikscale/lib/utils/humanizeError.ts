/**
 * Map an API/network error into a short, user-friendly sentence suitable for
 * toast messages and inline form errors.
 *
 * Accepts:
 *   - A `Response` (uses status code to pick the message; if a JSON body with
 *     `{ error }` is available pass it via `serverMessage`).
 *   - An `Error` whose `.message` is the server's `error` field (common when
 *     callers throw `new Error(json.error)` after a non-ok fetch).
 *   - An arbitrary unknown thrown value.
 *
 * Optional `context` is a short noun ("KPI", "Priority", "weekly value")
 * that gets folded into the message for clarity.
 */

const NETWORK_HINT_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /could not connect/i,
  /err_network/i,
  /timeout/i,
];

const PERMISSION_DENIED_HINTS = [
  /permission denied/i,
  /forbidden/i,
  /not allowed/i,
  /not authoriz/i,
];

function messageForStatus(status: number, serverMessage: string | null, context?: string): string {
  const ctx = context ? ` for this ${context}` : "";
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) {
    return `You do not have permission to do this${ctx}. Ask an admin to enable the relevant permission for your role.`;
  }
  if (status === 404) return `The ${context ?? "item"} you're trying to update no longer exists.`;
  if (status === 409) return serverMessage ?? `That ${context ?? "item"} conflicts with an existing one.`;
  if (status === 422) return serverMessage ?? "Please check your input and try again.";
  if (status === 429) return "You're doing that too fast. Please wait a minute and try again.";
  if (status === 400) return serverMessage ?? "Please check your input and try again.";
  if (status >= 500) {
    return "Something went wrong on our end. Please try again. If it keeps happening, contact support.";
  }
  return serverMessage ?? "Something went wrong. Please try again.";
}

export interface HumanizeOptions {
  /** Short noun describing the affected entity ("KPI", "Priority", "weekly value"). */
  context?: string;
  /** Last-resort fallback if nothing else matches. */
  fallback?: string;
}

export function humanizeApiError(err: unknown, opts: HumanizeOptions = {}): string {
  const { context, fallback } = opts;

  // Response object — e.g. caller did `if (!res.ok) throw res`
  if (typeof Response !== "undefined" && err instanceof Response) {
    return messageForStatus(err.status, null, context);
  }

  // Errors with attached status (common pattern: `err.status = res.status`)
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    const status = (err as { status: number }).status;
    const serverMessage =
      "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : null;
    return messageForStatus(status, serverMessage, context);
  }

  // Plain Error
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (msg) {
      if (NETWORK_HINT_PATTERNS.some((rx) => rx.test(msg))) {
        return "Can't reach the server. Check your internet connection and try again.";
      }
      if (PERMISSION_DENIED_HINTS.some((rx) => rx.test(msg))) {
        const ctx = context ? ` for this ${context}` : "";
        return `You do not have permission to do this${ctx}. Ask an admin to enable the relevant permission for your role.`;
      }
      // Server-curated 400/409 messages tend to be helpful — pass them through.
      return msg;
    }
  }

  // String thrown directly
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }

  return fallback ?? "Something went wrong. Please try again.";
}

/**
 * Convenience: take a fetch `Response` (non-ok) and produce a friendly string.
 * Reads the JSON body to pick up server-curated `error` text for 4xx codes.
 */
export async function humanizeResponse(res: Response, opts: HumanizeOptions = {}): Promise<string> {
  let serverMessage: string | null = null;
  try {
    const body = await res.clone().json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      serverMessage = (body as { error: string }).error;
    }
  } catch {
    // body not JSON — ignore
  }
  return messageForStatus(res.status, serverMessage, opts.context);
}
