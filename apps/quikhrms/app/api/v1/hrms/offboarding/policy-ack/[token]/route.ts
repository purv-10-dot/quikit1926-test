import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyDocUploadToken } from "@/lib/services/doc-upload-token";
import { getObject } from "@/lib/storage";
import { advanceAutomation, finalizeOffboardingIfComplete } from "@/lib/services/offboarding-automation";

// PUBLIC (token-gated, no login) — the exiting employee's "read & acknowledge"
// page for a Policy Re-acknowledge offboarding step. Mirrors the onboarding one,
// but the offboarding task's config lives in a raw column.

const ok = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

interface PolicyFile { url: string; key?: string; fileName: string }
interface Ack { acknowledgedAt: string; name?: string }
interface Row { id: string; instanceId: string; title: string; status: string; stepType: string | null; config: Record<string, unknown> | null }

function fileKey(f: PolicyFile): string | null {
  if (f.key) return f.key;
  const m = f.url.match(/[?&]key=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function load(token: string): Promise<{ task: Row; orgId: string } | null> {
  const payload = verifyDocUploadToken(token);
  if (!payload) return null;
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, "instanceId", title, status, "stepType", config FROM "app_quikhrms"."OffboardingTask"
    WHERE id = ${payload.taskId} AND "orgId" = ${payload.orgId} LIMIT 1`;
  const task = rows[0];
  if (!task || task.stepType !== "ReadPolicy") return null;
  return { task, orgId: payload.orgId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { task, orgId } = ctx;
  const config = (task.config ?? {}) as Record<string, unknown>;
  const files = Array.isArray(config.files) ? (config.files as PolicyFile[]).filter((f) => f && f.url) : [];

  const raw = req.nextUrl.searchParams.get("raw");
  if (raw) {
    const allowed = files.some((f) => fileKey(f) === raw);
    if (!allowed || raw.split("/")[1] !== orgId) return err("FORBIDDEN", "Not allowed", 403);
    try {
      const obj = await getObject(raw);
      return new NextResponse(new Uint8Array(obj.body), { status: 200, headers: { "Content-Type": obj.contentType, "Content-Length": String(obj.length), "Cache-Control": "private, max-age=3600" } });
    } catch {
      return err("NOT_FOUND", "File not found", 404);
    }
  }

  const acks = (config.acks ?? {}) as Record<string, Ack>;
  const [instance, company] = await Promise.all([
    prisma.offboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { employeeId: true } }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);
  const emp = instance ? await prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true } }) : null;

  return ok({
    companyName: company?.companyName ?? "Our Company",
    candidateName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "",
    title: task.title ?? "Acknowledgement",
    files: files.map((f) => ({ url: f.url, key: fileKey(f), fileName: f.fileName, acknowledgedAt: acks[f.url]?.acknowledgedAt ?? null })),
    completed: task.status === "TaskCompleted",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { task, orgId } = ctx;

  const body = await req.json().catch(() => ({}));
  const url = String(body?.url ?? "");
  const config = (task.config ?? {}) as Record<string, unknown>;
  const files = Array.isArray(config.files) ? (config.files as PolicyFile[]).filter((f) => f && f.url) : [];
  if (!files.some((f) => f.url === url)) return err("BAD_FILE", "Unknown file.", 400);

  const emp = await prisma.offboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { employeeId: true } })
    .then((i) => (i ? prisma.employee.findFirst({ where: { id: i.employeeId, orgId }, select: { firstName: true, lastName: true } }) : null));
  const name = emp ? `${emp.firstName} ${emp.lastName}`.trim() : undefined;

  const acks = { ...((config.acks ?? {}) as Record<string, Ack>) };
  acks[url] = { acknowledgedAt: new Date().toISOString(), name };
  const allAcked = files.length > 0 && files.every((f) => acks[f.url]);

  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."OffboardingTask" SET config = ${JSON.stringify({ ...config, acks })}::jsonb WHERE id = ${task.id}`;
  if (allAcked) {
    await prisma.offboardingTask.update({ where: { id: task.id }, data: { status: "TaskCompleted", completedAt: new Date() } });
    // Shared finalization; if it didn't close the offboarding, chain automation.
    const finalized = await finalizeOffboardingIfComplete(task.instanceId, orgId);
    if (!finalized) await advanceAutomation(task.instanceId, orgId);
  } else {
    await prisma.offboardingTask.update({ where: { id: task.id }, data: { status: "TaskInProgress" } });
  }

  return ok({ acknowledged: url, allAcked });
}
