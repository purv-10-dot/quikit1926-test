/**
 * POST /api/applications — founder submits a new startup application.
 *
 * Side effects (all in one transaction):
 *   1. Create VCApplication
 *   2. Auto-create linked VCDeal at "intake" stage
 *   3. Write VCTimelineEvent(type=stage-advanced, summary="Application submitted")
 *
 * Sprint 3 will add: AI scoring on submit (Claude composite), email
 * notification to assigned analyst.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { fullApplicationSchema } from "@/lib/schemas/applicationSchema";

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest) => {
    const parsed = fullApplicationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Resolve vertical
    const vertical = await db.vCVertical.findUnique({
      where: { tenantId_slug: { tenantId, slug: data.verticalSlug } },
    });
    if (!vertical) {
      return NextResponse.json(
        { success: false, error: "Selected vertical not found for this tenant" },
        { status: 400 },
      );
    }

    // Convert lakhs → paise (smallest INR unit). 1 lakh = 100,000 INR = 10,000,000 paise.
    const fundingAskPaise = BigInt(data.fundingAskLakhs) * BigInt(10_000_000);

    const result = await db.$transaction(async (tx) => {
      const application = await tx.vCApplication.create({
        data: {
          tenantId,
          founderId: userId,
          verticalId: vertical.id,
          startupName: data.startupName,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone || null,
          website: data.website || null,
          sector: vertical.name,
          foundedYear: data.foundedYear ?? null,
          teamSize: data.teamSize ?? null,
          description: data.description,
          fundingAsk: fundingAskPaise,
          loanType: data.loanType,
          tenureMonths: data.loanType === "equity" ? null : data.tenureMonths ?? null,
          purpose: data.purpose,
          formAnswers: {
            financials: {
              monthlyRevenueLakhs: data.monthlyRevenueLakhs ?? null,
              ebitdaLakhs: data.ebitdaLakhs ?? null,
              existingDebtLakhs: data.existingDebtLakhs ?? null,
              gstNumber: data.gstNumber || null,
              bankAccountLast4: data.bankAccountLast4 || null,
            },
          },
          status: "submitted",
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true, startupName: true },
      });

      const deal = await tx.vCDeal.create({
        data: {
          tenantId,
          applicationId: application.id,
          verticalId: vertical.id,
          currentStage: "intake",
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true, currentStage: true },
      });

      await tx.vCTimelineEvent.create({
        data: {
          tenantId,
          dealId: deal.id,
          type: "stage-advanced",
          actorId: userId,
          summary: `Application submitted by ${application.startupName}`,
          payload: { fromStage: null, toStage: "intake" },
          visibility: "founder",
        },
      });

      return { applicationId: application.id, dealId: deal.id };
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  },
);
