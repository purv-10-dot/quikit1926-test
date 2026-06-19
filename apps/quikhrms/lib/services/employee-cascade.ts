import { prisma } from "@/lib/prisma";

/**
 * Soft-delete (or restore) all related records for an employee.
 *
 * KEEP (audit/legal/financial) — never touched:
 *   Payslip, PayRunApproval, AttendanceRecord, ExpenseClaim,
 *   EmployeeLoan, LoanRepayment, EmploymentHistory, AssetAssignment
 *
 * SOFT DELETE: EmployeeSalary, LeaveRequest, LeaveBalance, WfhRequest,
 *   Tasks, Document, OnboardingInstance, OffboardingInstance, Goal,
 *   PIP, EmployeeAppraisal, ShiftAssignment, ManagerFeedback,
 *   EmployeeProvision, TimeLog, Timesheet, Notification (read mark only)
 *
 * Direct reports (other employees with this person as manager) → null out.
 */

export async function cascadeSoftDeleteEmployee(
  orgId: string,
  employeeId: string,
  userId: string,
): Promise<{ tables: Record<string, number> }> {
  const now = new Date();
  const counts: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    // 1. Soft-delete employee itself
    await tx.employee.update({
      where: { id: employeeId },
      data: { deletedAt: now, updatedBy: userId },
    });
    counts.employee = 1;

    // 2. Null out direct reports (reportingManager + dottedLineManager)
    const directReports = await tx.employee.updateMany({
      where: { orgId, deletedAt: null, reportingManagerId: employeeId },
      data: { reportingManagerId: null, updatedBy: userId },
    });
    counts.directReportsNulled = directReports.count;

    const dottedReports = await tx.employee.updateMany({
      where: { orgId, deletedAt: null, dottedLineManagerId: employeeId },
      data: { dottedLineManagerId: null, updatedBy: userId },
    });
    counts.dottedReportsNulled = dottedReports.count;

    // 3. Soft-delete related records (only those with deletedAt + orgId + employeeId)
    const softDeleteTargets: Array<{
      name: string;
      run: () => Promise<{ count: number }>;
    }> = [
      { name: "employeeSalary", run: () => tx.employeeSalary.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now, isActive: false } }) },
      { name: "leaveRequest", run: () => tx.leaveRequest.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "leaveBalance", run: () => tx.leaveBalance.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "wfhRequest", run: () => tx.wfhRequest.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "task", run: () => tx.task.updateMany({ where: { orgId, assigneeId: employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "document", run: () => tx.document.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "onboardingInstance", run: () => tx.onboardingInstance.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "offboardingInstance", run: () => tx.offboardingInstance.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "goal", run: () => tx.hrmsGoal.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "pIP", run: () => tx.pIP.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "employeeAppraisal", run: () => tx.employeeAppraisal.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "shiftAssignment", run: () => tx.shiftAssignment.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "employeeProvision", run: () => tx.employeeProvision.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "timeLog", run: () => tx.timeLog.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
      { name: "timesheet", run: () => tx.timesheet.updateMany({ where: { orgId, employeeId, deletedAt: null }, data: { deletedAt: now } }) },
    ];

    for (const t of softDeleteTargets) {
      try {
        const r = await t.run();
        counts[t.name] = r.count;
      } catch (err) {
        // Log but don't fail entire delete — some models may not have employeeId or deletedAt fields.
        console.warn(`[cascade-delete] ${t.name} skipped: ${(err as Error).message}`);
        counts[t.name] = 0;
      }
    }
  });

  return { tables: counts };
}

/**
 * HARD-DELETE employee + every related row across the schema.
 * Irreversible. Used for full purge (e.g. wrong onboarding data).
 *
 * Order:
 *   1. Null FK refs that point AT this employee from other tables (Department.headId, Team.leadId, Employee.reportingManagerId/dottedLineManagerId/referredById)
 *   2. Delete child rows scoped by employeeId / FK columns (best-effort per table)
 *   3. Delete Employee row
 */
