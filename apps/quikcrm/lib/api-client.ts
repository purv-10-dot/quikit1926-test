// apps/quikcrm/lib/api-client.ts
/**
 * Typed fetch wrappers for the click-to-call client. Auth piggy-backs on the
 * NextAuth cookie session (`credentials: "include"`) — there is no
 * Authorization header and no localStorage JWT in this codebase.
 *
 * Errors are normalized: every non-2xx response throws an Error whose
 * `message` is either the server-provided `error` string or the literal
 * `HTTP <status>`. Components can rely on `try/catch + err.message`.
 */

interface ClickToCallResponse {
  callSid: string | null;
  status: number;
  configured: boolean;
  providerType?: string;
  providerMessage?: string;
}

interface CallSessionStatus {
  found: boolean;
  callSid: string | null;
  campid: string | null;
  status: string | null;
  callEnded: boolean;
  duration: number;
  recordingUrl: string | null;
}

export interface CallDisposition {
  id: string;
  code: string;
  label: string;
  name?: string | null;
  category?: string | null;
  triggersPaymentVerification: boolean;
  targetLeadStage?: string | null;
  sortOrder?: number | null;
  config?: Record<string, unknown> | null;
}

export interface CallLogPayload {
  toNumber: string;
  fromNumber?: string | null;
  durationSec?: number | null;
  callDispositionId: string;
  linkedLeadId?: string | null;
  providerCallSid?: string | null;
  status?: string | null;
  subStage?: string | null;
  reason?: string | null;
  nextStage?: string | null;
  notes?: string | null;
  followUpAt?: string | null;
  demoScheduledBy?: string | null;
  demoScheduledOn?: string | null;
  /** Who terminated the call. Stamped by the dialer client based on whether
   *  the agent clicked End-call (=> "agent") or polling auto-advanced from a
   *  webhook (=> "customer"). The webhook handler may refine to "system"
   *  when the provider Status is busy/no_answer/cancel. */
  endedBy?: "agent" | "customer" | "system" | "unknown" | null;
}

export interface UserPickerRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface PaymentVerificationPayload {
  leadId?: string | null;
  callLogId?: string | null;
  amount: number;
  currency?: string;
  reference?: string | null;
  paymentMode?: string | null;
  notes?: string | null;
}

interface CallLogResponse {
  id: string;
  dispositionName: string;
  paymentVerificationRequired: boolean;
  linkedLeadId: string | null;
}

interface TwilioStatusResponse {
  configured: boolean;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  // Try to parse JSON for both ok and !ok branches so we can read `error`.
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* keep data null */
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      const errVal = (data as Record<string, unknown>).error;
      if (typeof errVal === "string" && errVal.length > 0) msg = errVal;
    }
    throw new Error(msg);
  }
  return data as T;
}

export function postClickToCall(to: string, calling_party_a?: string): Promise<ClickToCallResponse> {
  return apiFetch<ClickToCallResponse>("/api/telephony/twilio/click-to-call", {
    method: "POST",
    body: JSON.stringify({ to, partyA: calling_party_a }),
  });
}

export function fetchCallSessionStatus(callSid: string): Promise<CallSessionStatus> {
  return apiFetch<CallSessionStatus>(
    `/api/telephony/india-voice/call-session-status?callSid=${encodeURIComponent(callSid)}`,
  );
}

export function fetchDispositions(): Promise<{ items: CallDisposition[] }> {
  return apiFetch<{ items: CallDisposition[] }>("/api/telephony/dispositions");
}

export function postCallLog(payload: CallLogPayload): Promise<CallLogResponse> {
  return apiFetch<CallLogResponse>("/api/telephony/call-logs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTwilioStatus(): Promise<TwilioStatusResponse> {
  return apiFetch<TwilioStatusResponse>("/api/telephony/twilio/status");
}

export function fetchUsersPicker(): Promise<{ items: UserPickerRow[] }> {
  return apiFetch<{ items: UserPickerRow[] }>("/api/users/picker");
}

export function postPaymentVerification(payload: PaymentVerificationPayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/payment-verifications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
