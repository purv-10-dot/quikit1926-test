import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { convertLeadSchema } from "@/lib/validators/lead";

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

    const lead = await prisma.crmLead.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (lead.linkedContactId) {
      return NextResponse.json(
        { error: "Lead is already converted", contactId: lead.linkedContactId },
        { status: 409 },
      );
    }
    await assertAccountAccess(user, lead.accountId);

    const result = await prisma.$transaction(async (tx) => {
      let accountId: string | null = lead.accountId;
      if (!accountId && lead.company && lead.company.trim()) {
        const accountName = lead.company.trim();
        const existing = await tx.crmAccount.findFirst({
          where: { tenantId: user.tenantId, name: accountName, deletedAt: null },
          select: { id: true },
        });
        accountId =
          existing?.id ??
          (
            await tx.crmAccount.create({
              data: {
                tenantId: user.tenantId,
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

      let contactId: string | null = null;
      if (opts.createContact) {
        const [first, ...rest] = lead.name.split(" ");
        const contact = await tx.crmContact.create({
          data: {
            tenantId: user.tenantId,
            firstName: first || lead.name,
            lastName: rest.join(" ") || null,
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
        const opp = await tx.crmOpportunity.create({
          data: {
            tenantId: user.tenantId,
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
          where: { tenantId: user.tenantId, leadId: lead.id },
          data: {
            relatedKind: "Contact",
            relatedObjectId: contactId,
            ...(opportunityId ? { opportunityId } : {}),
          },
        });
        activitiesRelinked = activityRes.count;

        const taskRes = await tx.crmTask.updateMany({
          where: { tenantId: user.tenantId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        tasksRelinked = taskRes.count;

        const noteRes = await tx.crmNote.updateMany({
          where: { tenantId: user.tenantId, leadId: lead.id },
          data: { relatedKind: "Contact", relatedObjectId: contactId },
        });
        notesRelinked = noteRes.count;

        const callRes = await tx.crmCallLog.updateMany({
          where: { tenantId: user.tenantId, leadId: lead.id },
          data: { linkedContactId: contactId },
        });
        callsRelinked = callRes.count;

        await audit(
          {
            tenantId: user.tenantId,
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

      const updatedLead = await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "Converted",
          convertedAt: new Date(),
          linkedContactId: contactId,
          accountId: accountId ?? lead.accountId,
        },
      });
      return { lead: updatedLead, contactId, opportunityId, accountId };
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
