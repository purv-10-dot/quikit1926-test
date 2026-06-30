import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { wwwNoteSchema } from "@/lib/schemas/wwwNoteSchema";
import { canEditWWWNote, canDeleteWWWNote } from "@/lib/api/wwwPermissions";
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

// PATCH /api/www/[id]/notes/[noteId] — edit a note's content. Only the note's
// author (or an admin) may edit it.
export const PATCH = auth.update<{ id: string; noteId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const note = await db.wWWNote.findFirst({
      where: { id: params.noteId, wwwItemId: params.id, orgId },
      select: { id: true, content: true, authorId: true },
    });
    if (!note) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }

    const allowed = await canEditWWWNote(userId, orgId, { authorId: note.authorId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only the note's author or an admin can edit this note" },
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
    const oldContent = note.content;
    const content = parsed.data.content;

    const updated = await db.wWWNote.update({
      where: { id: params.noteId },
      data: { content },
      select: NOTE_SELECT,
    });

    // Re-sync the "latest note" mirror: it must reflect the most recent note's
    // current text (editing the newest note changes it; editing an older one
    // leaves it). Recompute from the newest note to stay correct either way.
    const latest = await db.wWWNote.findFirst({
      where: { wwwItemId: params.id, orgId },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    await db.wWWItem.update({
      where: { id: params.id },
      data: { notes: latest?.content ?? null, updatedBy: userId },
    });

    // ── Centralized audit ── field-level before→after so the change history
    // shows exactly what the note text was edited from/to.
    await audit.log({
      entityType: "WWW",
      entityId: params.id,
      action: "UPDATE",
      actor: { userId, orgId, teamId: null },
      changes: [{ fieldName: "note", oldValue: oldContent, newValue: content }],
      ...requestContext(req),
    });

    return NextResponse.json({ success: true, data: updated, message: "Note updated" });
  },
  { fallbackErrorMessage: "Failed to update note" },
);

// DELETE /api/www/[id]/notes/[noteId] — remove a note. The author or an admin
// may delete it.
export const DELETE = auth.update<{ id: string; noteId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const note = await db.wWWNote.findFirst({
      where: { id: params.noteId, wwwItemId: params.id, orgId },
      select: { id: true, content: true, authorId: true },
    });
    if (!note) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }

    const allowed = await canDeleteWWWNote(userId, orgId, { authorId: note.authorId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only the note's author or an admin can delete this note" },
        { status: 403 },
      );
    }

    await db.wWWNote.delete({ where: { id: params.noteId } });

    // Re-sync the "latest note" mirror to the newest remaining note (or null).
    const latest = await db.wWWNote.findFirst({
      where: { wwwItemId: params.id, orgId },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    await db.wWWItem.update({
      where: { id: params.id },
      data: { notes: latest?.content ?? null, updatedBy: userId },
    });

    // ── Centralized audit ── record the deletion (with the removed text).
    await audit.log({
      entityType: "WWW",
      entityId: params.id,
      action: "DELETE",
      actor: { userId, orgId, teamId: null },
      snapshot: { noteId: note.id, content: note.content },
      ...requestContext(req),
    });

    return NextResponse.json({ success: true, message: "Note deleted" });
  },
  { fallbackErrorMessage: "Failed to delete note" },
);
