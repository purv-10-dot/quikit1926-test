import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCandidateDocToken } from "@/lib/services/candidate-doc-token";

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyCandidateDocToken(token);
  if (!payload) return err("INVALID_TOKEN", "Invalid or expired link", 400);

  const request = await prisma.candidateDocumentRequest.findFirst({
    where: {
      id: payload.requestId,
      orgId: payload.orgId,
      token,
      deletedAt: null,
    },
    include: {
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true } },
          requisition: { select: { title: true } },
        },
      },
      uploads: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: "desc" },
        include: { documentType: { select: { id: true, code: true, name: true, isRequired: true } } },
      },
    },
  });
  if (!request) return err("NOT_FOUND", "Request not found", 404);
  if (request.tokenExpiresAt.getTime() < Date.now() || request.status === "Expired") {
    return err("EXPIRED", "Link expired", 400);
  }
  if (request.status === "Cancelled") return err("CANCELLED", "Request cancelled by HR", 400);

  const selectedIds = Array.isArray(request.selectedDocTypeIds) ? (request.selectedDocTypeIds as unknown as string[]) : null;
  const docTypes = await prisma.candidateDocumentType.findMany({
    where: {
      orgId: payload.orgId, bundle: payload.bundle, isActive: true, deletedAt: null,
      ...(selectedIds && selectedIds.length ? { id: { in: selectedIds } } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });

  const company = await prisma.companySettings.findUnique({
    where: { orgId: payload.orgId }, select: { companyName: true },
  });

  return ok({
    companyName: company?.companyName ?? "Our Company",
    bundle: payload.bundle,
    candidate: {
      name: `${request.application.candidate.firstName} ${request.application.candidate.lastName}`.trim(),
      email: request.application.candidate.email,
    },
    jobTitle: request.application.requisition.title,
    status: request.status,
    docTypes,
    uploads: request.uploads,
    tokenExpiresAt: request.tokenExpiresAt,
    submissionDeadline: request.submissionDeadline,
    submittedAt: request.submittedAt,
  });
}
