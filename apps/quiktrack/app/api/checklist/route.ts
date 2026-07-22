import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createChecklistItemSchema } from "@/lib/validation/checklist";
import {
  listItems,
  countItems,
  listStatuses,
  seedDefaultStatusesIfNone,
  createItem,
} from "@/lib/checklist/queries";

const DEFAULT_LIMIT = 30;

// The personal checklist is private to the caller — every query is scoped to
// (orgId, userId), so there's no cross-user leak and no RBAC grant to check
// beyond being an authenticated org member (handled by withOrgAuth).

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  await seedDefaultStatusesIfNone(orgId, userId);
  const [{ items, hasMore }, statuses, counts] = await Promise.all([
    listItems(orgId, userId, limit, offset),
    listStatuses(orgId, userId),
    countItems(orgId, userId),
  ]);
  return NextResponse.json({
    success: true,
    data: { items, statuses, hasMore, total: counts.total, checked: counts.checked },
  });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createChecklistItemSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // Ensure a default status exists so a name-only item lands in "To do".
  await seedDefaultStatusesIfNone(orgId, userId);
  const item = await createItem(orgId, userId, parsed.data);
  return NextResponse.json({ success: true, data: item }, { status: 201 });
});
