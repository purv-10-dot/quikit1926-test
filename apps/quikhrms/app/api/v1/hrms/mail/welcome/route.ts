import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendMail } from "@/lib/services/mailer";
import { buildWelcomeEmail } from "@/lib/email-templates/welcome";

const bodySchema = z.object({
  employeeId: z.string().min(1),
  portalUrl: z.string().url().optional(),
});

export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, workEmail: true, personalEmail: true,
        employeeCode: true, jobTitle: true, dateOfJoining: true,
        departmentId: true, reportingManagerId: true,
      },
    });
    if (!employee) return notFound("Employee not found");

    const to = employee.personalEmail || employee.workEmail;
    if (!to) return validationError("Employee email missing");

    const [company, department, manager] = await Promise.all([
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
      employee.departmentId
        ? prisma.department.findFirst({ where: { id: employee.departmentId, orgId }, select: { name: true } })
        : Promise.resolve(null),
      employee.reportingManagerId
        ? prisma.employee.findFirst({
            where: { id: employee.reportingManagerId, orgId },
            select: { firstName: true, lastName: true },
          })
        : Promise.resolve(null),
    ]);

    const { subject, html } = buildWelcomeEmail({
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeCode: employee.employeeCode,
      jobTitle: employee.jobTitle,
      department: department?.name ?? null,
      dateOfJoining: new Date(employee.dateOfJoining).toLocaleDateString("en-IN", {
        day: "2-digit", month: "long", year: "numeric",
      }),
      managerName: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
      companyName: company?.companyName ?? "Our Company",
      portalUrl: parsed.data.portalUrl,
    });

    const result = await sendMail({ to, subject, html });
    if (!result.sent) return internalError(`Mail send failed: ${result.error}`);

    return successResponse({ sent: true, employeeId: employee.id, to });
  } catch (error) {
    console.error("POST /mail/welcome error:", error);
    return internalError();
  }
});
