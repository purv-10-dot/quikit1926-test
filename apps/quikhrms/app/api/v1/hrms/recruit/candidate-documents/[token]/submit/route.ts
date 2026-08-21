import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCandidateDocToken } from "@/lib/services/candidate-doc-token";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/**
 * POST /api/v1/hrms/recruit/candidate-documents/[token]/submit
 *
 * Candidate marks their document submission as finalized — this stamps
 * submittedAt on the request, locks further uploads (until HR clears it),
 * and signals HR that review can start.
 *
 * - Public route, same token-based auth as the upload endpoint.
 * - Idempotent: if already submitted, returns success with the existing timestamp.
 * - Validates that every REQUIRED document type has at least one upload.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.candidate-doc.submit", clientIp(req), 12, 60);
  if (rl) return rl;
  const { token } = await params;
  const payload = verifyCandidateDocToken(token);
  if (!payload) return err("INVALID_TOKEN", "Invalid or expired link", 400);

  const request = await prisma.candidateDocumentRequest.findFirst({
    where: { id: payload.requestId, orgId: payload.orgId, token, deletedAt: null },
    include: {
      uploads: { where: { deletedAt: null }, select: { documentTypeId: true } },
    },
  });
  if (!request) return err("NOT_FOUND", "Request not found", 404);
  if (request.tokenExpiresAt.getTime() < Date.now() || request.status === "Expired") {
    return err("EXPIRED", "Link expired", 400);
  }
  if (request.status === "Cancelled") return err("CANCELLED", "Request cancelled by HR", 400);

  // Idempotent: already submitted → return current state without erroring.
  if (request.submittedAt) {
    return ok({ submittedAt: request.submittedAt, alreadySubmitted: true });
  }

  // Verify every REQUIRED document type has at least one upload. Respect
  // selectedDocTypeIds if HR narrowed the list for this candidate.
  const selectedIds = Array.isArray(request.selectedDocTypeIds)
    ? (request.selectedDocTypeIds as unknown as string[])
    : null;

  const requiredTypes = await prisma.candidateDocumentType.findMany({
    where: {
      orgId: payload.orgId, isActive: true, deletedAt: null,
      isRequired: true,
      ...(selectedIds && selectedIds.length ? { id: { in: selectedIds } } : {}),
    },
    select: { id: true, name: true },
  });

  const uploadedTypeIds = new Set(request.uploads.map((u) => u.documentTypeId));
  const missing = requiredTypes.filter((t) => !uploadedTypeIds.has(t.id));
  if (missing.length > 0) {
    return err(
      "MISSING_REQUIRED",
      `Please upload all required documents before submitting. Still missing: ${missing.map((m) => m.name).join(", ")}.`,
      400,
    );
  }

  const updated = await prisma.candidateDocumentRequest.update({
    where: { id: request.id },
    data: { submittedAt: new Date() },
    select: { submittedAt: true },
  });

  return ok({ submittedAt: updated.submittedAt, alreadySubmitted: false });
}
