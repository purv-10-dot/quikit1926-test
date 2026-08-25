import { prisma } from "@/lib/prisma";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { consumePositionOnHire } from "@/lib/services/requisition-positions";

/**
 * Recruiter & Position Tracking flow change (Option B): the Employee row is
 * now created automatically the moment an offer is accepted (candidate or
 * HR-override) instead of via a manual "Onboard" click. The Employee stays
 * in status "PreBoarding" — hidden from the Employees directory and from the
 * Pipeline board's Hired column — until HR clicks "Confirm Employee" at the
 * end of the Onboarding checklist, which flips status to "Active" and is the
 * ONLY thing that makes them visible anywhere.
 *
 * This is the same conversion logic that used to live directly in
 * POST /recruit/applications/:id/onboard, minus the document-approval gate
 * (moved to the Confirm Employee step, since docs are rarely uploaded yet at
 * the exact moment an offer is accepted — gating here would block every hire).
 */
export type ConvertResult =
  | { ok: true; employeeId: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_HIRED_STAGE" | "EMP_EXISTS" | "SEAT_FULL" };

export async function convertApplicationToEmployee(
  orgId: string,
  actorId: string,
  applicationId: string,
): Promise<ConvertResult> {
  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, orgId, deletedAt: null },
    include: { candidate: true, requisition: true },
  });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  if (application.currentStage !== "Hired") return { ok: false, reason: "NOT_HIRED_STAGE" };

  const existingEmp = await prisma.employee.findFirst({
    where: { orgId, workEmail: application.candidate.email, deletedAt: null },
    select: { id: true },
  });
  if (existingEmp) return { ok: false, reason: "EMP_EXISTS" };

  const employeeCode = await generateEmployeeCode(orgId);
  const reqn = application.requisition;

  try {
    const employee = await prisma.$transaction(async (tx) => {
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
          dateOfJoining: application.offerJoiningDate ?? new Date(),
          status: "PreBoarding",
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

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
              createdBy: actorId,
              updatedBy: actorId,
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
          updatedBy: actorId,
        },
      });

      await tx.candidate.update({
        where: { id: application.candidateId },
        data: { status: "Hired", updatedBy: actorId },
      });

      // Atomic seat claim — same race-safe pattern as before, just triggered
      // earlier (at offer-accept instead of at the old manual Onboard click).
      const claim = await tx.jobRequisition.updateMany({
        where: { id: reqn.id, filledPositions: { lt: reqn.positions } },
        data: { filledPositions: { increment: 1 }, updatedBy: actorId },
      });
      if (claim.count === 0) throw new Error("SEAT_FULL");
      const after = await tx.jobRequisition.findUnique({
        where: { id: reqn.id },
        select: { filledPositions: true, positions: true, status: true },
      });
      if (after && after.filledPositions >= after.positions && after.status !== "ReqClosed") {
        await tx.jobRequisition.update({ where: { id: reqn.id }, data: { status: "ReqClosed", updatedBy: actorId } });
      }

      const onboarding = await tx.onboardingInstance.create({
        data: {
          orgId,
          employeeId: emp.id,
          startDate: new Date(),
          status: "NotStarted",
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      // `phase` isn't in the generated Prisma client yet — raw SQL, same
      // transaction so a hire can never be saved without a phase.
      await tx.$executeRaw`
        UPDATE "app_quikhrms"."OnboardingInstance" SET phase = 'PreOnboarding' WHERE id = ${onboarding.id}`;

      return emp;
    });

    // Recruiter & Position Tracking (Phase 1) — consume one Open position
    // allocated to this candidate's assigned recruiter. Attribution only,
    // never blocks the hire (no-ops if unassigned or none left). Not in the
    // generated Prisma client, so fetched via raw SQL.
    const assignedRows = await prisma.$queryRaw<{ assignedRecruiterId: string | null }[]>`
      SELECT "assignedRecruiterId" FROM "app_quikhrms"."JobApplication" WHERE id = ${applicationId}`;
    await consumePositionOnHire(orgId, reqn.id, assignedRows[0]?.assignedRecruiterId ?? null, applicationId, actorId);

    return { ok: true, employeeId: employee.id };
  } catch (error) {
    if (error instanceof Error && error.message === "SEAT_FULL") return { ok: false, reason: "SEAT_FULL" };
    if (error instanceof Error && error.message === "EMP_EXISTS") return { ok: false, reason: "EMP_EXISTS" };
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") return { ok: false, reason: "EMP_EXISTS" };
    throw error;
  }
}
