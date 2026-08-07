import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateProductSchema } from "@/lib/services/quotes/validators";
import {
  getProduct,
  restoreProduct,
  softDeleteProduct,
  updateProduct,
} from "@/lib/services/quotes/product-service";
import { prisma } from "@/lib/db/prisma";
import { listProductFields } from "@/lib/services/products/fields/repo";
import { validateProductDynamicFields } from "@/lib/services/products/fields/validate";
import { serializeProduct } from "@/lib/services/products/serialize";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

async function serialise(tenantId: string, id: string) {
  const p = await prisma.qcfProduct.findFirst({
    where: { id, tenantId },
    include: {
      categoryRef: { select: { id: true, name: true } },
      subcategoryRef: { select: { id: true, name: true } },
      brandRef: { select: { id: true, name: true } },
      familyRef: { select: { id: true, name: true } },
    },
  });
  return p ? serializeProduct(p) : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const p = await serialise(user.tenantId, id);
    if (!p) return fail(404, "Product not found");
    return ok(p);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products/:id GET]", error);
    return fail(status, message);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const existing = await getProduct(user.tenantId, id);
    if (!existing) return fail(404, "Product not found");

    const body = await req.json().catch(() => null);
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    const patch = { ...parsed.data };
    if (parsed.data.dynamicFields !== undefined) {
      const defs = await listProductFields(user.tenantId);
      const existingDyn = (existing.dynamicFields as Record<string, unknown> | null) ?? {};
      const merged = { ...existingDyn, ...(parsed.data.dynamicFields ?? {}) };
      const { values, errors: dynErrors } = validateProductDynamicFields({
        defs,
        input: merged,
        requireMissing: true,
      });
      if (Object.keys(dynErrors).length > 0) {
        return fail(400, "Custom field validation failed", dynErrors);
      }
      patch.dynamicFields = values;
    }

    try {
      await updateProduct({
        tenantId: user.tenantId,
        id,
        input: patch,
      });
      const updated = await serialise(user.tenantId, id);
      return ok(updated);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        return fail(409, "A product with this SKU already exists in this tenant.", {
          sku: "Duplicate SKU",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products/:id PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");

    const existing = await getProduct(user.tenantId, id);
    if (!existing) return fail(404, "Product not found");

    await softDeleteProduct(user.tenantId, id);
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products/:id DELETE]", error);
    return fail(status, message);
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Restore endpoint — `/api/products/:id` with POST treats the body-less call
  // as "undo soft delete." We could split into a /restore sub-route but the
  // surface area is small enough that a single verb is cheaper than another
  // file. The DELETE handler is still the soft-delete entry.
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    await restoreProduct(user.tenantId, id);
    const p = await serialise(user.tenantId, id);
    if (!p) return fail(404, "Product not found");
    return ok(p);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restore product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/products/:id POST]", error);
    return fail(status, message);
  }
}
