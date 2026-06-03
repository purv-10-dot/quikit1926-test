import { NextRequest } from "next/server";
import {
  listCompanies,
  countCompanies,
  createCompany,
} from "@/lib/masters/companies-repository";
import { paginateDb } from "@/lib/http/pagination";
import {
  withListRoute,
  withMutationRoute,
  DomainError,
} from "@/lib/http";

/**
 * Companies master — Postgres-backed.
 *
 * Uses the standard route wrappers so auth, tenant scoping, pagination,
 * Prisma error mapping (P2002 / P2003 / P2025), and response envelopes
 * stay consistent with every other route.
 */

export async function GET(req: NextRequest) {
  // Lookup data — list readable by any authenticated org user (scoped to orgId).
  return withListRoute(req, { entityLabel: "company" }, async ({ ctx, searchParams, pagination }) => {
    const baseOpts = {
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      search: searchParams.get("search") ?? "",
    };
    return paginateDb(
      pagination,
      (paging) => listCompanies({ ...baseOpts, ...paging }),
      () => countCompanies(baseOpts),
    );
  });
}

export async function POST(req: NextRequest) {
  return withMutationRoute(
    req,
    {
      entityLabel: "company",
      successStatus: 201,
      requirePermission: "construction.masters.create",
      requireMatrix: { menuKey: "org.company", action: "add" },
      parseBody: (raw) => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
          throw new DomainError("VALIDATION", "Company name is required", 400);
        }
        return { ...body, name } as Record<string, unknown>;
      },
    },
    async ({ ctx, body }) => {
      return createCompany({
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        name: body.name as string,
        legalName: body.legalName as string | undefined,
        shortName: body.shortName as string | undefined,
        gstin: body.gstin as string | undefined,
        pan: body.pan as string | undefined,
        cin: body.cin as string | undefined,
        address: body.address as string | undefined,
        city: body.city as string | undefined,
        state: body.state as string | undefined,
        pincode: body.pincode as string | undefined,
        phone: body.phone as string | undefined,
        email: body.email as string | undefined,
        website: body.website as string | undefined,
        logoUrl: body.logoUrl as string | undefined,
        bankName: body.bankName as string | undefined,
        branchName: body.branchName as string | undefined,
        accountNo: body.accountNo as string | undefined,
        ifscCode: body.ifscCode as string | undefined,
        accountType: body.accountType as string | undefined,
        status: (body.status as string | undefined) ?? "active",
      });
    },
  );
}
