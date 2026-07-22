import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import type { Prisma } from "@quikit/database";

export interface SearchHit {
  type: "employee" | "department" | "designation" | "candidate" | "requisition" | "document";
  id: string;
  label: string;
  sub?: string | null;
  href: string;
}

/**
 * GET /api/v1/hrms/search?q=... — global type-ahead for the top bar.
 *
 * Searches employees (name / code / work-email / job title), departments and
 * designations, all scoped to the caller's org. Employee results additionally
 * respect the caller's read scope (all / team / self) so a self-only employee
 * can't enumerate the whole org through search.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return successResponse<SearchHit[]>([]);

    const contains = { contains: q, mode: "insensitive" as const };
    const has = (p: string) => ctx.permissions.includes("*") || ctx.permissions.includes(p);
    const canRecruit = has("hrms.recruit.read");
    const canAllDocs = has("hrms.document.read") || has("hrms.document.read_team");
    const canOwnDocs = has("hrms.document.read_self");

    // Employee read scope — reuse the same rules as the employees list.
    const scope = resolveScope(ctx, {
      all: "hrms.employee.read",
      team: "hrms.employee.read_team",
      self: "hrms.employee.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    const scopeIds = scopeFilter.allow ? (scopeFilter.employeeIds ?? null) : [];

    const empWhere: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      ...(scopeIds && { id: { in: scopeIds } }),
      OR: [
        { firstName: contains },
        { lastName: contains },
        { workEmail: contains },
        { employeeCode: contains },
        { jobTitle: contains },
      ],
    };

    const [employees, departments, designations, candidates, requisitions, documents] = await Promise.all([
      // scopeIds === [] means "no access" → skip the query entirely.
      Array.isArray(scopeIds) && scopeIds.length === 0 && scope !== "all"
        ? Promise.resolve([])
        : prisma.employee.findMany({
            where: empWhere,
            orderBy: { firstName: "asc" },
            take: 6,
            select: {
              id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true,
              department: { select: { name: true } },
            },
          }),
      prisma.department.findMany({
        where: { orgId, deletedAt: null, name: contains },
        orderBy: { name: "asc" }, take: 4, select: { id: true, name: true },
      }),
      prisma.designation.findMany({
        where: { orgId, deletedAt: null, title: contains },
        orderBy: { title: "asc" }, take: 4, select: { id: true, title: true },
      }),
      // Recruit — only if the caller can view recruitment.
      canRecruit
        ? prisma.candidate.findMany({
            where: { orgId, deletedAt: null, OR: [{ firstName: contains }, { lastName: contains }, { email: contains }] },
            orderBy: { firstName: "asc" }, take: 5,
            select: { id: true, firstName: true, lastName: true, email: true, currentDesignation: true },
          })
        : Promise.resolve([]),
      canRecruit
        ? prisma.jobRequisition.findMany({
            where: { orgId, deletedAt: null, OR: [{ title: contains }, { requisitionNumber: contains }] },
            orderBy: { createdAt: "desc" }, take: 4,
            select: { id: true, title: true, requisitionNumber: true },
          })
        : Promise.resolve([]),
      // Documents — all-org if permitted, else only the caller's own.
      canAllDocs || canOwnDocs
        ? prisma.document.findMany({
            where: {
              orgId, deletedAt: null, title: contains,
              ...(canAllDocs ? {} : { employeeId: ctx.userId }),
            },
            orderBy: { title: "asc" }, take: 4, select: { id: true, title: true, category: true },
          })
        : Promise.resolve([]),
    ]);

    const hits: SearchHit[] = [
      ...employees.map((e) => ({
        type: "employee" as const,
        id: e.id,
        label: `${e.firstName} ${e.lastName}`.trim(),
        sub: [e.employeeCode, e.jobTitle ?? e.department?.name].filter(Boolean).join(" · ") || null,
        href: `/employees/${e.id}`,
      })),
      ...departments.map((d) => ({
        type: "department" as const,
        id: d.id, label: d.name, sub: "Department", href: `/people?department=${d.id}`,
      })),
      ...designations.map((d) => ({
        type: "designation" as const,
        id: d.id, label: d.title, sub: "Designation", href: `/people?designation=${d.id}`,
      })),
      ...candidates.map((c) => ({
        type: "candidate" as const,
        id: c.id,
        label: `${c.firstName} ${c.lastName}`.trim(),
        sub: c.currentDesignation ?? c.email ?? "Candidate",
        href: `/recruit/candidates/${c.id}`,
      })),
      ...requisitions.map((r) => ({
        type: "requisition" as const,
        id: r.id, label: r.title, sub: r.requisitionNumber ?? "Requisition", href: `/recruit/requisitions`,
      })),
      ...documents.map((d) => ({
        type: "document" as const,
        id: d.id, label: d.title, sub: String(d.category ?? "Document"), href: `/documents/${d.id}`,
      })),
    ];

    return successResponse<SearchHit[]>(hits);
  } catch (error) {
    console.error("GET /search error:", error);
    return internalError();
  }
});
