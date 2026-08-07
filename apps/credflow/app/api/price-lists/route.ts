import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createPriceListSchema,
  listPriceListsQuerySchema,
} from "@/lib/services/quotes/validators";
import {
  createPriceList,
  listPriceLists,
} from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listPriceListsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listPriceLists({
      orgId: user.orgId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      q: parsed.data.q,
      isActive: parsed.data.isActive,
      isDefault: parsed.data.isDefault,
      currency: parsed.data.currency,
      trashed: parsed.data.trashed,
      sortBy: parsed.data.sortBy,
      sortDir: parsed.data.sortDir,
    });

    return ok(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list price lists";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists GET]", error);
    return fail(status, message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    const body = await req.json().catch(() => null);
    const parsed = createPriceListSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const created = await createPriceList({
        orgId: user.orgId,
        userId: user.userId,
        userName: user.name,
        input: parsed.data,
      });
      return ok(created, { status: 201 });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        return fail(409, "A price list with this name already exists.", {
          name: "Duplicate name",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists POST]", error);
    return fail(status, message);
  }
}
