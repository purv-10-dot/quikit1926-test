/**
 * IndiaVoice / RP Digital click-to-call client.
 *
 * Endpoint per provider docs (https://indiavoice.rpdigitalphone.com/swagger-ui/):
 *   GET /api/click_to_call_v2
 *   ?calling_party_a=<agent>&calling_party_b=<customer>&deskphone=<did>&authcode=<key>
 *   &call_from_did=1&waittime=<sec>&CallLimit=<sec>&uid=<systemId>
 *
 * Two calls are placed: first to calling_party_a (agent), and on pickup, the
 * second call is placed to calling_party_b (customer).
 *
 * Auth precedence:
 *   1. RP_DIGITAL_AUTHCODE  → sent as `authcode` query parameter (per current spec).
 *   2. RP_DIGITAL_BASIC_USER + RP_DIGITAL_BASIC_PASSWORD → fallback HTTP Basic
 *      header (legacy quikcrm-backend behavior; preserved for backwards compat).
 *
 * Operational notes from the provider:
 *   - The client IP must be whitelisted on IndiaVoice's firewall before any
 *     of these endpoints will accept traffic.
 *   - Webhooks are configured by the customer in their own IndiaVoice account
 *     (not via our app). Our /api/telephony/webhook just receives the events.
 *
 * Phone numbers are normalized to digits-only with a 10-digit minimum.
 */

import axios, { type AxiosResponse } from "axios";
import { env } from "@/lib/env";
import { digitsOnly } from "@/lib/utils/phone-helpers";
import { maskForLog } from "./dedupe";

interface DialerStatus {
  configured: boolean;
  baseUrl: string;
  authMethod: "authcode" | "basic" | "none";
  hasCredentials: boolean;
  deskphoneSet: boolean;
  callingPartyA: string | null;
}

interface ClickToCallResult {
  callSid: string | null;
  status: number;
  configured: boolean;
  providerType?: string;
  providerMessage?: string;
}

interface MemberListItem {
  member_name: string;
  member_num: string;
  status?: string;
}

/**
 * IndiaVoice "Available" in the panel maps to wire value `Ready`.
 * Swagger: GET /api_v3/update-working-status-v2
 *   ?member_num=<digits>&working_status=Ready&direction=IVR
 * Do NOT send `status`, `deskphone`, `uid`, or `CallLimit` on this endpoint.
 */
export const INDIA_VOICE_WORKING_STATUS_READY = "Ready";

/** Confirmed live — only `Ready` succeeds; others return "Invalid Parameter value." */
export const WORKING_STATUS_FALLBACK_VALUES = [
  INDIA_VOICE_WORKING_STATUS_READY,
  "Available",
  "available",
  "READY",
  "Active",
  "1",
] as const;

export interface WorkingStatusResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  type?: string;
  message?: string;
  /** Which member_num variant succeeded (for debug). */
  memberNumUsed?: string;
  workingStatusUsed?: string;
}

/** Short-lived cache so burst click-to-call / profile saves don't hammer the provider. */
const readyStatusCache = new Map<string, number>();
const READY_STATUS_CACHE_MS = 60_000;

let memberListCache: { at: number; items: MemberListItem[] } | null = null;
const MEMBER_LIST_CACHE_MS = 30_000;

function authMethod(): "authcode" | "basic" | "none" {
  const e = env();
  if (e.RP_DIGITAL_AUTHCODE && e.RP_DIGITAL_AUTHCODE.trim()) return "authcode";
  if (e.RP_DIGITAL_BASIC_USER && e.RP_DIGITAL_BASIC_PASSWORD) return "basic";
  return "none";
}

