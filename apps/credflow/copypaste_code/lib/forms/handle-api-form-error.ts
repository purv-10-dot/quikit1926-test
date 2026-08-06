/**
 * Map a non-OK fetch Response (or already-parsed JSON envelope) into form-shaped
 * error info: a top-level message + a per-field error map. Kept side-effect-free
 * so it can be unit tested without DOM.
 *
 * Server contract (matches the leads + opportunities envelope):
 *   { success: false, error: string, fieldErrors?: Record<string,string>, existingId?: string }
 *
 * Legacy routes return { error, errors } — both shapes are accepted.
 */

export interface ApiFormErrorResult {
  status: number;
  formError: string | null;
  fieldErrors: Record<string, string> | null;
  existingId: string | null;
  raw: unknown;
}

type EnvelopeShape = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  errors?: Record<string, string | string[]>;
  existingId?: string;
};

function flattenFieldErrors(
  raw: Record<string, string | string[]> | undefined,
): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      const first = v.find((s) => typeof s === "string" && s.trim());
      if (first) out[k] = first;
    } else if (typeof v === "string" && v.trim()) {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function handleApiFormError(
  input: Response | EnvelopeShape,
  status?: number,
): Promise<ApiFormErrorResult> {
  let parsed: EnvelopeShape;
  let st: number;
  if (input instanceof Response) {
    st = input.status;
    try {
      parsed = (await input.json()) as EnvelopeShape;
    } catch {
      parsed = {};
    }
  } else {
    st = status ?? 0;
    parsed = input;
  }

  const fieldErrors =
    flattenFieldErrors(parsed.fieldErrors) ?? flattenFieldErrors(parsed.errors);
  const formError =
    typeof parsed.error === "string" && parsed.error.trim()
      ? parsed.error
      : st === 401
      ? "You need to sign in again."
      : st === 403
      ? "You don't have permission to perform this action."
      : st === 409
      ? "This record conflicts with an existing one."
      : "Request failed.";

  return {
    status: st,
    formError,
    fieldErrors,
    existingId:
      typeof parsed.existingId === "string" && parsed.existingId.trim()
        ? parsed.existingId
        : null,
    raw: parsed,
  };
}
