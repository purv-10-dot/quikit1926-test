import { emailShell, hero, para, btnPrimary, esc } from "./_base";

export interface TaskAssignedActionEmailData {
  assigneeName: string;
  companyName: string;
  newHireName: string;
  taskTitle: string;
  detail?: string; // e.g. "Laptop ×1" or "Email + SSO"
  doneLink: string; // one-click "mark as done" link
  appLink: string;  // open the onboarding page in the app
}

/** Sent to an internal assignee (IT/Admin/etc.) for an onboarding task they own.
 *  Includes a one-click "Mark as done" button so they can complete it from email. */
export function buildTaskAssignedActionEmail(data: TaskAssignedActionEmailData): { subject: string; html: string } {
  const first = data.assigneeName.split(/\s+/)[0] || data.assigneeName;
  const body =
    hero({ emoji: "✅", title: "You have an onboarding task", subtitle: `For ${esc(data.newHireName)} at ${esc(data.companyName)}`, accent: "green" }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(`Please complete the following onboarding task for <strong>${esc(data.newHireName)}</strong>:`) +
    para(`<strong>${esc(data.taskTitle)}</strong>${data.detail ? ` — ${esc(data.detail)}` : ""}`) +
    para(`Once done, click below to mark it complete.`) +
    btnPrimary("Mark as done", data.doneLink, "green") +
    para(`Or <a href="${esc(data.appLink)}" style="color:#16a34a;">open it in the app</a> to view full details.`);

  return {
    subject: `Onboarding task: ${data.taskTitle} — ${data.newHireName}`,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `Onboarding task for ${data.newHireName}: ${data.taskTitle}`,
      body,
    }),
  };
}
