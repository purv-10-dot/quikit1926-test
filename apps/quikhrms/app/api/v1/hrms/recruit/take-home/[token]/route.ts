import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyTakeHomeToken } from "@/lib/services/take-home-token";
import { putObject, getObject, extractKeyFromUrl } from "@/lib/storage";
import { contentMatchesClaim } from "@/lib/utils/file-signature";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";
import { stageNames } from "@/lib/services/pipeline-stages";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildTakeHomeSubmittedEmail } from "@/lib/email-templates/take-home-submitted";
import { notifyTakeHomeSubmitted } from "@/lib/services/interview-notifications";
import { appBaseUrl } from "@/lib/utils/app-url";

// PUBLIC (token-gated, no login) — the candidate's take-home task page + submit.
// The Interview take-home/submission columns exist in the DB but the generated
// Prisma client is not regenerated, so every read/write of them uses raw SQL.

const ok = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

const MB = 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip", "application/x-zip-compressed",
  // AutoCAD .dwg — browsers report this inconsistently (often a generic/empty
  // type), so several variants are allow-listed here; contentMatchesClaim's
  // magic-byte check (not this MIME check) is the real gate against spoofing.
  "application/acad", "application/x-dwg", "application/x-autocad", "image/vnd.dwg", "application/dwg", "application/octet-stream",
]);

interface Row {
  id: string;
  orgId: string;
  applicationId: string;
  interviewerId: string;
  round: number;
  type: string;
  takeHomeInstructions: string | null;
  takeHomeAttachmentUrl: string | null;
  takeHomeAttachmentLink: string | null;
  takeHomeDueDate: Date | null;
  submissionToken: string | null;
  submissionUrl: string | null;
  submissionFileName: string | null;
  submissionNote: string | null;
  submittedAt: Date | null;
}

