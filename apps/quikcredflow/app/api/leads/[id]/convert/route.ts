import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { SERVERLESS_TX_OPTIONS } from "@/lib/db/transaction-options";
import { audit } from "@/lib/services/audit";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { assertLeadOwnership } from "@/lib/auth/owner-scope";
import { convertLeadSchema } from "@/lib/validators/lead";
import { notifyLeadConverted } from "@/lib/notifications/lead-triggers";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

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

    const lead = await prisma.qcfLead.findFirst({ where: { id, orgId: user.orgId } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Fast-path rejection. Also checks `status === "Converted"` so account-only
    // converts (which never set linkedContactId) are caught here too. This is a
    // best-effort early-out; the authoritative guard is the atomic claim below.
    if (lead.linkedContactId || lead.status === "Converted") {
      return NextResponse.json(
        { error: "Lead is already converted", contactId: lead.linkedContactId },
        { status: 409 },
      );
    }
    await assertAccountAccess(user, lead.accountId);
    await assertLeadOwnership(user, lead.ownerId);

    const result = await prisma.$transaction(async (tx) => {
      // Atomic idempotency claim — flip the lead to Converted *inside* the tx
      // before doing any work. Under READ COMMITTED a second concurrent convert
      // blocks on this row, then re-evaluates the WHERE against the now-committed
      // row and matches 0, so it cannot double-convert (no duplicate Contacts/
      // Accounts from a double-click or retry). It also closes the account-only
      // re-convert hole: linkedContactId is never set on those, but status/
      // convertedAt are, so the claim guards them regardless of createContact.
      const claim = await tx.qcfLead.updateMany({
        where: { id: lead.id, orgId: user.orgId, status: { not: "Converted" }, convertedAt: null },
        data: { status: "Converted", convertedAt: new Date() },
      });
      if (claim.count === 0) {
        return { alreadyConverted: true as const };
      }

      let accountId: string | null = lead.accountId;
      if (!accountId) {
        // Account rollup name: the company for B2B, otherwise the individual's
        // own name for the B2C / company-less motion. This closes the silent
        // "Contact with no Account" hole — every converted Contact rolls up to an
        // account. When there's no company AND we're not creating a Contact
        // (account-only convert), there's nothing to roll up, so we skip.
        const companyName = lead.company?.trim();
        const accountName = companyName || (opts.createContact ? lead.name.trim() : "");
        if (accountName) {
          const existing = await tx.qcfAccount.findFirst({
            where: { orgId: user.orgId, name: accountName, deletedAt: null },
            select: { id: true },
          });
          accountId =
            existing?.id ??
            (
              await tx.qcfAccount.create({
                data: {
                  orgId: user.orgId,
                  name: accountName,
                  industry: lead.industry,
                  ownerId: lead.ownerId,
                  ownerName: lead.ownerName,
                  createdByUserId: user.userId,
                },
                select: { id: true },
              })
            ).id;
        }
      }

      let contactId: string | null = null;
      if (opts.createContact) {
        // Prefer the lead's structured firstName/lastName (added 2026-07-08).
        // Fall back to splitting the single `name` only for legacy leads created
        // before those columns existed (name-only rows). This kills the naive
        // split for all new leads: "Mary Jane Watson" now maps to the actual
        // firstName/lastName the user entered instead of first-word/rest.
        let contactFirstName: string;
        let contactLastName: string | null;
        if (lead.firstName?.trim()) {
          contactFirstName = lead.firstName.trim();
          contactLastName = lead.lastName?.trim() || null;
        } else {
          const [first, ...rest] = lead.name.split(" ");
          contactFirstName = first || lead.name;
          contactLastName = rest.join(" ") || null;
        }
        const contact = await tx.qcfContact.create({
          data: {
            orgId: user.orgId,
            firstName: contactFirstName,
            lastName: contactLastName,
            email: lead.email,
            phone: lead.phone,
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
        const opp = await tx.qcfOpportunity.create({
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
        const activityRes = await tx.qcfActivity.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: {
            relatedKind: "Contact",
            relatedObjectId: contactId,
            ...(opportunityId ? { opportunityId } : {}),
          },
        });
        activitiesRelinked = activityRes.count;

        const taskRes = await tx.qcfTask.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        tasksRelinked = taskRes.count;

        const noteRes = await tx.qcfNote.updateMany({
          where: { orgId: user.orgId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        notesRelinked = noteRes.count;

        const callRes = await tx.qcfCallLog.updateMany({
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

      const updatedLead = await tx.qcfLead.update({
        where: { id: lead.id },
        data: {
          status: "Converted",
          convertedAt: new Date(),
          linkedContactId: contactId,
          accountId: accountId ?? lead.accountId,
        },
      });
      return { alreadyConverted: false as const, lead: updatedLead, contactId, opportunityId, accountId };
    }, SERVERLESS_TX_OPTIONS);

    if (result.alreadyConverted) {
      // A concurrent request won the claim — treat the loser as a no-op conflict.
      return NextResponse.json({ error: "Lead is already converted" }, { status: 409 });
    }

    // Outbound sync AFTER the tx committed (status -> Converted). Fire-and-forget.
    // On a tx rollback we never reach here, so nothing is enqueued.
    triggerOutboundSync({ orgId: user.orgId, crmLeadId: lead.id });

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

    return NextResponse.json({
      lead: result.lead,
      contactId: result.contactId,
      opportunityId: result.opportunityId,
      accountId: result.accountId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
