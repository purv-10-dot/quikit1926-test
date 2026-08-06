import { NextRequest, NextResponse } from "next/server";
import {
  listItems,
  countItems,
  createItem,
} from "@/lib/masters/items-repository";
import { cachedJson } from "@/lib/http/cache";
import { paginateDb, parseSort } from "@/lib/http/pagination";
import { withListRoute, withMutationRoute, DomainError } from "@/lib/http";

/**
 * GET  /api/masters/items — list tenant items (seeded on first call if empty).
 * POST /api/masters/items — create a new item. Free-text `category` and
 *                          `uomCode` are resolved into CnItemGroup / CnUOM
 *                          by find-or-create.
 *
 * GET keeps `cachedJson` because items-list response is shared across
 * many pages and we still want browsers to reuse it for ~10 seconds —
 * the wrapper returns the payload, then we wrap it in cache headers.
 */

export async function GET(req: NextRequest) {
  // Items are lookup/reference data picked across modules (PR / BOQ / GRN /
  // stock), so the LIST is readable by ANY authenticated user in the org —
  // no Masters permission required. Still scoped to ctx.orgId below, so a
  // user only ever sees their own org's items. Create/edit/delete (POST etc.)
  // still require the full Masters permission.
  return withListRoute(
    req,
    { entityLabel: "item" },
    async ({ ctx, searchParams, pagination }) => {
      // `status=all` / `status=inactive` (sent by the master list to power
      // its Active / Inactive / All tabs). Every other caller omits status
      // and gets active-only.
      const statusParam = (searchParams.get("status") ?? "").toLowerCase();
      const status: "active" | "inactive" | "all" =
        statusParam === "all" ? "all" : statusParam === "inactive" ? "inactive" : "active";
      const baseOpts = {
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        search: searchParams.get("search") ?? "",
        groupId: searchParams.get("groupId") || undefined,
        status,
      };
      const { orderBy } = parseSort(
        searchParams,
        // Scalar cnItem columns only — `category`/`uom` are relations and
        // `currentStock` is computed, so those stay client-unsortable.
        ["code", "name", "itemType", "hsnCode", "standardRate", "gstRate", "minStockLevel", "status", "createdAt"],
        { field: "createdAt", order: "desc" },
      );
      const result = await paginateDb(
        pagination,
        (paging) => listItems({ ...baseOpts, ...paging, orderBy }),
        () => countItems(baseOpts),
      );
      // Items master changes infrequently — return the cached envelope
      // directly (full NextResponse) instead of a plain payload so the
      // wrapper preserves our Cache-Control headers.
      return cachedJson(result, "short");
    },
  );
}

interface ItemBody {
  name: string;
  code?: string;
  itemType?: string;
  category?: string;
  groupName?: string;
  uomId?: string;
  uomCode?: string;
  uomIds?: string[];
  specifications?: string;
  hsnCode?: string;
  gstRate?: string | number;
  standardRate?: string | number;
  minStockLevel?: string | number;
  reorderLevel?: string | number;
  status?: string;
}

export async function POST(req: NextRequest) {
  return withMutationRoute<ItemBody>(
    req,
    {
      entityLabel: "item",
      successStatus: 201,
      requirePermission: "construction.master_item.create",
      requireMatrix: { menuKey: "master.item", action: "add" },
      parseBody: (raw): ItemBody => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) throw new DomainError("VALIDATION", "Item name is required", 400);
        return { ...(body as unknown as ItemBody), name };
      },
    },
    async ({ ctx, body }) => {
      const toDecStr = (v: string | number | undefined): string | undefined =>
        v == null ? undefined : String(v);
      return createItem({
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        code: body.code,
        name: body.name,
        itemType: body.itemType,
        category: body.category ?? body.groupName,
        uomId: body.uomId,
        uomCode: body.uomCode,
        uomIds: Array.isArray(body.uomIds) ? body.uomIds : undefined,
        specifications: body.specifications,
        hsnCode: body.hsnCode,
        gstRate: toDecStr(body.gstRate),
        standardRate: toDecStr(body.standardRate),
        minStockLevel: toDecStr(body.minStockLevel),
        reorderLevel: toDecStr(body.reorderLevel),
        status: body.status,
      });
    },
  );
}
