import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { signESignSchema } from "@/lib/validations/gap-fill";

type Signer = { name: string; email: string; role?: string; order: number; status?: string; signedAt?: string; signatureBase64?: string; declinedAt?: string; };

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = signESignSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const esign = await prisma.eSignRequest.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!esign) return notFound("E-sign request not found");
    if (!["ESignSent", "ESignPartiallySigned"].includes(esign.status)) return conflict("Request is not active");

    const signers = esign.signers as unknown as Signer[];
    const idx = signers.findIndex((s) => s.email.toLowerCase() === parsed.data.signerEmail.toLowerCase());
    if (idx === -1) return notFound("Signer not found in this request");

    if (parsed.data.decline) {
      signers[idx] = { ...signers[idx], status: "Declined", declinedAt: new Date().toISOString() };
      const updated = await prisma.eSignRequest.update({
        where: { id: params.id },
        data: { signers: JSON.parse(JSON.stringify(signers)), status: "ESignDeclined", updatedBy: userId },
      });
      return successResponse(updated);
    }

    signers[idx] = {
      ...signers[idx], status: "Signed",
      signedAt: new Date().toISOString(),
      signatureBase64: parsed.data.signatureBase64,
    };
    const allSigned = signers.every((s) => s.status === "Signed");
    const anySigned = signers.some((s) => s.status === "Signed");

    const newStatus = allSigned ? "ESignCompleted" : anySigned ? "ESignPartiallySigned" : "ESignSent";

    const updated = await prisma.eSignRequest.update({
      where: { id: params.id },
      data: {
        signers: JSON.parse(JSON.stringify(signers)),
        status: newStatus,
        ...(allSigned && { completedAt: new Date() }),
        updatedBy: userId,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /esign/[id]/sign error:", error);
    return internalError();
  }
});
