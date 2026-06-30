import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { wwwNoteSchema } from "@/lib/schemas/wwwNoteSchema";
import { canEditWWW } from "@/lib/api/wwwPermissions";
import { audit, requestContext } from "@/lib/audit";

const auth = withOrgAuthForResource("www", "WWW");

const NOTE_SELECT = {
  id: true,
  content: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { firstName: true, lastName: true } },
} as const;

// GET /api/www/[id]/notes — thread for one WWW item, newest first.
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const item = await db.wWWItem.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
  if (!item) {
    return NextResponse.json({ success: false, error: "WWW item not found" }, { status: 404 });
  }

  const notes = await db.wWWNote.findMany({
    where: { wwwItemId: params.id, orgId },
    select: NOTE_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: notes });
}, { fallbackErrorMessage: "Failed to fetch notes" });

// POST /api/www/[id]/notes — add a note. Anyone who can edit the item
// (creator / assignee / admin) may add a note.
export const POST = auth.update<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const item = await db.wWWItem.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, createdBy: true, who: true },
  });
  if (!item) {
    return NextResponse.json({ success: false, error: "WWW item not found" }, { status: 404 });
  }

  const allowed = await canEditWWW(userId, orgId, { createdBy: item.createdBy, who: item.who });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Only the creator, assignee, or an admin can add notes to this item" },
      { status: 403 },
    );
  }

  const parsed = wwwNoteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const content = parsed.data.content;

  const note = await db.wWWNote.create({
    data: { wwwItemId: params.id, orgId, content, authorId: userId },
    select: NOTE_SELECT,
  });

  // Keep the denormalized "latest note" mirror in sync (list column +
  // www_notes_required). The just-created note is the newest, so it IS the mirror.
  await db.wWWItem.update({
    where: { id: params.id },
    data: { notes: content, updatedBy: userId },
  });

  // ── Centralized audit ── one COMMENT event per note so the WWW Log / change
  // history shows who added which note, when, and its text.
  await audit.log({
    entityType: "WWW",
    entityId: params.id,
    action: "COMMENT",
    actor: { userId, orgId, teamId: null },
    snapshot: { noteId: note.id, content },
    ...requestContext(req),
  });

  return NextResponse.json(
    { success: true, data: note, message: "Note added successfully" },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to add note" });
