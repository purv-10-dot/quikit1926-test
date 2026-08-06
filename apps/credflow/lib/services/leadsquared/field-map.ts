/**
 * Field mapping layer for the QuikCRM -> LeadSquared outbound sync.
 *
 * LeadSquared's `Lead.CreateOrUpdate` accepts a flat array of
 * `{ Attribute, Value }` pairs, where `Attribute` is the field's *SchemaName*.
 * Two kinds of SchemaName exist:
 *
 *   - Standard system fields (FirstName, EmailAddress, Phone, ...). These names
 *     are stable and documented, so we ship sensible defaults for them.
 *   - Custom fields (Stage, Sub-stage, Status, Remarks, ...). Their SchemaNames
 *     are `mx_...` strings that differ per LeadSquared account and are NOT
 *     known until `LeadsMetaData.Get` is run at runtime. We therefore keep them
 *     `null` here and require them to be injected via config. A `null` mapping
 *     means "not discovered yet" and the field is skipped rather than guessed.
 *
 * This module is pure and unit-testable — no network, no Prisma, no env.
 */
import type { CrmLead } from "@quikit/database";

/** One LeadSquared attribute pair, as required by the CreateOrUpdate body. */
export interface LeadSquaredAttribute {
  Attribute: string;
  Value: string;
}

/**
 * The subset of CrmLead columns we sync outbound. Tied to the real Prisma model
 * so a schema change surfaces here at compile time. Every field is widened to
 * allow `null`: this is a sync DTO that may carry a partial update, and the
 * builder skips empty values — so callers need not supply columns the model
 * marks non-null (name/stage/status).
 */
type Nullable<T> = { [K in keyof T]: T[K] | null };
// Partial + Nullable: a sync DTO that may carry a partial update. The builder
// skips any field that is null/undefined, so callers supply only what changed.
export type LeadSyncFields = Partial<
  Nullable<
    Pick<
      CrmLead,
    // name is used only to derive FirstName/LastName; never sent as its own attribute.
    | "name"
    // --- CONFIRMED (mapped both directions) ---
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "mobile"
    | "company"
    | "source"
    | "stage"
    | "status"
    | "substatus"
    | "country"
    | "industry"
    | "website"
    | "linkedinUrl"
    | "addressLine1"
    | "addressLine2"
    | "cityName"
    | "stateName"
    | "postalCode"
    | "ownerId"
    | "lat"
    | "long"
    // --- AMBIGUOUS (mapped only once the client confirms the SchemaName) ---
    | "jobTitle"
    | "secondaryEmail"
    | "annualRevenueDisplay"
    | "leadType"
    | "contactLinkedinUrl"
    | "area"
    >
  >
>;

/**
 * The full input to the payload builder: the mapped lead fields plus the
 * transient status `remarks` (which is not a stored CrmLead column — it rides
 * along with a status change), passed in by the caller when present.
 */
export interface LeadPayloadInput extends LeadSyncFields {
  statusRemarks?: string | null;
}

/**
 * SchemaName mapping config. Standard fields have safe defaults; custom fields
 * are `null` until fed from `LeadsMetaData.Get`. Inject a partial to override.
 */
export interface LeadSquaredFieldMapConfig {
  // ── CONFIRMED · STANDARD LeadSquared SchemaNames (stable, safe defaults) ──
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string | null;
  company: string | null;
  source: string | null; // Source
  stage: string | null; // ProspectStage (standard) — overridable via env
  linkedinUrl: string | null; // LinkedInId
  /**
   * OWNER SYNC DISABLED. QuikCRM `ownerId` is an internal id that does not match
   * any LeadSquared user (separate user systems), so mapping ownerId->OwnerId
   * mis-assigns/errors. Defaults to null and is never pushed. Kept as an
   * extension point for future email-based owner mapping (see builder TODO).
   */
  ownerId: string | null;
  lat: string | null; // Latitude
  long: string | null; // Longitude

  // ── CONFIRMED · CUSTOM (mx_) SchemaNames — account-specific. ──
  // null = not configured -> field skipped (today's behaviour). Populated from
  // env (LEADSQUARED_SCHEMA_*) or LeadsMetaData.Get at runtime. The sample .env
  // lists the confirmed mx_ names for the client to fill/confirm.
  status: string | null; // mx_Status
  subStage: string | null; // mx_Sub_Stage
  country: string | null; // mx_Country
  industry: string | null; // mx_Industry
  website: string | null; // mx_URL
  addressLine1: string | null; // mx_Street1
  addressLine2: string | null; // mx_Street2
  cityName: string | null; // mx_City
  stateName: string | null; // mx_State
  postalCode: string | null; // mx_Zip
  statusRemarks: string | null; // remarks that ride along with a status change

  // ── AMBIGUOUS — DO NOT GUESS. Disabled (null) until the client confirms the ──
  // exact LeadSquared SchemaName. Enable by setting the matching env var.
  // TODO(leadsquared): confirm SchemaName with the client before enabling each.
  jobTitle: string | null;
  secondaryEmail: string | null;
  annualRevenueDisplay: string | null;
  leadType: string | null;
  contactLinkedinUrl: string | null;
  area: string | null;

