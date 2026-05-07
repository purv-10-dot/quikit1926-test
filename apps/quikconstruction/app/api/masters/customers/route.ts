import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  listCustomers,
  countCustomers,
  createCustomer,
} from "@/lib/masters/customers-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const baseOpts = {
      tenantId: ctx.tenantId,
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

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/customers.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }
  try {
    const record = await createCustomer({
      tenantId: ctx.tenantId,
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
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A customer with this code already exists" }, { status: 409 });
    }
    console.error("[customers.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create customer" }, { status: 500 });
  }
}