export async function cascadeHardDeleteEmployee(
  orgId: string,
  employeeId: string,
): Promise<{ tables: Record<string, number> }> {
  const counts: Record<string, number> = {};

  // Best-effort per table — a missing field/relation must not abort the purge.
  // NOTE: this is intentionally NOT one big interactive transaction. On a
  // network-latency DB (Neon), 50 sequential round-trips is slow; instead we
  // fire each dependency phase in parallel. Deletes are idempotent, so a rare
  // partial failure is fixed by re-running the delete.
  const run = (name: string, p: Promise<{ count: number }>) =>
    p.then((r) => { counts[name] = r.count; })
      .catch((err) => { console.warn(`[hard-cascade] ${name} skipped: ${(err as Error).message}`); counts[name] = 0; });

  // ── Phase 0: null FK refs pointing AT this employee (parallel) ──
  await Promise.all([
    prisma.department.updateMany({ where: { orgId, headId: employeeId }, data: { headId: null } }),
    prisma.hrmsTeam.updateMany({ where: { orgId, leadId: employeeId }, data: { leadId: null } }),
    prisma.employee.updateMany({ where: { orgId, reportingManagerId: employeeId }, data: { reportingManagerId: null } }),
    prisma.employee.updateMany({ where: { orgId, dottedLineManagerId: employeeId }, data: { dottedLineManagerId: null } }),
    prisma.employee.updateMany({ where: { orgId, referredById: employeeId }, data: { referredById: null } }),
    prisma.candidate.updateMany({ where: { orgId, referredById: employeeId }, data: { referredById: null } }),
  ].map((p) => p.catch((err) => { console.warn(`[hard-cascade] null-ref skipped: ${(err as Error).message}`); })));

  // ── Phase 1: child rows that must precede their parents (parallel) ──
  await Promise.all([
    run("payslipLine",          prisma.payslipLine.deleteMany({ where: { payslip: { orgId, employeeId } } })),
    run("loanRepayment",        prisma.loanRepayment.deleteMany({ where: { orgId, loan: { employeeId } } })),
    run("keyResult",            prisma.keyResult.deleteMany({ where: { goal: { orgId, employeeId } } })),
    run("goalCheckIn",          prisma.goalCheckIn.deleteMany({ where: { updatedById: employeeId } })),
    run("offboardingTask",      prisma.offboardingTask.deleteMany({ where: { instance: { orgId, employeeId } } })),
    run("ticketActivity",       prisma.ticketActivity.deleteMany({ where: { orgId, actorId: employeeId } })),
    run("ticketComment",        prisma.ticketComment.deleteMany({ where: { orgId, userId: employeeId } })),
    // Scorecard data lives on the Interview row now; it's removed when the
    // interviewer's interviews are deleted in Phase 2 below.
    run("requisitionApproval",  prisma.requisitionApproval.deleteMany({ where: { orgId, approverId: employeeId } })),
    run("documentAcknowledgment", prisma.documentAcknowledgment.deleteMany({ where: { employeeId } })),
    run("documentShare",        prisma.documentShare.deleteMany({ where: { orgId, sharedWith: employeeId } })),
    run("taskActivity",         prisma.taskActivity.deleteMany({ where: { authorId: employeeId } })),
    run("expenseApproval",      prisma.expenseApproval.deleteMany({ where: { orgId, approverId: employeeId } })),
    run("leaveApproval",        prisma.leaveApproval.deleteMany({ where: { orgId, approverId: employeeId } })),
    run("wfhApproval",          prisma.wfhApproval.deleteMany({ where: { orgId, approverId: employeeId } })),
  ]);

  // ── Phase 2: parents + independent tables (parallel) ──
  await Promise.all([
    run("payslip",              prisma.payslip.deleteMany({ where: { orgId, employeeId } })),
    run("employeeLoan",         prisma.employeeLoan.deleteMany({ where: { orgId, employeeId } })),
    run("goal",                 prisma.hrmsGoal.deleteMany({ where: { orgId, employeeId } })),
    run("offboardingInstance",  prisma.offboardingInstance.deleteMany({ where: { orgId, employeeId } })),
    run("ticket",               prisma.ticket.deleteMany({ where: { orgId, OR: [{ raisedById: employeeId }, { assignedToId: employeeId }] } })),
    run("interview",            prisma.interview.deleteMany({ where: { orgId, interviewerId: employeeId } })),
    run("jobRequisition",       prisma.jobRequisition.deleteMany({ where: { orgId, OR: [{ createdById: employeeId }, { hiringManagerId: employeeId }, { recruiterId: employeeId }, { raisedById: employeeId }] } })),
    run("document",             prisma.document.deleteMany({ where: { orgId, employeeId } })),
    run("task",                 prisma.task.deleteMany({ where: { orgId, assigneeId: employeeId } })),
    run("expenseClaim",         prisma.expenseClaim.deleteMany({ where: { orgId, employeeId } })),
    run("leaveRequest",         prisma.leaveRequest.deleteMany({ where: { orgId, employeeId } })),
    run("wfhRequest",           prisma.wfhRequest.deleteMany({ where: { orgId, employeeId } })),
    run("attendanceRecord",     prisma.attendanceRecord.deleteMany({ where: { orgId, employeeId } })),
    run("shiftAssignment",      prisma.shiftAssignment.deleteMany({ where: { orgId, employeeId } })),
    run("leaveBalance",         prisma.leaveBalance.deleteMany({ where: { orgId, employeeId } })),
    run("employeeAppraisal",    prisma.employeeAppraisal.deleteMany({ where: { orgId, employeeId } })),
    run("continuousFeedback",   prisma.continuousFeedback.deleteMany({ where: { orgId, OR: [{ fromEmployeeId: employeeId }, { toEmployeeId: employeeId }] } })),
    run("pIP",                  prisma.pIP.deleteMany({ where: { orgId, OR: [{ employeeId }, { initiatedById: employeeId }] } })),
    run("postComment",          prisma.postComment.deleteMany({ where: { orgId, employeeId } })),
    run("socialPost",           prisma.socialPost.deleteMany({ where: { orgId, employeeId } })),
    run("announcement",         prisma.announcement.deleteMany({ where: { orgId, authorId: employeeId } })),
    run("surveyResponse",       prisma.hrmsSurveyResponse.deleteMany({ where: { orgId, employeeId } })),
    run("recognition",          prisma.recognition.deleteMany({ where: { orgId, OR: [{ fromEmployeeId: employeeId }, { toEmployeeId: employeeId }] } })),
    run("notification",         prisma.hrmsNotification.deleteMany({ where: { orgId, employeeId } })),
    run("donation",             prisma.donation.deleteMany({ where: { orgId, employeeId } })),
    run("reimbursementClaim",   prisma.reimbursementClaim.deleteMany({ where: { orgId, employeeId } })),
    run("investmentProof",      prisma.investmentProof.deleteMany({ where: { orgId, employeeId } })),
    run("salaryRevision",       prisma.salaryRevision.deleteMany({ where: { orgId, employeeId } })),
    run("oneTimeEarning",       prisma.oneTimeEarning.deleteMany({ where: { orgId, employeeId } })),
    run("form12BBDeclaration",  prisma.form12BBDeclaration.deleteMany({ where: { orgId, employeeId } })),
    run("gratuityRecord",       prisma.gratuityRecord.deleteMany({ where: { orgId, employeeId } })),
    run("fullAndFinalSettlement", prisma.fullAndFinalSettlement.deleteMany({ where: { orgId, employeeId } })),
    run("employeeSalary",       prisma.employeeSalary.deleteMany({ where: { orgId, employeeId } })),
    run("assetAssignment",      prisma.assetAssignment.deleteMany({ where: { orgId, employeeId } })),
    run("onboardingInstance",   prisma.onboardingInstance.deleteMany({ where: { orgId, employeeId } })),
    run("employeeProvision",    prisma.employeeProvision.deleteMany({ where: { orgId, employeeId } })),
    run("timeLog",              prisma.timeLog.deleteMany({ where: { orgId, employeeId } })),
    run("timesheet",            prisma.timesheet.deleteMany({ where: { orgId, employeeId } })),
    run("delegation",           prisma.delegation.deleteMany({ where: { orgId, OR: [{ delegatorId: employeeId }, { delegateeId: employeeId }] } })),
    run("employmentHistory",    prisma.employmentHistory.deleteMany({ where: { orgId, employeeId } })),
  ]);

  // ── Phase 3: the employee row itself ──
  await prisma.employee.delete({ where: { id: employeeId } });
  counts.employee = 1;

  return { tables: counts };
}

