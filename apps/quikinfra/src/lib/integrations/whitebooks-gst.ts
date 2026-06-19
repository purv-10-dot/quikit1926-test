/**
 * Whitebooks sandbox `public/search` — match Postman:
 *   Query: `email`, `gstin` only.
 *   Headers: `client_id`, `client_secret`.
 *
 * Env (all required to enable verification):
 *   WHITEBOOKS_ACCOUNT_EMAIL, WHITEBOOKS_CLIENT_ID, WHITEBOOKS_CLIENT_SECRET
 * Optional: WHITEBOOKS_API_BASE_URL, WHITEBOOKS_AUTHORIZATION,
 *   WHITEBOOKS_GSTN_USERNAME (header `username` only, if your Postman uses it)
 */

import { logger } from "@/lib/observability/logger";

/**
 * v2 permission keys that may call the vendor GST endpoints. The vendor
 * picker lives in the RFQ and PO drawers (and reads vendors off Indents),
 * so any role that can view/create those documents must be able to verify
 * a vendor's GST. These are the live `construction.*` keys seeded from
 * PERMISSION_TREE — the previous `purchase.po.read` legacy keys never
 * existed in the v2 tree, so no non-admin could pass the gate.
 */
export const VENDOR_PICKER_PERMISSIONS = [
  "construction.rfq.view",
  "construction.rfq.create",
  "construction.po.view",
  "construction.po.create",
  "construction.indent.view",
  "construction.indent.create",
] as const;

export function isWhitebooksGstVerifyEnabled(): boolean {
  const email = process.env.WHITEBOOKS_ACCOUNT_EMAIL?.trim();
  const clientId = process.env.WHITEBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.WHITEBOOKS_CLIENT_SECRET?.trim();
  return Boolean(email && clientId && clientSecret);
}

function isWhitebooksCredentialErrorMessage(text: string): boolean {
  return /client\s*id|client\s*secret|does not exist/i.test(text);
}

function normalizeGstin(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function whitebooksBaseUrl(): string {
  const raw =
    process.env.WHITEBOOKS_API_BASE_URL?.trim() ||
    "https://apisandbox.whitebooks.in";
  return raw.replace(/\/+$/, "");
}

function interpretData(data: Record<string, unknown>): {
  active: boolean;
  statusLabel: string | null;
  message: string;
} {
  const stsRaw = data.sts ?? data.status;
  const sts = typeof stsRaw === "string" ? stsRaw.trim() : "";
  const cxdt = typeof data.cxdt === "string" ? data.cxdt.trim() : "";
  if (cxdt && !sts) {
    return {
      active: false,
      statusLabel: "Cancelled",
      message: "GST registration appears cancelled.",
    };
  }
  const low = sts.toLowerCase();
  if (low === "active") {
    return { active: true, statusLabel: sts || "Active", message: "" };
  }
  if (
    low === "cancelled" ||
    low === "inactive" ||
    low === "suspended" ||
    low.includes("cancel")
  ) {
    return {
      active: false,
      statusLabel: sts || low,
      message: `GST status is ${sts || "not active"}. This vendor cannot be used on a PO.`,
    };
  }
  if (!sts) {
    const dtyRaw = typeof data.dty === "string" ? data.dty.trim() : "";
    const hasGstin = typeof data.gstin === "string" && data.gstin.trim().length > 0;
    if (!cxdt && hasGstin && dtyRaw && !/^cancel/i.test(dtyRaw)) {
      return { active: true, statusLabel: dtyRaw, message: "" };
    }
    return {
      active: false,
      statusLabel: null,
      message:
        "Could not read GST status from Whitebooks. This vendor cannot be used on a PO.",
    };
  }
  return {
    active: false,
    statusLabel: sts,
    message: `GST status "${sts}" is not allowed for PO creation.`,
  };
}

export type WhitebooksGstLookupResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; active: true; statusLabel: string | null }
  | { ok: true; skipped: false; active: false; statusLabel: string | null; message: string }
  | { ok: false; message: string };

export async function lookupGstStatusOnWhitebooks(
  gstin: string | null | undefined,
): Promise<WhitebooksGstLookupResult> {
  if (!isWhitebooksGstVerifyEnabled()) {
    return { ok: true, skipped: true };
  }

  const normalized = normalizeGstin(gstin);
  if (!normalized) {
    return {
      ok: true,
      skipped: false,
      active: false,
      statusLabel: null,
      message:
        "Vendor has no GSTIN. Add GSTIN in Masters → Vendors before creating a PO.",
    };
  }

  const email = process.env.WHITEBOOKS_ACCOUNT_EMAIL!.trim();
  const clientId = process.env.WHITEBOOKS_CLIENT_ID!.trim();
  const clientSecret = process.env.WHITEBOOKS_CLIENT_SECRET!.trim();
  const gstnUsername = process.env.WHITEBOOKS_GSTN_USERNAME?.trim();

  const url = `${whitebooksBaseUrl()}/public/search?${new URLSearchParams({
    email,
    gstin: normalized,
  })}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    client_id: clientId,
    client_secret: clientSecret,
  };
  if (gstnUsername) headers.username = gstnUsername;
  const auth = process.env.WHITEBOOKS_AUTHORIZATION?.trim();
  if (auth) headers.Authorization = auth;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: unknown) {
    logger.warn({
      msg: "whitebooks_gst_fetch_failed",
      code: (e as { name?: string })?.name ?? "fetch_error",
    });
    return {
      ok: false,
      message:
        "Could not reach Whitebooks to verify GST. Try again or contact support.",
    };
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      message: "Whitebooks returned an invalid response. Try again later.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      message: `Whitebooks HTTP ${res.status}. GST could not be verified.`,
    };
  }

  const statusCd = json?.status_cd;
  const hasData =
    json?.data != null && typeof json.data === "object" && !Array.isArray(json.data);

  if (!hasData) {
    const desc =
      typeof json?.status_desc === "string" && json.status_desc.trim()
        ? json.status_desc.trim()
        : "Whitebooks did not return GST details for this vendor.";
    if (statusCd !== undefined && String(statusCd) !== "1") {
      logger.info({
        msg: "whitebooks_gst_lookup_rejected",
        status_cd: String(statusCd),
      });
    }
    if (isWhitebooksCredentialErrorMessage(desc)) {
      return {
        ok: false,
        message: `${desc} Use headers client_id and client_secret; query: email and gstin only.`,
      };
    }
    return {
      ok: true,
      skipped: false,
      active: false,
      statusLabel: null,
      message: desc,
    };
  }

  const interpreted = interpretData(json.data as Record<string, unknown>);
  logger.info({
    msg: "whitebooks_gst_lookup",
    active: interpreted.active,
    status_label: interpreted.statusLabel,
  });

  if (interpreted.active) {
    return {
      ok: true,
      skipped: false,
      active: true,
      statusLabel: interpreted.statusLabel,
    };
  }
  return {
    ok: true,
    skipped: false,
    active: false,
    statusLabel: interpreted.statusLabel,
    message: interpreted.message,
  };
}

export async function assertVendorGstActiveForPo(
  gstin: string | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await lookupGstStatusOnWhitebooks(gstin);
  if (!r.ok) return { ok: false, message: r.message };
  if (r.skipped) return { ok: true };
  if (r.active) return { ok: true };
  return { ok: false, message: r.message };
}
