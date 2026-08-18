/**
 * LeadSquared HTTP client (outbound).
 *
 * Thin wrapper over a single `fetch` — no SDK, matching the repo's other
 * integration drivers (Brevo/email). Credentials and host come from env only
 * (never hardcoded). The `fetch` implementation is injectable so tests never
 * touch the network.
 *
 * Auth: we send the keys as `x-LSQ-AccessKey` / `x-LSQ-SecretKey` HEADERS
 * rather than query params. LeadSquared accepts both; headers keep the secret
 * out of URLs and access logs. (Deviation from the spec's "query params or
 * headers" — the safer of the two options offered.)
 *
 * `fromEnv` reads `process.env` directly (like the repo's Brevo email driver)
 * rather than the central `env()` accessor. The vars are still declared/
 * validated in `lib/env.ts` for app boot, but the driver stays decoupled so it
 * is unit-testable without a fully-populated env.
 */
import type { LeadSquaredAttribute } from "@/lib/services/leadsquared/field-map";

const DEFAULT_HOST = "https://api-in21.leadsquared.com";
const DEFAULT_TIMEOUT_MS = 30_000;

export class LeadSquaredError extends Error {
  constructor(
    message: string,
    public status?: number,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = "LeadSquaredError";
  }
}

export interface LeadSquaredClientConfig {
  host: string;
  accessKey: string;
  secretKey: string;
  /** Injectable fetch — defaults to the global. Tests pass a stub. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface CreateOrUpdateResult {
  /** The LeadSquared ProspectId returned for the created/updated lead. */
  prospectId: string;
  /** The raw parsed response, for callers that need more than the id. */
  raw: unknown;
}

const CREATE_OR_UPDATE_PATH =
  "/v2/LeadManagement.svc/Lead.CreateOrUpdate?postUpdatedLead=false";
const UPDATE_PATH = "/v2/LeadManagement.svc/Lead.Update";
const METADATA_PATH = "/v2/LeadManagement.svc/LeadsMetaData.Get";
const LEAD_BY_EMAIL_PATH = "/v2/LeadManagement.svc/Leads.GetByEmailaddress";
const RECENTLY_MODIFIED_PATH = "/v2/LeadManagement.svc/Leads.RecentlyModified";

/** Format a UTC instant as LeadSquared's "yyyy-MM-dd HH:mm:ss", shifted into the
 *  account's timezone (LSQ interprets these strings in the account TZ). */
