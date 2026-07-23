// apps/quikcrm/app/api/activities/call-contacts/route.ts
/**
 * GET /api/activities/call-contacts?relatedKind=&relatedObjectId=
 *
 * Read-only helper for the Log Activity → Call form. Given the record the
 * activity is being linked to, returns the people that could have been called
 * plus a best-guess phone number, so the Call form can offer a searchable
 * Contact picker that auto-fills Phone Number.
 *
 * Resolution by kind (all org-scoped; contacts pass the account-scope ACL):
 *   - Contact     → that contact.
 *   - Lead        → the lead itself (name + phone/mobile) and any contacts
 *                   whose leadId points at it.
 *   - Account     → contacts whose accountId points at it.
 *   - Opportunity → contacts on the opportunity's account (falls back to its
 *                   lead's contacts when it has no account).
 *   - None        → empty list (manual entry only).
 *
 * Response: { success: true, data: { items: [{ id, name, phone }] } }
 * `id` is a stable string the picker keys on (record id; the lead's own row is
 * prefixed "lead:" so it can't collide with a contact id).
 *
 * This endpoint only READS; it changes no existing API. It exists so the Call
 * picker doesn't have to overload /api/contacts/picker (which is unscoped to a
 * parent record and returns no phone).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";

export const runtime = "nodejs";

type CallContact = { id: string; name: string; phone: string | null };

const LOOKUP_KINDS = ["Lead", "Opportunity", "Contact", "Account"] as const;
type LookupKind = (typeof LOOKUP_KINDS)[number];

function isLookupKind(v: string): v is LookupKind {
  return (LOOKUP_KINDS as readonly string[]).includes(v);
}

/** `firstName lastName` → falls back to email → "—". */
function contactName(c: { firstName: string | null; lastName: string | null; email: string | null }): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || "—";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const { searchParams } = new URL(req.url);
    const relatedKind = (searchParams.get("relatedKind") ?? "").trim();
    const relatedObjectId = (searchParams.get("relatedObjectId") ?? "").trim();

    // Standalone / unknown kind / missing id → nothing to resolve. Not an error:
    // the form simply offers manual entry.
    if (!relatedKind || !relatedObjectId || !isLookupKind(relatedKind)) {
      return NextResponse.json({ success: true, data: { items: [] } });
    }

    const orgId = user.orgId;
    // Account-scope ACL — a plain object (never a NextResponse) so it composes
    // into the contact `where` without leaking cross-account contacts.
    const acl = await accountScopeFilter(user);
    const contactWhere = (extra: Record<string, unknown>) => {
      const base = { orgId, deletedAt: null, ...extra };
      return acl ? { AND: [base, acl] } : base;
    };

    const items: CallContact[] = [];
    const seen = new Set<string>();
    const push = (it: CallContact) => {
      if (seen.has(it.id)) return;
      seen.add(it.id);
      items.push(it);
    };

    const selectContact = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    } as const;

    if (relatedKind === "Contact") {
      const c = await prisma.crmContact.findFirst({
        where: contactWhere({ id: relatedObjectId }),
        select: selectContact,
      });
      if (c) push({ id: c.id, name: contactName(c), phone: c.phone ?? null });
    } else if (relatedKind === "Account") {
      const rows = await prisma.crmContact.findMany({
        where: contactWhere({ accountId: relatedObjectId }),
        select: selectContact,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const c of rows) push({ id: c.id, name: contactName(c), phone: c.phone ?? null });
    } else if (relatedKind === "Lead") {
      // The lead's own name + best phone, then any contacts attached to it.
      const lead = await prisma.crmLead.findFirst({
        where: { orgId, id: relatedObjectId },
        select: { id: true, name: true, phone: true, mobile: true },
      });
      if (lead) {
        push({ id: `lead:${lead.id}`, name: lead.name, phone: lead.phone ?? lead.mobile ?? null });
      }
      const rows = await prisma.crmContact.findMany({
        where: contactWhere({ leadId: relatedObjectId }),
        select: selectContact,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      for (const c of rows) push({ id: c.id, name: contactName(c), phone: c.phone ?? null });
    } else if (relatedKind === "Opportunity") {
      const opp = await prisma.crmOpportunity.findFirst({
        where: { orgId, id: relatedObjectId },
        select: { accountId: true, leadId: true },
      });
      if (opp?.accountId) {
        const rows = await prisma.crmContact.findMany({
          where: contactWhere({ accountId: opp.accountId }),
          select: selectContact,
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        for (const c of rows) push({ id: c.id, name: contactName(c), phone: c.phone ?? null });
      } else if (opp?.leadId) {
        const rows = await prisma.crmContact.findMany({
          where: contactWhere({ leadId: opp.leadId }),
          select: selectContact,
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        for (const c of rows) push({ id: c.id, name: contactName(c), phone: c.phone ?? null });
      }
    }

    return NextResponse.json({ success: true, data: { items } });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
