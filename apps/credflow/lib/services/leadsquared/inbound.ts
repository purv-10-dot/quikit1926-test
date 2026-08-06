/**
 * Inbound sync: LeadSquared webhook -> QuikCRM.
 *
 * Heavy logic lives here (the route stays thin). Single-client setup: the
 * tenant is resolved from env, never derived from the payload.
 *
 * LOOP BREAK (critical):
 *   When we write a lead that came FROM LeadSquared, we stamp the mapping row
 *   with `syncOrigin = "leadsquared"`. That is the provenance guard. We ALSO
 *   store `lastPayloadHash` computed with the SAME outbound representation
 *   (`buildLeadSquaredAttributes` + `hashPayload`) that the outbound path uses.
 *   That makes the hash comparable across directions: if anything later
 *   triggers an outbound push for this lead with unchanged content, the
 *   outbound loop guard sees `newHash === lastPayloadHash` and skips it — no
 *   echo. Genuine later CRM edits change the hash and still push.
 *
 *   Note the primary structural guard, too: this path writes CrmLead directly
 *   via Prisma and NEVER enqueues onto the outbound `leadsquared-sync` queue
 *   (that queue is only fed from the HTTP lead routes). So an inbound write does
 *   not travel back out. `syncOrigin` + the cross-direction hash are the
 *   defense-in-depth on top of that.
 *
 * Delete-sync is intentionally out of scope.
 */
import { createHash, timingSafeEqual } from "crypto";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import {
  buildLeadSquaredAttributes,
  DEFAULT_FIELD_MAP_CONFIG,
  reverseValueMap,
  type LeadPayloadInput,
  type LeadSquaredFieldMapConfig,
} from "@/lib/services/leadsquared/field-map";
import {
  hashPayload,
  shouldApplyInbound,
  type SyncOrigin,
} from "@/lib/services/leadsquared/loop-guard";

// ─────────────────────────────────────────────────────────────────────────
// Payload parsing
//
// TODO(leadsquared): confirm the REAL inbound webhook payload shape against a
// live sample. LeadSquared webhooks are configured with a custom body template,
// so the exact keys (and whether the body is a bare object or an array) vary per
// account. The extractor below is defensive (handles array-wrapping + several
// key spellings), but the ProspectId key and the Stage/Status/Sub-stage `mx_`
// SchemaNames MUST be verified once the client's webhook is wired up.
// ─────────────────────────────────────────────────────────────────────────

/** Duck-typed Prisma P2002 (unique constraint) check. */
function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Narrow to a plain (non-array) object, else null. */
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toRecord(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) return toRecord(payload[0]);
  const rec = asObject(payload);
  if (!rec) return {};
  // LeadSquared "Lead Modified" webhook is a { Before, After } snapshot — the
  // lead fields (incl. ProspectID) live INSIDE those objects, not at the top
  // level. Unwrap to `After` (the new/updated state), falling back to `Before`.
  // Every other shape (plain object; top-level array handled above) is returned
  // unchanged, so existing payloads keep working.
  if ("After" in rec || "Before" in rec) {
    const inner = asObject(rec.After) ?? asObject(rec.Before);
    if (inner) return inner;
  }
  return rec;
}

