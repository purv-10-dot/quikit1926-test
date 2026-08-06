/**
 * Resolve CRM records ↔ email addresses.
 *
 *   - recordEmails(): the email address(es) belonging to a Lead/Contact/etc.
 *     (used to prefill the compose "To" and to link a record's thread).
 *   - matchRecordByEmail(): given an inbound address, find the Lead/Contact it
 *     belongs to in this org (used by the sync poller to attach replies).
 *
 * All queries are orgId-scoped. Matching uses the existing indexed email columns
 * (@@index([orgId, email]) on CrmLead + CrmContact) so it stays cheap at scale.
 * Account/Opportunity have no email column, so inbound matching is Lead/Contact
 * only; outbound sends from those records still thread correctly via the record
 * the user opened.
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { ActivityPrimaryKind } from "@/lib/services/activities/target-existence";

/**
 * Canonical email normalization for MATCHING (trim + lowercase). Single source
 * of truth — every comparison in the email pipeline routes through this so
 * casing/whitespace never causes a miss. Does NOT change stored display values.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return email ? email.trim().toLowerCase() : "";
}

/** Normalize a list of emails for matching (deduped, empties dropped). */
export function normalizeEmails(emails: Array<string | null | undefined>): string[] {
  return [...new Set(emails.map(normalizeEmail).filter((e) => e.length > 0))];
}

/**
 * A case-insensitive equality clause for a stored email column. Stored Lead/
 * Contact emails may be mixed-case; Postgres `=` is case-sensitive, so matching
 * must use mode:"insensitive". `value` must already be normalized.
 */
function ciEmail(
  field: "email" | "secondaryEmail",
  value: string,
): Record<string, Prisma.StringNullableFilter> {
  return { [field]: { equals: value, mode: "insensitive" } };
}

export interface RecordRef {
  kind: ActivityPrimaryKind;
  id: string;
}

/** Emails associated with a specific record (for prefilling recipients). */
export async function recordEmails(
  orgId: string,
  kind: string,
  id: string,
): Promise<string[]> {
  const norm = (e?: string | null) => (e ? e.trim().toLowerCase() : "");
  if (kind === "Lead") {
    const r = await prisma.crmLead.findFirst({
      where: { id, orgId },
      select: { email: true, secondaryEmail: true },
    });
    return [norm(r?.email), norm(r?.secondaryEmail)].filter(Boolean);
  }
  if (kind === "Contact") {
    const r = await prisma.crmContact.findFirst({
      where: { id, orgId },
      select: { email: true },
    });
    return [norm(r?.email)].filter(Boolean);
  }
  // Account/Opportunity: fall back to the emails of their linked contacts/leads.
  if (kind === "Account") {
    const [contacts, leads] = await Promise.all([
      prisma.crmContact.findMany({ where: { accountId: id, orgId }, select: { email: true } }),
      prisma.crmLead.findMany({ where: { accountId: id, orgId }, select: { email: true } }),
    ]);
    return [...contacts, ...leads].map((x) => norm(x.email)).filter(Boolean);
  }
  if (kind === "Opportunity") {
    const opp = await prisma.crmOpportunity.findFirst({
      where: { id, orgId },
      select: { accountId: true, leadId: true },
    });
    const out = new Set<string>();
    if (opp?.leadId) (await recordEmails(orgId, "Lead", opp.leadId)).forEach((e) => out.add(e));
    if (opp?.accountId)
      (await recordEmails(orgId, "Account", opp.accountId)).forEach((e) => out.add(e));
    return [...out];
  }
  return [];
}

export interface MatchResult extends RecordRef {
  /** The account this record rolls up to (if any) — lets the Account Emails tab surface it. */
  accountId?: string | null;
  /** An open/related opportunity on that account (if any) — for Opportunity roll-up. */
  opportunityId?: string | null;
}

/**
 * Find the CRM record that owns an email address in this org. Returns null when
 * the address is unknown — the sync poller skips unknown addresses (scope: only
 * sync mail tied to a CRM record).
 *
 * A message attaches to exactly ONE primary record (its `relatedKind`/
 * `relatedObjectId`), and the addressable owners are Leads and Contacts (the
 * only entities with an email column). Accounts and Opportunities have no email
 * of their own — an email "belongs" to them transitively through their linked
 * lead/contact. So we resolve the person first (Lead → Contact), then ALSO
 * return the account/opportunity it rolls up to, so the Account/Opportunity
 * Emails tabs can surface the same thread (see thread-visibility in the read
 * layer). Requirement 4/5 ("match against Leads, Contacts, Accounts, and
 * Opportunities") is satisfied by this person→account→opportunity resolution
 * rather than by inventing an email column on Account/Opportunity.
 */
