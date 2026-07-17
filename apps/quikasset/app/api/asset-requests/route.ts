import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";

const auth = withOrgAuthForResource("AssetRequest");

const statusFilter = z
  .enum([
    "Draft",
    "Submitted",
    "PendingApproval",
    "Approved",
    "Rejected",
    "PartiallyFulfilled",
    "Fulfilled",
    "Cancelled",
  ])
  .optional();

/**
 * Body for raising a request (employee "My Requests" form). The chosen
 * `categoryId` is a Category Master row; the route resolves its name into
 * `itemType` and copies the parent `baseCategoryId`, mirroring the seed shape.
 * A raised request always enters the approver queue directly (`Submitted`) —
 * there is no employee-facing Draft step.
 */
// Quantity, item-kind, and request-type are no longer employee-facing decisions:
// every asset is a unique item (quantity 1), the Category Master row conveys the
// item type (kind Physical), and New/Replacement/Upgrade/Additional is an IT-team
// call based on actual availability (request-type New). All three are fixed
// server-side — the DB columns/enums stay for now; we just stop exposing them.
const createSchema = z.object({
  categoryId: z.string().min(1, "Pick an item type"),
  justification: z.string().trim().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
  requiredBy: z.string().trim().min(1).nullable().optional(),
});

/**
 * Asset-request queue. Role-aware, mirroring the `/api/assets` pattern:
 *   - holders of `AssetRequest:viewAll` (approvers/admin) see every request;
 *   - everyone else sees only their own (`requesterUserId == me`).
 * The admin "Pending Approvals" screen is gated on `viewAll`, so it lands here
 * with the full queue; the member "My Requests" view reuses the same endpoint
 * and gets the scoped list for free. `?mine=1` force-scopes to the caller even
 * for a `viewAll` holder, so an admin's "My Requests" shows only their own.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const { searchParams } = new URL(req.url);
  const parsedStatus = statusFilter.safeParse(searchParams.get("status") ?? undefined);
  if (!parsedStatus.success) {
    return NextResponse.json({ success: false, error: "Invalid status filter" }, { status: 400 });
  }

  const mineOnly = searchParams.get("mine") === "1";
  const canViewAll = !mineOnly && (await userCan(userId, orgId, "AssetRequest", "viewAll"));

  const requests = await db.astAssetRequest.findMany({
    where: {
      orgId,
      ...(canViewAll ? {} : { requesterUserId: userId }),
      ...(parsedStatus.data ? { status: parsedStatus.data } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve requester display names via the AstEmployee.userId identity bridge
  // (requesterUserId is a plain column, not a relation, so we join in app code).
  const userIds = [...new Set(requests.map((r) => r.requesterUserId))];
  const employees = userIds.length
    ? await db.astEmployee.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, name: true, employeeId: true },
      })
    : [];
  const byUser = new Map(employees.map((e) => [e.userId, e]));

  // Resolve base-category names for the "Category" column subtitle. baseCategoryId
  // is a loose reference (no FK), so we join in app code like the requester name.
  const baseCatIds = [...new Set(requests.map((r) => r.baseCategoryId).filter((id): id is string => !!id))];
  const baseCats = baseCatIds.length
    ? await db.astBaseCategory.findMany({ where: { orgId, id: { in: baseCatIds } }, select: { id: true, name: true } })
    : [];
  const baseCatById = new Map(baseCats.map((b) => [b.id, b.name]));

  const data = requests.map((r) => ({
    ...r,
    requesterName: byUser.get(r.requesterUserId)?.name ?? null,
    requesterEmployeeId: byUser.get(r.requesterUserId)?.employeeId ?? null,
    baseCategoryName: r.baseCategoryId ? baseCatById.get(r.baseCategoryId) ?? null : null,
  }));

  return NextResponse.json({ success: true, data });
});

/**
 * Raise a new asset request (employee side). Gated on `AssetRequest:create`.
 * The requester is always the caller (`requesterUserId = session user id`,
 * matching the GET scoping column), and the request is created as `Submitted`
 * so it lands in the approver queue immediately.
 */
export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { categoryId, justification, priority, requiredBy } = parsed.data;

  // The item type must be an existing Category Master row in this org. Resolve
  // its name into `itemType` and carry the parent base category (same shape the
  // seed writes), and guard tenant ownership in the same lookup.
  const category = await db.astCategory.findFirst({
    where: { id: categoryId, orgId },
    select: { name: true, baseCategoryId: true },
  });
  if (!category) {
    return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
  }

  const created = await db.astAssetRequest.create({
    data: {
      orgId,
      requesterUserId: userId,
      itemKind: "Physical", // fixed — kind is no longer a UI decision
      itemType: category.name,
      baseCategoryId: category.baseCategoryId,
      categoryId,
      requestType: "New", // fixed — the IT team decides New/Replacement/etc. at fulfil time
      quantity: 1, // fixed — every asset is a unique, single item
      justification: justification || "", // column is non-null; store "" when omitted
      priority,
      requiredBy: requiredBy || null,
      status: "Submitted",
    },
  });

  await audit({
    orgId,
    module: "AssetRequests",
    action: "Request Submitted",
    entityId: created.id,
    entityName: created.itemType,
    details: `Priority: ${priority}`,
    actorId: userId,
    actorEmail: userEmail,
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
