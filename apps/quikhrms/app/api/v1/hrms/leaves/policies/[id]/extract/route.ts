import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { extractLeavePolicy } from "@/lib/services/leave-policy-extractor";
import { invalidateLeavePolicyCache } from "@/lib/services/leave-policy-engine";
import { uploadToS3, getS3Object, extractKeyFromUrl } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * POST /api/v1/hrms/leaves/policies/[id]/extract
 *
 * Two modes:
 *   1. multipart/form-data with `file` -> upload to storage, then extract.
 *   2. application/json with { fileUrl, fileType, fileName } already stored
 *      -> read from storage and extract.
 *
 * Result is saved on policy.extractedRules and status moves to PendingReview.
 * Approved rules MUST still be set explicitly via the /approve endpoint.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const policy = await prisma.leavePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, sourceFileUrl: true, sourceFileType: true, sourceFileName: true },
    });
    if (!policy) return notFound("Policy not found");

    let buf: Buffer | null = null;
    let mime: string | null = null;
    let fileName: string | null = null;
    let fileUrl: string | null = policy.sourceFileUrl ?? null;

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return validationError("file is required");
      if (file.size > MAX_BYTES) return validationError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
      if (!ALLOWED_MIMES.has(file.type)) return validationError(`Unsupported file type: ${file.type}`);

      buf = Buffer.from(await file.arrayBuffer());
      mime = file.type;
      fileName = file.name;

      const key = `tenants/${orgId}/leave-policies/${policy.id}/${Date.now()}_${fileName}`;
      const uploaded = await uploadToS3({ key, body: buf, contentType: mime });
      fileUrl = uploaded.url;
    } else {
      const body = await req.json().catch(() => ({}));
      const url = body.fileUrl ?? policy.sourceFileUrl;
      const type = body.fileType ?? policy.sourceFileType;
      const name = body.fileName ?? policy.sourceFileName;
      if (!url || !type) return validationError("Either upload `file` or provide stored fileUrl + fileType");

      const proxyMatch = url.match(/\/uploads\/proxy\?.*?key=([^&]+)/i);
      const key: string | null = proxyMatch
        ? decodeURIComponent(proxyMatch[1])
        : extractKeyFromUrl(url);

      if (key) {
        const obj = await getS3Object(key);
        if (obj.body.byteLength > MAX_BYTES) return validationError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
        buf = obj.body;
        mime = type;
      } else {
        const res = await fetch(url);
        if (!res.ok) return validationError(`Failed to fetch fileUrl: HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        if (arr.byteLength > MAX_BYTES) return validationError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
        buf = Buffer.from(arr);
        mime = type;
      }
      fileName = name ?? null;
      fileUrl = url;
    }

    if (!buf || !mime) return validationError("File payload missing");

    const result = await extractLeavePolicy({ buf, mime });

    const updated = await prisma.leavePolicy.update({
      where: { id: policy.id },
      data: {
        sourceFileUrl: fileUrl ?? undefined,
        sourceFileType: mime,
        sourceFileName: fileName ?? undefined,
        extractedRules: result.ok && result.rules ? JSON.parse(JSON.stringify(result.rules)) : undefined,
        extractedAt: result.ok ? new Date() : undefined,
        extractedBy: result.ok ? userId : undefined,
        extractionLog: JSON.parse(JSON.stringify({ provider: result.provider, log: result.log, error: result.error })),
        status: result.ok ? "PendingReview" : "Draft",
        updatedBy: userId,
      },
    });

    await invalidateLeavePolicyCache(orgId);

    if (!result.ok) {
      // Flatten the structured log into one readable line per step so the toast
      // shows the real reason instead of "[object Object]".
      const lines = result.log.map((l) => `${l.step}: ${l.ok ? "ok" : (l.reason ?? "failed")}`);
      return validationError("Extraction failed — please review and edit rules manually", {
        steps: lines,
        error: result.error,
      });
    }

    return successResponse({ policy: updated, extraction: result });
  } catch (error) {
    console.error("POST /leaves/policies/[id]/extract error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.write"] });
