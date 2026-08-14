import { emailShell, hero, para, detailBlock, alert, btnPrimary, esc } from "./_base";

export interface TakeHomeTaskData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  roundName?: string | null;
  instructions: string;
  dueDate?: string | null;
  submitUrl: string;
  hasAttachment?: boolean;
  /** Optional reference link HR pasted (e.g. a doc/repo for the assignment). */
  attachmentLink?: string | null;
}

/**
 * Candidate-facing "Take-Home Task" assignment email. Sent (in place of the
 * standard interview invite) when HR schedules an interview of type TakeHome.
 * Shows the brief, deadline, an optional "spec attached" note, and a primary
 * CTA to the tokenised public submission page.
 */
export function buildTakeHomeTaskEmail(data: TakeHomeTaskData): { subject: string; html: string } {
  const rows: Array<[string, string] | null> = [
    ["Position", esc(data.jobTitle)],
    data.roundName ? ["Round", esc(data.roundName)] : null,
    data.dueDate ? ["Due", esc(data.dueDate)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  // Instructions are plain text from HR — escape, then preserve line breaks.
  const briefHtml = esc(data.instructions || "").replace(/\n/g, "<br/>");

  const body =
    hero({
      title: "Your Take-Home Task",
      subtitle: "A short assignment as the next step in your application.",
      accent: "blue",
    }) +
    para(`Hi <strong>${esc(data.candidateName)}</strong>,`) +
    para("Please complete the following task and submit your work using the button below.") +
    detailBlock(filtered, { heading: "Task", accent: "blue" }) +
    (briefHtml
      ? `<div style="font-size:12px;font-weight:800;color:#2563eb;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px;">Instructions</div>` +
        `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 18px;font-size:13px;line-height:1.6;color:#1f2937;">${briefHtml}</div>`
      : "") +
    (data.hasAttachment
      ? alert("info", "A specification file is attached to your task — you'll be able to download it on the submission page.")
      : "") +
    (data.attachmentLink
      ? alert("info", `Reference link: <a href="${esc(data.attachmentLink)}" style="color:#1d4ed8;">${esc(data.attachmentLink)}</a>`)
      : "") +
    btnPrimary("Start / Submit Task", esc(data.submitUrl), "blue") +
    para(`<span style="font-size:12px;color:#6b7280;">You can upload a file and/or paste a link on the submission page.${data.dueDate ? ` Please submit by <strong>${esc(data.dueDate)}</strong>.` : ""}</span>`);

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Take-home task for ${data.jobTitle}`,
    body,
  });

  const subject = `Take-home task: ${data.jobTitle}`;

  return { subject, html };
}
