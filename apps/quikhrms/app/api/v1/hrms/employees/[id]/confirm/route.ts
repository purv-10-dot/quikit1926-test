import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { inviteImportedEmployees } from "@/lib/services/invitation";
import { successResponse, notFound, validationError, conflict, internalError } from "@/lib/api-response";
import { confirmEmploymentSchema } from "@/lib/validations/provisions";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { queueEmail } from "@/lib/services/mailer";
import { buildConfirmationEmail } from "@/lib/email-templates/confirmation";

/**
 * POST /api/v1/hrms/employees/[id]/confirm
 * Promotes employee from probation → confirmed.
 * - Sets confirmationDate
 * - Logs EmploymentHistory (ConfirmationChange)
 * - Optionally revises designation / CTC
 * - Sends confirmation email
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const tenantSettings = await prisma.companySettings.findUnique({
      where: { orgId }, select: { noticePeriodDays: true },
    }).catch(() => null);
    if (!employee) return notFound("Employee not found");

    if (employee.confirmationDate) {
      return conflict(`Employee already confirmed on ${new Date(employee.confirmationDate).toLocaleDateString()}.`);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = confirmEmploymentSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const confirmDate = new Date(data.confirmationDate);
    if (Number.isNaN(confirmDate.getTime())) return validationError("Invalid confirmation date");

    // Update Employee row
    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        confirmationDate: confirmDate,
        status: employee.status === "PreBoarding" ? "Active" : employee.status,
        ...(data.revisedDesignation ? { jobTitle: data.revisedDesignation } : {}),
        updatedBy: userId,
      },
    });

    // Log EmploymentHistory
    await prisma.employmentHistory.create({
      data: {
        orgId,
        employeeId: employee.id,
        changeType: "ConfirmationChange",
        fromValue: { status: "Probation", confirmationDate: null },
        toValue: {
          status: "Confirmed",
          confirmationDate: confirmDate.toISOString().slice(0, 10),
          ...(data.revisedCTC ? { revisedCTC: data.revisedCTC } : {}),
          ...(data.revisedDesignation ? { revisedDesignation: data.revisedDesignation } : {}),
        },
        effectiveDate: confirmDate,
        reason: "Probation completed — employment confirmed",
        notes: data.notes ?? null,
        approvedBy: userId,
        createdBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Employee", entityId: employee.id,
      changes: { action: "Confirmation", confirmationDate: confirmDate.toISOString(), revisedCTC: data.revisedCTC ?? null, revisedDesignation: data.revisedDesignation ?? null },
    });

    // Drop the cached perms so the PreBoarding lockdown lifts on the very
    // next request (instead of waiting for the 5-min cache TTL).
    await invalidatePermissionCache(orgId, employee.id);

    // Send email
    let emailSent = false;
    let emailError: string | null = null;
    if (data.sendEmail && employee.workEmail) {
      try {
        const company = await prisma.companySettings.findUnique({
          where: { orgId },
          select: { companyName: true },
        });
        const { subject, html } = buildConfirmationEmail({
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeCode: employee.employeeCode,
          jobTitle: employee.jobTitle,
          designation: employee.designation?.title,
          department: employee.department?.name,
          dateOfJoining: employee.dateOfJoining
            ? new Date(employee.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
            : "—",
          confirmationDate: confirmDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          probationMonths: employee.probationEndDate && employee.dateOfJoining
            ? Math.round((new Date(employee.probationEndDate).getTime() - new Date(employee.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : null,
          managerName: employee.reportingManager ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}` : null,
          companyName: company?.companyName ?? "QuikIT HRMS",
          nextReviewDate: data.nextReviewDate ?? null,
          revisedCTC: data.revisedCTC ?? null,
          revisedDesignation: data.revisedDesignation ?? null,
          effectiveDate: confirmDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          probationNoticeDays: 15,
          confirmedNoticePeriodMonths: Math.max(1, Math.round((employee.noticePeriodDays || tenantSettings?.noticePeriodDays || 60) / 30)),
        });
        // emailSent = queued; the email worker handles delivery + retries.
        await queueEmail(orgId, { to: employee.workEmail, subject, html, kind: "employee.confirmation" });
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : "Unknown email error";
      }
    }

    void fireWorkflow({
      orgId,
      event: "employee.confirmed",
      payload: {
        employeeId: employee.id,
        confirmationDate: confirmDate.toISOString(),
        revisedCTC: data.revisedCTC ?? null,
        revisedDesignation: data.revisedDesignation ?? null,
      },
    });

    // ── Activation email ────────────────────────────────────────────
    // This is the moment the employee gets their login credentials. Onboard
    // routes intentionally don't send the email; HR finishes the checklist,
    // then confirming employment triggers the invite. The accept flow sets
    // a password and routes them to /login (no auto sign-in).
    let activationQueued = false;
    let activationError: string | null = null;
    if (!employee.passwordHash) {
      try {
        const r = await inviteImportedEmployees(orgId, userId, [{
          id: employee.id,
          workEmail: employee.workEmail,
          firstName: employee.firstName,
          lastName: employee.lastName,
          roleId: null,
        }]);
        activationQueued = r.queued > 0;
      } catch (e) {
        activationError = e instanceof Error ? e.message : "Could not queue activation email";
        console.error("[confirm-employment] activation invite failed:", e);
      }
    }

    return successResponse({
      employee: updated,
      activationQueued,
      activationError,
      emailSent,
      emailError,
    });
  } catch (error) {
    console.error("POST /employees/[id]/confirm error:", error);
    return internalError();
  }
});
