import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { nextProjectScopedDocNumber } from "@/lib/db/doc-number";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { listRfqs, createRfq } from "@/lib/purchase/rfq-repository";
import { findIndentById } from "@/lib/purchase/indent-repository";
import { findVendorsByIds } from "@/lib/masters/vendors-repository";
import { assertVendorGstActiveForPo } from "@/lib/integrations/whitebooks-gst";
import { findProjectById } from "@/lib/masters/projects-repository";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/http/pagination";

/**
 * RFQ API — Postgres-backed via `rfq-repository`.
 *
 * GET  /api/purchase/rfqs — list, tenant + project scoped.
 * POST /api/purchase/rfqs — create a draft RFQ. Approval instance is
 *                          created by `/submit`, not here — same
 *                          pattern as PR and Indent.
 *
 * Source Indent inheritance: when `sourceIndentId` is supplied, the
 * route resolves it via the Indent repo and auto-fills projectId +
 * `sourceIndentNumber` + line items (only if the drawer didn't post
 * any), matching the legacy demo-store behaviour.
 */

/**
 * Collapse `body.contacts: [{name, mobile}]` into the single
 * `contactPerson` string column the repo expects. Falls back to the
 * legacy `body.contactPerson` scalar when no list is posted. Empty
 * rows are dropped so "click Add Contact then cancel" doesn't leave
 * trailing commas on the document.
 */
function joinContactNames(
  contacts: unknown,
  legacy: unknown,
): string | null {
  if (Array.isArray(contacts) && contacts.length) {
    const names = contacts
      .map((c) => String(c?.name ?? "").trim())
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }
  const one = typeof legacy === "string" ? legacy.trim() : "";
  return one || null;
}

/**
 * Same idea as `joinContactNames`, but also strips each mobile to
 * digits so we match the legacy single-field semantics (the old form
 * had `transform: raw.replace(/[^\d]/g, "")`).
 */
