/**
 * Convert a sourced opportunity → VCApplication + VCDeal at Intake stage.
 *
 *   POST /api/sourced-opportunities/[id]/convert
 *
 * Required: opportunity has verticalId set. Founder user is created lazily
 * if contactEmail is present and no matching User exists yet (placeholder
 * Membership; real founder onboarding still happens via standard flow).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, ANALYST_ROLES } from "@/lib/rbac";

export const POST = withTenantAuth(
  async ({ tenantId, userId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, tenantId), ANALYST_ROLES);
    if (denied) return denied;

    const opp = await db.vCSourcedOpportunity.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!opp) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (opp.status === "converted") {
      return NextResponse.json(
        { success: false, error: "Already converted" },
        { status: 409 },
      );
    }
    if (!opp.verticalId) {
      return NextResponse.json(
        { success: false, error: "Vertical must be set before conversion" },
        { status: 400 },
      );
    }
    if (!opp.contactEmail) {
      return NextResponse.json(
        { success: false, error: "Contact email required for conversion" },
        { status: 400 },
      );
    }

    // Resolve founder user (create lazily if missing).
    let founder = await db.user.findUnique({
      where: { email: opp.contactEmail },
      select: { id: true },
    });
    if (!founder) {
      const created = await db.user.create({
        data: {
          email: opp.contactEmail,
          firstName: opp.contactName?.split(" ")[0] ?? "Founder",
          lastName: opp.contactName?.split(" ").slice(1).join(" ") || "—",
          memberships: {
            create: {
              tenantId,
              role: "founder",
            },
          },
        },
        select: { id: true },
      });
      founder = created;
    } else {
      // Ensure founder membership exists for this tenant
      await db.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: founder.id } },
        update: {},
        create: { userId: founder.id, tenantId, role: "founder" },
      });
    }

    const result = await db.$transaction(async (tx) => {
      const application = await tx.vCApplication.create({
        data: {
          tenantId,
          founderId: founder.id,
          verticalId: opp.verticalId!,
          startupName: opp.startupName,
          contactName: opp.contactName ?? "—",
          contactEmail: opp.contactEmail!,
          contactPhone: opp.contactPhone,
          website: opp.website,
          fundingAsk: opp.fundingAsk,
          status: "submitted",
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true },
      });

      const deal = await tx.vCDeal.create({
        data: {
          tenantId,
          applicationId: application.id,
          verticalId: opp.verticalId!,
          currentStage: "intake",
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true },
      });

      await tx.vCSourcedOpportunity.update({
        where: { id: opp.id },
        data: {
          status: "converted",
          convertedApplicationId: application.id,
          updatedBy: userId,
        },
      });

      await tx.vCTimelineEvent.create({
        data: {
          tenantId,
          dealId: deal.id,
          type: "deal-created-from-sourcing",
          actorId: userId,
          summary: `Converted from sourced opportunity (${opp.source})`,
          visibility: "internal",
        },
      });

      return { applicationId: application.id, dealId: deal.id };
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  },
);