/**
 * Restore a soft-deleted employee + all related records that were deleted at the SAME timestamp.
 * Direct reports are NOT auto-reassigned (manual reassignment needed).
 */
export async function restoreEmployee(
  orgId: string,
  employeeId: string,
  userId: string,
): Promise<{ tables: Record<string, number> }> {
  const counts: Record<string, number> = {};

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: { not: null } },
    select: { deletedAt: true },
  });
  if (!employee?.deletedAt) {
    throw new Error("Employee not found or not deleted");
  }
  // Restore window: ±2 seconds around the original delete timestamp
  const lo = new Date(employee.deletedAt.getTime() - 2000);
  const hi = new Date(employee.deletedAt.getTime() + 2000);

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: { deletedAt: null, updatedBy: userId },
    });
    counts.employee = 1;

    const restoreTargets: Array<{
      name: string;
      run: () => Promise<{ count: number }>;
    }> = [
      { name: "employeeSalary", run: () => tx.employeeSalary.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null, isActive: true } }) },
      { name: "leaveRequest", run: () => tx.leaveRequest.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "leaveBalance", run: () => tx.leaveBalance.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "wfhRequest", run: () => tx.wfhRequest.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "task", run: () => tx.task.updateMany({ where: { orgId, assigneeId: employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "document", run: () => tx.document.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "onboardingInstance", run: () => tx.onboardingInstance.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "offboardingInstance", run: () => tx.offboardingInstance.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "goal", run: () => tx.hrmsGoal.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "pIP", run: () => tx.pIP.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "employeeAppraisal", run: () => tx.employeeAppraisal.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "shiftAssignment", run: () => tx.shiftAssignment.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "employeeProvision", run: () => tx.employeeProvision.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "timeLog", run: () => tx.timeLog.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
      { name: "timesheet", run: () => tx.timesheet.updateMany({ where: { orgId, employeeId, deletedAt: { gte: lo, lte: hi } }, data: { deletedAt: null } }) },
    ];

    for (const t of restoreTargets) {
      try {
        const r = await t.run();
        counts[t.name] = r.count;
      } catch (err) {
        console.warn(`[restore-employee] ${t.name} skipped: ${(err as Error).message}`);
        counts[t.name] = 0;
      }
    }
  });

  return { tables: counts };
}
