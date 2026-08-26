import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { ensureCandidateDocDefaults } from "@/lib/services/candidate-doc-setup";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("includeInactive") === "1";
    await ensureCandidateDocDefaults(orgId, userId);

    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (!includeInactive) where.isActive = true;

    const types = await prisma.candidateDocumentType.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }],
    });
    return successResponse(types);
  } catch (e) {
    console.error("GET candidate-document-types", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `doc_${Date.now()}`;
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return validationError("Name required");

    const codeRaw = typeof body.code === "string" && body.code.trim() ? body.code.trim() : slugify(name);
    const isRequired = body.isRequired !== false;
    const helpText = typeof body.helpText === "string" ? body.helpText.trim() || null : null;
    const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 999;

    const dup = await prisma.candidateDocumentType.findUnique({
      where: { orgId_code: { orgId, code: codeRaw } },
    }).catch(() => null);
    if (dup) return validationError(`A document with code "${codeRaw}" already exists`);

    const created = await prisma.candidateDocumentType.create({
      data: {
        orgId, name, code: codeRaw,
        isRequired, helpText, sortOrder,
        isDefault: false, isActive: true,
        createdBy: userId, updatedBy: userId,
      },
    });
    return successResponse(created, undefined, 201);
  } catch (e) {
    console.error("POST candidate-document-types", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
