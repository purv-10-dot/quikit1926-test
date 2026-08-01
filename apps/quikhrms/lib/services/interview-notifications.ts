import { prisma } from "@/lib/prisma";
import { publishNotification } from "@/lib/services/realtime";

type NotifType = "Info" | "Success" | "Warning" | "Error" | "Action";

/**
 * In-app notification for interview events (to the interviewer). Best-effort —
 * never throws, so it can't block scheduling / reschedule / cancel.
 */
async function notify(orgId: string, interviewerId: string, interviewId: string, title: string, message: string, type: NotifType = "Action") {
  if (!interviewerId) return;
  try {
    await prisma.hrmsNotification.create({
      data: {
        orgId, employeeId: interviewerId, type, channel: "InApp",
        title, message, link: "/recruit/interviews",
        entityType: "Interview", entityId: interviewId,
      },
    });
    publishNotification(orgId, [interviewerId], { title, message, type, link: "/recruit/interviews" }).catch(() => {});
  } catch (e) {
    console.error("interview notify error:", e);
  }
}

interface Ctx { interviewId: string; interviewerId: string; candidateName: string; jobTitle: string; whenLabel: string; }

export function notifyInterviewScheduled(orgId: string, c: Ctx) {
  return notify(orgId, c.interviewerId, c.interviewId, "Interview scheduled",
    `You're interviewing ${c.candidateName} for ${c.jobTitle} on ${c.whenLabel}.`, "Action");
}

export function notifyInterviewRescheduled(orgId: string, c: Ctx) {
  return notify(orgId, c.interviewerId, c.interviewId, "Interview rescheduled",
    `Interview with ${c.candidateName} for ${c.jobTitle} is now on ${c.whenLabel}.`, "Warning");
}

export function notifyInterviewCancelled(orgId: string, c: Omit<Ctx, "whenLabel">) {
  return notify(orgId, c.interviewerId, c.interviewId, "Interview cancelled",
    `Interview with ${c.candidateName} for ${c.jobTitle} has been cancelled.`, "Error");
}

export function notifyTakeHomeSubmitted(orgId: string, c: Omit<Ctx, "whenLabel">) {
  return notify(orgId, c.interviewerId, c.interviewId, "Take-home task submitted",
    `${c.candidateName} submitted their take-home task for ${c.jobTitle}. Review it and add your feedback.`, "Action");
}
