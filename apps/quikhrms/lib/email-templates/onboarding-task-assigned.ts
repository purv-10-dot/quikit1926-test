import { emailShell, hero, para, checklist, btnPrimary, esc } from "./_base";

export interface OnboardingTaskAssignedEmailData {
  assigneeName: string;
  companyName: string;
  newHireName: string;
  tasks: string[];
  link: string;
}

/** Sent to an employee who was assigned onboarding task(s) via a template. */
export function buildOnboardingTaskAssignedEmail(data: OnboardingTaskAssignedEmailData): { subject: string; html: string } {
  const first = data.assigneeName.split(/\s+/)[0] || data.assigneeName;
  const many = data.tasks.length > 1;
  const body =
    hero({ emoji: "✅", title: "You have an onboarding task", subtitle: `${data.newHireName}'s onboarding`, accent: "green" }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(`You've been assigned the following onboarding ${many ? "tasks" : "task"} for <strong>${esc(data.newHireName)}</strong>. Please complete ${many ? "them" : "it"} and mark ${many ? "them" : "it"} done.`) +
    checklist(data.tasks.map((t) => ({ text: esc(t) })), { heading: many ? "Your tasks" : "Your task", accent: "green" }) +
    btnPrimary("Open onboarding", data.link, "green");

  return {
    subject: `Onboarding task assigned — ${data.newHireName}`,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `You've been assigned an onboarding task for ${data.newHireName}`,
      body,
    }),
  };
}
