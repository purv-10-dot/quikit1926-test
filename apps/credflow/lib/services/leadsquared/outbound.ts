/**
 * Outbound sync: QuikCRM QcfLead create/update -> LeadSquared.
 *
 * Flow (all tenant-scoped):
 *   1. Map the lead to the `{ Attribute, Value }[]` LeadSquared payload.
 *   2. Hash that payload (stable, order-independent).
 *   3. Load the mapping row and run the Phase 1 loop guard against its
 *      `syncOrigin` + `lastPayloadHash`. Changes that originated in
 *      LeadSquared, or that are byte-identical to what we last synced, are
 *      skipped — this is what breaks the echo loop.
 *   4. Only if the guard passes: call LeadSquared, then upsert the mapping row
 *      with the returned ProspectId, syncOrigin='crm', and the new hash.
 *
 * The API call happens BEFORE any DB write, so a failed push leaves the mapping
 * row exactly as it was — we never record a sync that didn't happen.
 *
 * Delete-sync is intentionally out of scope. A future delete path would add its
 * own function here and a `deletedAt`/`deleteSyncedAt` column on the mapping.
 */
import { prisma } from "@/lib/db/prisma";
import {
  hashPayload,
  shouldPushToLeadSquared,
  type SyncOrigin,
} from "@/lib/services/leadsquared/loop-guard";
import {
  buildLeadSquaredAttributes,
  DEFAULT_FIELD_MAP_CONFIG,
  type LeadPayloadInput,
  type LeadSquaredFieldMapConfig,
} from "@/lib/services/leadsquared/field-map";
import { LeadSquaredClient, LeadSquaredError } from "@/lib/services/leadsquared/client";
import { logSync } from "@/lib/services/leadsquared/telemetry";

export interface OutboundSyncInput {
  tenantId: string;
  /** The QcfLead id — the stable link key in the mapping table. */
  crmLeadId: string;
  /** Mapped lead fields (+ optional transient status remarks). */
  lead: LeadPayloadInput;
  /** Which system authored this change. LeadSquared-origin writes are dropped. */
  origin: SyncOrigin;
}

export interface OutboundSyncResult {
  pushed: boolean;
  skippedReason?: "origin-leadsquared" | "unchanged";
  prospectId?: string | null;
  /** Non-fatal outcome flags:
   *  - "prospect-id-conflict": push succeeded but the ProspectId already maps to
   *    another lead (LeadSquared merged CRM duplicates).
   *  - "duplicate-email": LeadSquared rejected the create as a duplicate email
   *    and we couldn't resolve the existing ProspectId to update instead. */
  warning?: "prospect-id-conflict" | "duplicate-email";
}

/** Duck-typed Prisma P2002 (unique constraint) check — avoids importing the
 *  error class and keeps this module DB-driver-agnostic. */
function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** LeadSquared's "A Lead with same Email already exists." rejection. */
function isDuplicateEmailError(err: unknown): boolean {
  if (!(err instanceof LeadSquaredError)) return false;
  const body = err.responseBody;
  if (body && typeof body === "object") {
    const ex = (body as { ExceptionType?: unknown }).ExceptionType;
    if (ex === "MXDuplicateEntryException") return true;
    try {
      if (/MXDuplicateEntryException|already exists/i.test(JSON.stringify(body))) return true;
    } catch {
      /* non-serialisable body — fall through */
    }
  }
  return /already exists/i.test(err.message);
}

/** Client surface the outbound path needs. `getLeadByEmail` is optional so a
 *  test double (or a future client) without it degrades gracefully. */
type OutboundClient = Pick<LeadSquaredClient, "createOrUpdateLead" | "updateLead"> &
  Partial<Pick<LeadSquaredClient, "getLeadByEmail">>;

/** Injectable dependencies so tests never hit the network or a real DB. */
export interface OutboundSyncDeps {
  prisma?: typeof prisma;
  client?: OutboundClient;
  fieldMap?: LeadSquaredFieldMapConfig;
  now?: () => Date;
}

