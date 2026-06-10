import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { calcNpsBreakdown, getNpsCategory } from "@/lib/schemas/surveySchema";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const survey = await db.survey.findFirst({
      where: { id: params.id, orgId },
      include: {
        questions: { orderBy: { order: "asc" } },
        responses: {
          orderBy: { submittedAt: "desc" },
          include: {
            answers: { select: { questionId: true, scoreInt: true, scoreBool: true, comment: true } },
          },
        },
      },
    });
    if (!survey) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // CSV: one row per respondent, with one column per question.
    const header: string[] = ["Respondent Name", "Email", "Submitted At"];
    for (const q of survey.questions) {
      header.push(`Q${q.order + 1}: ${q.text}`);
      if (q.allowComment) header.push(`Q${q.order + 1} Comment`);
    }

    function csvEscape(v: string | number | boolean | null | undefined): string {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    const rows = survey.responses.map((r) => {
      const byQ = new Map(r.answers.map((a) => [a.questionId, a]));
      const cells: string[] = [
        csvEscape(r.respondentName),
        csvEscape(r.respondentEmail),
        csvEscape(r.submittedAt.toISOString()),
      ];
      for (const q of survey.questions) {
        const a = byQ.get(q.id);
        if (!a) {
          cells.push("");
          if (q.allowComment) cells.push("");
          continue;
        }
        if (q.answerType === "nps_rank") {
          cells.push(a.scoreInt !== null ? `${a.scoreInt} (${getNpsCategory(a.scoreInt)})` : "");
        } else {
          cells.push(a.scoreBool === true ? "Yes" : a.scoreBool === false ? "No" : "");
        }
        if (q.allowComment) cells.push(csvEscape(a.comment));
      }
      return cells.join(",");
    });

    // Top-of-file summary for context.
    const npsScores = survey.responses
      .map((r) => r.answers.find((a) => a.scoreInt !== null))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ score: a.scoreInt! }));
    const breakdown = calcNpsBreakdown(npsScores);

    const summary = [
      `${survey.type.toUpperCase()} Survey Report`,
      `Title,${csvEscape(survey.title)}`,
      `Period,${survey.quarter} ${survey.year}`,
      `Status,${survey.status}`,
      `Questions,${survey.questions.length}`,
      `Responses,${breakdown.total}`,
      `Primary NPS,${breakdown.nps}`,
      `Promoters,${breakdown.promoters} (${breakdown.promoterPct}%)`,
      `Passives,${breakdown.passives} (${breakdown.passivePct}%)`,
      `Detractors,${breakdown.detractors} (${breakdown.detractorPct}%)`,
      "",
      header.join(","),
    ].join("\n");

    const csv = [summary, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${survey.type}-${survey.quarter}-${survey.year}.csv"`,
      },
    });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to generate report" },
);
