import { NextRequest } from "next/server";
import { listBanks, countBanks, createBank } from "@/lib/masters/banks-repository";
import { paginateDb } from "@/lib/http/pagination";
import { withListRoute, withMutationRoute, DomainError } from "@/lib/http";

/**
 * Banks master.
 *
 * The mutation wrapper auto-maps Prisma P2002 / P2003 to friendly 409 /
 * 400 responses, so the route handler only validates inputs and delegates
 * to the repository.
 */

export async function GET(req: NextRequest) {
  // Lookup data — list readable by any authenticated org user (scoped to orgId).
  return withListRoute(req, { entityLabel: "bank" }, async ({ ctx, searchParams, pagination }) => {
    const baseOpts = {
      orgId: ctx.orgId,
      search: searchParams.get("search") ?? "",
    };
    return paginateDb(
      pagination,
      (paging) => listBanks({ ...baseOpts, ...paging }),
      () => countBanks(baseOpts),
    );
  });
}

export async function POST(req: NextRequest) {
  return withMutationRoute(
    req,
    {
      entityLabel: "bank",
      successStatus: 201,
      requirePermission: "construction.masters.create",
      parseBody: (raw) => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const required = (key: string, label: string) => {
          const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
          if (!v) throw new DomainError("VALIDATION", `${label} is required`, 400);
          return v;
        };
        return {
          bankName: required("bankName", "Bank name"),
          accountNo: required("accountNo", "Account number"),
          ifscCode: required("ifscCode", "IFSC code"),
          accountType: required("accountType", "Account type"),
          companyId: required("companyId", "Company"),
          branchName: typeof body.branchName === "string" ? body.branchName : undefined,
          status: typeof body.status === "string" ? body.status : "active",
        };
      },
    },
    async ({ ctx, body }) => {
      return createBank({
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        ...body,
      });
    },
  );
}