/** First non-empty value across the given keys (handles casing/spelling drift). */
function pick(rec: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/**
 * True for the empty / verification request LeadSquared sends when registering
 * the webhook. The route must answer these 200 without processing.
 */
export function isEmptyWebhookPayload(payload: unknown): boolean {
  return Object.keys(toRecord(payload)).length === 0;
}

export interface InboundLeadFields {
  lsqProspectId: string;
  // Confirmed fields (raw LSQ string values; lat/long coerced to number on write).
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  source: string | null;
  stage: string | null;
  linkedinUrl: string | null;
  ownerId: string | null;
  lat: string | null;
  long: string | null;
  status: string | null;
  substatus: string | null;
  country: string | null;
  industry: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  cityName: string | null;
  stateName: string | null;
  postalCode: string | null;
  // Ambiguous — only populated once the SchemaName is configured.
  jobTitle: string | null;
  secondaryEmail: string | null;
  annualRevenueDisplay: string | null;
  leadType: string | null;
  contactLinkedinUrl: string | null;
  area: string | null;
  /**
   * LeadSquared's last-modified timestamp for the prospect, if the webhook
   * carries one. Used only for the stale-echo guard — deliberately NOT part of
   * the synced field set / hash (it changes on every event).
   */
  modifiedOn: Date | null;
}

/** Parse a LeadSquared date value defensively (ISO or epoch); null if unusable. */
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(/^\d+$/.test(value) ? Number(value) : value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Pull the ProspectId + lead fields out of a webhook payload. Standard fields
 * use LeadSquared's documented SchemaNames; Stage / Sub-stage / Status use the
 * custom `mx_` SchemaNames from the field-map config (null => not discovered
 * yet, so skipped — same gating as the outbound direction). Returns null when
 * there is no ProspectId to key on.
 */
export function extractInboundLead(
  payload: unknown,
  config: LeadSquaredFieldMapConfig = DEFAULT_FIELD_MAP_CONFIG,
): InboundLeadFields | null {
  const rec = toRecord(payload);
  const lsqProspectId = pick(
    rec,
    "ProspectID",
    "ProspectId",
    "prospectId",
    "RelatedProspectId",
    "LeadId",
    "mx_ProspectId",
  );
  if (!lsqProspectId) return null;

  // Standard fields: read the configured SchemaName, then documented fallbacks.
  const std = (schema: string | null, ...fallbacks: string[]) =>
    pick(rec, ...(schema ? [schema, ...fallbacks] : fallbacks));
  // Custom/ambiguous fields: only read when a SchemaName is configured.
  const custom = (schema: string | null) => (schema ? pick(rec, schema) : null);

  // Phone/Mobile: LeadSquared has two standard number fields and some accounts
  // populate only one. Read each from its own key, but fall CrmLead.phone back
  // to the Mobile value when Phone is empty — otherwise a lead whose number is
  // only in Mobile would land with phone=null. Both columns are still written.
  const mobileVal = std(config.mobile, "Mobile", "mobile");

  return {
    lsqProspectId,
    firstName: std(config.firstName, "FirstName", "mx_First_Name"),
    lastName: std(config.lastName, "LastName", "mx_Last_Name"),
    email: std(config.email, "EmailAddress", "Email", "email"),
    phone: std(config.phone, "Phone", "phone") ?? mobileVal,
    mobile: mobileVal,
    company: std(config.company, "Company"),
    source: std(config.source, "Source"),
    stage: std(config.stage, "ProspectStage"),
    linkedinUrl: std(config.linkedinUrl, "LinkedInId"),
    // OWNER SYNC DISABLED (both directions) — LeadSquared OwnerId is not a
    // QuikCRM user id, so writing it would mis-assign the lead. Never read it.
    // TODO(leadsquared): email-based owner mapping once the LSQ user list is
    // confirmed (resolve OwnerId/owner email -> the matching QuikCRM user).
    ownerId: null,
    lat: std(config.lat, "Latitude"),
    long: std(config.long, "Longitude"),
    status: custom(config.status),
    substatus: custom(config.subStage),
    country: custom(config.country),
    industry: custom(config.industry),
    website: custom(config.website),
    addressLine1: custom(config.addressLine1),
    addressLine2: custom(config.addressLine2),
    cityName: custom(config.cityName),
    stateName: custom(config.stateName),
    postalCode: custom(config.postalCode),
    jobTitle: custom(config.jobTitle),
    secondaryEmail: custom(config.secondaryEmail),
    annualRevenueDisplay: custom(config.annualRevenueDisplay),
    leadType: custom(config.leadType),
    contactLinkedinUrl: custom(config.contactLinkedinUrl),
    area: custom(config.area),
    // TODO(leadsquared): confirm the exact modified-timestamp key on the live
    // webhook. These are the common ones; absence just disables the stale guard.
    modifiedOn: toDate(
      pick(rec, "ModifiedOn", "ProspectModifiedOn", "mx_Modified_On", "ModifiedOnDate"),
    ),
  };
}

function deriveName(fields: InboundLeadFields): string {
  const full = [fields.firstName, fields.lastName].filter(Boolean).join(" ").trim();
  return full || fields.email || `LeadSquared ${fields.lsqProspectId}`;
}

/** Only include fields we actually received, so we never null out CRM data.
 *  Picklist values are translated LSQ -> CRM via the reversed value maps. */
function commonWriteData(
  fields: InboundLeadFields,
  config: LeadSquaredFieldMapConfig,
): Record<string, unknown> {
  const stageRev = reverseValueMap(config.stageValueMap);
  const subStageRev = reverseValueMap(config.subStageValueMap);
  const statusRev = reverseValueMap(config.statusValueMap);
  const sourceRev = reverseValueMap(config.sourceValueMap);
  const industryRev = reverseValueMap(config.industryValueMap);
  const rev = (map: Record<string, string>, v: string) => map[v] ?? v;

  const data: Record<string, unknown> = {};
  const set = (key: string, v: string | null) => {
    if (v !== null) data[key] = v;
  };
  set("email", fields.email);
  set("phone", fields.phone);
  set("mobile", fields.mobile);
  set("company", fields.company);
  set("firstName", fields.firstName);
  set("lastName", fields.lastName);
  set("linkedinUrl", fields.linkedinUrl);
  set("ownerId", fields.ownerId);
  set("country", fields.country);
  set("website", fields.website);
  set("addressLine1", fields.addressLine1);
  set("addressLine2", fields.addressLine2);
  set("cityName", fields.cityName);
  set("stateName", fields.stateName);
  set("postalCode", fields.postalCode);
  set("jobTitle", fields.jobTitle);
  set("secondaryEmail", fields.secondaryEmail);
  set("annualRevenueDisplay", fields.annualRevenueDisplay);
  set("leadType", fields.leadType);
  set("contactLinkedinUrl", fields.contactLinkedinUrl);
  set("area", fields.area);
  // Picklist values translated LSQ -> CRM (reverse of the outbound value maps).
  if (fields.source !== null) data.source = rev(sourceRev, fields.source);
  if (fields.stage !== null) data.stage = rev(stageRev, fields.stage);
  if (fields.status !== null) data.status = rev(statusRev, fields.status);
  if (fields.substatus !== null) data.substatus = rev(subStageRev, fields.substatus);
  if (fields.industry !== null) data.industry = rev(industryRev, fields.industry);
  // lat/long are Float columns — coerce the string back to a number, skip NaN.
  const num = (v: string | null) => {
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const latNum = num(fields.lat);
  if (latNum !== undefined) data.lat = latNum;
  const longNum = num(fields.long);
  if (longNum !== undefined) data.long = longNum;
  return data;
}

/** The subset used to compute the cross-direction outbound hash. Values are the
 *  RAW LSQ values (identity through the outbound value maps), so the hash of an
 *  echo equals the hash of what we pushed. */
function toPayloadInput(fields: InboundLeadFields): LeadPayloadInput {
  const num = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    name: null,
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    mobile: fields.mobile,
    company: fields.company,
    source: fields.source,
    stage: fields.stage,
    linkedinUrl: fields.linkedinUrl,
    ownerId: fields.ownerId,
    lat: num(fields.lat),
    long: num(fields.long),
    status: fields.status,
    substatus: fields.substatus,
    country: fields.country,
    industry: fields.industry,
    website: fields.website,
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    cityName: fields.cityName,
    stateName: fields.stateName,
    postalCode: fields.postalCode,
    jobTitle: fields.jobTitle,
    secondaryEmail: fields.secondaryEmail,
    annualRevenueDisplay: fields.annualRevenueDisplay,
    leadType: fields.leadType,
    contactLinkedinUrl: fields.contactLinkedinUrl,
    area: fields.area,
    statusRemarks: null,
  };
}

export interface InboundResult {
  ok: true;
  action:
    | "created"
    | "updated"
    | "skipped-no-prospect-id"
    | "skipped-echo"
    | "skipped-stale"
    | "skipped-deleted"
    | "error";
  crmLeadId?: string;
  lsqProspectId?: string;
}

export interface InboundDeps {
  prisma?: typeof prisma;
  fieldMap?: LeadSquaredFieldMapConfig;
  now?: () => Date;
}

/**
 * Apply a LeadSquared webhook payload to QuikCRM: upsert the CrmLead and the
 * mapping row, stamping `syncOrigin = "leadsquared"`. Tenant-scoped throughout.
 */
export async function processInboundWebhook(
  tenantId: string,
  payload: unknown,
  deps: InboundDeps = {},
): Promise<InboundResult> {
  const db = deps.prisma ?? prisma;
  const fieldMap = deps.fieldMap ?? DEFAULT_FIELD_MAP_CONFIG;
  const now = deps.now ?? (() => new Date());

  const fields = extractInboundLead(payload, fieldMap);
  if (!fields) {
    console.warn("[leadsquared-webhook] payload had no ProspectId — skipping");
    return { ok: true, action: "skipped-no-prospect-id" };
  }
  const { lsqProspectId } = fields;

  // Look up the mapping by (tenantId, lsqProspectId) — tenant-scoped.
  const mapping = await db.leadSquaredSyncMap.findFirst({
    where: { tenantId, lsqProspectId },
  });

  // Cross-direction hash of the incoming content — the FAITHFUL representation
  // (forHash): stage/status/substatus/source contribute their raw values even
  // when outside the picklist allowlist. The outbound path stores the same
  // representation, so an echo of our own push still hashes identically, while a
  // genuine change to an unmapped value now changes the hash instead of being
  // silently filtered out (the bug that dropped inbound stage/status updates).
  const attrs = buildLeadSquaredAttributes(toPayloadInput(fields), fieldMap, { forHash: true });
  const inboundHash = hashPayload(
    Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value])),
  );

  // GUARD 1 — echo / duplicate. A hash MATCH means the incoming content is
  // byte-identical to what we last synced for this lead: either the echo of our
  // own outbound push (syncOrigin='crm') or a duplicate inbound delivery
  // (syncOrigin='leadsquared'). Both are no-ops, so we skip.
  //
  // Origin-aware guarantee: `shouldApplyInbound` returns true for ANY differing
  // hash regardless of `lastOrigin`, so a real inbound change is applied even
  // when the last write — and thus the stored hash — came from an outbound 'crm'
  // push. An outbound hash can no longer suppress a genuine LeadSquared edit.
  if (
    mapping &&
    !shouldApplyInbound({
      newHash: inboundHash,
      lastHash: mapping.lastPayloadHash,
      lastOrigin: mapping.syncOrigin as SyncOrigin,
    })
  ) {
    return { ok: true, action: "skipped-echo", crmLeadId: mapping.crmLeadId, lsqProspectId };
  }

  // GUARD 2 — stale echo vs a newer CRM edit: if our last write was a CRM push
  // (syncOrigin='crm') and this event is not newer than that push, it is a
  // delayed echo that would clobber the newer local state. Only fires when the
  // webhook carries a modified timestamp; otherwise Guard 1 is the protection.
  if (
    mapping &&
    mapping.syncOrigin === "crm" &&
    fields.modifiedOn &&
    mapping.lastSyncedAt &&
    fields.modifiedOn.getTime() <= mapping.lastSyncedAt.getTime()
  ) {
    return { ok: true, action: "skipped-stale", crmLeadId: mapping.crmLeadId, lsqProspectId };
  }

  const common = commonWriteData(fields, fieldMap);
  // Update payload shared by every update path. Only refresh name when we
  // actually received a name part, so we don't clobber an existing name.
  const updateData: Record<string, unknown> = { ...common };
  if (fields.firstName !== null || fields.lastName !== null) updateData.name = deriveName(fields);

  let crmLeadId: string;
  let action: "created" | "updated";

  // Determine the target CrmLead. Two independent keys can already point at this
  // ProspectId, and we must UPDATE (never re-create) if either resolves:
  //   1. the mapping row, by (tenantId, lsqProspectId) — the canonical link;
  //   2. the CrmLead's own unique triple (tenantId, sourceSystem='leadsquared',
  //      externalId=ProspectId) — the DB constraint `lead_external_uk`.
  //
  // We use findUnique (NOT findFirst): the soft-delete middleware injects
  // `deletedAt: null` into findFirst, so a trashed lead was invisible there —
  // which is exactly why create() ran and hit `lead_external_uk` ("Unique
  // constraint failed on (tenantId, sourceSystem, externalId)"). findUnique
  // bypasses that filter, so we see the row regardless of deletedAt: skip it if
  // trashed, otherwise UPDATE it instead of racing into a duplicate.
  const byTriple: Prisma.CrmLeadWhereUniqueInput = {
    lead_external_uk: {
      tenantId,
      sourceSystem: "leadsquared",
      externalId: lsqProspectId,
    },
  };

  // Select stage/status/substatus too: we diff old-vs-new after the update to
  // log a timeline entry only when one of them actually changed (see below).
  const existingSelect = {
    id: true,
    tenantId: true,
    deletedAt: true,
    stage: true,
    status: true,
    substatus: true,
  } as const;
  let existingLead = mapping
    ? await db.crmLead.findUnique({
        where: { id: mapping.crmLeadId },
        select: existingSelect,
      })
    : null;
  // findUnique(by id) is not tenant-scoped — enforce the tenant boundary.
  if (existingLead && existingLead.tenantId !== tenantId) existingLead = null;
  if (!existingLead) {
    existingLead = await db.crmLead.findUnique({
      where: byTriple,
      select: existingSelect,
    });
  }

  if (existingLead?.deletedAt) {
    // The lead is in the trash. Do not resurrect it from an inbound webhook.
    return { ok: true, action: "skipped-deleted", crmLeadId: existingLead.id, lsqProspectId };
  }

  if (existingLead) {
    // Capture OLD values BEFORE the update so we can diff for the timeline entry.
    const prevStage = existingLead.stage;
    const prevStatus = existingLead.status;
    const prevSubstatus = existingLead.substatus;
    const updated = await db.crmLead.update({
      where: { id: existingLead.id },
      data: updateData as Prisma.CrmLeadUpdateInput,
    });
    crmLeadId = updated.id;
    action = "updated";

    // Timeline parity with the in-app Call Disposition path
    // (disposition-engine.ts::createCallLog): when a status/stage move originates
    // in the CRM we write a "Disposition update" activity, but an inbound
    // LeadSquared move used to mutate the field silently. Mirror that entry here
    // so the change is traceable in the Call Disposition / Timeline tabs.
    //
    // CHANGE-ONLY: build a line per field that actually changed. `updateData`
    // holds the new (reverse-mapped, CRM-side) values — only present when the
    // webhook carried that field — so an absent or unchanged field logs nothing.
    // No trigger of an outbound sync from here: this is a log entry, not a lead
    // edit, so it cannot bounce back out (the field write above is the only lead
    // mutation, and inbound never enqueues the outbound queue).
    const changed: string[] = [];
    const newStage = updateData.stage as string | undefined;
    const newStatus = updateData.status as string | undefined;
    const newSubstatus = updateData.substatus as string | undefined;
    if (newStatus !== undefined && newStatus !== (prevStatus ?? "")) {
      changed.push(`Status: ${prevStatus || "—"} -> ${newStatus}`);
    }
    if (newStage !== undefined && newStage !== (prevStage ?? "")) {
      changed.push(`Stage: ${prevStage || "—"} -> ${newStage}`);
    }
    if (newSubstatus !== undefined && newSubstatus !== (prevSubstatus ?? "")) {
      changed.push(`Sub Stage: ${prevSubstatus || "—"} -> ${newSubstatus}`);
    }
    if (changed.length > 0) {
      try {
        await db.crmActivity.create({
          data: {
            tenantId,
            type: "LeadStageChange",
            relatedKind: "Lead",
            relatedObjectId: crmLeadId,
            leadId: crmLeadId,
            subject: `Disposition update · ${newStatus || newStage || newSubstatus} (via LeadSquared)`,
            outcome: "",
            // Provenance: distinguishes an inbound sync from a human disposition.
            ownerName: "LeadSquared Sync",
            occurredAt: now(),
            detailNotes: changed.join("\n"),
          },
        });
      } catch (e: unknown) {
        // Best-effort: a timeline-log failure must never fail the webhook/sync.
        console.error("[leadsquared-webhook] activity log failed", {
          crmLeadId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } else {
    // No live lead found — but a concurrent webhook for the SAME ProspectId
    // could be creating it right now. Upsert on `lead_external_uk` so the DB
    // does an atomic INSERT ... ON CONFLICT DO UPDATE: the loser of the race
    // (or a redelivery) UPDATES instead of throwing the unique-constraint error.
    // upsert also bypasses the soft-delete middleware.
    const upserted = await db.crmLead.upsert({
      where: byTriple,
      create: {
        tenantId,
        name: deriveName(fields),
        sourceSystem: "leadsquared",
        externalId: lsqProspectId,
        ...common,
      } as Prisma.CrmLeadUncheckedCreateInput,
      update: updateData as Prisma.CrmLeadUpdateInput,
      select: { id: true },
    });
    crmLeadId = upserted.id;
    action = "created";
  }

  // Loop break: record provenance + the cross-direction-comparable hash.
  const lastPayloadHash = inboundHash;
  const syncedAt = now();

  try {
    await db.leadSquaredSyncMap.upsert({
      where: { crmLeadId },
      create: {
        tenantId,
        crmLeadId,
        lsqProspectId,
        syncOrigin: "leadsquared" satisfies SyncOrigin,
        lastPayloadHash,
        lastSyncedAt: syncedAt,
      },
      update: {
        lsqProspectId,
        syncOrigin: "leadsquared" satisfies SyncOrigin,
        lastPayloadHash,
        lastSyncedAt: syncedAt,
      },
    });
  } catch (e: unknown) {
    // [tenantId, lsqProspectId] conflict: this ProspectId already maps to a
    // different lead. The CrmLead write already happened; log and continue
    // rather than fail the webhook/job.
    if (isUniqueConstraintError(e)) {
      console.warn(
        `[leadsquared-webhook] prospect-id conflict: ${lsqProspectId} already mapped to ` +
          `another lead in tenant ${tenantId}; mapping write skipped for crmLead ${crmLeadId}.`,
      );
      return { ok: true, action, crmLeadId, lsqProspectId };
    }
    throw e;
  }

  return { ok: true, action, crmLeadId, lsqProspectId };
}

/**
 * Process a webhook body that may be a single lead OR a batch (array) of leads.
 * LeadSquared can POST multiple prospects at once; we process each sequentially
 * (order preserved) so one lead's write can't race another's. Returns one
 * result per lead.
 */
export async function processInboundBatch(
  tenantId: string,
  payload: unknown,
  deps: InboundDeps = {},
): Promise<InboundResult[]> {
  const items = Array.isArray(payload) ? payload : [payload];
  const results: InboundResult[] = [];
  for (const item of items) {
    try {
      results.push(await processInboundWebhook(tenantId, item, deps));
    } catch (e: unknown) {
      // One bad record must not fail the whole job — otherwise BullMQ retries the
      // ENTIRE batch and re-applies the good records. Log a redacted summary
      // (never the payload) and continue with the next record.
      console.error("[leadsquared-webhook] record failed — skipping", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
      results.push({ ok: true, action: "error" });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Secret validation + tenant resolution (used by the webhook route).
// Reads process.env directly (like the LeadSquared client) so it stays
// testable without a fully-populated env(). Mirrors the telephony webhook's
// require-secret semantics.
// ─────────────────────────────────────────────────────────────────────────

export interface InboundWebhookHeaders {
  authorization?: string | null;
  xWebhookSecret?: string | null;
}

export function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function extractPresentedSecret(
  headers: InboundWebhookHeaders,
  payload: Record<string, unknown>,
): string | null {
  if (headers.authorization?.startsWith("Bearer ")) return headers.authorization.slice(7);
  if (headers.xWebhookSecret) return headers.xWebhookSecret;
  const inBody = payload.secret;
  return inBody != null ? String(inBody) : null;
}

/** Constant-time secret comparison. Hash to a fixed length first so we never
 *  leak length via timingSafeEqual's own length check. */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Only these environments may run the webhook without a configured secret. */
const SECRET_OPTIONAL_ENVS = new Set(["development", "test"]);

/**
 * Throws a statusError when the shared secret is required but missing/invalid.
 *
 * The secret is REQUIRED in every environment except local `development` and
 * `test` (and always, if WEBHOOK_REQUIRE_SECRET=true). This closes the previous
 * hole where any non-production env (staging/preview) accepted unauthenticated
 * lead injection.
 */
export function assertInboundSecret(
  headers: InboundWebhookHeaders,
  payload: Record<string, unknown>,
): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const requireSecret =
    process.env.WEBHOOK_REQUIRE_SECRET === "true" || !SECRET_OPTIONAL_ENVS.has(nodeEnv);
  const configured = process.env.LEADSQUARED_WEBHOOK_SECRET;

  if (!configured) {
    if (requireSecret) {
      throw statusError("Webhook secret not configured on server", 503);
    }
    return; // dev/test: no secret configured and not required -> allow
  }
  const presented = extractPresentedSecret(headers, payload);
  if (!presented) throw statusError("Webhook secret required", 401);
  if (!secretsMatch(presented, configured)) throw statusError("Invalid webhook secret", 401);
}

/**
 * Resolve the single-client tenant from env. Prefers the LeadSquared-specific
 * override, then the shared webhook default, then DEFAULT_ORG_ID. Never derived
 * from the payload.
 */
export function resolveInboundTenantId(): string {
  const tenantId =
    process.env.LEADSQUARED_DEFAULT_ORG_ID ||
    process.env.WEBHOOK_DEFAULT_ORG_ID ||
    process.env.DEFAULT_ORG_ID ||
    "";
  if (!tenantId) {
    throw statusError(
      "Could not resolve tenant for LeadSquared webhook — set LEADSQUARED_DEFAULT_ORG_ID or DEFAULT_ORG_ID.",
      400,
    );
  }
  return tenantId;
}