  // ── EXCLUDED — never mapped (internal / system / sync-control fields): ──
  //   id, tenantId, accountId, linkedContactId, externalId, sourceSystem,
  //   ownerName, name (derived only), score, leadQuality, isStarred,
  //   isDisengaged, followupPriority, createdAt, updatedAt, deletedAt,
  //   convertedAt, dynamicFields, requirementDetails.

  // ── Optional picklist value maps: CRM value -> LeadSquared value. ──
  // For Select/Dropdown fields these act as an ALLOWLIST: only mapped values (or
  // values already equal to a known LSQ value) are sent. Reverse (LSQ -> CRM)
  // drives inbound. See `skipUnknownPicklist` for the no-map behaviour.
  stageValueMap?: Record<string, string>;
  subStageValueMap?: Record<string, string>;
  statusValueMap?: Record<string, string>;
  industryValueMap?: Record<string, string>;
  sourceValueMap?: Record<string, string>;

  /**
   * How picklist fields behave when there is NO value-map entry for a value.
   *  - true (DEFAULT): SKIP that one attribute (do not send it) + warn. A CRM
   *    value that isn't in LeadSquared's picklist can then never 500 the whole
   *    lead — worst case that one field is omitted; the rest still syncs.
   *  - false: send the value as-is (legacy pass-through) — only safe when every
   *    CRM value is guaranteed to exist in the LSQ picklist.
   * Undefined is treated as true.
   */
  skipUnknownPicklist?: boolean;
}

/** Invert a CRM->LSQ value map into LSQ->CRM for the inbound direction. */
export function reverseValueMap(
  map: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map) return out;
  for (const [crm, lsq] of Object.entries(map)) out[lsq] = crm;
  return out;
}

/**
 * Default map. Only the standard system SchemaNames are filled in. Every custom
 * field stays null so nothing is pushed under a guessed `mx_` name.
 */
export const DEFAULT_FIELD_MAP_CONFIG: LeadSquaredFieldMapConfig = {
  // Standard — stable LSQ SchemaNames, safe to default.
  firstName: "FirstName",
  lastName: "LastName",
  email: "EmailAddress",
  phone: "Phone",
  mobile: "Mobile",
  company: "Company",
  source: "Source",
  stage: "ProspectStage",
  linkedinUrl: "LinkedInId",
  ownerId: null, // DISABLED — cross-system ids; see config comment + builder TODO
  lat: "Latitude",
  long: "Longitude",

  // Custom (mx_) — null until configured via env; skipped when null.
  status: null,
  subStage: null,
  country: null,
  industry: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  cityName: null,
  stateName: null,
  postalCode: null,
  statusRemarks: null,

  // Ambiguous — null until the client confirms the SchemaName.
  jobTitle: null,
  secondaryEmail: null,
  annualRevenueDisplay: null,
  leadType: null,
  contactLinkedinUrl: null,
  area: null,

  // Unknown picklist values are skipped (not sent) by default — never 500 a lead.
  skipUnknownPicklist: true,
};

/** Split a single `name` into first / last for LSQ's FirstName / LastName. */
function splitName(name: string | null | undefined): {
  first: string;
  last: string;
} {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { first, last: rest.join(" ") };
}

/** Coerce a value to the string LeadSquared expects, or null to skip it. */
function toValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Build the `{ Attribute, Value }[]` payload for `Lead.CreateOrUpdate`.
 *
 * Rules:
 *   - A field is emitted only when it has a non-empty value AND a non-null
 *     SchemaName in the config. Unmapped custom fields are silently skipped
 *     (with the SchemaName still to be discovered), never sent under a guess.
 *   - FirstName / LastName come from the explicit columns when present, else
 *     are derived by splitting `name`.
 *   - Output is sorted by Attribute so the result is deterministic — the
 *     outbound service hashes it for the loop guard, so stability matters.
 *   - `opts.forHash`: build the FAITHFUL representation used for change
 *     detection. Picklist values are still canonicalised via the value map, but
 *     an out-of-allowlist / unmapped value is INCLUDED (raw) instead of skipped.
 *     Use this for the loop-guard hash on BOTH directions; use the default
 *     (allowlist-filtering) build for the actual LeadSquared API push.
 */
