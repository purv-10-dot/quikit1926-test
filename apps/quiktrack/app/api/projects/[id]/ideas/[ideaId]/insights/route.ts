import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Research insights on an idea (JPD "Insights" tab). GET lists them, POST adds
 * one. An insight is a snippet of evidence with an optional source URL (shown as
 * a link-preview card), an Impact rating (0–5), and freeform labels. Reading is
 * membership-gated (IdeaView:view); creating reuses Idea:update.
 */

// Accept bare domains too (e.g. "google.com") by prepending https:// before
// URL-validating, so the composer doesn't force the user to type the scheme.
const urlField = z
  .string()
  .max(2048)
  .transform((s) => s.trim())
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .refine((s) => s === "" || z.string().url().safeParse(s).success, "Invalid url")
  .transform((s) => (s === "" ? null : s));

const createInsightSchema = z.object({
  body: z.string().min(1, "Insight can't be empty").max(20000),
  url: urlField.nullable().optional(),
  impact: z.number().int().min(0).max(5).optional(),
  labels: z.array(z.string().min(1).max(64)).max(20).optional(),
});

async function ideaExists(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({
    where: { id: ideaId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
}

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const insights = await db.qtIdeaInsight.findMany({
      where: { orgId, ideaId: params.ideaId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, url: true, impact: true, labels: true, createdBy: true, createdAt: true },
    });

    const authorIds = [...new Set(insights.map((i) => i.createdBy).filter((v): v is string => Boolean(v)))];
    const users = authorIds.length
      ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = insights.map((i) => {
      const u = i.createdBy ? byId.get(i.createdBy) : null;
      const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "Unknown";
      const labels = Array.isArray(i.labels) ? (i.labels as string[]) : [];
      return { ...i, labels, authorName: name };
    });

    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createInsightSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }

    try {
      const insight = await db.qtIdeaInsight.create({
        data: {
          orgId,
          ideaId: params.ideaId,
          body: parsed.data.body,
          url: parsed.data.url ?? null,
          impact: parsed.data.impact ?? 0,
          labels: parsed.data.labels ?? [],
          createdBy: userId,
        },
        select: { id: true, body: true, url: true, impact: true, labels: true, createdBy: true, createdAt: true },
      });
      return NextResponse.json({ success: true, data: insight }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add insight";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
