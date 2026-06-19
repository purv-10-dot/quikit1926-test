import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, internalError, errorResponse } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { seedDefaultOnboardingTasks } from "@/lib/utils/default-onboarding-tasks";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/recruit/applications/:id/onboard
 * Converts a hired Application + Candidate → Employee record.
 * Bumps requisition.filledPositions, auto-closes if fully filled.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    // Optional override — admins can bypass the document-approval gate when
    // truly necessary (e.g. legal hardcopy on file). Logged loudly.
    const body = await req.json().catch(() => ({}));
    const canForce = permissions.includes("*"); // super admin bypass
    const force = !!body.force && canForce;     // non-admins can't force

    const application = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        candidate: true,
        requisition: true,
      },
    });
    if (!application) return notFound("Application not found");
    if (application.currentStage !== "Hired") {
      return validationError("Application must be in Hired stage to onboard");
    }

    // If already onboarded (email present as employee), block.
    const existingEmp = await prisma.employee.findFirst({
      where: { orgId, workEmail: application.candidate.email, deletedAt: null },
    });
    if (existingEmp) return conflict("Employee already exists for this candidate email");

    // ── Document-approval gate ───────────────────────────────────────
    // Block onboarding until every REQUIRED candidate document has an
    // Approved upload. Super-admins can pass { force: true } to bypass.
    if (!force) {
      const docRequests = await prisma.candidateDocumentRequest.findMany({
        where: {
          orgId,
          applicationId: application.id,
          deletedAt: null,
          status: { not: "Cancelled" },
        },
        select: {
          bundle: true,
          selectedDocTypeIds: true,
          uploads: {
            where: { deletedAt: null },
            select: { documentTypeId: true, status: true },
          },
        },
      });

      const missing: { bundle: string; name: string; reason: "not_uploaded" | "not_approved" }[] = [];
      for (const r of docRequests) {
        const selected = Array.isArray(r.selectedDocTypeIds)
          ? (r.selectedDocTypeIds as unknown as string[])
          : null;

        // Latest upload per documentTypeId — Approved wins; otherwise the
        // most-recent (Pending/Rejected) reflects current state.
        const latestByType = new Map<string, "Pending" | "Approved" | "Rejected">();
        for (const u of r.uploads) {
          if (!u.documentTypeId) continue;
          if (latestByType.get(u.documentTypeId) === "Approved") continue;
          latestByType.set(u.documentTypeId, u.status);
        }

        const requiredTypes = await prisma.candidateDocumentType.findMany({
          where: {
            orgId, bundle: r.bundle, isActive: true, deletedAt: null,
            isRequired: true,
            ...(selected && selected.length ? { id: { in: selected } } : {}),
          },
          select: { id: true, name: true },
        });

        for (const t of requiredTypes) {
          const status = latestByType.get(t.id);
          if (!status) missing.push({ bundle: r.bundle, name: t.name, reason: "not_uploaded" });
          else if (status !== "Approved") missing.push({ bundle: r.bundle, name: t.name, reason: "not_approved" });
        }
      }

      if (missing.length > 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Cannot onboard — required documents are not yet approved.",
          400,
          {
            missing,
            canForce,
            hint: canForce
              ? "Super admins can override by sending { force: true } in the request body."
              : "Ask HR to approve the pending documents, or have a super admin override.",
          },
        );
      }
    }

    const employeeCode = await generateEmployeeCode(orgId);
    const reqn = application.requisition; // renamed from `req` to avoid clash with the request param above

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          orgId,
          employeeCode,
          firstName: application.candidate.firstName,
          lastName: application.candidate.lastName,
          workEmail: application.candidate.email,
          personalEmail: application.candidate.email,
          personalPhone: application.candidate.phone ?? undefined,
          linkedinUrl: application.candidate.linkedinUrl ?? undefined,
          portfolioUrl: application.candidate.portfolioUrl ?? undefined,
          jobTitle: reqn.title,
          departmentId: reqn.departmentId ?? undefined,
          employmentType: reqn.employmentType,
          workLocation: reqn.workLocation,
          dateOfJoining: new Date(),
          status: "PreBoarding",
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await tx.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "AppHired",
          currentStage: "Hired",
          updatedBy: userId,
        },
      });

      await tx.candidate.update({
        where: { id: application.candidateId },
        data: { status: "Hired", updatedBy: userId },
      });

      const newFilled = (reqn.filledPositions ?? 0) + 1;
      await tx.jobRequisition.update({
        where: { id: reqn.id },
        data: {
          filledPositions: newFilled,
          status: newFilled >= reqn.positions ? "ReqClosed" : reqn.status,
          updatedBy: userId,
        },
      });

      // Create onboarding instance + default task checklist.
      const startDate = new Date();
      const onboarding = await tx.onboardingInstance.create({
        data: {
          orgId,
          employeeId: emp.id,
          startDate,
          status: "NotStarted",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await seedDefaultOnboardingTasks(tx, orgId, onboarding.id, startDate);

      return emp;
    });

    if (force) {
      // Loud audit trail — force-onboards bypass the doc-approval gate.
      await createAuditLog({
        orgId, userId, action: "Create", entityType: "Employee", entityId: employee.id,
        metadata: {
          action: "onboard-force",
          applicationId: application.id,
          reason: typeof body.reason === "string" ? body.reason : undefined,
        },
      });
    }

    // NOTE: activation email is NOT sent here anymore. HR completes the
    // onboarding checklist first, then clicks "Confirm Employment", which is
    // the moment the invitation email goes out (see /employees/[id]/confirm).
    return successResponse({ employee, redirectUrl: `/onboarding/${employee.id}` }, undefined, 201);
  } catch (error) {
    console.error("POST /recruit/applications/:id/onboard error:", error);
    return internalError();
  }
});
