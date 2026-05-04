/**
 * POST /api/memos/[id]/sections/[slug]/generate
 *
 * Calls Claude to draft a single memo section using all available deal data
 * (financials + scores + risks). Returns HTML — caller inserts it into the
 * working memo state (analyst can edit before saving the version).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import {
  generateMemoSection,
  type MemoSectionSlug,
  MEMO_SECTIONS,
} from "@/lib/ai/prompts/generate-memo-section";

export const POST = withTenantAuth(
  async (
    { orgId },
    _req: NextRequest,
    { params }: { params: { id: string; slug: string } },
  ) => {
    const dealId = params.id;
    const slug = params.slug as MemoSectionSlug;

    if (!MEMO_SECTIONS.some((s) => s.slug === slug)) {
      return NextResponse.json(
        { success: false, error: `Unknown section slug "${slug}"` },
        { status: 400 },
      );
    }

    const deal = await db.vCDeal.findFirst({
      where: { id: dealId, orgId },
      include: {
        application: {
          select: {
            startupName: true, description: true, fundingAsk: true,
            loanType: true, teamSize: true, formAnswers: true,
          },
        },
        vertical: { select: { name: true } },
        scores: {
          select: { criterionSlug: true, aiScore: true, analystScore: true },
        },
        signals: {
          select: { severity: true, title: true, description: true, status: true },
          where: { status: { not: "resolved" } },
          orderBy: { severity: "asc" },
          take: 10,
        },
      },
    });
    if (!deal) {
      return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
    }

    // Resolve criterion names for the scores prompt section
    const criteria = await db.vCScoringCriterion.findMany({
      where: { orgId, verticalId: deal.verticalId },
      select: { slug: true, name: true },
    });
    const slugToName = Object.fromEntries(criteria.map((c) => [c.slug, c.name]));

    const fundingAskInr =
      deal.application.fundingAsk == null
        ? 0
        : Number(deal.application.fundingAsk / BigInt(10_000_000));

    const formAnswers = (deal.application.formAnswers ?? {}) as
      | { financials?: { monthlyRevenueLakhs?: number; ebitdaLakhs?: number } }
      | undefined;

    const result = await generateMemoSection(slug, {
      startupName: deal.application.startupName,
      description: deal.application.description ?? "",
      sector: deal.vertical.name,
      fundingAskInr,
      loanType: deal.application.loanType ?? "term-loan",
      teamSize: deal.application.teamSize,
      monthlyRevenueLakhs: formAnswers?.financials?.monthlyRevenueLakhs ?? null,
      ebitdaLakhs: formAnswers?.financials?.ebitdaLakhs ?? null,
      scores: deal.scores
        .filter((s) => (s.analystScore ?? s.aiScore) != null)
        .map((s) => ({
          criterionName: slugToName[s.criterionSlug] ?? s.criterionSlug,
          score: s.analystScore ?? s.aiScore!,
        })),
      signals: deal.signals.map((s) => ({
        severity: s.severity,
        title: s.title,
        description: s.description,
      })),
    });

    return NextResponse.json({
      success: true,
      data: {
        slug,
        html: result.html,
        isStub: result.isStub,
      },
    });
  },
);
