import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import {
  decodeAccountNoteContent,
  encodeAccountNoteContent,
  type AccountNoteCategoryId,
} from "@/lib/accounts/account-note-category";
import {
  logBusinessEvent,
  BUSINESS_EVENT_TYPES,
} from "@/lib/services/activities/business-events";
import { normaliseRelatedKind } from "@/lib/services/activities/related-kind";

export const runtime = "nodejs";

const createSchema = z.object({
  content: z.string().min(1).max(10_000),
  relatedKind: z.string().min(1),
  relatedObjectId: z.string().min(1),
  leadId: z.string().trim().min(1).optional().nullable(),
  noteCategory: z.enum(["internal", "strategy", "meeting", "risk"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const objectId = searchParams.get("relatedObjectId");
    const where: Record<string, unknown> = { orgId: user.orgId };
    if (objectId) where.relatedObjectId = objectId;
    const items = await prisma.crmNote.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({
      items: items.map((n) => {
        const decoded = decodeAccountNoteContent(n.content);
        return {
          ...n,
          noteCategory: decoded.category,
          content: decoded.body,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { noteCategory, content, ...rest } = parsed.data;
    const storedContent =
      rest.relatedKind.toLowerCase() === "account" && noteCategory
        ? encodeAccountNoteContent(noteCategory as AccountNoteCategoryId, content)
        : content;
    const note = await prisma.crmNote.create({
      data: {
        ...rest,
        content: storedContent,
        orgId: user.orgId,
        createdByUserId: user.userId,
      },
    });
    const decoded = decodeAccountNoteContent(note.content);

    // Global Activities feed: surface "Note Added" against the parent record.
    // Visibility inherits via relatedKind/relatedObjectId (RBAC unchanged). Only
    // emitted for the four account-scoped kinds; other kinds are skipped so we
    // never write a feed row the ACL can't scope. Non-blocking + swallowed.
    const activityKind = normaliseRelatedKind(note.relatedKind);
    if (activityKind) {
      const preview = decoded.body.replace(/\s+/g, " ").trim().slice(0, 120);
      await logBusinessEvent({
        orgId: user.orgId,
        userId: user.userId,
        type: BUSINESS_EVENT_TYPES.noteAdded,
        relatedKind: activityKind,
        relatedObjectId: note.relatedObjectId,
        leadId: note.leadId ?? undefined,
        subject: "Note added",
        outcome: preview,
        detailNotes: decoded.body,
        occurredAt: new Date(),
      });
    }

    return NextResponse.json(
      { ...note, noteCategory: decoded.category, content: decoded.body },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
