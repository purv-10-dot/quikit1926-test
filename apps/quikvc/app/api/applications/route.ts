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
import { scoreDeal } from "@/lib/ai/prompts/score-deal";
import { detectFinancialSignals } from "@/lib/risk/auto-detect";

export const POST = withTenantAuth(
  async ({ orgId, userId }, req: NextRequest) => {
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
      where: { orgId_slug: { orgId, slug: data.verticalSlug } },
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
          orgId,
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
          orgId,
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
          orgId,
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

    // ── AI scoring (best-effort, non-blocking on response) ──
    // We await so the analyst sees a score on first visit, but errors are
    // swallowed: a failed scoring call shouldn't reject a valid application.
    try {
      const criteria = await db.vCScoringCriterion.findMany({
        where: { orgId, verticalId: vertical.id },
        select: { slug: true, name: true, description: true, weight: true },
        orderBy: { sortOrder: "asc" },
      });

      const scored = await scoreDeal({
        startupName: data.startupName,
        description: data.description,
        sector: vertical.name,
        fundingAskInr: data.fundingAskLakhs,
        loanType: data.loanType,
        teamSize: data.teamSize ?? null,
        foundedYear: data.foundedYear ?? null,
        monthlyRevenueLakhs: data.monthlyRevenueLakhs ?? null,
        ebitdaLakhs: data.ebitdaLakhs ?? null,
        existingDebtLakhs: data.existingDebtLakhs ?? null,
        criteria,
      });

      // Persist per-criterion scores + composite on the deal
      await db.$transaction([
        ...scored.scores.map((s) =>
          db.vCDealScore.upsert({
            where: {
              orgId_dealId_criterionSlug: {
                orgId,
                dealId: result.dealId,
                criterionSlug: s.slug,
              },
            },
            update: { aiScore: s.score },
            create: {
              orgId,
              dealId: result.dealId,
              criterionSlug: s.slug,
              aiScore: s.score,
              createdBy: userId,
              updatedBy: userId,
            },
          }),
        ),
        db.vCDeal.update({
          where: { id: result.dealId },
          data: { aiScore: scored.composite, updatedBy: userId },
        }),
        db.vCTimelineEvent.create({
          data: {
            orgId,
            dealId: result.dealId,
            type: "score-updated",
            summary: `AI scored deal ${scored.composite}/100`,
            payload: { composite: scored.composite, caveats: scored.caveats },
            visibility: "internal",
          },
        }),
      ]);
    } catch (scoringErr: unknown) {
      // Don't fail the application submit on scoring error — analyst can
      // re-trigger scoring from the workbench.
      const message = scoringErr instanceof Error ? scoringErr.message : "Scoring failed";
      // eslint-disable-next-line no-console
      console.error("[applications] AI scoring failed:", message);
    }

    // ── Heuristic risk auto-detection from financials ──
    // Synchronous + cheap. Writes any detected signals to VCDealSignal so the
    // Risk Register populates without analyst manual entry.
    try {
      const signals = detectFinancialSignals({
        fundingAskLakhs: data.fundingAskLakhs,
        monthlyRevenueLakhs: data.monthlyRevenueLakhs ?? null,
        ebitdaLakhs: data.ebitdaLakhs ?? null,
        existingDebtLakhs: data.existingDebtLakhs ?? null,
        loanType: data.loanType,
      });
      if (signals.length > 0) {
        await db.vCDealSignal.createMany({
          data: signals.map((s) => ({
            orgId,
            dealId: result.dealId,
            severity: s.severity,
            source: "financial",
            title: s.title,
            description: s.description,
            status: "open",
            createdBy: userId,
            updatedBy: userId,
          })),
        });
      }
    } catch (sigErr: unknown) {
      // eslint-disable-next-line no-console
      console.error("[applications] auto-detect failed:", sigErr instanceof Error ? sigErr.message : "unknown");
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  },
);