function formatLsqDate(d: Date, tzOffsetMinutes: number): string {
  const t = new Date(d.getTime() + tzOffsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

/** Normalise one lead record from a list response into a FLAT object (the same
 *  shape the inbound webhook path consumes). Handles a `LeadPropertyList` of
 *  { Attribute, Value } pairs as well as an already-flat object. */
function flattenLead(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const pairs = o.LeadPropertyList ?? o.Fields;
  if (Array.isArray(pairs)) {
    const flat: Record<string, unknown> = {};
    for (const p of pairs) {
      if (p && typeof p === "object") {
        const rec = p as Record<string, unknown>;
        const attr = rec.Attribute ?? rec.SchemaName ?? rec.Key;
        if (typeof attr === "string") flat[attr] = rec.Value ?? rec.value ?? null;
      }
    }
    return flat;
  }
  return o; // already flat (webhook-style)
}

/** Pull the lead array out of the various envelopes LSQ list APIs return. */
function extractLeadList(parsed: unknown): Record<string, unknown>[] {
  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(rec.Leads)
      ? (rec.Leads as unknown[])
      : Array.isArray(rec.List)
        ? (rec.List as unknown[])
        : Array.isArray(rec.RecordList)
          ? (rec.RecordList as unknown[])
          : [];
  return arr.map(flattenLead).filter((x): x is Record<string, unknown> => x !== null);
}

/** One field descriptor from LeadsMetaData.Get (only the parts we use). */
export interface LeadSquaredFieldMeta {
  SchemaName: string;
  DisplayName: string;
}

/**
 * Extract the ProspectId from a CreateOrUpdate response. LeadSquared has
 * returned the id under a few shapes across API versions, so we probe the
 * known locations in order.
 *
 * TODO(leadsquared): confirm the exact field against the live in21 response
 * and tighten this once we have a real sample.
 */
function extractProspectId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const message = (b.Message ?? {}) as Record<string, unknown>;
  const candidate =
    message.Id ?? message.RelatedId ?? b.RelatedId ?? b.ProspectId ?? b.Id;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

export class LeadSquaredClient {
  private readonly host: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: LeadSquaredClientConfig) {
    this.host = config.host.replace(/\/+$/, "");
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Build a client from env vars. Throws a clear LeadSquaredError when
   * credentials are missing, so the failure is obvious at push time rather than
   * a vague auth error from the API.
   */
  static fromEnv(overrides?: Partial<LeadSquaredClientConfig>): LeadSquaredClient {
    const accessKey = overrides?.accessKey ?? process.env.LEADSQUARED_ACCESS_KEY;
    const secretKey = overrides?.secretKey ?? process.env.LEADSQUARED_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new LeadSquaredError(
        "LeadSquared credentials missing: set LEADSQUARED_ACCESS_KEY and LEADSQUARED_SECRET_KEY.",
      );
    }
    const envTimeout = Number(process.env.LEADSQUARED_HTTP_TIMEOUT_MS);
    return new LeadSquaredClient({
      host: overrides?.host ?? process.env.LEADSQUARED_HOST ?? DEFAULT_HOST,
      accessKey,
      secretKey,
      fetchImpl: overrides?.fetchImpl,
      timeoutMs:
        overrides?.timeoutMs ??
        (Number.isFinite(envTimeout) && envTimeout > 0
          ? envTimeout
          : DEFAULT_TIMEOUT_MS),
    });
  }

  /** Shared request path: timeout, header auth, JSON parse, HTTP-error mapping. */
  private async send(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; parsed: unknown }> {
    const url = `${this.host}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-LSQ-AccessKey": this.accessKey,
          "x-LSQ-SecretKey": this.secretKey,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "network error";
      throw new LeadSquaredError(`LeadSquared request failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Non-JSON body (e.g. an HTML error page). Leave null; handled below.
    }

    if (!res.ok) {
      throw new LeadSquaredError(`LeadSquared returned HTTP ${res.status}`, res.status, parsed);
    }
    return { status: res.status, parsed };
  }

  /**
   * POST an attribute array to Lead.CreateOrUpdate and return the ProspectId.
   * LeadSquared matches ProspectId -> Email -> Phone by default, so this both
   * creates and dedupes.
   */
  async createOrUpdateLead(
    attributes: LeadSquaredAttribute[],
  ): Promise<CreateOrUpdateResult> {
    const { status, parsed } = await this.send("POST", CREATE_OR_UPDATE_PATH, attributes);
    const prospectId = extractProspectId(parsed);
    if (!prospectId) {
      throw new LeadSquaredError(
        "LeadSquared response did not contain a ProspectId",
        status,
        parsed,
      );
    }
    return { prospectId, raw: parsed };
  }

  /**
   * Update an EXISTING prospect by id via the dedicated Lead.Update endpoint.
   * Unlike Lead.CreateOrUpdate, this never dedupes or creates — it targets the
   * one lead identified by `leadId`, so it can't raise MXDuplicateEntryException
   * on an email that already exists. Use this whenever we already know the
   * ProspectId (i.e. a mapping row exists).
   *
   * Returns the same shape as createOrUpdateLead. The id is echoed from the
   * caller (we already know it) but we prefer a response-supplied id when present.
   *
   * TODO(leadsquared): confirm the exact endpoint + query param against the live
   * in21 account — Lead.Update with `?leadId=<ProspectId>` is the documented
   * convention, but verify the param name/casing and success envelope.
   */
  async updateLead(
    prospectId: string,
    attributes: LeadSquaredAttribute[],
  ): Promise<CreateOrUpdateResult> {
    const path = `${UPDATE_PATH}?leadId=${encodeURIComponent(prospectId)}`;
    const { parsed } = await this.send("POST", path, attributes);
    return { prospectId: extractProspectId(parsed) ?? prospectId, raw: parsed };
  }

  /**
   * Fetch field metadata (SchemaName + DisplayName) via LeadsMetaData.Get, used
   * to resolve the custom `mx_*` SchemaNames for Stage/Sub-stage/Status/Remarks.
   * Handles both a bare array and a `{ List: [...] }` envelope.
   *
   * TODO(leadsquared): confirm the exact envelope against the live in21 account.
   */
  async getLeadMetaData(): Promise<LeadSquaredFieldMeta[]> {
    const { parsed } = await this.send("GET", METADATA_PATH);
    const rec = (parsed ?? {}) as Record<string, unknown>;
    const rawList: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(rec.List)
        ? (rec.List as unknown[])
        : [];
    return rawList.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const o = item as Record<string, unknown>;
      const schemaName = typeof o.SchemaName === "string" ? o.SchemaName : null;
      if (!schemaName) return [];
      const displayName = typeof o.DisplayName === "string" ? o.DisplayName : "";
      return [{ SchemaName: schemaName, DisplayName: displayName }];
    });
  }

  /**
   * Look up an existing prospect's ProspectId by email, used to recover from a
   * duplicate-email create rejection (update the existing lead instead of
   * failing). Returns null when no lead matches. Handles a bare array or a
   * `{ List: [...] }` envelope.
   *
   * TODO(leadsquared): confirm the exact endpoint + response shape against the
   * live in21 account (Leads.GetByEmailaddress vs Lead.Get variants).
   */
  async getLeadByEmail(email: string): Promise<string | null> {
    const path = `${LEAD_BY_EMAIL_PATH}?emailaddress=${encodeURIComponent(email)}`;
    const { parsed } = await this.send("GET", path);
    const rec = (parsed ?? {}) as Record<string, unknown>;
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(rec.List)
        ? (rec.List as unknown[])
        : [];
    for (const item of list) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const id = o.ProspectID ?? o.ProspectId ?? o.Id;
        if (typeof id === "string" && id.length > 0) return id;
      }
    }
    return null;
  }

  /**
   * Fetch leads modified in [from, to] — the safety-net poller uses this to pull
   * stage/status changes LeadSquared did NOT fire an update webhook for. Returns
   * FLAT lead objects (same shape the inbound webhook path consumes), so a polled
   * lead flows through the exact same extract → loop-guard → upsert logic.
   *
   * TODO(leadsquared): confirm the exact endpoint (Leads.RecentlyModified),
   * request params, response envelope, and the account timezone for FromDate/
   * ToDate against the live in21 account. Dates are formatted in the account TZ
   * (LEADSQUARED_TZ_OFFSET_MINUTES, default +330 / IST). Single page for now —
   * poll windows are small; paginate if a window can exceed PageSize.
   */
  async getRecentlyModifiedLeads(
    from: Date,
    to: Date,
    opts: { pageSize?: number; tzOffsetMinutes?: number } = {},
  ): Promise<Record<string, unknown>[]> {
    const tz = opts.tzOffsetMinutes ?? Number(process.env.LEADSQUARED_TZ_OFFSET_MINUTES ?? 330);
    const pageSize = opts.pageSize ?? Number(process.env.LEADSQUARED_POLL_PAGE_SIZE ?? 200);
    const body = {
      Parameter: { FromDate: formatLsqDate(from, tz), ToDate: formatLsqDate(to, tz) },
      Paging: { PageIndex: 1, PageSize: pageSize },
      Sorting: { ColumnName: "ModifiedOn", Direction: "0" },
    };
    const { parsed } = await this.send("POST", RECENTLY_MODIFIED_PATH, body);
    return extractLeadList(parsed);
  }
}
