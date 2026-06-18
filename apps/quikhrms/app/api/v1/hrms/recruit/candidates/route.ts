import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createCandidateSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const includeArchived = searchParams.get("includeArchived") === "1";
    const onlyArchived = searchParams.get("archived") === "1";
    const onlyBlacklisted = searchParams.get("blacklisted") === "1";

    const where: Prisma.CandidateWhereInput = {
      orgId, deletedAt: null,
      ...(onlyArchived
        ? { isArchived: true }
        : includeArchived ? {} : { isArchived: false }),
      ...(onlyBlacklisted && { isBlacklisted: true }),
      ...(status && { status: status as Prisma.CandidateWhereInput["status"] }),
      ...(source && { source: source as Prisma.CandidateWhereInput["source"] }),
      ...(search && { OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ] }),
    };

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          currentCompany: true,
          currentDesignation: true,
          totalExperience: true,
          expectedCTC: true,
          source: true,
          status: true,
          rating: true,
          location: true,
          isBlacklisted: true,
          blacklistReason: true,
          blacklistedAt: true,
          blacklistedUntil: true,
          isArchived: true,
          archiveReason: true,
          archivedAt: true,
          createdAt: true,
          _count: { select: { applications: true } },
          applications: {
            where: { deletedAt: null },
            orderBy: { appliedDate: "desc" },
            take: 1,
            select: { id: true, currentStage: true, status: true, requisition: { select: { id: true, title: true, requisitionNumber: true } } },
          },
        },
      }),
      prisma.candidate.count({ where }),
    ]);
    return successResponse(candidates, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/candidates error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createCandidateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const existing = await prisma.candidate.findFirst({ where: { orgId, email: data.email, deletedAt: null } });
    if (existing) return conflict("Candidate with this email already exists");

    const candidate = await prisma.candidate.create({
      data: {
        orgId, ...data,
        skills: data.skills ? JSON.parse(JSON.stringify(data.skills)) : undefined,
        education: data.education ? JSON.parse(JSON.stringify(data.education)) : undefined,
        tags: data.tags ? JSON.parse(JSON.stringify(data.tags)) : undefined,
        createdBy: userId, updatedBy: userId,
      },
    });
    void fireWorkflow({
      orgId, event: "recruit.candidate.created",
      payload: { candidateId: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`, source: candidate.source },
    });

    return successResponse(candidate, undefined, 201);
  } catch (error) { console.error("POST /recruit/candidates error:", error); return internalError(); }
});
