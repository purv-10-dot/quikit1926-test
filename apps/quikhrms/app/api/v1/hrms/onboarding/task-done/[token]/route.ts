import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTaskActionToken } from "@/lib/services/task-action-token";
import { advanceAutomation } from "@/lib/services/onboarding-automation";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";

// PUBLIC (token-gated, no login) — lets an assignee mark their onboarding task
// complete straight from the email link. The token carries who it was sent to,
// so we record completedBy without a session.

const ok = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

async function load(token: string) {
  const payload = verifyTaskActionToken(token);
  if (!payload) return null;
  const task = await prisma.onboardingTask.findFirst({ where: { id: payload.taskId, orgId: payload.orgId } });
  if (!task) return null;
  return { task, orgId: payload.orgId, employeeId: payload.employeeId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("onboarding.task-done.get", clientIp(req), 40, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { task, orgId, employeeId } = ctx;

  const [instance, company, assignee] = await Promise.all([
    prisma.onboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { employeeId: true } }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { firstName: true, lastName: true } }),
  ]);
  const hire = instance ? await prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true } }) : null;

  return ok({
    companyName: company?.companyName ?? "Our Company",
    assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : "",
    newHireName: hire ? `${hire.firstName} ${hire.lastName}`.trim() : "the new hire",
    taskTitle: task.title,
    completed: task.status === "TaskCompleted",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("onboarding.task-done.post", clientIp(req), 12, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { task, employeeId } = ctx;

  // Frozen once the onboarding is closed — no completing tasks on a closed instance.
  const inst = await prisma.onboardingInstance.findFirst({ where: { id: task.instanceId, orgId: ctx.orgId }, select: { status: true } });
  if (inst && (inst.status === "OnboardCompleted" || inst.status === "OnboardCancelled")) {
    return err("ONBOARDING_CLOSED", "This onboarding is closed.", 409);
  }

  if (task.status !== "TaskCompleted") {
    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: { status: "TaskCompleted", completedAt: new Date(), completedBy: employeeId },
    });
    await advanceAutomation(task.instanceId, ctx.orgId); // chain: send next step
  }
  return ok({ completed: true });
}