function basicAuthHeader(): string {
  const e = env();
  const user = e.RP_DIGITAL_BASIC_USER ?? "";
  const pw = e.RP_DIGITAL_BASIC_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${user}:${pw}`).toString("base64");
}

/** Apply the configured auth (authcode → query, basic → header). */
function applyAuth(url: URL, headers: Record<string, string>): void {
  const e = env();
  const m = authMethod();
  if (m === "authcode") {
    url.searchParams.set("authcode", e.RP_DIGITAL_AUTHCODE!);
  } else if (m === "basic") {
    headers.Authorization = basicAuthHeader();
  }
}

export function isConfigured(): boolean {
  return authMethod() !== "none" && Boolean(env().RP_DIGITAL_DESKPHONE);
}

export function dialerStatus(): DialerStatus {
  const e = env();
  const m = authMethod();
  return {
    configured: isConfigured(),
    baseUrl: e.RP_DIGITAL_BASE_URL,
    authMethod: m,
    hasCredentials: m !== "none",
    deskphoneSet: Boolean(e.RP_DIGITAL_DESKPHONE),
    callingPartyA: e.RP_DIGITAL_CALLING_PARTY_A ?? null,
  };
}

function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Redact sensitive query params (authcode, password) when logging URLs. */
export function redactUrl(url: string): string {
  return url.replace(/(authcode|password)=([^&]+)/g, "$1=***");
}

function agentCacheKey(memberNum: string): string {
  const digits = digitsOnly(memberNum);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function isMemberAlreadyRegisteredMessage(message: string | undefined): boolean {
  return Boolean(message && /already\s+register/i.test(message));
}

function telephonyDebugEnabled(): boolean {
  return env().NODE_ENV !== "production" || process.env.RP_DIGITAL_TELEPHONY_DEBUG === "true";
}

function logTelephonyDebug(message: string, extra?: Record<string, unknown>): void {
  if (!telephonyDebugEnabled()) return;
  console.log(`[india-voice][debug] ${message}`, extra ?? "");
}

/** Last 10 digits — used to match provider member_num formats (e.g. 08120833324 vs 8120833324). */
function last10Digits(num: string): string {
  const d = digitsOnly(num);
  return d.length >= 10 ? d.slice(-10) : d;
}

/** Unique member_num strings to try against update-working-status-v2. */
export function memberNumVariants(raw: string): string[] {
  const d = digitsOnly(raw);
  if (d.length < 10) return [];
  const last10 = d.slice(-10);
  const variants = new Set<string>();
  variants.add(d);
  variants.add(last10);
  // India mobile: provider often stores with leading 0 (see getmemberlist_v2).
  if (last10.length === 10) variants.add(`0${last10}`);
  if (d.length === 12 && d.startsWith("91")) variants.add(`0${d.slice(2)}`);
  if (d.length === 10) variants.add(`91${d}`);
  return [...variants];
}

export function findProviderMemberNum(raw: string, members: MemberListItem[]): string | null {
  const needle = last10Digits(raw);
  if (needle.length < 10) return null;
  const hit = members.find((m) => last10Digits(m.member_num) === needle);
  return hit ? digitsOnly(hit.member_num) : null;
}

async function getMemberListCached(): Promise<MemberListItem[]> {
  if (memberListCache && Date.now() - memberListCache.at < MEMBER_LIST_CACHE_MS) {
    return memberListCache.items;
  }
  try {
    const items = await getMemberList();
    memberListCache = { at: Date.now(), items };
    return items;
  } catch (err) {
    console.warn("[india-voice] getmemberlist_v2 failed during status sync:", err);
    return [];
  }
}

/**
 * Builds the provider URL for update-working-status-v2.
 * Contract (swagger indiavoice.yaml): GET with member_num, working_status, direction only.
 */
function buildUpdateWorkingStatusUrl(memberNum: string, workingStatus: string): URL {
  const e = env();
  const direction = (e.RP_DIGITAL_WORKING_STATUS_DIRECTION || "IVR").trim();
  if (!direction) {
    throw new Error("RP_DIGITAL_WORKING_STATUS_DIRECTION must not be empty (provider requires direction=IVR)");
  }
  const url = new URL("/api_v3/update-working-status-v2", e.RP_DIGITAL_BASE_URL);
  url.searchParams.set("member_num", digitsOnly(memberNum));
  url.searchParams.set("working_status", workingStatus);
  url.searchParams.set("direction", direction);
  return url;
}

/**
 * Single GET attempt — sets agent presence on IndiaVoice.
 * `addmember_v2` only creates the member; working status is updated here separately.
 */
export async function updateWorkingStatus(
  memberNum: string,
  workingStatus: string,
): Promise<WorkingStatusResult> {
  if (!isConfigured()) {
    console.warn("[india-voice] update-working-status-v2 skipped — provider not configured");
    return { ok: false, skipped: true };
  }
  const num = digitsOnly(memberNum);
  if (num.length < 10) {
    console.warn(`[india-voice] update-working-status-v2 skipped — invalid agent number (${maskForLog(memberNum)})`);
    return { ok: false, skipped: true };
  }

  const e = env();
  const url = buildUpdateWorkingStatusUrl(num, workingStatus);
  const headers: Record<string, string> = { Accept: "application/json" };
  applyAuth(url, headers);

  const queryKeys = [...url.searchParams.keys()].sort().join(",");
  logTelephonyDebug("update-working-status-v2 request", {
    normalizedMemberNum: maskForLog(num),
    workingStatus,
    direction: url.searchParams.get("direction"),
    queryKeys,
    method: "GET",
  });

  console.log(
    `[india-voice] update-working-status-v2 → agent=${maskForLog(num)} working_status=${workingStatus} direction=${url.searchParams.get("direction")} ${maskForLog(redactUrl(url.toString()))}`,
  );

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers,
    timeoutMs: e.RP_DIGITAL_HTTP_TIMEOUT_MS,
  });
  const text = await res.text();
  let json: { type?: string; message?: string } = {};
  try {
    json = JSON.parse(text) as { type?: string; message?: string };
  } catch {
    console.warn(
      `[india-voice] update-working-status-v2 non-JSON agent=${maskForLog(num)} HTTP ${res.status} body=${text.slice(0, 200)}`,
    );
    logTelephonyDebug("update-working-status-v2 raw body", { body: text.slice(0, 500) });
    return { ok: false, status: res.status, message: text.slice(0, 200), memberNumUsed: num, workingStatusUsed: workingStatus };
  }

  logTelephonyDebug("update-working-status-v2 response", { httpStatus: res.status, json });

  const success = res.status < 400 && json.type !== "error";
  if (success) {
    console.log(
      `[india-voice] update-working-status-v2 SUCCESS agent=${maskForLog(num)} working_status=${workingStatus} message=${json.message ?? ""}`,
    );
    return {
      ok: true,
      status: res.status,
      type: json.type,
      message: json.message,
      memberNumUsed: num,
      workingStatusUsed: workingStatus,
    };
  }

  console.warn(
    `[india-voice] update-working-status-v2 FAILED agent=${maskForLog(num)} working_status=${workingStatus} HTTP ${res.status} type=${json.type ?? "?"} message=${json.message ?? ""}`,
  );
  return {
    ok: false,
    status: res.status,
    type: json.type,
    message: json.message,
    memberNumUsed: num,
    workingStatusUsed: workingStatus,
  };
}

/**
 * Sets agent to Ready (panel: Available). Tries provider-registered member_num first,
 * then phone-format variants, then fallback working_status values. Non-throwing.
 */
export async function setAgentAvailable(memberNum: string): Promise<WorkingStatusResult> {
  const key = agentCacheKey(memberNum);
  const cachedAt = readyStatusCache.get(key);
  if (cachedAt != null && Date.now() - cachedAt < READY_STATUS_CACHE_MS) {
    console.log(`[india-voice] agent status update skipped (recently Ready) agent=${maskForLog(key)}`);
    return { ok: true, skipped: true };
  }

  const members = await getMemberListCached();
  const providerNum = findProviderMemberNum(memberNum, members);
  const candidates = [...new Set([providerNum, ...memberNumVariants(memberNum)].filter(Boolean))] as string[];

  logTelephonyDebug("setAgentAvailable candidates", {
    input: maskForLog(memberNum),
    providerNum: providerNum ? maskForLog(providerNum) : null,
    candidates: candidates.map((c) => maskForLog(c)),
  });

  let last: WorkingStatusResult = { ok: false, message: "No valid member number" };

  for (const num of candidates) {
    for (const ws of WORKING_STATUS_FALLBACK_VALUES) {
      const result = await updateWorkingStatus(num, ws);
      last = result;
      if (result.ok) {
        readyStatusCache.set(agentCacheKey(num), Date.now());
        console.log(
          `[india-voice] agent status updated → ${ws} (panel: Available) agent=${maskForLog(num)}`,
        );
        return result;
      }
      // Ready is first in WORKING_STATUS_FALLBACK_VALUES; if it fails with Invalid
      // Parameter, try next phone variant before other status strings.
      if (ws === INDIA_VOICE_WORKING_STATUS_READY) break;
      if (result.message && !/invalid parameter/i.test(result.message)) break;
    }
  }

  console.warn(
    `[india-voice] agent status update exhausted retries agent=${maskForLog(key)} last=${last.message ?? "unknown"}`,
  );
  return last;
}

/** Alias used before click-to-call — never throws. */
export async function ensureAgentAvailable(memberNum: string): Promise<WorkingStatusResult> {
  return setAgentAvailable(memberNum);
}

export async function clickToCall(to: string, partyA?: string): Promise<ClickToCallResult> {
  if (!isConfigured()) {
    const err = new Error(
      "Telephony provider not configured. Set RP_DIGITAL_AUTHCODE (or RP_DIGITAL_BASIC_USER + RP_DIGITAL_BASIC_PASSWORD) and RP_DIGITAL_DESKPHONE.",
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const e = env();
  const target = digitsOnly(to);
  if (target.length < 10) {
    const err = new Error("Destination phone must have at least 10 digits") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const callingPartyA = digitsOnly(partyA || e.RP_DIGITAL_CALLING_PARTY_A || e.RP_DIGITAL_DESKPHONE!);

  // addmember_v2 does not flip working status — agent may still be On Break.
  await ensureAgentAvailable(callingPartyA);

  // Provider expects the /api_v3/ namespace. Confirmed live against
  // https://indiavoice.rpdigitalphone.com on 2026-05-01: /api/click_to_call_v2
  // returns "Invalid Auth Code or use latest api version!" while
  // /api_v3/click_to_call_v2 with HTTP Basic auth returns
  // {"type":"success","campid":...}. Member-management endpoints
  // (addmember_v2, getmemberlist_v2) live under the same /api_v3/ namespace.
  const url = new URL("/api_v3/click_to_call_v2", e.RP_DIGITAL_BASE_URL);
  url.searchParams.set("calling_party_a", callingPartyA);
  url.searchParams.set("calling_party_b", target);
  url.searchParams.set("deskphone", last10Digits(e.RP_DIGITAL_DESKPHONE!));
  url.searchParams.set("call_from_did", e.RP_DIGITAL_CALL_FROM_DID);
  url.searchParams.set("waittime", String(e.RP_DIGITAL_WAITTIME));
  url.searchParams.set("CallLimit", e.RP_DIGITAL_CALL_LIMIT);
  url.searchParams.set("uid", e.RP_DIGITAL_UID);

  const headers: Record<string, string> = { Accept: "application/json" };
  applyAuth(url, headers);

  // redactUrl strips `authcode`/`password`; maskForLog further redacts any
  // remaining digit run >=7 (i.e. the phone numbers in calling_party_a/_b).
  console.log(`[india-voice] Click2Call → ${maskForLog(redactUrl(url.toString()))}`);

  // Provider response shape (confirmed live against /api_v3/click_to_call_v2):
  //   success: { type: "success", campid: 2920340, deskphone: "...", message: "..." }
  //   failure: { type: "error",   message: "Invalid Auth Code or use latest api version!" }
  // `campid` arrives as a NUMBER at the top level — coerce to string so it
  // can flow into CrmCallLog.providerCallSid (the column is text). The legacy
  // `data.callsid` shape from the older /api/ endpoint is kept as a fallback
  // in case the provider switches it back.
  type ProviderResponse = {
    type?: string;
    message?: string;
    campid?: string | number;
    deskphone?: string;
    data?: { callsid?: string | number };
  };
  // validateStatus: () => true so the provider's 4xx error JSON body
  // reaches our handler instead of axios throwing on it. We treat 4xx as a
  // domain failure below.
  const res: AxiosResponse<ProviderResponse> = await axios.get(url.toString(), {
    headers,
    timeout: e.RP_DIGITAL_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    responseType: "json",
  });
  const json: ProviderResponse = res.data ?? {};
  console.log(`[india-voice] Click2Call response HTTP ${res.status} body=${JSON.stringify(json)}`);

  if (res.status >= 400 || json.type === "error") {
    let message = json.message || `Provider error (${res.status})`;
    // Hint surfaces the most common operator mistake: the agent's IndiaVoice
    // member status is set to "On Break" so the panel rejects outbound calls.
    if (/on\s*break/i.test(message)) {
      message = `${message} (IndiaVoice: working status must be Ready — set automatically on profile save / before dial)`;
    }
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const campid =
    json.campid != null ? String(json.campid) : (json.data?.callsid != null ? String(json.data.callsid) : null);

  return {
    callSid: campid,
    status: res.status,
    configured: true,
    providerType: json.type,
    providerMessage: json.message,
  };
}

export async function getMemberList(): Promise<MemberListItem[]> {
  if (!isConfigured()) return [];
  const e = env();
  // Member-list endpoint path is unchanged from the legacy quikcrm-backend port.
  // Only /api/click_to_call_v2 was explicitly re-documented in the v2 spec.
  const url = new URL("/api_v3/getmemberlist_v2", e.RP_DIGITAL_BASE_URL);
  const headers: Record<string, string> = {};
  applyAuth(url, headers);
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers,
    body: new FormData(),
    timeoutMs: e.RP_DIGITAL_HTTP_TIMEOUT_MS,
  });
  const text = await res.text();
  if (res.status >= 400) throw new Error(`Provider error (${res.status})`);
  let json: unknown = {};
  try { json = JSON.parse(text); } catch { return []; }
  const candidates = ["getmember", "", "data", "members", "member_list", "list"] as const;
  for (const k of candidates) {
    const arr = k === "" ? json : (json as Record<string, unknown>)[k];
    if (Array.isArray(arr)) return arr as MemberListItem[];
  }
  return [];
}

export async function registerMember(
  memberName: string,
  memberNum: string,
): Promise<{
  status: number;
  type?: string;
  message?: string;
  data: unknown;
  alreadyRegistered?: boolean;
  workingStatus?: WorkingStatusResult;
}> {
  if (!isConfigured()) {
    const err = new Error("Telephony provider not configured") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const num = digitsOnly(memberNum);
  if (num.length < 10) throw new Error("Member number must have at least 10 digits");

  const e = env();
  const url = new URL("/api_v3/addmember_v2", e.RP_DIGITAL_BASE_URL);
  const headers: Record<string, string> = {};
  applyAuth(url, headers);
  const body = new FormData();
  body.append("member_name", memberName);
  body.append("member_num", num);
  body.append("access", "2");
  body.append("active", "1");
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers,
    body,
    timeoutMs: e.RP_DIGITAL_HTTP_TIMEOUT_MS,
  });
  const text = await res.text();
  let json: { type?: string; message?: string; data?: unknown } = {};
  try { json = JSON.parse(text); } catch { /* */ }
  const alreadyRegistered = isMemberAlreadyRegisteredMessage(json.message);

  if ((res.status >= 400 || json.type === "error") && !alreadyRegistered) {
    const err = new Error(json.message || `Provider error (${res.status})`) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  // addmember_v2 only registers the phone — working status stays Break/Offline
  // until update-working-status-v2 sets Ready (provider label for "Available").
  const statusResult = await setAgentAvailable(num);
  if (!statusResult.ok && !statusResult.skipped) {
    console.warn(
      `[india-voice] member registered but working status not updated agent=${maskForLog(num)}: ${statusResult.message ?? "unknown"}`,
    );
  }

  return {
    status: res.status,
    type: json.type ?? (alreadyRegistered ? "success" : undefined),
    message: json.message,
    data: json.data,
    alreadyRegistered,
    workingStatus: statusResult,
  };
}
