import { BaseProvider, type TokenSet } from "../provider";
import type {
  ConnectResult, EntityType, ProviderDescriptor, ProviderMetadata, PullResult, PushResult,
  RecordChange, ExternalRecord
} from "../types";
import { ENTITY_TYPES } from "../types";
import { stableHash } from "../util/hash";

/** Zoho data-centre suffixes → accounts + api hosts differ only by TLD. */
const REGION_TLD: Record<string, string> = {
  com: "com", us: "com", in: "in", eu: "eu", au: "com.au", jp: "jp", ca: "ca", sa: "sa", uk: "eu"
};

/** Maps our entities to Zoho Books endpoints + the JSON list key + modified key. */
const ENDPOINTS: Partial<Record<EntityType, { path: string; listKey: string; modifiedKey: string; idKey: string; query?: Record<string, string> }>> = {
  customers: { path: "contacts", listKey: "contacts", modifiedKey: "last_modified_time", idKey: "contact_id", query: { contact_type: "customer" } },
  vendors: { path: "contacts", listKey: "contacts", modifiedKey: "last_modified_time", idKey: "contact_id", query: { contact_type: "vendor" } },
  products: { path: "items", listKey: "items", modifiedKey: "last_modified_time", idKey: "item_id" },
  services: { path: "items", listKey: "items", modifiedKey: "last_modified_time", idKey: "item_id" },
  inventory: { path: "items", listKey: "items", modifiedKey: "last_modified_time", idKey: "item_id" },
  chart_of_accounts: { path: "chartofaccounts", listKey: "chartofaccounts", modifiedKey: "last_modified_time", idKey: "account_id" },
  taxes: { path: "settings/taxes", listKey: "taxes", modifiedKey: "last_modified_time", idKey: "tax_id" },
  invoices: { path: "invoices", listKey: "invoices", modifiedKey: "last_modified_time", idKey: "invoice_id" },
  sales_orders: { path: "salesorders", listKey: "salesorders", modifiedKey: "last_modified_time", idKey: "salesorder_id" },
  purchase_orders: { path: "purchaseorders", listKey: "purchaseorders", modifiedKey: "last_modified_time", idKey: "purchaseorder_id" },
  bills: { path: "bills", listKey: "bills", modifiedKey: "last_modified_time", idKey: "bill_id" },
  credit_notes: { path: "creditnotes", listKey: "creditnotes", modifiedKey: "last_modified_time", idKey: "creditnote_id" },
  debit_notes: { path: "vendorcredits", listKey: "vendor_credits", modifiedKey: "last_modified_time", idKey: "vendor_credit_id" },
  expenses: { path: "expenses", listKey: "expenses", modifiedKey: "last_modified_time", idKey: "expense_id" },
  payments: { path: "customerpayments", listKey: "customerpayments", modifiedKey: "last_modified_time", idKey: "payment_id" },
  journals: { path: "journals", listKey: "journals", modifiedKey: "last_modified_time", idKey: "journal_id" },
  bank_accounts: { path: "bankaccounts", listKey: "bankaccounts", modifiedKey: "last_modified_time", idKey: "account_id" },
  bank_transactions: { path: "banktransactions", listKey: "banktransactions", modifiedKey: "last_modified_time", idKey: "transaction_id" }
};

export const ZOHO_DESCRIPTOR: ProviderDescriptor = {
  key: "zoho_books",
  name: "Zoho Books",
  authType: "oauth2",
  description: "Cloud accounting with OAuth2, multi-organization, and webhooks.",
  capabilities: {
    oauth: true,
    webhooks: true,
    incremental: true,
    multiCompany: true,
    entities: Object.keys(ENDPOINTS) as EntityType[],
    directions: ["pull", "push", "bidirectional"]
  }
};

export class ZohoBooksProvider extends BaseProvider {
  readonly descriptor = ZOHO_DESCRIPTOR;

  private tld(): string {
    return REGION_TLD[(this.ctx.region ?? "com").toLowerCase()] ?? "com";
  }
  private accountsHost(): string {
    return `https://accounts.zoho.${this.tld()}`;
  }
  private apiHost(): string {
    return `https://www.zohoapis.${this.tld()}/books/v3`;
  }
  private redirectUri(): string {
    return String(this.ctx.config.redirectUri ?? process.env.ZOHO_REDIRECT_URI ?? `${process.env.APP_URL ?? "http://localhost:3000"}/api/v1/integrations/oauth/zoho/callback`);
  }

