import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, internalError, errorResponse } from "@/lib/api-response";
import { ErrorCode } from "@/lib/types/api";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
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
      // Idempotency guard: re-check inside the transaction so two fast clicks
      // can't both pass the earlier check and create duplicate employees. The
      // DB unique index on (orgId, workEmail) is the ultimate backstop (P2002,
      // handled below).
      const dup = await tx.employee.findFirst({
        where: { orgId, workEmail: application.candidate.email, deletedAt: null },
        select: { id: true },
      });
      if (dup) throw new Error("EMP_EXISTS");

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
          // Honour the agreed offer joining date (drives Pre-Onboarding
          // "joining this week/month" counts); fall back to today if unset.
          dateOfJoining: application.offerJoiningDate ?? new Date(),
          status: "PreBoarding",
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // Carry the accepted offer's CTC into the employee's permanent salary, so
      // HR sets it once in Send Offer and doesn't re-enter it. Matches the offer's
      // salary template by name (falls back to any structure). Skipped only if no
      // CTC was offered or the org has no salary structure yet.
      if (application.offeredCTC != null) {
        const comp = (application.offeredComponents ?? {}) as { salaryTemplateName?: string };
        const structure =
          (comp.salaryTemplateName
            ? await tx.salaryStructure.findFirst({
                where: { orgId, deletedAt: null, name: comp.salaryTemplateName },
                select: { id: true },
              })
            : null) ??
          (await tx.salaryStructure.findFirst({
            where: { orgId, deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          }));
        if (structure) {
          await tx.employeeSalary.create({
            data: {
              orgId,
              employeeId: emp.id,
              structureId: structure.id,
              ctc: Number(application.offeredCTC),
              effectiveFrom: new Date(),
              isActive: true,
              createdBy: userId,
              updatedBy: userId,
            },
          });
        }
      }

      await tx.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "AppHired",
          currentStage: "Hired",
          ...(application.status !== "AppHired" && { hiredAt: new Date() }),
          updatedBy: userId,
        },
      });

      await tx.candidate.update({
        where: { id: application.candidateId },
        data: { status: "Hired", updatedBy: userId },
      });

      // Atomic seat claim — increment ONLY if a seat is still free. Two
      // simultaneous onboards on the last seat can't both succeed: the second
      // UPDATE's WHERE re-evaluates against the committed row and matches 0 rows.
      const claim = await tx.jobRequisition.updateMany({
        where: { id: reqn.id, filledPositions: { lt: reqn.positions } },
        data: { filledPositions: { increment: 1 }, updatedBy: userId },
      });
      if (claim.count === 0) throw new Error("SEAT_FULL");
      // Close the requisition once it's fully filled.
      const after = await tx.jobRequisition.findUnique({
        where: { id: reqn.id },
        select: { filledPositions: true, positions: true, status: true },
      });
      if (after && after.filledPositions >= after.positions && after.status !== "ReqClosed") {
        await tx.jobRequisition.update({ where: { id: reqn.id }, data: { status: "ReqClosed", updatedBy: userId } });
      }

      // Create an empty onboarding instance — no system-default checklist. Tasks
      // are added from a template or manually on the onboarding page.
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
      // New hires start in the PRE-ONBOARDING phase (pre-joining: BGV, docs,
      // credentials, facilities). `phase` is a raw-SQL column (not in the
      // generated Prisma Client), so it must be written via $executeRaw — never
      // in the create() above. Set inside the same transaction so a hire can
      // never be saved without a phase and vanish from the list.
      await tx.$executeRaw`
        UPDATE "app_quikhrms"."OnboardingInstance" SET phase = 'PreOnboarding' WHERE id = ${onboarding.id}`;
      void onboarding; void startDate;

      return emp;
    });

    // Copy the candidate's approved recruitment documents into the new
    // employee's central Documents vault (best-effort — never block onboarding).
    try {
      const reqs = await prisma.candidateDocumentRequest.findMany({
        where: { orgId, applicationId: application.id, deletedAt: null, status: { not: "Cancelled" } },
        select: {
          uploads: {
            where: { deletedAt: null, status: "Approved" },
            select: { fileUrl: true, fileName: true, fileSize: true, customLabel: true, documentType: { select: { name: true } } },
          },
        },
      });
      const uploads = reqs.flatMap((r) => r.uploads);
      if (uploads.length) {
        await prisma.document.createMany({
          data: uploads.map((u) => ({
            orgId,
            employeeId: employee.id,
            title: u.documentType?.name ?? u.customLabel ?? u.fileName ?? "Recruitment document",
            category: "Other" as const,
            fileUrl: u.fileUrl,
            fileType: "application/octet-stream",
            fileSize: u.fileSize ?? 0,
            status: "Active" as const,
            uploadedBy: userId,
            createdBy: userId,
            updatedBy: userId,
          })),
        });
      }
    } catch (e) {
      console.error("copy recruitment docs to vault failed:", e);
    }

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
    if (error instanceof Error && error.message === "SEAT_FULL") {
      return conflict("All positions for this requisition are already filled.");
    }
    // In-tx dedup guard, or the (orgId, workEmail) unique index tripping on a
    // concurrent double-click → return the same friendly conflict, not a 500.
    if (error instanceof Error && error.message === "EMP_EXISTS") {
      return conflict("Employee already exists for this candidate email");
    }
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
      return conflict("Employee already exists for this candidate email");
    }
    console.error("POST /recruit/applications/:id/onboard error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
