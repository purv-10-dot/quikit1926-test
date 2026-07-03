import { BaseProvider, type TokenSet } from "../provider";
import type {
  ConnectResult, EntityType, ProviderDescriptor, ProviderMetadata, PullResult, PushResult,
  RecordChange, ExternalRecord
} from "../types";
import { stableHash } from "../util/hash";

/**
 * Tally Prime provider. Talks to Tally's HTTP-XML gateway (default port 9000)
 * over LAN or localhost. Tally must have "Act as Server" enabled. No OAuth —
 * connectivity is host/port (+ optional company security user/password).
 */

const COLLECTION: Partial<Record<EntityType, { tdlType: string; nativeMethods: string[] }>> = {
  customers: { tdlType: "Ledger", nativeMethods: ["Name", "Parent", "LedgerPhone", "Email", "PartyGSTIN", "IncomeTaxNumber"] },
  vendors: { tdlType: "Ledger", nativeMethods: ["Name", "Parent", "LedgerPhone", "Email", "PartyGSTIN", "IncomeTaxNumber"] },
  chart_of_accounts: { tdlType: "Ledger", nativeMethods: ["Name", "Parent", "OpeningBalance"] },
  products: { tdlType: "StockItem", nativeMethods: ["Name", "Parent", "BaseUnits", "OpeningBalance", "OpeningRate"] },
  inventory: { tdlType: "StockItem", nativeMethods: ["Name", "Parent", "BaseUnits", "ClosingBalance"] },
  taxes: { tdlType: "Ledger", nativeMethods: ["Name", "Parent", "RateOfTaxCalculation"] },
  invoices: { tdlType: "Voucher", nativeMethods: ["Date", "VoucherNumber", "PartyLedgerName", "Amount"] },
  bills: { tdlType: "Voucher", nativeMethods: ["Date", "VoucherNumber", "PartyLedgerName", "Amount"] },
  payments: { tdlType: "Voucher", nativeMethods: ["Date", "VoucherNumber", "PartyLedgerName", "Amount"] },
  journals: { tdlType: "Voucher", nativeMethods: ["Date", "VoucherNumber", "Narration", "Amount"] }
};

export const TALLY_DESCRIPTOR: ProviderDescriptor = {
  key: "tally_prime",
  name: "Tally Prime",
  authType: "local",
  description: "Desktop/LAN accounting via Tally's XML HTTP gateway.",
  capabilities: {
    oauth: false,
    webhooks: false,
    incremental: true,
    multiCompany: true,
    entities: Object.keys(COLLECTION) as EntityType[],
    directions: ["pull", "push", "bidirectional"]
  }
};

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal, dependency-free tag extractor for Tally's flat XML responses. */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

export class TallyPrimeProvider extends BaseProvider {
  readonly descriptor = TALLY_DESCRIPTOR;

  private baseUrl(): string {
    const ssl = Boolean(this.ctx.config.ssl);
    const host = String(this.ctx.config.host ?? "localhost");
    const port = Number(this.ctx.config.port ?? 9000);
    return `${ssl ? "https" : "http"}://${host}:${port}`;
  }

  private company(): string {
    return String(this.ctx.externalOrgId ?? this.ctx.config.company ?? "");
  }

