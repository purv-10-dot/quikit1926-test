import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { employeeIdForEmail } from "@/lib/api/assetScope";

const auth = withOrgAuthForResource("RepairRequest");

const statusFilter = z
  .enum(["Submitted", "Approved", "Rejected", "Fulfilled", "Cancelled"])
  .optional();

/**
 * Body for raising a repair request (employee "My Repair Requests" form / the
 * "Request Repair" button on a My Assets card). The employee reports a fault on
 * ONE of their own assigned assets — vendor/cost/dates are NOT their decision
 * (the approver supplies those at "send to repair" time).
 */
const createSchema = z.object({
  assetId: z.string().min(1, "Pick the asset that needs repair"),
  issueTitle: z.string().trim().min(1, "Add a short issue title"),
  issueDescription: z.string().trim().min(1, "Describe the issue"),
  urgency: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
});

/**
 * Repair-request queue. Role-aware, mirroring `/api/asset-requests`:
 *   - holders of `RepairRequest:viewAll` (approvers/admin) see every request;
 *   - everyone else sees only their own (`requesterUserId == me`).
 * The admin queue is gated on `viewAll`; the member "My Repair Requests" view
 * reuses the same endpoint with `?mine=1` (force-scopes even a viewAll holder).
 * Optional `?status=` filter.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const { searchParams } = new URL(req.url);
  const parsedStatus = statusFilter.safeParse(searchParams.get("status") ?? undefined);
  if (!parsedStatus.success) {
    return NextResponse.json({ success: false, error: "Invalid status filter" }, { status: 400 });
  }

  const mineOnly = searchParams.get("mine") === "1";
  const canViewAll = !mineOnly && (await userCan(userId, orgId, "RepairRequest", "viewAll"));

  const requests = await db.astRepairRequest.findMany({
    where: {
      orgId,
      ...(canViewAll ? {} : { requesterUserId: userId }),
      ...(parsedStatus.data ? { status: parsedStatus.data } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      asset: { select: { itemName: true, itemCode: true, category: { select: { name: true } } } },
    },
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

  const data = requests.map((r) => {
    const { asset, ...rest } = r;
    return {
      ...rest,
      assetName: asset?.itemName ?? null,
      assetCode: asset?.itemCode ?? null,
      assetCategoryName: asset?.category?.name ?? null,
      requesterName: byUser.get(r.requesterUserId)?.name ?? null,
      requesterEmployeeId: byUser.get(r.requesterUserId)?.employeeId ?? null,
    };
  });

  return NextResponse.json({ success: true, data });
});

/**
 * Raise a new repair request (employee side). Gated on `RepairRequest:create`.
 * The requester is always the caller, and the chosen asset MUST be one currently
 * (Active) assigned to that caller — an employee can only report a fault on their
 * own asset, not anyone else's. Created as `Submitted` so it lands in the queue.
 */
export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { assetId, issueTitle, issueDescription, urgency } = parsed.data;

  // Ownership guard: resolve the caller's employee record and confirm the asset
  // is actively assigned to them. Without this a member could raise a request
  // against any asset id in the org (the classic IDOR).
  const employeeId = await employeeIdForEmail(orgId, userEmail);
  if (!employeeId) {
    return NextResponse.json(
      { success: false, error: "No employee record is linked to your account." },
      { status: 403 },
    );
  }
  const assignment = await db.astAssignment.findFirst({
    where: { orgId, assetId, userId: employeeId, status: "Active" },
    select: { id: true },
  });
  if (!assignment) {
    return NextResponse.json(
      { success: false, error: "You can only request a repair for an asset currently assigned to you." },
      { status: 403 },
    );
  }

  const created = await db.astRepairRequest.create({
    data: {
      orgId,
      requesterUserId: userId,
      assetId,
      issueTitle,
      issueDescription,
      urgency,
      status: "Submitted",
    },
  });

  await audit({
    orgId,
    module: "RepairRequests",
    action: "Repair Request Submitted",
    entityId: created.id,
    entityName: issueTitle,
    details: `Urgency: ${urgency}`,
    actorId: userId,
    actorEmail: userEmail,
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
