import { NextRequest, NextResponse } from "next/server";
import { nextProjectScopedDocNumber } from "@/lib/db/doc-number";
import { isVendorBlacklisted } from "@/lib/masters/vendors-repository";
import { validateIndentCreation, PurchaseValidationError } from "@/lib/purchase-service";
import { getTenantContext } from "@/lib/auth/context";
import { listIndents, createIndent } from "@/lib/purchase/indent-repository";
import { findPRById } from "@/lib/purchase/pr-repository";
import { findProjectById } from "@/lib/masters/projects-repository";
import { db } from "@/lib/db/prisma";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { parsePagination } from "@/lib/http/pagination";

/**
 * Decide whether the caller is a "workflow participant" for indents.
 * Participants (admins, users with a role configured on any step, or
 * users pinned by userId to any step) see every indent in their
 * project scope. Everyone else only sees indents they raised — so a
 * plain USER doesn't see a Site Admin's draft/pending indent when
 * the workflow doesn't include USER as a step.
 */
async function resolveIndentVisibility(ctx: {
  tenantId: string;
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

  const workflow = await (db as any).cnApprovalWorkflow.findFirst({
    where: {
      tenantId: ctx.tenantId,
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
    workflow.steps.map((s: any) => s.approverRoleId).filter(Boolean),
  );
  const pinnedUsers = new Set<string>(
    workflow.steps.map((s: any) => s.approverUserId).filter(Boolean),
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
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
    const search = searchParams.get("search") ?? "";
  
    const { ownOnly } = await resolveIndentVisibility({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      userId: ctx.userId,
      roleKey: ctx.roleKey,
    });
  
    const p = parsePagination(req);
    const data = await listIndents({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      // `projectIds` scope is applied inside the repo — either narrows the
      // explicit projectId filter or caps the list.
      projectIds: ctx.projectIds ?? null,
      status,
      projectId,
      search,
      ownOnlyForUserId: ownOnly ? ctx.userId : null,
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    });
    if (p.paginated) {
      return NextResponse.json({
        data,
        total: data.length,
        page: p.page,
        pageSize: p.pageSize,
        hasMore: data.length === p.pageSize,
      });
    }
    return NextResponse.json({ data, total: data.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[purchase/indents.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();

    // Source PR inheritance. PRs moved to Prisma — resolve via the
    // repo rather than the demo-store so new-format PRs are found.
    let sourcePr: any = null;
    if (body.sourceMrId) {
      sourcePr = await findPRById(ctx.tenantId, body.sourceMrId);
      if (sourcePr) {
        body.sourceMrNumber =
          body.sourceMrNumber ?? sourcePr.prNumber ?? sourcePr.mrNumber ?? "";
        body.projectId = body.projectId || sourcePr.projectId;
        // If the drawer didn't send line items, copy the PR's lines —
        // the usual "pick a PR and click Create" shortcut.
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          body.lines = (sourcePr.lines ?? []).map((l: any) => ({
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
    const project = await findProjectById(ctx.tenantId, body.projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const projectCode = project.code ?? "SITE";

    // Vendor blacklist gate (BR-IND-04).
    if (
      body.preferredVendorId &&
      (await isVendorBlacklisted(ctx.tenantId, body.preferredVendorId))
    ) {
      return NextResponse.json(
        { error: "Selected vendor is blacklisted. Choose another vendor." },
        { status: 400 },
      );
    }

    const indentNumber = await nextProjectScopedDocNumber({
      type: "indent",
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      projectCode,
    });

    // Build lines — resolve item master once to stash code/name + uom
    // for enrichment consumers, and compute line totals for the header
    // estimatedTotal sum.
    const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [];
    const itemIds = Array.from(
      new Set<string>(rawLines.map((l) => l.itemId).filter(Boolean)),
    );
    const items = itemIds.length
      ? await (db as any).cnItem.findMany({
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
    const itemById = new Map<string, any>(items.map((i: any) => [i.id, i]));

    let estimatedTotal = 0;
    const repoLines = rawLines.map((line: any) => {
      const master = itemById.get(line.itemId);
      const qty = parseFloat(line.qtyRequested ?? line.quantity ?? "0") || 0;
      const rate =
        parseFloat(
          line.estimatedRate ?? master?.standardRate?.toString?.() ?? "0",
        ) || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      estimatedTotal += amount;
      return {
        itemId: line.itemId,
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
      tenantId: ctx.tenantId,
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
    const e = err as { code?: string; message?: string };
    if (err instanceof PurchaseValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "An indent with this number already exists" },
        { status: 409 },
      );
    }
    console.error("[indents.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
