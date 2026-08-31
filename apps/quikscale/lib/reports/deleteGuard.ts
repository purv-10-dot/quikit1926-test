/**
 * Shared body parsing + the sign-off guard for every report DELETE route.
 *
 * One rule, applied identically to the daily, weekly-rollup, weekly-meeting
 * and monthly reports: a report someone has SIGNED OFF is not deleted on a
 * single click. Sign-off is a person's claim that they read the report and
 * stand behind it, and it is what the Monthly Report trends; losing one
 * silently is the difference between "the report was removed" and "the review
 * never happened". The caller must repeat the request with
 * `confirmValidated: true`, which the UI only sends after the user has been
 * told what they are discarding.
 *
 * Pure request/response shaping — no DB access, so it unit-tests directly.
 */

import { NextResponse } from "next/server";

export interface DeleteRequestBody {
  /** Free-text note recorded on the audit event. Never required. */
  reason: string | null;
  /** Explicit acknowledgement that a signed-off report is being discarded. */
  confirmValidated: boolean;
}

/** Read `{ reason?, confirmValidated? }` from a DELETE body. Missing body is fine. */
export async function parseDeleteBody(req: {
  json(): Promise<unknown>;
}): Promise<DeleteRequestBody> {
  const body = (await req.json().catch(() => null)) as
    | { reason?: unknown; confirmValidated?: unknown }
    | null;
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  return { reason, confirmValidated: body?.confirmValidated === true };
}

/**
 * 409 when a validated report would be destroyed without acknowledgement.
 *
 * Returns `null` when the delete may proceed. The response carries
 * `requiresConfirmation: true` so the client can tell this apart from a plain
 * failure and re-issue the request with the confirmation flag.
 */
export function guardValidated(
  validatedAt: Date | null | undefined,
  confirmed: boolean,
  what: string,
): NextResponse | null {
  if (!validatedAt || confirmed) return null;
  return NextResponse.json(
    {
      success: false,
      requiresConfirmation: true,
      error: `${what} has been signed off. Deleting it discards that sign-off — confirm to continue.`,
    },
    { status: 409 },
  );
}
