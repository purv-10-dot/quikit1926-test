/**
 * FR-RE Stage 3-C — pure Option-Y payload builder for the clean disposition
 * view's Save button.
 *
 * The clean form has no disposition picker; Status is the single required pick
 * and the disposition is internal plumbing. This builds the postCallLog body and
 * OWNS the hard-required guard (empty Status / empty hard custom field => blocked)
 * so the Save button can't post a meaningless save. CleanDispositionForm's Save
 * handler calls THIS function and the unit test asserts it — one source, no mirror.
 *
 * It deliberately OMITS callDispositionId (server resolves the internal "Call")
 * and carries none of the legacy reason / demo / nextStage gates.
 */
import type { CallLogPayload } from "@/lib/api-client";

/** Format a Date as the value an <input type="datetime-local"> expects:
 *  local wall-clock "YYYY-MM-DDTHH:mm", zero-padded. */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Activity date+time prefill (Option A, WYSIWYG): the open-time as a non-blank
 *  datetime-local string. Because the field opens non-blank at this instant, an
 *  untouched save stores the SHOWN time — never blank, never save-time-stamped. */
export function initialActivityDateTime(now: Date): string {
  return toDatetimeLocal(now);
}

export interface CleanCallLogInput {
  toNumber: string;
  leadId: string | null;
  status: string;
  subStage: string;
  notes: string;
  /** datetime-local string (e.g. "2026-06-02T11:18"); converted to ISO. */
  dateTimeValue: string;
  /** string for most fields; string[] for a multi user_picker (widened pipeline). */
  fieldValues: Record<string, string | string[]>;
  /** fieldKeys the live form marks hard-required (must be non-empty to save). */
  hardRequiredFieldKeys: string[];
}

/** "Empty" for the hard-required check, additive across the widened value shapes:
 *  blank/whitespace string OR an empty array. A non-empty array (multi picker)
 *  counts as filled; a plain string keeps its existing trim semantics. */
export function isFieldEmpty(v: string | string[] | undefined | null): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return !(v ?? "").trim();
}

/** The builder owns everything EXCEPT `source` — the call site sets that (the
 *  parent flow knows dialer vs manual; see Stage 3-D(a)). */
export type CleanCallLogPayload = Omit<CallLogPayload, "source">;

export type CleanCallLogResult =
  | { ok: true; payload: CleanCallLogPayload }
  | { ok: false; error: string };

export function buildCleanCallLogPayload(input: CleanCallLogInput): CleanCallLogResult {
  const status = input.status.trim();
  if (!status) return { ok: false, error: "Status is required." };

  for (const key of input.hardRequiredFieldKeys) {
    if (isFieldEmpty(input.fieldValues[key])) {
      return { ok: false, error: `${key} is required.` };
    }
  }

  const to = input.toNumber.trim();
  const dt = input.dateTimeValue.trim();

  const payload: CleanCallLogPayload = {
    // callDispositionId intentionally omitted — server resolves internal "Call".
    toNumber: to,
    linkedLeadId: input.leadId,
    status,
    subStage: input.subStage.trim() || null,
    notes: input.notes.trim() || null,
    activityDateTime: dt ? new Date(dt).toISOString() : undefined,
    dispositionFieldValues: input.fieldValues,
  };

  return { ok: true, payload };
}