async function load(token: string): Promise<{ iv: Row; orgId: string } | null> {
  const payload = verifyTakeHomeToken(token);
  if (!payload) return null;
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, "orgId", "applicationId", "interviewerId", round, type::text AS type,
           "takeHomeInstructions", "takeHomeAttachmentUrl", "takeHomeAttachmentLink", "takeHomeDueDate",
           "submissionToken", "submissionUrl", "submissionFileName",
           "submissionNote", "submittedAt"
    FROM "app_quikhrms"."Interview"
    WHERE id = ${payload.interviewId} AND "orgId" = ${payload.orgId} AND "deletedAt" IS NULL
    LIMIT 1`;
  const iv = rows[0];
  // Reject if the row was re-assigned (token rotated) or isn't a take-home.
  if (!iv || iv.type !== "TakeHome" || iv.submissionToken !== token) return null;
  return { iv, orgId: payload.orgId };
}

async function roundName(orgId: string, applicationId: string, round: number): Promise<string> {
  const app = await prisma.jobApplication.findFirst({
    where: { id: applicationId, orgId },
    select: { requisition: { select: { pipelineId: true } } },
  });
  const pipeline = await prisma.hiringPipeline.findFirst({
    where: {
      orgId, deletedAt: null,
      ...(app?.requisition?.pipelineId ? { id: app.requisition.pipelineId } : { isDefault: true }),
    },
    select: { stages: true },
  });
  const names = stageNames(pipeline?.stages);
  return (names[round - 1] ?? `Round ${round}`).replace(/([A-Z])/g, " $1").trim();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.take-home.get", clientIp(req), 40, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { iv, orgId } = ctx;

  // Stream the attached spec file (public, but only THIS interview's attachment
  // and only within its tenant) when `?attachment=1` is requested.
  if (req.nextUrl.searchParams.get("attachment")) {
    const key = iv.takeHomeAttachmentUrl ? extractKeyFromUrl(iv.takeHomeAttachmentUrl) : null;
    if (!key || key.split("/")[1] !== orgId) return err("NOT_FOUND", "No attachment.", 404);
    try {
      const obj = await getObject(key);
      const filename = (key.split("/").pop() || "spec").replace(/["\\\r\n]/g, "");
      return new NextResponse(new Uint8Array(obj.body), {
        status: 200,
        headers: {
          "Content-Type": obj.contentType,
          "Content-Length": String(obj.length),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return err("NOT_FOUND", "Attachment not found.", 404);
    }
  }

  const [app, company] = await Promise.all([
    prisma.jobApplication.findFirst({
      where: { id: iv.applicationId, orgId },
      select: {
        candidate: { select: { firstName: true, lastName: true } },
        requisition: { select: { title: true } },
      },
    }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);

  return ok({
    companyName: company?.companyName ?? "Our Company",
    candidateName: app?.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : "",
    jobTitle: app?.requisition?.title ?? "the role",
    roundName: await roundName(orgId, iv.applicationId, iv.round),
    instructions: iv.takeHomeInstructions ?? "",
    hasAttachment: !!iv.takeHomeAttachmentUrl,
    attachmentLink: iv.takeHomeAttachmentLink,
    dueDate: iv.takeHomeDueDate ? new Date(iv.takeHomeDueDate).toISOString().slice(0, 10) : null,
    submission: iv.submittedAt
      ? {
          url: iv.submissionUrl,
          fileName: iv.submissionFileName,
          note: iv.submissionNote,
          submittedAt: iv.submittedAt,
        }
      : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.take-home.post", clientIp(req), 10, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await load(token);
  if (!ctx) return err("INVALID_TOKEN", "This link is invalid or has expired.", 400);
  const { iv, orgId } = ctx;

  const contentType = req.headers.get("content-type") ?? "";
  let file: File | null = null;
  let link = "";
  let note = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const f = form?.get("file");
    if (f instanceof File && f.size > 0) file = f;
    link = String(form?.get("link") ?? "").trim();
    note = String(form?.get("note") ?? "").trim();
  } else {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    link = String((body as Record<string, unknown>).link ?? "").trim();
    note = String((body as Record<string, unknown>).note ?? "").trim();
  }

  if (!file && !link) return err("NOTHING_SUBMITTED", "Attach a file or paste a link (at least one is required).", 400);
  if (note.length > 5000) return err("NOTE_TOO_LONG", "Note is too long.", 400);

  let submissionUrl: string;
  let submissionFileName: string | null = null;

  if (file) {
    const claim = file.type === "application/x-zip-compressed" ? "application/zip" : file.type;
    if (!ALLOWED.has(file.type)) return err("BAD_TYPE", `Unsupported file type: ${file.type}`, 400);
    // Vercel's serverless functions hard-reject any request body over ~4.5MB
    // before this route runs (HTML error page, not JSON) — same reasoning as
    // uploads/route.ts and onboarding/doc-upload/[token]/route.ts.
    if (file.size > 4 * MB) return err("TOO_BIG", "File exceeds 4MB.", 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (!contentMatchesClaim(buf, claim)) {
      return err("BAD_CONTENT", "File content doesn't match its type. Upload a genuine PDF, image, document, or zip.", 400);
    }
    const ext = (path.extname(file.name) || "").replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const key = `take-home/${orgId}/${iv.id}/${randomUUID()}${ext}`;
    await putObject(key, buf, file.type);
    submissionUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(key)}`;
    submissionFileName = file.name;
  } else {
    if (!/^https?:\/\//i.test(link) || link.length > 2000) {
      return err("BAD_LINK", "Enter a valid http(s) link.", 400);
    }
    submissionUrl = link;
  }

  // No InterviewStatus enum value represents "submitted", so status is left
  // untouched — the reviewer scores via the existing scorecard flow.
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."Interview"
    SET "submissionUrl" = ${submissionUrl},
        "submissionFileName" = ${submissionFileName},
        "submissionNote" = ${note || null},
        "submittedAt" = now()
    WHERE id = ${iv.id} AND "orgId" = ${orgId}`;

  // Notify the interviewer (email + in-app) — best-effort, never blocks the
  // candidate's submit response.
  void (async () => {
    try {
      const [interviewer, app, company] = await Promise.all([
        prisma.employee.findFirst({
          where: { id: iv.interviewerId, orgId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, workEmail: true },
        }),
        prisma.jobApplication.findFirst({
          where: { id: iv.applicationId, orgId },
          select: { candidate: { select: { firstName: true, lastName: true } }, requisition: { select: { title: true } } },
        }),
        prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
      ]);
      if (!interviewer) return;
      const candidateName = app?.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : "The candidate";
      const jobTitle = app?.requisition?.title ?? "the role";
      const companyName = company?.companyName ?? "Our Company";
      const base = appBaseUrl();
      const reviewUrl = base ? `${base}/recruit/interviews/${iv.id}` : "";

      if (interviewer.workEmail) {
        const emailData = {
          interviewerName: `${interviewer.firstName} ${interviewer.lastName}`.trim(),
          candidateName, jobTitle, companyName,
          roundName: await roundName(orgId, iv.applicationId, iv.round),
          submittedAt: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
          hasFile: !!submissionFileName,
          hasLink: !submissionFileName,
          reviewUrl,
        };
        await resolveAndSend(orgId, {
          key: "recruit.take-home-submitted",
          to: interviewer.workEmail,
          vars: { ...emailData, roundName: emailData.roundName ?? "" },
          fallback: () => buildTakeHomeSubmittedEmail(emailData),
        });
      }
      await notifyTakeHomeSubmitted(orgId, { interviewId: iv.id, interviewerId: interviewer.id, candidateName, jobTitle });
    } catch (e) {
      console.error("[take-home] submit notify failed:", e);
    }
  })();

  return ok({ submitted: true });
}
