import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listCustomers,
  countCustomers,
  createCustomer,
} from "@/lib/masters/customers-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
  };
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listCustomers({ ...baseOpts, ...paging }),
    () => countCustomers(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.customer", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.customer`, 403);
  }
  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }
  try {
    const record = await createCustomer({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      customerType: body.customerType,
      contactPerson: body.contactPerson,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      state: body.state,
      pincode: body.pincode,
      gstin: body.gstin,
      pan: body.pan,
      billingAddress: body.billingAddress,
      shippingAddress: body.shippingAddress,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      ifscCode: body.ifscCode,
      paymentTerms: body.paymentTerms,
      creditLimit: body.creditLimit,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A customer with this code already exists" }, { status: 409 });
    }
    console.error("[customers.create] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create customer" }, { status: 500 });
  }
}
