import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyExitInterviewToken } from "@/lib/services/exit-interview-token";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("offboarding.exit-interview.get", clientIp(req), 40, 60);
  if (rl) return rl;
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
  const rl = await rateLimitOrResponse("offboarding.exit-interview.post", clientIp(req), 12, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await loadInstance(token);
  if (!ctx) return err("INVALID_TOKEN", "This exit-interview link is invalid or has expired.", 400);
  const { instance } = ctx;
  if (instance.exitInterviewDone) return err("ALREADY_SUBMITTED", "This exit interview has already been submitted.", 409);

  // Validate the payload — must be a plain object and not oversized (it's stored
  // as JSON on the instance). Rejects garbage / giant bodies instead of storing
  // them verbatim.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("BAD_INPUT", "Invalid exit-interview submission.", 400);
  }
  if (JSON.stringify(body).length > 20000) {
    return err("TOO_LARGE", "Your responses are too long. Please shorten them.", 413);
  }
  const response = { ...(body as Record<string, unknown>), submittedAt: new Date().toISOString() };

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
