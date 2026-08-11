import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateOrderSchema } from "@/lib/services/orders/validators";
import {
  OrderError,
  getOrder,
  softDeleteOrder,
  updateOrder,
} from "@/lib/services/orders/order-service";
import { toNumber } from "@/lib/services/quotes/decimal";

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

function serialise(o: Awaited<ReturnType<typeof getOrder>>) {
  if (!o) return o;
  return {
    ...o,
    subtotal: toNumber(o.subtotal),
    totalDiscount: toNumber(o.totalDiscount),
    taxableAmount: toNumber(o.taxableAmount),
    cgstAmount: toNumber(o.cgstAmount),
    sgstAmount: toNumber(o.sgstAmount),
    igstAmount: toNumber(o.igstAmount),
    freightAmount: toNumber(o.freightAmount),
    grandTotal: toNumber(o.grandTotal),
    lines: o.lines.map((l) => ({
      ...l,
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unitPrice),
      discountPct: toNumber(l.discountPct),
      discountAmount: toNumber(l.discountAmount),
      taxableAmount: toNumber(l.taxableAmount),
      gstRate: toNumber(l.gstRate),
      cgstAmount: toNumber(l.cgstAmount),
      sgstAmount: toNumber(l.sgstAmount),
      igstAmount: toNumber(l.igstAmount),
      lineTotal: toNumber(l.lineTotal),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const o = await getOrder(user.tenantId, id);
    if (!o) return fail(404, "Order not found");
    return ok(serialise(o));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load order";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/orders/:id GET]", error);
    return fail(status, message);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      await updateOrder({
        tenantId: user.tenantId,
        userId: user.userId,
        userName: user.name ?? null,
        id,
        input: parsed.data,
      });
      const o = await getOrder(user.tenantId, id);
      return ok(serialise(o));
    } catch (e: unknown) {
      if (e instanceof OrderError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update order";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/orders/:id PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");

    const existing = await getOrder(user.tenantId, id);
    if (!existing) return fail(404, "Order not found");
    await softDeleteOrder(user.tenantId, id);
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete order";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/orders/:id DELETE]", error);
    return fail(status, message);
  }
}
