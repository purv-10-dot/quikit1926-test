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
    // Block onboarding ONLY on documents the candidate has UPLOADED that HR
    // hasn't approved yet (Pending review or Rejected). Documents that were
    // requested but never uploaded do NOT block — otherwise an (often
    // auto-created) bundle the candidate never filled would deadlock onboarding.
    // Super-admins can still pass { force: true } to bypass entirely.
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
          uploads: {
            where: { deletedAt: null },
            orderBy: { uploadedAt: "desc" },
            select: { documentTypeId: true, status: true, customLabel: true, fileName: true, documentType: { select: { name: true } } },
          },
        },
      });

      const missing: { bundle: string; name: string; reason: "not_approved" }[] = [];
      for (const r of docRequests) {
        // Latest upload per document (Approved wins; uploads are newest-first).
        const latest = new Map<string, { status: "Pending" | "Approved" | "Rejected"; name: string }>();
        for (const u of r.uploads) {
          const name = u.documentType?.name ?? u.customLabel ?? u.fileName ?? "Document";
          const key = u.documentTypeId ?? name;
          if (!latest.has(key)) latest.set(key, { status: u.status, name });
        }
        for (const { status, name } of latest.values()) {
          if (status !== "Approved") missing.push({ bundle: r.bundle, name, reason: "not_approved" });
        }
      }

      if (missing.length > 0) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Cannot onboard — some uploaded documents are still awaiting your approval.",
          400,
          {
            missing,
            canForce,
            hint: canForce
              ? "Approve the pending uploads, or send { force: true } to override."
              : "Approve the pending uploads, or have a super admin override.",
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
