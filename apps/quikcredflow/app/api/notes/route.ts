import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  decodeAccountNoteContent,
  encodeAccountNoteContent,
  type AccountNoteCategoryId,
} from "@/lib/accounts/account-note-category";
import { touchLeadLastActivity } from "@/lib/services/leads/touch-last-activity";

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
    const items = await prisma.qcfNote.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
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
    await assertModule(user, "notes", "create");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const { noteCategory, content, ...rest } = parsed.data;
    const storedContent =
      rest.relatedKind.toLowerCase() === "account" && noteCategory
        ? encodeAccountNoteContent(noteCategory as AccountNoteCategoryId, content)
        : content;
    const note = await prisma.qcfNote.create({
      data: {
        ...rest,
        content: storedContent,
        orgId: user.orgId,
        createdByUserId: user.userId,
      },
    });
    // [last-activity] Adding a note is an activity — advance the lead's
    // last_activity_date so activity-date filters re-evaluate. Only for notes on
    // a lead (resolve leadId from the explicit field or a Lead-kind relation).
    const noteLeadId =
      rest.leadId ??
      (rest.relatedKind.toLowerCase() === "lead" ? rest.relatedObjectId : null);
    if (noteLeadId) {
      await touchLeadLastActivity({
        orgId: user.orgId,
        leadId: noteLeadId,
        label: "Note",
      });
    }
    const decoded = decodeAccountNoteContent(note.content);
    return NextResponse.json(
      { ...note, noteCategory: decoded.category, content: decoded.body },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