function joinContactMobiles(
  contacts: unknown,
  legacy: unknown,
): string | null {
  if (Array.isArray(contacts) && contacts.length) {
    const mobiles = contacts
      .map((c) => String(c?.mobile ?? "").replace(/[^\d]/g, ""))
      .filter(Boolean);
    if (mobiles.length) return mobiles.join(", ");
  }
  const one =
    typeof legacy === "string" ? legacy.replace(/[^\d]/g, "") : "";
  return one || null;
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const sourceIndentId = searchParams.get("sourceIndentId") ?? "";
  const search = searchParams.get("search") ?? "";

  const p = parsePagination(req);
  const data = await listRfqs({
    orgId: ctx.orgId,
    projectIds: ctx.projectIds ?? null,
    status,
    projectId,
    sourceIndentId,
    search,
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
}

interface RfqLineInput {
  itemId?: string | null;
  quantity?: number | string | null;
  qtyRequested?: number | string | null;
  qtyOpen?: number | string | null;
  uomCode?: string | null;
  uomId?: string | null;
  specification?: string | null;
  qualitySpec?: string | null;
  id?: string | null;
  lineId?: string | null;
  sourceIndentLineId?: string | null;
}
interface RfqVendorInput {
  vendorId?: string | null;
  email?: string | null;
  vendorName?: string | null;
  assignedItemIds?: unknown;
}
interface RfqCreateBody {
  sourceIndentId?: string | null;
  sourceIndentNumber?: string | null;
  projectId?: string | null;
  lines?: RfqLineInput[];
  vendors?: RfqVendorInput[];
  dueDate?: string | null;
  purpose?: string | null;
  contacts?: unknown;
  contactPerson?: string | null;
  contactMobile?: string | null;
  termsTemplateId?: string | null;
  status?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ctxOrResp = await requirePurchaseAction("construction.rfq", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
    if (!hasMatrixAction(ctx, "purchase.rfq", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for purchase.rfq`, 403);
    }

    const body: RfqCreateBody = await req.json();

    // Resolve source Indent first (via the Prisma repo), then use
    // it to back-fill anything the drawer left blank.
    let sourceIndent: Awaited<ReturnType<typeof findIndentById>> = null;
    if (body.sourceIndentId) {
      sourceIndent = await findIndentById(ctx.orgId, body.sourceIndentId);
    }

    const projectId = body.projectId ?? sourceIndent?.projectId;
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId (or a sourceIndentId that carries one) is required" },
        { status: 400 },
      );
    }

    // Projects live in Postgres — same fix as PR / Indent endpoints.
    // The legacy demo-store resolveProject returned 404 for any DB-only id.
    const project = await findProjectById(ctx.orgId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const projectCode = project.code ?? "SITE";
    const rfqNumber = await nextProjectScopedDocNumber({
      type: "rfq",
      orgId: ctx.orgId,
      projectCode,
    });

    // Build lines — prefer lines the user supplied, else copy from the
    // source Indent so the RFQ is ready to fan out to vendors.
    const userLines: RfqLineInput[] = Array.isArray(body.lines)
      ? body.lines
      : [];
    const rawLines: RfqLineInput[] =
      userLines.length > 0
        ? userLines
        : (sourceIndent?.lines ?? []).map((l) => ({
            itemId: l.itemId,
            quantity: l.qtyRequested ?? l.qtyOpen ?? "0",
            uomCode: l.uomCode ?? "",
            uomId: l.uomId ?? null,
            specification: l.qualitySpec ?? "",
            sourceIndentLineId: l.id ?? null,
          }));

    // Pull item masters so line-level itemCode / uomCode can be
    // resolved (for the repo's UOM create-on-miss helper).
    const itemIds = Array.from(
      new Set<string>(
        rawLines
          .map((l) => l.itemId)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const items = itemIds.length
      ? await db.cnItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            code: true,
            name: true,
            uomId: true,
            uom: { select: { code: true } },
          },
        })
      : [];
    const itemById = new Map(
      items.map((i): [string, (typeof items)[number]] => [i.id, i]),
    );

    const repoLines = rawLines
      .filter((l): l is RfqLineInput & { itemId: string } => Boolean(l.itemId))
      .map((l) => {
        const master = itemById.get(l.itemId);
        return {
          itemId: l.itemId,
          uomId: l.uomId ?? master?.uomId ?? null,
          uomCode: l.uomCode ?? master?.uom?.code ?? null,
          quantity:
            parseFloat(String(l.quantity ?? l.qtyRequested ?? "0")) || 0,
          specification: l.specification ?? "",
          sourceIndentLineId: l.sourceIndentLineId ?? null,
        };
      });

    // Resolve vendor master for denormalised fan-out rows.
    const rawVendors: RfqVendorInput[] = Array.isArray(body.vendors)
      ? body.vendors
      : [];
    const vendorIdsLookup = Array.from(
      new Set<string>(
        rawVendors
          .map((v) => v?.vendorId)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const vendorMasterMap = vendorIdsLookup.length
      ? await findVendorsByIds(ctx.orgId, vendorIdsLookup)
      : new Map();

    for (const v of rawVendors) {
      const vid = v?.vendorId ? String(v.vendorId) : "";
      if (!vid) continue;
      const master = vendorMasterMap.get(vid);
      if (!master) {
        return NextResponse.json(
          { error: "Vendor not found", code: "VENDOR_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (master.status === "blacklisted") {
        return NextResponse.json(
          {
            error: "Blacklisted vendors cannot be added to an RFQ.",
            code: "BLACKLISTED_VENDOR",
          },
          { status: 400 },
        );
      }
      const gst = await assertVendorGstActiveForPo(master.gstin);
      if (!gst.ok) {
        return NextResponse.json(
          { error: gst.message, code: "VENDOR_GST_NOT_ACTIVE" },
          { status: 400 },
        );
      }
    }

    const repoVendors = rawVendors
      .filter((v): v is RfqVendorInput & { vendorId: string } =>
        Boolean(v?.vendorId),
      )
      .map((v) => {
        const master = vendorMasterMap.get(v.vendorId);
        const assignedItemIds: string[] = Array.isArray(v.assignedItemIds)
          ? v.assignedItemIds.filter(
              (x): x is string => typeof x === "string" && !!x,
            )
          : [];
        return {
          vendorId: v.vendorId,
          email: String(v.email ?? master?.email ?? "").trim() || null,
          vendorName:
            master?.companyName || master?.name || v.vendorName || null,
          assignedItemIds,
        };
      });

    // Server-side mirror of the drawer's per-vendor item rule: when the
    // request carries a `vendors` array (what the UI always sends),
    // every vendor must have at least one item assigned — an empty
    // selection is no longer accepted as "send all".
    if (
      Array.isArray(body.vendors) &&
      repoVendors.some((v) => v.assignedItemIds.length === 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Please select the item material for the vendor — each vendor must have at least one item assigned.",
          code: "VENDOR_ITEMS_REQUIRED",
        },
        { status: 400 },
      );
    }

    const record = await createRfq({
      orgId: ctx.orgId,
      rfqNumber,
      projectId,
      sourceIndentId: sourceIndent?.id ?? body.sourceIndentId ?? null,
      sourceIndentNumber:
        sourceIndent?.indentNumber ?? body.sourceIndentNumber ?? null,
      rfqDate: new Date(),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      purpose: body.purpose ?? null,
      // Contacts are posted as a list `[{name, mobile}]` from the
      // drawer. We flatten them into the existing `contactPerson` /
      // `contactMobile` string columns (comma-separated) so the
      // downstream reads — detail page, PDF generator, email body —
      // don't need to know about the list shape. Still accept the
      // single-field legacy payload for older callers.
      contactPerson: joinContactNames(body.contacts, body.contactPerson),
      contactMobile: joinContactMobiles(body.contacts, body.contactMobile),
      termsTemplateId: body.termsTemplateId
        ? String(body.termsTemplateId).trim() || null
        : null,
      status: body.status ?? "draft",
      createdBy: ctx.userId,
      lines: repoLines,
      vendors: repoVendors,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "An RFQ with this number already exists" },
        { status: 409 },
      );
    }
    console.error("[rfqs.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err) ?? "Internal error" },
      { status: 500 },
    );
  }
}

