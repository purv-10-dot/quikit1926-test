/**
 * GET  /api/memos/[id]      — fetch the current memo + version
 * PATCH /api/memos/[id]     — save analyst edits (creates a new version)
 *
 * Where [id] = dealId. Memo is 1:1 with deal.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { MEMO_SECTIONS } from "@/lib/ai/prompts/generate-memo-section";
import type { MemoSection, MemoSectionsPayload } from "@/lib/memo/types";

const sectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string().min(1).max(200),
  contentHtml: z.string().max(20000),
  generatedBy: z.enum(["claude", "analyst"]),
  generatedAt: z.string(),
});

const patchSchema = z.object({
  sections: z.array(sectionSchema),
  changeNote: z.string().max(500).optional(),
});

export const GET = withTenantAuth(
  async ({ orgId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const dealId = params.id;
    const memo = await db.vCICMemo.findUnique({
      where: { dealId },
      include: { currentVersion: true },
    });

    // No memo yet → return an empty starter shell
    if (!memo) {
      const starter: MemoSection[] = MEMO_SECTIONS.map((s, i) => ({
        id: `s${i + 1}`,
        slug: s.slug,
        title: s.title,
        contentHtml: "",
        generatedBy: "analyst",
        generatedAt: new Date().toISOString(),
      }));
      return NextResponse.json({
        success: true,
        data: {
          memoId: null,
          status: "draft",
          version: 0,
          sections: starter,
          versionList: [],
        },
      });
    }

    // tenant scoping check
    if (memo.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const sections = (memo.currentVersion?.sections as unknown as MemoSection[]) ?? [];

    const versionList = await db.vCICMemoVersion.findMany({
      where: { memoId: memo.id, orgId },
      select: { id: true, version: true, source: true, changeNote: true, createdAt: true },
      orderBy: { version: "desc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        memoId: memo.id,
        status: memo.status,
        version: memo.currentVersion?.version ?? 0,
        sections,
        versionList,
      },
    });
  },
);

export const PATCH = withTenantAuth(
  async ({ orgId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const dealId = params.id;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const deal = await db.vCDeal.findFirst({ where: { id: dealId, orgId } });
    if (!deal) return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });

    const sectionsPayload: MemoSectionsPayload = { sections: parsed.data.sections };

    const result = await db.$transaction(async (tx) => {
      // Find or create the memo header row
      let memo = await tx.vCICMemo.findUnique({ where: { dealId } });
      if (!memo) {
        memo = await tx.vCICMemo.create({
          data: { orgId, dealId, status: "draft", createdBy: userId, updatedBy: userId },
        });
      }
      if (memo.status === "frozen") {
        throw new Error("Memo is frozen — create a new draft to edit");
      }

      // Compute next version number
      const lastVersion = await tx.vCICMemoVersion.findFirst({
        where: { memoId: memo.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (lastVersion?.version ?? 0) + 1;

      const created = await tx.vCICMemoVersion.create({
        data: {
          orgId,
          memoId: memo.id,
          version: nextVersion,
          sections: sectionsPayload.sections as unknown as object,
          changeNote: parsed.data.changeNote ?? null,
          source: "analyst-edit",
          createdBy: userId,
        },
      });

      await tx.vCICMemo.update({
        where: { id: memo.id },
        data: { currentVersionId: created.id, updatedBy: userId },
      });

      await tx.vCTimelineEvent.create({
        data: {
          orgId,
          dealId,
          type: "memo-saved",
          actorId: userId,
          summary: `IC memo saved (v${nextVersion})`,
          payload: { version: nextVersion, changeNote: parsed.data.changeNote ?? null },
          visibility: "internal",
        },
      });

      return { memoId: memo.id, version: nextVersion };
    });

    return NextResponse.json({ success: true, data: result });
  },
);
