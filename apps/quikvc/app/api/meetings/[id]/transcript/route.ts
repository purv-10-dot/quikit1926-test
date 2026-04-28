/**
 * POST /api/meetings/[id]/transcript
 *
 * Body: { rawText }
 * Persists the raw transcript, calls Claude to analyze, stores the analysis
 * JSON. Auto-promotes red/amber flags to VCDealSignal rows so the Risk
 * Register reflects them without analyst manual entry.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { analyzeTranscript } from "@/lib/ai/prompts/analyze-transcript";

const bodySchema = z.object({
  rawText: z.string().min(50, "Transcript too short").max(150_000, "Transcript too long"),
});

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const meeting = await db.vCMeeting.findFirst({
      where: { id: params.id, tenantId },
      include: {
        deal: {
          select: { id: true, application: { select: { startupName: true } } },
        },
      },
    });
    if (!meeting) {
      return NextResponse.json({ success: false, error: "Meeting not found" }, { status: 404 });
    }

    const { analysis, tokensUsed, isStub } = await analyzeTranscript(parsed.data.rawText, {
      startupName: meeting.deal.application.startupName,
      meetingType: meeting.type,
    });

    // Persist transcript + analysis (upsert: re-pasting overwrites)
    await db.vCMeetingTranscript.upsert({
      where: { meetingId: meeting.id },
      update: {
        rawText: parsed.data.rawText,
        analysis: analysis as unknown as object,
        tokensUsed,
        status: "analysed",
      },
      create: {
        tenantId,
        meetingId: meeting.id,
        rawText: parsed.data.rawText,
        analysis: analysis as unknown as object,
        tokensUsed,
        status: "analysed",
      },
    });

    // Mark meeting completed
    await db.vCMeeting.update({
      where: { id: meeting.id },
      data: { status: "completed", updatedBy: userId },
    });

    // Auto-promote red flags → VCDealSignal rows (skip if stub returned no flags)
    if (!isStub && analysis.redFlags.length > 0) {
      await db.vCDealSignal.createMany({
        data: analysis.redFlags.map((f) => ({
          tenantId,
          dealId: meeting.deal.id,
          severity: f.severity,
          source: "transcript",
          title: f.title,
          description: f.description,
          status: "open",
          createdBy: userId,
          updatedBy: userId,
        })),
      });
    }

    await db.vCTimelineEvent.create({
      data: {
        tenantId,
        dealId: meeting.deal.id,
        type: "transcript-analysed",
        actorId: userId,
        summary: `Transcript analysed: ${analysis.redFlags.length} red flag${
          analysis.redFlags.length === 1 ? "" : "s"
        }, ${analysis.actionItems.length} action item${
          analysis.actionItems.length === 1 ? "" : "s"
        }`,
        payload: { sentiment: analysis.sentiment, tokensUsed },
        visibility: "internal",
      },
    });

    return NextResponse.json({
      success: true,
      data: { analysis, tokensUsed, isStub, flagsPromoted: analysis.redFlags.length },
    });
  },
);
