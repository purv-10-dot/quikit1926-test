import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { nextProjectScopedDocNumber } from "@/lib/db/doc-number";
import { isVendorBlacklisted } from "@/lib/masters/vendors-repository";
import { validateIndentCreation, PurchaseValidationError } from "@/lib/purchase-service";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { listIndents, countIndents, indentStatusCounts, createIndent } from "@/lib/purchase/indent-repository";
import { findPRById } from "@/lib/purchase/pr-repository";
import { findProjectById } from "@/lib/masters/projects-repository";
import { db } from "@/lib/db";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { parsePagination, paginateDb, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

/**
 * Decide whether the caller is a "workflow participant" for indents.
 * Participants (admins, users with a role configured on any step, or
 * users pinned by userId to any step) see every indent in their
 * project scope. Everyone else only sees indents they raised — so a
 * plain USER doesn't see a Site Admin's draft/pending indent when
 * the workflow doesn't include USER as a step.
 */
async function resolveIndentVisibility(ctx: {
  orgId: string;
  userId: string;
  roleKey: string;
}): Promise<{ ownOnly: boolean }> {
  const callerType = USER_TYPE_CATALOG.find(
    (t) => t.backingRole === ctx.roleKey,
  )?.key;
  if (callerType === "ADMIN" || callerType === "SUPER_ADMIN") {
    return { ownOnly: false };
  }

  const workflow = await db.cnApprovalWorkflow.findFirst({
    where: {
      orgId: ctx.orgId,
      entityType: "purchase_indents",
      isActive: true,
    },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
  });
  // No active workflow — default to project-scoped visibility so the
  // list doesn't silently empty out for non-admins.
  if (!workflow || workflow.steps.length === 0) return { ownOnly: false };

  const allowedTypes = new Set<string>(
    workflow.steps
      .map((s) => s.approverRoleId)
      .filter((x): x is string => Boolean(x)),
  );
  const pinnedUsers = new Set<string>(
    workflow.steps
      .map((s) => s.approverUserId)
      .filter((x): x is string => Boolean(x)),
  );
  const isParticipant =
    (callerType && allowedTypes.has(callerType)) ||
    pinnedUsers.has(ctx.userId);
  return { ownOnly: !isParticipant };
}

/**
 * Indent API — Postgres-backed via `indent-repository`.
 *
 * GET  /api/purchase/indents — list, tenant + project scoped.
 * POST /api/purchase/indents — create a draft indent. The approval
 *                              instance is created by the `/submit`
 *                              route, not here — same pattern as PR.
 *
 * Source PR inheritance: when `sourceMrId` is supplied, the route pulls
 * the PR from Postgres (via `findPRById`) and auto-fills projectId,
 * sourceMrNumber, and — if the drawer didn't post any lines — the PR's
 * line items, so the common "pick a PR and click Create" flow works.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requirePurchaseAction("construction.indent", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = searchParams.get("search") ?? "";

  const { ownOnly } = await resolveIndentVisibility({
    orgId: ctx.orgId,
    userId: ctx.userId,
    roleKey: ctx.roleKey,
  });

  const baseOpts = {
    orgId: ctx.orgId,
    projectIds: ctx.projectIds ?? null,
    status,
    projectId,
    search,
    ownOnlyForUserId: ownOnly ? ctx.userId : null,
  };
  if (searchParams.get("counts") === "1") {
    const counts = await indentStatusCounts(baseOpts);
    return NextResponse.json({ counts });
  }
  const p = parsePagination(req);
  const { orderBy } = parseSort(
    searchParams,
    ["indentNumber", "indentDate", "status", "createdAt"],
    { field: "indentDate", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const result = await paginateDb(
    p,
    (paging) => listIndents({ ...baseOpts, ...paging, orderBy }),
    () => countIndents(baseOpts),
  );
  return NextResponse.json(result);
}

interface IndentLineInput {
  itemId?: string | null;
  quantity?: number | string | null;
  qtyRequired?: number | string | null;
  qtyRequested?: number | string | null;
  estimatedRate?: number | string | null;
  uomCode?: string | null;
  uomId?: string | null;
  specification?: string | null;
  qualitySpec?: string | null;
  prLineId?: string | null;
  preferredVendorId?: string | null;
  id?: string | null;
  lineId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const ctxOrResp = await requirePurchaseAction("construction.indent", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
    if (!hasMatrixAction(ctx, "purchase.indent", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for purchase.indent`, 403);
    }

    const body = await req.json();

    // Source PR inheritance. PRs moved to Prisma — resolve via the
    // repo rather than the demo-store so new-format PRs are found.
    let sourcePr:
      | {
          prNumber?: string | null;
          mrNumber?: string | null;
          projectId?: string | null;
          lines?: IndentLineInput[];
        }
      | null = null;
    if (body.sourceMrId) {
      sourcePr = await findPRById(ctx.orgId, body.sourceMrId);
      if (sourcePr) {
        body.sourceMrNumber =
          body.sourceMrNumber ?? sourcePr.prNumber ?? sourcePr.mrNumber ?? "";
        body.projectId = body.projectId || sourcePr.projectId;
        // If the drawer didn't send line items, copy the PR's lines —
        // the usual "pick a PR and click Create" shortcut.
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          body.lines = (sourcePr.lines ?? []).map((l) => ({
            itemId: l.itemId,
            qtyRequested:
              l.qtyRequired ?? l.quantity ?? l.qtyRequested ?? "0",
            estimatedRate: l.estimatedRate ?? "0",
            qualitySpec: l.specification ?? "",
            uomCode: l.uomCode ?? "",
            uomId: l.uomId ?? null,
            prLineId: l.id ?? l.lineId ?? null,
          }));
        }
      }
    }

    if (!body.projectId) {
      return NextResponse.json({ error: "Project is required" }, { status: 400 });
    }

    // Direct Indent (no source PR) MUST carry a justification.
    validateIndentCreation(body);

    // Projects live in Postgres — same fix as the PR endpoint. The
    // legacy demo-store resolveProject returned 404 for any DB-only id.
    const project = await findProjectById(ctx.orgId, body.projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const projectCode = project.code ?? "SITE";

    // Vendor blacklist gate (BR-IND-04).
    if (
      body.preferredVendorId &&
      (await isVendorBlacklisted(ctx.orgId, body.preferredVendorId))
    ) {
      return NextResponse.json(
        { error: "Selected vendor is blacklisted. Choose another vendor." },
        { status: 400 },
      );
    }

    const indentNumber = await nextProjectScopedDocNumber({
      type: "indent",
      orgId: ctx.orgId,
      projectCode,
    });

    // Build lines — resolve item master once to stash code/name + uom
    // for enrichment consumers, and compute line totals for the header
    // estimatedTotal sum.
    const rawLines: IndentLineInput[] = Array.isArray(body.lines)
      ? body.lines
      : [];
    const itemIds = Array.from(
      new Set<string>(
        rawLines.map((l) => l.itemId).filter((x): x is string => Boolean(x)),
      ),
    );
    const items = itemIds.length
      ? await db.cnItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            code: true,
            name: true,
            standardRate: true,
            uomId: true,
            uom: { select: { code: true } },
          },
        })
      : [];
    const itemById = new Map(
      items.map((i): [string, (typeof items)[number]] => [i.id, i]),
    );

    let estimatedTotal = 0;
    const repoLines = rawLines.map((line) => {
      const master = itemById.get(line.itemId ?? "");
      const qty =
        parseFloat(String(line.qtyRequested ?? line.quantity ?? "0")) || 0;
      const rate =
        parseFloat(
          String(line.estimatedRate ?? master?.standardRate?.toString?.() ?? "0"),
        ) || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      estimatedTotal += amount;
      return {
        itemId: line.itemId ?? "",
        uomId: line.uomId ?? master?.uomId ?? null,
        uomCode: line.uomCode ?? master?.uom?.code ?? null,
        prLineId: line.prLineId ?? null,
        requiredQty: qty,
        indentedQty: qty,
        qtyRequested: qty,
        estimatedRate: rate,
        estimatedAmount: amount,
        preferredVendorId: line.preferredVendorId ?? null,
        qualitySpec: line.qualitySpec ?? "",
        lineStatus: "open",
      };
    });

    const record = await createIndent({
      orgId: ctx.orgId,
      indentNumber,
      prId: body.sourceMrId ?? null,
      sourceMrNumber: body.sourceMrNumber ?? null,
      projectId: body.projectId,
      requestedById: ctx.userId,
      indentDate: new Date(),
      requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
      isUrgent: !!body.isUrgent,
      directIndentReason: body.sourceMrId ? null : (body.directIndentReason ?? null),
      estimatedTotal: Math.round(estimatedTotal),
      status: "draft",
      createdBy: ctx.userId,
      lines: repoLines,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof PurchaseValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "An indent with this number already exists" },
        { status: 409 },
      );
    }
    console.error("[indents.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err) ?? "Internal error" },
      { status: 500 },
    );
  }
}
