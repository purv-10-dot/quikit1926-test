export interface InterviewFeedbackRequestData {
  interviewerName: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  duration: string;
  type: string;
  roundName?: string | null;
  feedbackUrl: string;
  expiryDays: number;
  companyName: string;
  isReminder?: boolean;
  reminderLevel?: 1 | 2 | 3; // 24h, 48h, 72h
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildInterviewFeedbackRequestEmail(data: InterviewFeedbackRequestData): { subject: string; html: string } {
  const isReminder = !!data.isReminder;
  const level = data.reminderLevel ?? 1;

  const reminderHeading =
    level === 1 ? "Gentle reminder: feedback needed" :
    level === 2 ? "Second reminder: please submit feedback" :
                  "Final reminder: feedback overdue";

  const heading = isReminder
    ? reminderHeading
    : "Please submit interview feedback";

  const accent = isReminder && level === 3 ? "#dc2626" : isReminder && level === 2 ? "#d97706" : "#2563eb";
  const accentSoft = isReminder && level === 3 ? "#fef2f2" : isReminder && level === 2 ? "#fffbeb" : "#eff6ff";
  const accentRing = isReminder && level === 3 ? "#fecaca" : isReminder && level === 2 ? "#fde68a" : "#bfdbfe";

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const rows: Array<[string, string] | null> = [
    ["Candidate", escape(data.candidateName)],
    ["Role", escape(data.jobTitle)],
    data.roundName ? ["Round", escape(data.roundName)] : null,
    ["Interview Type", escape(data.type)],
    ["Date", escape(data.interviewDate)],
    ["Time", `${escape(data.interviewTime)} (${escape(data.duration)} min)`],
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const introLine = isReminder
    ? (level === 1 ? `This is a friendly reminder to submit feedback for <strong>${escape(data.candidateName)}</strong>. The interview concluded 24+ hours ago and your feedback is still pending.`
      : level === 2 ? `Your feedback for <strong>${escape(data.candidateName)}</strong> is still pending after 48 hours. Please submit at the earliest — hiring decisions are blocked.`
                     : `Your feedback for <strong>${escape(data.candidateName)}</strong> is now 72+ hours overdue. HR and the reporting manager have been cc'd.`)
    : `You recently completed an interview with <strong>${escape(data.candidateName)}</strong> for the role of <strong>${escape(data.jobTitle)}</strong>. Please share your feedback so the team can move forward with the hiring decision.`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:${accentSoft};color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:${accent};padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">${isReminder ? "Feedback Reminder" : "Interview Feedback"}</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escape(heading)}</h1>
      </div>

      <div style="padding:26px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hi <strong>${escape(data.interviewerName)}</strong>,</p>
        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">${introLine}</p>

        <div style="margin:18px 0 0;padding:14px 18px;background:${accentSoft};border:1px solid ${accentRing};border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${accent};letter-spacing:0.5px;text-transform:uppercase;">Interview Details</p>
          <table style="border-collapse:collapse;width:100%;">${filtered.map(([k, v]) => row(k, v)).join("")}</table>
        </div>

        <div style="text-align:center;margin:28px 0 0;">
          <a href="${escape(data.feedbackUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:14px 34px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">Submit Feedback →</a>
          <p style="margin:10px 0 0;font-size:11px;color:#6b7280;">This link is valid for ${data.expiryDays} days. No login required.</p>
        </div>

        <p style="margin:24px 0 28px;font-size:13px;color:#4b5563;">Thanks,<br/>${escape(data.companyName)} · Talent Acquisition</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated message from ${escape(data.companyName)} HRMS. Please do not reply.
      </div>
    </div>
  </div>
</body>
</html>`;

  const subject = isReminder
    ? (level === 1 ? `Reminder: submit feedback for ${data.candidateName}`
      : level === 2 ? `[2nd reminder] Feedback pending: ${data.candidateName}`
                     : `[OVERDUE] Feedback pending: ${data.candidateName}`)
    : `Feedback needed: ${data.candidateName} — ${data.jobTitle}`;

  return { subject, html };
}
