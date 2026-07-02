/**
 * Normalise a free-form related-kind string into the canonical `CrmActivity`
 * relatedKind vocabulary the activity ACL recognises.
 *
 * `buildActivityAclWhere` scopes feed visibility by matching `relatedKind` in
 * `["Lead","lead"]`, `["Account","account"]`, `["Opportunity","opportunity"]`,
 * `["Contact","contact"]`. Activities written with any other relatedKind would
 * NOT inherit account scoping, so callers must map their entity to one of these
 * canonical PascalCase kinds (or get `null` and skip the activity write).
 *
 * Document `refType`s (lead/account/opportunity/quote/order) and note
 * `relatedKind`s flow through here. quote/order have no account-scope branch in
 * the ACL, so they normalise to `null` — the caller skips the feed row for them
 * (their own quote/order activities already cover those records).
 */
export type CanonicalRelatedKind = "Lead" | "Opportunity" | "Contact" | "Account";

export function normaliseRelatedKind(
  raw: string | null | undefined,
): CanonicalRelatedKind | null {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "lead":
      return "Lead";
    case "opportunity":
      return "Opportunity";
    case "contact":
      return "Contact";
    case "account":
      return "Account";
    default:
      return null;
  }
}
