import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, internalError } from "@/lib/api-response";
import { convertApplicationToEmployee } from "@/lib/services/onboard-application";

/**
 * POST /api/v1/hrms/recruit/applications/:id/onboard
 *
 * Manual fallback only — the normal path now auto-converts an application to
 * an Employee the moment its offer is accepted (see offer-response/[token]
 * and recruit/offers/[id] routes, both calling convertApplicationToEmployee).
 * This stays as a retry path for the rare case that auto-conversion failed
 * (e.g. a transient SEAT_FULL race) — no UI currently links to it directly.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const result = await convertApplicationToEmployee(orgId, userId, params.id);
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return notFound("Application not found");
      if (result.reason === "NOT_HIRED_STAGE") return validationError("Application must be in Hired stage to onboard");
      if (result.reason === "EMP_EXISTS") return conflict("Employee already exists for this candidate email");
      if (result.reason === "SEAT_FULL") return conflict("All positions for this requisition are already filled.");
    }
    return successResponse({ employeeId: (result as { employeeId: string }).employeeId }, undefined, 201);
  } catch (error) {
    console.error("POST /recruit/applications/:id/onboard error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