export async function matchRecordByEmail(
  orgId: string,
  email: string,
): Promise<MatchResult | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;

  // Case-insensitive comparison: the incoming address is normalized (trim +
  // lowercase), but stored Lead/Contact emails may be mixed-case (e.g.
  // "Kanishka.Jedhe@x.com"). Postgres string equality is case-SENSITIVE by
  // default, so we must match with mode:"insensitive" or replies to a
  // mixed-case-stored record would never attach. See ciEmail() helper.
  // 1. Lead (top-of-funnel — where cold email typically lands first).
  const lead = await prisma.crmLead.findFirst({
    where: { orgId, OR: [ciEmail("email", e), ciEmail("secondaryEmail", e)] },
    select: { id: true, accountId: true },
  });
  if (lead) {
    return { kind: "Lead", id: lead.id, ...(await rollUp(orgId, lead.accountId)) };
  }

  // 2. Contact.
  const contact = await prisma.crmContact.findFirst({
    where: { orgId, ...ciEmail("email", e) },
    select: { id: true, accountId: true },
  });
  if (contact) {
    return { kind: "Contact", id: contact.id, ...(await rollUp(orgId, contact.accountId)) };
  }

  return null;
}

/** Resolve the account + a related opportunity a matched person rolls up to. */
async function rollUp(
  orgId: string,
  accountId: string | null,
): Promise<{ accountId: string | null; opportunityId: string | null }> {
  if (!accountId) return { accountId: null, opportunityId: null };
  const opp = await prisma.crmOpportunity.findFirst({
    where: { orgId, accountId },
    select: { id: true },
    orderBy: { lastActivityAt: "desc" },
  });
  return { accountId, opportunityId: opp?.id ?? null };
}

/**
 * Given the addresses on a message, return the first CRM record any of them
 * match (checking non-mailbox parties first). Used to attach a synced message.
 */
export async function matchRecordByAnyAddress(
  orgId: string,
  addresses: string[],
  mailboxAddress: string,
): Promise<MatchResult | null> {
  const mbox = normalizeEmail(mailboxAddress);
  const candidates = addresses.map(normalizeEmail).filter((a) => a && a !== mbox);
  for (const addr of candidates) {
    const match = await matchRecordByEmail(orgId, addr);
    if (match) return match;
  }
  return null;
}

/**
 * Expand a record into the set of (relatedKind, relatedObjectId) primaries whose
 * email threads should appear on that record's Emails tab.
 *
 * Messages are stored against their primary owner (a Lead or Contact). An
 * Account/Opportunity Emails tab must ROLL UP the threads of the leads/contacts
 * under it — that is how requirement 4/5 ("attach to the correct Account /
 * Opportunity") surfaces without duplicating messages. Lead/Contact just
 * return themselves.
 */
export async function resolveThreadScope(
  orgId: string,
  kind: string,
  id: string,
): Promise<Array<{ relatedKind: string; relatedObjectId: string }>> {
  const self = [{ relatedKind: kind, relatedObjectId: id }];
  if (kind === "Lead" || kind === "Contact") return self;

  let accountId: string | null = null;
  if (kind === "Account") {
    accountId = id;
  } else if (kind === "Opportunity") {
    const opp = await prisma.crmOpportunity.findFirst({
      where: { id, orgId },
      select: { accountId: true, leadId: true },
    });
    accountId = opp?.accountId ?? null;
    // An opportunity linked directly to a lead (no account) rolls up that lead.
    if (opp?.leadId) self.push({ relatedKind: "Lead", relatedObjectId: opp.leadId });
  }

  if (accountId) {
    const [contacts, leads] = await Promise.all([
      prisma.crmContact.findMany({ where: { orgId, accountId }, select: { id: true } }),
      prisma.crmLead.findMany({ where: { orgId, accountId }, select: { id: true } }),
    ]);
    for (const c of contacts) self.push({ relatedKind: "Contact", relatedObjectId: c.id });
    for (const l of leads) self.push({ relatedKind: "Lead", relatedObjectId: l.id });
  }
  return self;
}