  async connect(): Promise<ConnectResult> {
    const clientId = this.ctx.credentials.client_id;
    if (!clientId) return { status: "error", message: "Zoho Client ID is required." };
    const scope = "ZohoBooks.fullaccess.all";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope,
      redirect_uri: this.redirectUri(),
      access_type: "offline",
      prompt: "consent",
      state: this.ctx.connectionId
    });
    return {
      status: "pending",
      message: "Authorize QuikFinance in Zoho to finish connecting.",
      authorizationUrl: `${this.accountsHost()}/oauth/v2/auth?${params.toString()}`
    };
  }

  async authenticate(params: Record<string, string>): Promise<TokenSet> {
    const code = params.code;
    if (!code) throw new Error("Missing OAuth authorization code.");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.ctx.credentials.client_id ?? "",
      client_secret: this.ctx.credentials.client_secret ?? "",
      redirect_uri: this.redirectUri(),
      code
    });
    const res = await this.http(`${this.accountsHost()}/oauth/v2/token`, { method: "POST", body });
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string };
    if (!res.ok || json.error || !json.access_token) throw new Error(`Zoho token exchange failed: ${json.error ?? res.status}`);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenType: json.token_type ?? "Zoho-oauthtoken",
      scope: json.scope,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString()
    };
  }

  async refreshToken(): Promise<TokenSet> {
    const refresh = this.ctx.tokens?.refreshToken;
    if (!refresh) throw new Error("No Zoho refresh token available — reconnect required.");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.ctx.credentials.client_id ?? "",
      client_secret: this.ctx.credentials.client_secret ?? "",
      refresh_token: refresh
    });
    const res = await this.http(`${this.accountsHost()}/oauth/v2/token`, { method: "POST", body });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; token_type?: string; error?: string };
    if (!res.ok || json.error || !json.access_token) throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`);
    return {
      accessToken: json.access_token,
      refreshToken: refresh,
      tokenType: json.token_type ?? "Zoho-oauthtoken",
      scope: this.ctx.tokens?.scope,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString()
    };
  }

  private async authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.ensureToken();
    if (!token) throw new Error("Not authenticated with Zoho.");
    const sep = path.includes("?") ? "&" : "?";
    const url = `${this.apiHost()}/${path}${this.ctx.externalOrgId ? `${sep}organization_id=${this.ctx.externalOrgId}` : ""}`;
    return this.http(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Zoho-oauthtoken ${token}` }
    });
  }

  async validateConnection(): Promise<boolean> {
    try {
      const res = await this.authedFetch("organizations");
      return res.ok;
    } catch {
      return false;
    }
  }

  async getMetadata(): Promise<ProviderMetadata> {
    const res = await this.authedFetch("organizations");
    const json = (await res.json()) as { organizations?: Array<Record<string, unknown>> };
    const organizations = (json.organizations ?? []).map((o) => ({
      id: String(o.organization_id),
      name: String(o.name ?? ""),
      currency: o.currency_code ? String(o.currency_code) : undefined,
      country: o.country ? String(o.country) : undefined
    }));
    return { organizations, raw: json as Record<string, unknown> };
  }

  async pullChanges(entity: EntityType, since?: string | null, cursor?: string | null): Promise<PullResult> {
    const ep = ENDPOINTS[entity];
    if (!ep) return { entity, records: [], hasMore: false };
    const page = cursor ? Number(cursor) : 1;
    const qs = new URLSearchParams({ page: String(page), per_page: "200", ...(ep.query ?? {}) });
    if (since) qs.set("last_modified_time", since);
    const res = await this.authedFetch(`${ep.path}?${qs.toString()}`);
    if (!res.ok) throw new Error(`Zoho pull ${entity} failed: ${res.status}`);
    const json = (await res.json()) as Record<string, unknown> & { page_context?: { has_more_page?: boolean } };
    const list = (json[ep.listKey] as Array<Record<string, unknown>>) ?? [];
    const records: ExternalRecord[] = list.map((row) => ({
      externalId: String(row[ep.idKey] ?? ""),
      modifiedAt: row[ep.modifiedKey] ? String(row[ep.modifiedKey]) : null,
      data: row,
      deleted: false
    }));
    const hasMore = Boolean(json.page_context?.has_more_page);
    return { entity, records, nextCursor: hasMore ? String(page + 1) : null, hasMore };
  }

  async pushChanges(entity: EntityType, changes: RecordChange[]): Promise<PushResult> {
    const ep = ENDPOINTS[entity];
    const result: PushResult = { entity, created: 0, updated: 0, deleted: 0, failures: [] };
    if (!ep) {
      changes.forEach((c) => result.failures.push({ internalId: c.internalId, error: `Push not supported for ${entity}` }));
      return result;
    }
    for (const change of changes) {
      try {
        if (change.op === "delete" && change.externalId) {
          const res = await this.authedFetch(`${ep.path}/${change.externalId}`, { method: "DELETE" });
          if (res.ok) result.deleted += 1;
          else result.failures.push({ internalId: change.internalId, error: `Delete failed: ${res.status}` });
          continue;
        }
        const isUpdate = Boolean(change.externalId);
        const res = await this.authedFetch(isUpdate ? `${ep.path}/${change.externalId}` : ep.path, {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change.data)
        });
        if (res.ok) isUpdate ? (result.updated += 1) : (result.created += 1);
        else result.failures.push({ internalId: change.internalId, error: `Push failed: ${res.status}` });
      } catch (error) {
        result.failures.push({ internalId: change.internalId, error: error instanceof Error ? error.message : "push error" });
      }
    }
    return result;
  }

  async disconnect(): Promise<void> {
    const refresh = this.ctx.tokens?.refreshToken;
    if (!refresh) return;
    try {
      await this.http(`${this.accountsHost()}/oauth/v2/token/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" });
    } catch {
      // best-effort revoke
    }
  }
}

/** Re-export so callers can fingerprint Zoho records consistently. */
export function zohoRecordHash(record: ExternalRecord): string {
  return stableHash(record.data);
}

export const ZOHO_SUPPORTED_ENTITIES = ENTITY_TYPES.filter((e) => e in ENDPOINTS);