  private async send(xml: string, timeoutMs = 15_000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.http(this.baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: xml,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Tally returned HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private collectionEnvelope(id: string, tdlType: string, nativeMethods: string[]): string {
    const company = this.company();
    const fetchTags = nativeMethods.map((m) => `<NATIVEMETHOD>${m}</NATIVEMETHOD>`).join("");
    return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${xmlEscape(id)}</ID></HEADER>` +
      `<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>` +
      (company ? `<SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>` : "") +
      `</STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="${xmlEscape(id)}" ISMODIFY="No"><TYPE>${tdlType}</TYPE>${fetchTags}</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  }

  async connect(): Promise<ConnectResult> {
    const ok = await this.validateConnection();
    return ok
      ? { status: "connected", message: "Connected to Tally gateway." }
      : { status: "error", message: `Could not reach Tally at ${this.baseUrl()}. Ensure Tally is running with HTTP server enabled.` };
  }

  async authenticate(): Promise<TokenSet> {
    // Tally has no token model; credentials (if any) are sent per request.
    return {};
  }

  async refreshToken(): Promise<TokenSet> {
    return {};
  }

  async validateConnection(): Promise<boolean> {
    try {
      const xml = this.collectionEnvelope("List of Companies", "Company", ["Name"]);
      const body = await this.send(xml);
      return /<ENVELOPE>|<COMPANY|<NAME>/i.test(body);
    } catch {
      return false;
    }
  }

  async getMetadata(): Promise<ProviderMetadata> {
    const xml = this.collectionEnvelope("List of Companies", "Company", ["Name", "StartingFrom"]);
    const body = await this.send(xml);
    const names = extractAll(body, "NAME");
    const organizations = (names.length ? names : [this.company()].filter(Boolean)).map((name) => ({ id: name, name }));
    return { organizations };
  }

  async pullChanges(entity: EntityType, _since?: string | null, _cursor?: string | null): Promise<PullResult> {
    const col = COLLECTION[entity];
    if (!col) return { entity, records: [], hasMore: false };
    const id = `QF ${entity}`;
    const body = await this.send(this.collectionEnvelope(id, col.tdlType, col.nativeMethods));
    // Each collection member is wrapped in a tag named after the TDL type.
    const members = extractAll(body, col.tdlType.toUpperCase());
    const records: ExternalRecord[] = members.map((memberXml, i) => {
      const data: Record<string, unknown> = {};
      for (const method of col.nativeMethods) {
        const vals = extractAll(memberXml, method.toUpperCase());
        if (vals.length) data[method] = vals.length === 1 ? vals[0] : vals;
      }
      const externalId = String(data.Name ?? data.VoucherNumber ?? `${entity}-${i}`);
      return { externalId, modifiedAt: null, data, deleted: false };
    });
    return { entity, records, hasMore: false };
  }

  async pushChanges(entity: EntityType, changes: RecordChange[]): Promise<PushResult> {
    const result: PushResult = { entity, created: 0, updated: 0, deleted: 0, failures: [] };
    const col = COLLECTION[entity];
    if (!col) {
      changes.forEach((c) => result.failures.push({ internalId: c.internalId, error: `Push not supported for ${entity}` }));
      return result;
    }
    for (const change of changes) {
      try {
        const tag = col.tdlType;
        const fields = Object.entries(change.data)
          .map(([k, v]) => `<${k.toUpperCase()}>${xmlEscape(String(v ?? ""))}</${k.toUpperCase()}>`)
          .join("");
        const action = change.externalId ? "Alter" : "Create";
        const envelope = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>` +
          `<BODY><DESC><STATICVARIABLES>${this.company() ? `<SVCURRENTCOMPANY>${xmlEscape(this.company())}</SVCURRENTCOMPANY>` : ""}</STATICVARIABLES></DESC>` +
          `<DATA><TALLYMESSAGE><${tag.toUpperCase()} ACTION="${action}">${fields}</${tag.toUpperCase()}></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
        const body = await this.send(envelope);
        const created = Number(extractAll(body, "CREATED")[0] ?? 0);
        const altered = Number(extractAll(body, "ALTERED")[0] ?? 0);
        if (created) result.created += created;
        if (altered) result.updated += altered;
        if (!created && !altered) result.failures.push({ internalId: change.internalId, error: "Tally accepted no records." });
      } catch (error) {
        result.failures.push({ internalId: change.internalId, error: error instanceof Error ? error.message : "tally push error" });
      }
    }
    return result;
  }
}

export function tallyRecordHash(record: ExternalRecord): string {
  return stableHash(record.data);
}
