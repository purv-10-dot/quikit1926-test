import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createProductSchema,
  listProductsQuerySchema,
} from "@/lib/services/quotes/validators";
import {
  createProduct,
  listProducts,
} from "@/lib/services/quotes/product-service";
import { listProductFields } from "@/lib/services/products/fields/repo";
import { validateProductDynamicFields } from "@/lib/services/products/fields/validate";
import { serializeProduct } from "@/lib/services/products/serialize";
import { prisma } from "@/lib/db/prisma";

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
    const parsed = listProductsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listProducts({
      orgId: user.orgId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      q: parsed.data.q,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      categoryId: parsed.data.categoryId,
      subcategoryId: parsed.data.subcategoryId,
      brandId: parsed.data.brandId,
      familyId: parsed.data.familyId,
      tag: parsed.data.tag,
      hsnCode: parsed.data.hsnCode,
      isActive: parsed.data.isActive,
      productType: parsed.data.productType,
      trashed: parsed.data.trashed,
    });

    const enriched = await prisma.qcfProduct.findMany({
      where: { orgId: user.orgId, id: { in: result.items.map((i) => i.id) } },
      include: {
        categoryRef: { select: { id: true, name: true } },
        brandRef: { select: { id: true, name: true } },
      },
    });
    const byId = new Map(enriched.map((p) => [p.id, p]));

    return ok({
      items: result.items.map((it) => serializeProduct(byId.get(it.id)!)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list products";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products GET]", error);
    return fail(status, message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    const body = await req.json().catch(() => null);
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    const defs = await listProductFields(user.orgId);
    const { values: dyn, errors: dynErrors } = validateProductDynamicFields({
      defs,
      input: parsed.data.dynamicFields,
      requireMissing: true,
    });
    if (Object.keys(dynErrors).length > 0) {
      return fail(400, "Custom field validation failed", dynErrors);
    }

    try {
      const created = await createProduct({
        orgId: user.orgId,
        userId: user.userId,
        input: { ...parsed.data, dynamicFields: dyn },
      });
      const full = await prisma.qcfProduct.findFirst({
        where: { id: created.id, orgId: user.orgId },
        include: {
          categoryRef: { select: { id: true, name: true } },
          brandRef: { select: { id: true, name: true } },
        },
      });
      return ok(serializeProduct(full ?? created), { status: 201 });
    } catch (e: unknown) {
      // Surface unique-constraint collisions (e.g., duplicate SKU per tenant).
      const err = e as { code?: string; meta?: { target?: string[] } };
      if (err.code === "P2002") {
        return fail(409, "A product with this SKU already exists in this tenant.", {
          sku: "Duplicate SKU",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products POST]", error);
    return fail(status, message);
  }
}