export async function syncLeadOutbound(
  input: OutboundSyncInput,
  deps: OutboundSyncDeps = {},
): Promise<OutboundSyncResult> {
  const db = deps.prisma ?? prisma;
  const fieldMap = deps.fieldMap ?? DEFAULT_FIELD_MAP_CONFIG;
  const now = deps.now ?? (() => new Date());

  // 1. Build the payload and hash the exact content we would send. We hash an
  //    Attribute->Value object (key order irrelevant) so it stays stable.
  //    onSkip: a picklist value outside LeadSquared's allowed options is dropped
  //    (not sent) and logged, so it can't 500 the whole lead — the rest syncs.
  const attributes = buildLeadSquaredAttributes(input.lead, fieldMap, {
    onSkip: (field, value) =>
      logSync("warn", "outbound.picklist.value_skipped", {
        tenantId: input.tenantId,
        crmLeadId: input.crmLeadId,
        field,
        value,
      }),
  });
  // Change-detection hash uses the FAITHFUL representation (forHash): it includes
  // stage/status/substatus/source values even when they fall outside the picklist
  // allowlist. This is what the inbound path also hashes, so a real change to an
  // unmapped value is never mistaken for "unchanged" in either direction — while
  // the actual push above still sends only allowlist-safe attributes.
  const hashAttributes = buildLeadSquaredAttributes(input.lead, fieldMap, { forHash: true });
  const payloadForHash = Object.fromEntries(
    hashAttributes.map((a) => [a.Attribute, a.Value]),
  );
  const newHash = hashPayload(payloadForHash);

  // 2. Load the existing mapping (tenant-scoped per rule #5).
  const existing = await db.qcfLeadSquaredSyncMap.findFirst({
    where: { crmLeadId: input.crmLeadId, tenantId: input.tenantId },
  });

  // 3. Loop guard.
  const pass = shouldPushToLeadSquared({
    origin: input.origin,
    newHash,
    lastHash: existing?.lastPayloadHash,
  });
  if (!pass) {
    return {
      pushed: false,
      skippedReason:
        input.origin === "leadsquared" ? "origin-leadsquared" : "unchanged",
      prospectId: existing?.lsqProspectId ?? null,
    };
  }

  // 4. Push FIRST — if this throws, we return before touching the mapping row,
  //    so a failed API call can never corrupt it.
  //    - Known ProspectId (a mapping row exists): UPDATE that exact prospect via
  //      Lead.Update. CreateOrUpdate would match by email and try to CREATE
  //      (it ignores a body ProspectID), 500ing with MXDuplicateEntryException.
  //    - No mapping (first sync): CreateOrUpdate creates/dedupes by email; on a
  //      duplicate-email rejection we resolve the existing prospect by email and
  //      switch to the update path (see recovery below).
  const client = deps.client ?? LeadSquaredClient.fromEnv();
  const knownProspectId = existing?.lsqProspectId ?? null;

  let prospectId: string;
  if (knownProspectId) {
    const res = await client.updateLead(knownProspectId, attributes);
    prospectId = res.prospectId;
  } else {
    try {
      const res = await client.createOrUpdateLead(attributes);
      prospectId = res.prospectId;
    } catch (err: unknown) {
      if (!isDuplicateEmailError(err)) throw err;
      // The email already exists in LeadSquared but we have no mapping, so the
      // create was rejected. Recover: resolve the existing prospect by email and
      // UPDATE it via Lead.Update (NOT another CreateOrUpdate with the same body,
      // which would just 500 again). If we can't resolve it — or the update also
      // fails — treat "already exists" as NON-FATAL (log + return) so the job
      // doesn't exhaust its BullMQ retries on a permanent condition.
      logSync("warn", "outbound.duplicate_email", {
        tenantId: input.tenantId,
        crmLeadId: input.crmLeadId,
      });
      const email = typeof input.lead.email === "string" ? input.lead.email.trim() : "";
      const recoveredId =
        email && client.getLeadByEmail
          ? await client.getLeadByEmail(email).catch(() => null)
          : null;
      if (!recoveredId) {
        logSync("warn", "outbound.duplicate_unresolved", {
          tenantId: input.tenantId,
          crmLeadId: input.crmLeadId,
          reason: !email ? "no-email" : !client.getLeadByEmail ? "lookup-unavailable" : "not-found",
        });
        return { pushed: false, prospectId: null, warning: "duplicate-email" };
      }
      try {
        // Persisting `recoveredId` happens at step 5 via this prospectId.
        const res = await client.updateLead(recoveredId, attributes);
        prospectId = res.prospectId;
      } catch {
        logSync("warn", "outbound.duplicate_update_failed", {
          tenantId: input.tenantId,
          crmLeadId: input.crmLeadId,
        });
        return { pushed: false, prospectId: recoveredId, warning: "duplicate-email" };
      }
    }
  }

  // 5. Record the successful sync. Tenant-scoped; tenantId is immutable so it
  //    is only set on create.
  const syncedAt = now();
  try {
    await db.qcfLeadSquaredSyncMap.upsert({
      where: { crmLeadId: input.crmLeadId },
      create: {
        tenantId: input.tenantId,
        crmLeadId: input.crmLeadId,
        lsqProspectId: prospectId,
        syncOrigin: "crm" satisfies SyncOrigin,
        lastPayloadHash: newHash,
        lastSyncedAt: syncedAt,
      },
      update: {
        lsqProspectId: prospectId,
        syncOrigin: "crm" satisfies SyncOrigin,
        lastPayloadHash: newHash,
        lastSyncedAt: syncedAt,
      },
    });
  } catch (e: unknown) {
    // The [tenantId, lsqProspectId] unique blew up: this ProspectId is already
    // mapped to a DIFFERENT crmLead — LeadSquared merged two CRM duplicates
    // into one prospect. The push already succeeded; don't dead-letter the job.
    // Surface it loudly so the duplicate CRM leads can be reconciled by hand.
    if (isUniqueConstraintError(e)) {
      console.warn(
        `[leadsquared] prospect-id conflict: ProspectId ${prospectId} is already mapped to ` +
          `another lead in tenant ${input.tenantId}; skipped mapping write for crmLead ` +
          `${input.crmLeadId}. Likely a LeadSquared-side merge of duplicate leads.`,
      );
      return { pushed: true, prospectId, warning: "prospect-id-conflict" };
    }
    throw e;
  }

  return { pushed: true, prospectId };
}
