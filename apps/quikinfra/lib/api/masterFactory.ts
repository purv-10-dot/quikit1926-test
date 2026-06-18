import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

/**
 * createMasterRoutes — factory that produces {GET, POST} list handlers and a
 * matching [id] {GET, PATCH, DELETE} set for any simple "Cn*" master.
 *
 * Cuts ~60 files of boilerplate across 12 masters. Bespoke routes (FinancialYear,
 * Project with FK validation, Machinery, Assets) still write their own handlers.
 *
 * Usage:
 *   // app/api/masters/departments/route.ts
 *   const { GET, POST } = createListRoutes({
 *     model: "cnDepartment",
 *     createSchema: departmentCreateSchema,
 *     orderBy: [{ name: "asc" }],
 *     uniqueBy: "code",
 *     errorLabel: "Department",
 *   });
 *   export { GET, POST };
 */

type PrismaModelName =
  | "cnDepartment"
  | "cnWorkCategory"
  | "cnCostCenter"
  | "cnLocation"
  | "cnGSTCode"
  | "cnTDSCode"
  | "cnTermsCondition"
  | "cnMachinery"
  | "cnAsset"
  | "cnCustomer"
  | "cnContractor"
  | "cnUOM"
  | "cnItemGroup"
  | "cnItem";

interface ListRoutesConfig {
  model: PrismaModelName;
  createSchema: ZodSchema;
  orderBy: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
  /** Field name whose value must be unique per tenant (e.g. "code" or "section"). */
  uniqueBy?: string;
  /** Human-friendly label for duplicate-key error messages. */
  errorLabel: string;
  /** Optional extra include/select clause passed through to findMany. */
  include?: Record<string, unknown>;
}

function modelFn(name: PrismaModelName) {
  // Narrowed access — allows calling findMany / findFirst / create on any of
  // the Cn* models through the same code path.
  return (db as unknown as Record<string, {
    findMany: (args?: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  }>)[name];
}

export function createListRoutes(config: ListRoutesConfig) {
  const withOrgAuth = withOrgAuthForModule("masters");

  const GET = withOrgAuth(async ({ orgId }, req) => {
    const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
    const rows = await modelFn(config.model).findMany({
      where: {
        orgId,
        deletedAt: includeDeleted ? { not: null } : null,
      },
      orderBy: config.orderBy,
      ...(config.include ? { include: config.include } : {}),
    });
    return NextResponse.json({ success: true, data: rows });
  });

  const POST = withOrgAuth(async ({ orgId, userId }, req) => {
    const body = await req.json();
    const input = config.createSchema.parse(body);

    if (config.uniqueBy) {
      const uniqueValue = (input as Record<string, unknown>)[config.uniqueBy];
      if (typeof uniqueValue === "string" && uniqueValue) {
        const existing = await modelFn(config.model).findFirst({
          where: { orgId, [config.uniqueBy]: uniqueValue, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          return NextResponse.json(
            { success: false, error: `${config.errorLabel} ${config.uniqueBy} '${uniqueValue}' already exists` },
            { status: 409 },
          );
        }
      }
    }

    const row = await modelFn(config.model).create({
      data: { ...(input as object), orgId, createdBy: userId },
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  });

  return { GET, POST };
}

interface IdRoutesConfig {
  model: PrismaModelName;
  updateSchema: ZodSchema;
  uniqueBy?: string;
  errorLabel: string;
}

export function createIdRoutes(config: IdRoutesConfig) {
  const withOrgAuth = withOrgAuthForModule("masters");

  const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
    const row = await modelFn(config.model).findFirst({
      where: { id: params.id, orgId },
    });
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: row });
  });

  const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
    const existing = await modelFn(config.model).findFirst({
      where: { id: params.id, orgId },
      select: config.uniqueBy ? { id: true, [config.uniqueBy]: true } : { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const body = await req.json();
    const input = config.updateSchema.parse(body);

    if (config.uniqueBy) {
      const nextValue = (input as Record<string, unknown>)[config.uniqueBy];
      const currentValue = (existing as Record<string, unknown>)[config.uniqueBy];
      if (typeof nextValue === "string" && nextValue !== currentValue) {
        const conflict = await modelFn(config.model).findFirst({
          where: {
            orgId,
            [config.uniqueBy]: nextValue,
            deletedAt: null,
            NOT: { id: params.id },
          },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json(
            { success: false, error: `${config.errorLabel} ${config.uniqueBy} '${nextValue}' already exists` },
            { status: 409 },
          );
        }
      }
    }

    const updated = await modelFn(config.model).update({
      where: { id: params.id },
      data: { ...(input as object), updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: updated });
  });

  const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
    const existing = await modelFn(config.model).findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await modelFn(config.model).update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return NextResponse.json({ success: true });
  });

  return { GET, PATCH, DELETE };
}
