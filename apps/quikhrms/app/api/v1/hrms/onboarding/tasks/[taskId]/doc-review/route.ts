import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { advanceAutomation } from "@/lib/services/onboarding-automation";

// HR reviews a candidate-uploaded document on a Document Upload task and either
// approves or rejects it. The task completes only when every required document
// is approved; a rejection sends it back for re-upload.
interface Upload { url: string; fileName: string; uploadedAt: string; review: string; rejectReason?: string; reviewedAt?: string; reviewedBy?: string; fileType?: string; fileSize?: number; documentId?: string }

type DocCategory = "OfferLetter" | "Policy" | "IdProof" | "Certificate" | "Contract" | "AppointmentLetter" | "ExperienceLetter" | "RelievingLetter" | "NDA" | "Other";
function guessCategory(name: string): DocCategory {
  const t = name.toLowerCase();
  if (t.includes("pan") || t.includes("aadhaar") || t.includes("id ") || t.includes("passport") || t.includes("licen")) return "IdProof";
  if (t.includes("offer")) return "OfferLetter";
  if (t.includes("appointment")) return "AppointmentLetter";
  if (t.includes("experience")) return "ExperienceLetter";
  if (t.includes("relieving")) return "RelievingLetter";
  if (t.includes("nda")) return "NDA";
  if (t.includes("contract")) return "Contract";
  if (t.includes("certificate") || t.includes("degree") || t.includes("marksheet") || t.includes("mark sheet")) return "Certificate";
  if (t.includes("policy")) return "Policy";
  return "Other";
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const task = await prisma.onboardingTask.findFirst({ where: { id: params.taskId, orgId } });
    if (!task) return notFound("Task not found");
    if (task.stepType !== "DocumentUpload") return validationError("This task is not a document-upload step.");

    // Once the onboarding is closed, documents can't be re-reviewed (no
    // re-rejecting an approved doc after the employee was activated).
    const closedInst = await prisma.onboardingInstance.findFirst({
      where: { id: task.instanceId, orgId },
      select: { status: true },
    });
    if (closedInst && (closedInst.status === "OnboardCompleted" || closedInst.status === "OnboardCancelled")) {
      return conflict("This onboarding is already closed — documents can no longer be re-reviewed.");
    }

    const body = await req.json().catch(() => ({}));
    const docName = String(body?.docName ?? "");
    const action = body?.action as "approve" | "reject" | undefined;
    const reason = typeof body?.reason === "string" ? body.reason : undefined;
    if (action !== "approve" && action !== "reject") return validationError("Choose approve or reject.");

    const config = (task.config ?? {}) as Record<string, unknown>;
    const documents = Array.isArray(config.documents) ? (config.documents as string[]).filter(Boolean) : [];
    const uploads = { ...((config.uploads ?? {}) as Record<string, Upload>) };
    if (!uploads[docName]) return validationError("That document hasn't been uploaded yet.");

    uploads[docName] = {
      ...uploads[docName],
      review: action === "approve" ? "approved" : "rejected",
      rejectReason: action === "reject" ? reason : undefined,
      reviewedAt: new Date().toISOString(),
      reviewedBy: userId,
    };

    // On approval, save a copy into the employee's central Documents vault so it
    // shows in their profile / My Vault (only once per uploaded file).
    if (action === "approve" && !uploads[docName].documentId) {
      try {
        const inst = await prisma.onboardingInstance.findFirst({ where: { id: task.instanceId, orgId }, select: { employeeId: true } });
        const u = uploads[docName];
        if (inst?.employeeId && u.url) {
          const doc = await prisma.document.create({
            data: {
              orgId,
              employeeId: inst.employeeId,
              title: docName,
              category: guessCategory(docName),
              fileUrl: u.url,
              fileType: u.fileType ?? "application/octet-stream",
              fileSize: u.fileSize ?? 0,
              status: "Active",
              uploadedBy: userId,
              createdBy: userId,
              updatedBy: userId,
            },
            select: { id: true },
          });
          uploads[docName].documentId = doc.id;
        }
      } catch (e) {
        console.error("save onboarding doc to vault failed:", e);
      }
    }

    const allApproved = documents.length > 0 && documents.every((d) => uploads[d]?.review === "approved");

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        config: JSON.parse(JSON.stringify({ ...config, uploads })),
        ...(allApproved
          ? { status: "TaskCompleted", completedAt: new Date(), completedBy: userId }
          : { status: "TaskInProgress" }),
      },
    });

    // Completing the last task finishes the onboarding.
    if (allApproved) {
      const remaining = await prisma.onboardingTask.count({
        where: { instanceId: task.instanceId, status: { notIn: ["TaskCompleted", "TaskSkipped"] } },
      });
      if (remaining === 0) {
        const instance = await prisma.onboardingInstance.update({
          where: { id: task.instanceId },
          data: { status: "OnboardCompleted", completedAt: new Date(), updatedBy: userId },
        });
        await prisma.employee.update({
          where: { id: instance.employeeId },
          data: { status: "Active", inviteStatus: "Invited", updatedBy: userId },
        }).catch(() => null);
      } else {
        await advanceAutomation(task.instanceId, orgId); // chain: send next step
      }
    }

    return successResponse({ docName, review: uploads[docName].review, allApproved });
  } catch (error) {
    console.error("POST /onboarding/tasks/[taskId]/doc-review error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
