import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";

const brandingSchema = z.object({
  letterheadKey: z.string().nullish(),
  sealKey: z.string().nullish(),
  signatureKey: z.string().nullish(),
  signatoryName: z.string().max(120).nullish(),
  signatoryDesignation: z.string().max(120).nullish(),
  offerLetterFooter: z.string().max(500).nullish(),
  offerLetterBody: z.string().max(20000).nullish(),
});

const SELECT = {
  letterheadKey: true,
  sealKey: true,
  signatureKey: true,
  signatoryName: true,
  signatoryDesignation: true,
  offerLetterFooter: true,
  offerLetterBody: true,
  companyName: true,
};

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const row = (await prisma.companySettings.findUnique({ where: { orgId }, select: SELECT })) ?? {};
    return successResponse(row);
  } catch (error) {
    console.error("GET /settings/branding error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = brandingSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    const existing = await prisma.companySettings.findUnique({ where: { orgId } });
    const row = existing
      ? await prisma.companySettings.update({
          where: { orgId },
          data: { ...data, updatedBy: userId },
          select: SELECT,
        })
      : await prisma.companySettings.create({
          data: {
            orgId,
            companyName: "Your Company",
            ...data,
            createdBy: userId,
            updatedBy: userId,
          },
          select: SELECT,
        });

    return successResponse(row);
  } catch (error) {
    console.error("PUT /settings/branding error:", error);
    return internalError();
  }
});
