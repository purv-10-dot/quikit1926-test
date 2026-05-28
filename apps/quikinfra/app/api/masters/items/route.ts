import { NextRequest, NextResponse } from "next/server";
import {
  listItems,
  countItems,
  createItem,
} from "@/lib/masters/items-repository";
import { cachedJson } from "@/lib/http/cache";
import { paginateDb } from "@/lib/http/pagination";
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
  return withListRoute(
    req,
    { entityLabel: "item" },
    async ({ ctx, searchParams, pagination }) => {
      const baseOpts = {
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        search: searchParams.get("search") ?? "",
        groupId: searchParams.get("groupId") || undefined,
      };
      const result = await paginateDb(
        pagination,
        (paging) => listItems({ ...baseOpts, ...paging }),
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
      requireMatrix: { menuKey: "master.item", action: "add" },
      parseBody: (raw): ItemBody => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) throw new DomainError("VALIDATION", "Item name is required", 400);
        return { ...(body as unknown as ItemBody), name };
      },
    },
    async ({ ctx, body }) => {
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
        gstRate: body.gstRate as any,
        standardRate: body.standardRate as any,
        minStockLevel: body.minStockLevel as any,
        reorderLevel: body.reorderLevel as any,
        status: body.status,
      });
    },
  );
}
