import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyExitInterviewToken } from "@/lib/services/exit-interview-token";

// PUBLIC (token-gated, no login) — the exit-interview form a departing employee
// fills from the emailed link.

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

async function loadInstance(token: string) {
  const payload = verifyExitInterviewToken(token);
  if (!payload) return null;
  const instance = await prisma.offboardingInstance.findFirst({
    where: { id: payload.instanceId, orgId: payload.orgId, deletedAt: null },
  });
  return instance ? { instance, orgId: payload.orgId } : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadInstance(token);
  if (!ctx) return err("INVALID_TOKEN", "This exit-interview link is invalid or has expired.", 400);
  const { instance, orgId } = ctx;

  const [emp, company] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: instance.employeeId, orgId },
      select: { firstName: true, lastName: true, jobTitle: true, dateOfJoining: true, department: { select: { name: true } } },
    }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);

  let existing: unknown = null;
  try { existing = instance.exitInterviewNotes ? JSON.parse(instance.exitInterviewNotes) : null; } catch { existing = null; }

  return ok({
    companyName: company?.companyName ?? "Our Company",
    employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "",
    titleDepartment: [emp?.jobTitle, emp?.department?.name].filter(Boolean).join(" · "),
    startDate: emp?.dateOfJoining ?? null,
    separationDate: instance.lastWorkingDate,
    alreadySubmitted: instance.exitInterviewDone,
    response: existing,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadInstance(token);
  if (!ctx) return err("INVALID_TOKEN", "This exit-interview link is invalid or has expired.", 400);
  const { instance } = ctx;
  if (instance.exitInterviewDone) return err("ALREADY_SUBMITTED", "This exit interview has already been submitted.", 409);

  const body = await req.json().catch(() => ({}));
  const response = { ...(body ?? {}), submittedAt: new Date().toISOString() };

  await prisma.offboardingInstance.update({
    where: { id: instance.id },
    data: {
      exitInterviewNotes: JSON.stringify(response),
      exitInterviewDone: true,
      exitInterviewAt: new Date(),
    },
  });

  return ok({ submitted: true });
}