export function buildLeadSquaredAttributes(
  input: LeadPayloadInput,
  config: LeadSquaredFieldMapConfig = DEFAULT_FIELD_MAP_CONFIG,
  opts: { onSkip?: (field: string, value: string) => void; forHash?: boolean } = {},
): LeadSquaredAttribute[] {
  const attrs: LeadSquaredAttribute[] = [];

  const push = (schemaName: string | null, rawValue: unknown): void => {
    if (!schemaName) return; // custom SchemaName not discovered yet -> skip
    const value = toValue(rawValue);
    if (value === null) return; // empty value -> skip
    attrs.push({ Attribute: schemaName, Value: value });
  };

  const skipUnknownPicklist = config.skipUnknownPicklist !== false; // default ON

  /**
   * Picklist (Select/Dropdown) push. An out-of-picklist value must never reach
   * LeadSquared — it would 500 the WHOLE lead — so we omit just that attribute
   * (+ onSkip) instead. Rules:
   *   - value map present: it is the ALLOWLIST. Send the mapped value; a value
   *     that is neither a CRM key nor a known LSQ value is SKIPPED.
   *   - no value map + skipUnknownPicklist (DEFAULT): SKIP the value — we can't
   *     prove it exists in the LSQ picklist, so omitting it is the safe choice.
   *   - no value map + skipUnknownPicklist=false: send as-is (legacy opt-out).
   * The decision is deterministic from (config, value), so the outbound payload
   * and the inbound echo hash stay consistent across directions.
   */
  const pushPicklist = (
    schemaName: string | null,
    rawValue: string | null | undefined,
    valueMap: Record<string, string> | undefined,
    field: string,
  ): void => {
    if (!schemaName) return;
    const value = toValue(rawValue);
    if (value === null) return;
    if (valueMap && Object.keys(valueMap).length > 0) {
      const mapped = valueMap[value]; // CRM -> LSQ
      const isKnownLsqValue = Object.values(valueMap).includes(value);
      if (mapped === undefined && !isKnownLsqValue) {
        // Value is outside the allowlist. For an ACTUAL push we skip it (an
        // out-of-picklist value would 500 the lead). For the CHANGE-DETECTION
        // hash (forHash) we MUST keep it — otherwise a genuine change to/from an
        // unmapped value is invisible to the hash and gets dropped as a false
        // echo. Include the raw value so the hash stays faithful.
        if (opts.forHash) {
          attrs.push({ Attribute: schemaName, Value: value });
          return;
        }
        opts.onSkip?.(field, value); // out-of-allowlist -> skip this attribute, keep the lead
        return;
      }
      attrs.push({ Attribute: schemaName, Value: mapped ?? value });
      return;
    }
    // No value map configured.
    if (skipUnknownPicklist && !opts.forHash) {
      opts.onSkip?.(field, value); // unknown-picklist -> skip this attribute, keep the lead
      return;
    }
    // forHash (or opt-out): include the raw value so change detection is faithful.
    attrs.push({ Attribute: schemaName, Value: value });
  };

  // Name -> FirstName / LastName. Prefer explicit columns, fall back to split.
  const split = splitName(input.name);
  push(config.firstName, input.firstName ?? split.first);
  push(config.lastName, input.lastName ?? split.last);

  push(config.email, input.email);
  push(config.phone, input.phone);
  push(config.mobile, input.mobile);
  push(config.company, input.company);
  push(config.linkedinUrl, input.linkedinUrl);
  push(config.lat, input.lat);
  push(config.long, input.long);

  // OWNER SYNC DISABLED (both directions) — QuikCRM ownerId is not a LeadSquared
  // user id, so pushing ownerId->OwnerId mis-assigns/errors. We intentionally do
  // NOT push it (config.ownerId is null anyway).
  // TODO(leadsquared): email-based owner mapping — resolve the CRM owner's email
  // to the matching LeadSquared user, then push here, once the client confirms
  // their LSQ user list.

  // Picklist (Select/Dropdown) fields — value map doubles as an allowlist.
  pushPicklist(config.source, input.source, config.sourceValueMap, "source");
  pushPicklist(config.stage, input.stage, config.stageValueMap, "stage");
  pushPicklist(config.status, input.status, config.statusValueMap, "status");
  pushPicklist(config.subStage, input.substatus, config.subStageValueMap, "subStage");
  pushPicklist(config.industry, input.industry, config.industryValueMap, "industry");

  // Free-text / other custom fields (no picklist allowlist).
  push(config.statusRemarks, input.statusRemarks);
  // COUNTRY INTENTIONALLY UNMAPPED. The earlier `mx_Country` guess is actually
  // "Demo Taken By" (a people picker) in the client's account. config.country
  // stays null (no default, not in the sample env) -> skipped, until the real
  // country field is confirmed.
  push(config.country, input.country);
  push(config.website, input.website);
  push(config.addressLine1, input.addressLine1);
  push(config.addressLine2, input.addressLine2);
  push(config.cityName, input.cityName);
  push(config.stateName, input.stateName);
  push(config.postalCode, input.postalCode);

  // Ambiguous fields — emitted only if the client has confirmed + configured
  // a SchemaName (otherwise null -> skipped).
  push(config.jobTitle, input.jobTitle);
  push(config.secondaryEmail, input.secondaryEmail);
  push(config.annualRevenueDisplay, input.annualRevenueDisplay);
  push(config.leadType, input.leadType);
  push(config.contactLinkedinUrl, input.contactLinkedinUrl);
  push(config.area, input.area);

  return attrs.sort((a, b) => a.Attribute.localeCompare(b.Attribute));
}
