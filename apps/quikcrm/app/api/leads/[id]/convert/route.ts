import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { convertLeadSchema } from "@/lib/validators/lead";
import { parseRevenueDisplay } from "@/lib/services/accounts";
import { notifyLeadConverted } from "@/lib/notifications/lead-triggers";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import {
  logBusinessEvent,
  BUSINESS_EVENT_TYPES,
} from "@/lib/services/activities/business-events";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");

    const parsed = convertLeadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const opts = parsed.data;

    const lead = await prisma.crmLead.findFirst({ where: { id, orgId: user.orgId } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (lead.linkedContactId) {
      return NextResponse.json(
        { error: "Lead is already converted", contactId: lead.linkedContactId },
        { status: 409 },
      );
    }
    await assertAccountAccess(user, lead.accountId);
    // A pre-selected account (from the Convert modal) must be in the caller's
    // scope, same gate the lead's own account passes above.
    if (opts.accountId) await assertAccountAccess(user, opts.accountId);

    const result = await prisma.$transaction(async (tx) => {
      // Prefer an explicitly selected account, then the lead's existing link.
      // When neither is set, the block below resolves one from the company name
      // exactly as before (the selection simply pre-fills `accountId`, which
      // short-circuits the `if (!accountId …)` company-name branch).
      let accountId: string | null = opts.accountId ?? lead.accountId;
      if (!accountId && lead.company && lead.company.trim()) {
        const accountName = lead.company.trim();
        const existing = await tx.crmAccount.findFirst({
          where: { orgId: user.orgId, name: accountName, deletedAt: null },
          select: { id: true, annualRevenueDisplay: true, annualRevenueAmount: true },
        });
        // Carry the Lead's revenue onto the Account (Revenue → Revenue).
        // Lead stores free-text `annualRevenueDisplay`; best-effort parse it into
        // amount/currency the same way the Accounts API does on create, so the
        // Account's numeric revenue fields are populated too (not just display).
        const revenue = parseRevenueDisplay(lead.annualRevenueDisplay);
        if (existing) {
          accountId = existing.id;
          // Reused an existing account by name. Backfill revenue ONLY when the
          // account has none yet and the lead provides one — never clobber an
          // account that already carries its own revenue.
          const accountHasRevenue =
            !!existing.annualRevenueDisplay || existing.annualRevenueAmount != null;
          if (!accountHasRevenue && lead.annualRevenueDisplay) {
            await tx.crmAccount.update({
              where: { id: existing.id },
              data: {
                annualRevenueDisplay: lead.annualRevenueDisplay,
                annualRevenueAmount: revenue?.amount ?? null,
                annualRevenueCurrency: revenue?.currency ?? "INR",
              },
            });
          }
        } else {
          accountId = (
            await tx.crmAccount.create({
              data: {
                orgId: user.orgId,
                name: accountName,
                industry: lead.industry,
                ownerId: lead.ownerId,
                ownerName: lead.ownerName,
                annualRevenueDisplay: lead.annualRevenueDisplay,
                annualRevenueAmount: revenue?.amount ?? null,
                annualRevenueCurrency: revenue?.currency ?? "INR",
                createdByUserId: user.userId,
              },
              select: { id: true },
            })
          ).id;
        }
      }

      let contactId: string | null = null;
      if (opts.createContact) {
        const [first, ...rest] = lead.name.split(" ");
        const contact = await tx.crmContact.create({
          data: {
            orgId: user.orgId,
            firstName: first || lead.name,
            lastName: rest.join(" ") || null,
            email: lead.email,
            // Contact has a single `phone`. The lead stores phone + mobile, and
            // Mobile is the required/primary field in the Add Lead form (Phone is
            // optional), so map mobile first and fall back to phone — matching how
            // the leads grid resolves the lead's phone column (lead-table.tsx).
            // Without this, leads captured with only a Mobile produced contacts
            // with an empty phone.
            phone: lead.mobile || lead.phone,
            title: lead.jobTitle,
            accountId,
            leadId: lead.id,
            ownerId: lead.ownerId,
            ownerName: lead.ownerName,
            source: lead.source,
          },
        });
        contactId = contact.id;
      }
      let opportunityId: string | null = null;
      if (opts.createOpportunity) {
        const opp = await tx.crmOpportunity.create({
          data: {
            orgId: user.orgId,
            name: opts.opportunityTitle || `${lead.name} — Opportunity`,
            stage: "Prospecting",
            amount: opts.opportunityAmount ?? null,
            closeDate: opts.opportunityCloseDate ? new Date(opts.opportunityCloseDate) : null,
            accountId,
            leadId: lead.id,
            ownerId: lead.ownerId,
          },
        });
        opportunityId = opp.id;
      }

      // Re-link polymorphic anchors + call-log FKs to the new Contact when a
      // Contact was created (Contact-Primary routing). The direct `leadId` FK
      // is intentionally preserved so the original Lead timeline still works.
      let activitiesRelinked = 0;
      let tasksRelinked = 0;
      let notesRelinked = 0;
      let callsRelinked = 0;
      if (contactId) {
        const activityRes = await tx.crmActivity.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: {
            relatedKind: "Contact",
            relatedObjectId: contactId,
            ...(opportunityId ? { opportunityId } : {}),
          },
        });
        activitiesRelinked = activityRes.count;

        const taskRes = await tx.crmTask.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        tasksRelinked = taskRes.count;

        const noteRes = await tx.crmNote.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        notesRelinked = noteRes.count;

        const callRes = await tx.crmCallLog.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: { linkedContactId: contactId },
        });
        callsRelinked = callRes.count;

        await audit(
          {
            orgId: user.orgId,
            userId: user.userId,
            module: "leads",
            action: "lead_convert_relink",
            resourceId: lead.id,
            metadata: {
              fromLeadId: lead.id,
              // `toAccountId` lets the change log resolve the Account name for the
              // "Lead Converted" entry. (Older rows omit it — the changelog API
              // falls back to the lead's current accountId.)
              toAccountId: accountId,
              toContactId: contactId,
              toOpportunityId: opportunityId,
              activitiesRelinked,
              tasksRelinked,
              notesRelinked,
              callsRelinked,
            },
          },
          tx,
        );
      }

      const updatedLead = await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "Converted",
          convertedAt: new Date(),
          linkedContactId: contactId,
          accountId: accountId ?? lead.accountId,
        },
      });

      // RBAC: grant the converting user account-scoped access so the records
      // produced by this conversion (Account + the Contact/Opportunity attached
      // to it) are visible to them. Visibility for accounts/contacts/opportunities
      // is account-scoped via CrmUserAccountAccess (see lib/auth/account-acl.ts),
      // so a single access row covers all three — reusing the existing mechanism
      // rather than adding a new one.
      //
      // Skipped for Administrators (already unrestricted — "no changes" per spec).
      // Idempotent: composite PK (userId, accountId) + skipDuplicates means a
      // pre-existing grant or an account already created with access is a no-op.
      // Only the converting user is affected.
      const resolvedAccountId = accountId ?? lead.accountId;
      if (resolvedAccountId && user.role !== "Administrator") {
        await tx.crmUserAccountAccess.createMany({
          data: [{ userId: user.userId, accountId: resolvedAccountId }],
          skipDuplicates: true,
        });
      }

      return {
        lead: updatedLead,
        contactId,
        opportunityId,
        accountId,
        opportunityName: opts.createOpportunity
          ? opts.opportunityTitle || `${lead.name} — Opportunity`
          : null,
      };
    });

    // Global Activities feed: emit a single "Lead Converted" event. This is the
    // user-visible counterpart to the internal `lead_convert_relink` audit row
    // (which stays out of the feed). Created AFTER the transaction's relink so it
    // is NOT re-keyed to the Contact — it stays on the Lead. Visibility inherits
    // from relatedKind/relatedObjectId (RBAC unchanged). Non-blocking + swallowed.
    {
      const accountName = result.accountId
        ? (
            await prisma.crmAccount.findFirst({
              where: { id: result.accountId, orgId: user.orgId },
              select: { name: true },
            })
          )?.name ?? null
        : null;
      const parts: string[] = [];
      if (accountName) parts.push(`Account ${accountName}`);
      if (result.contactId) parts.push(`Contact ${lead.name}`);
      if (result.opportunityName) parts.push(`Opportunity ${result.opportunityName}`);
      const outcome =
        parts.length > 0 ? `Converted to ${parts.join(", ")}` : "Lead converted";
      await logBusinessEvent({
        orgId: user.orgId,
        userId: user.userId,
        type: BUSINESS_EVENT_TYPES.leadConverted,
        relatedKind: "Lead",
        relatedObjectId: lead.id,
        leadId: lead.id,
        opportunityId: result.opportunityId ?? undefined,
        subject: `Lead converted · ${lead.name}`,
        outcome,
        occurredAt: new Date(),
      });
    }

    // Notify lead owner about conversion — non-blocking.
    notifyLeadConverted({
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      leadId: lead.id,
      leadName: lead.name,
      ownerId: lead.ownerId,
      contactId: result.contactId,
      opportunityId: result.opportunityId,
    }).catch((err) =>
      console.error("[notifications] notifyLeadConverted failed", err),
    );

    // ── Rules engine (after existing conversion notification) ──
    evaluateRulesForEvent({
      event: "converted",
      entityType: "lead",
      entityId: lead.id,
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      before: lead as unknown as Record<string, unknown>,
      after: {
        ...result.lead,
        contactId: result.contactId,
        opportunityId: result.opportunityId,
      } as Record<string, unknown>,
      changedFields: ["status", "convertedAt", "linkedContactId"],
    }).catch((err) => console.error("[rules-engine] lead convert failed", err));

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
