import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyDocUploadToken } from "@/lib/services/doc-upload-token";
import { putObject } from "@/lib/storage";
import { contentMatchesClaim } from "@/lib/utils/file-signature";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";

// PUBLIC (token-gated, no login) — the candidate's document-upload page.

const ok = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

const MB = 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type ReviewState = "pending" | "approved" | "rejected";
interface Upload { url: string; fileName: string; uploadedAt: string; review: ReviewState; rejectReason?: string; fileType?: string; fileSize?: number; documentId?: string }

async function load(token: string) {
  const payload = verifyDocUploadToken(token);
  if (!payload) return null;
  const task = await prisma.onboardingTask.findFirst({
    where: { id: payload.taskId, orgId: payload.orgId },
  });
  if (!task || task.stepType !== "DocumentUpload") return null;
  return { task, orgId: payload.orgId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("onboarding.doc-upload.get", clientIp(req), 40, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This upload link is invalid or has expired.", 400);
  const { task, orgId } = ctx;
  const config = (task.config ?? {}) as Record<string, unknown>;
  const documents = Array.isArray(config.documents) ? (config.documents as string[]).filter(Boolean) : [];
  const uploads = (config.uploads ?? {}) as Record<string, Upload>;

  const [instance, company] = await Promise.all([
    prisma.onboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { employeeId: true } }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);
  const emp = instance ? await prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true } }) : null;

  return ok({
    companyName: company?.companyName ?? "Our Company",
    candidateName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "",
    title: task.title,
    documents,
    uploaded: Object.fromEntries(Object.entries(uploads).map(([k, v]) => [k, { fileName: v.fileName, uploadedAt: v.uploadedAt, review: v.review ?? "pending", rejectReason: v.rejectReason ?? null }])),
    completed: task.status === "TaskCompleted",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("onboarding.doc-upload.post", clientIp(req), 10, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This upload link is invalid or has expired.", 400);
  const { task, orgId } = ctx;

  // Frozen once the onboarding is closed.
  const inst = await prisma.onboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { status: true } });
  if (inst && (inst.status === "OnboardCompleted" || inst.status === "OnboardCancelled")) {
    return err("ONBOARDING_CLOSED", "This onboarding is closed.", 409);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const docName = String(form?.get("docName") ?? "");
  if (!file || !(file instanceof File) || file.size === 0) return err("NO_FILE", "Please choose a file.", 400);
  if (!ALLOWED.has(file.type)) return err("BAD_TYPE", `Unsupported file type: ${file.type}`, 400);
  if (file.size > 10 * MB) return err("TOO_BIG", "File exceeds 10MB.", 400);

  const config = (task.config ?? {}) as Record<string, unknown>;
  const documents = Array.isArray(config.documents) ? (config.documents as string[]).filter(Boolean) : [];
  if (!documents.includes(docName)) return err("BAD_DOC", "Unknown document.", 400);

  // Cap total uploads per link — stop unbounded storage writes / abuse.
  const uploadCount = (typeof config.uploadCount === "number" ? config.uploadCount : 0) + 1;
  if (uploadCount > 50) return err("TOO_MANY", "Upload limit reached for this link. Please contact HR.", 429);

  // Content check — reject files whose real bytes don't match the claimed type
  // (e.g. an .html/.svg payload renamed .pdf). Never trust file.type alone.
  const buf = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesClaim(buf, file.type)) {
    return err("BAD_CONTENT", "File content doesn't match its type. Upload a genuine PDF, image, or document.", 400);
  }

  const ext = (path.extname(file.name) || "").replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
  const key = `onboarding/${orgId}/${task.id}/${randomUUID()}${ext}`;
  await putObject(key, buf, file.type);
  const url = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(key)}`;

  const uploads = { ...((config.uploads ?? {}) as Record<string, Upload>) };
  // New / re-uploaded file always goes back to "pending" for HR review — the
  // task never auto-completes on upload; HR approves each document.
  uploads[docName] = { url, fileName: file.name, uploadedAt: new Date().toISOString(), review: "pending", fileType: file.type, fileSize: file.size };

  await prisma.onboardingTask.update({
    where: { id: task.id },
    data: {
      config: JSON.parse(JSON.stringify({ ...config, uploads, uploadCount })),
      status: "TaskInProgress",
    },
  });

  return ok({ uploaded: docName });
}
