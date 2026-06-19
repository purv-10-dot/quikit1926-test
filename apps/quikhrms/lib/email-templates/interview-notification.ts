export interface InterviewerNotificationData {
  interviewerName: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  duration: string;
  type: string;
  meetingLink?: string | null;
  location?: string | null;
  companyName: string;
  roundName?: string | null;
  resumeUrl?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TYPE_LABEL: Record<string, string> = {
  Phone: "Phone Screen",
  Video: "Video Call",
  InPerson: "In-Person",
  Panel: "Panel Interview",
  TakeHome: "Take-Home Task",
  GroupDiscussion: "Group Discussion",
};

export function buildInterviewerNotificationEmail(data: InterviewerNotificationData): { subject: string; html: string } {
  const typeLabel = TYPE_LABEL[data.type] ?? data.type;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const rows: Array<[string, string] | null> = [
    ["Candidate", escapeHtml(data.candidateName)],
    ["Candidate Email", `<a href="mailto:${escapeHtml(data.candidateEmail)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.candidateEmail)}</a>`],
    data.candidatePhone ? ["Candidate Phone", escapeHtml(data.candidatePhone)] : null,
    ["Role", escapeHtml(data.jobTitle)],
    data.roundName ? ["Round", escapeHtml(data.roundName)] : null,
    ["Interview Type", escapeHtml(typeLabel)],
    ["Date", escapeHtml(data.interviewDate)],
    ["Time", `${escapeHtml(data.interviewTime)} (${escapeHtml(data.duration)} min)`],
    data.meetingLink ? ["Meeting Link", `<a href="${escapeHtml(data.meetingLink)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.meetingLink)}</a>`] : null,
    data.location ? ["Location", escapeHtml(data.location)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#eff6ff;color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 60%,#3b82f6 100%);padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">Interview Assigned</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">You have a ${escapeHtml(typeLabel)} scheduled</h1>
      </div>

      <div style="padding:26px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hi <strong>${escapeHtml(data.interviewerName)}</strong>,</p>

        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          You have been assigned to interview <strong>${escapeHtml(data.candidateName)}</strong> for the role of <strong>${escapeHtml(data.jobTitle)}</strong> at <strong>${escapeHtml(data.companyName)}</strong>.
        </p>

        <div style="margin:18px 0 0;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1d4ed8;letter-spacing:0.5px;text-transform:uppercase;">Interview Details</p>
          <table style="border-collapse:collapse;width:100%;">${filtered.map(([k, v]) => row(k, v)).join("")}</table>
        </div>

        ${data.meetingLink ? `
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${escapeHtml(data.meetingLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Join Interview</a>
          </div>` : ""}

        <p style="margin:22px 0 0;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Action items</p>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
          <li style="margin:3px 0;">Review the candidate's profile before the interview.</li>
          <li style="margin:3px 0;">Submit your scorecard in HRMS within 24 hours of the session.</li>
          <li style="margin:3px 0;">Reach out to HR if you need to reschedule.</li>
        </ul>

        <p style="margin:24px 0 0;font-size:14px;color:#111827;">Thanks,</p>
        <p style="margin:4px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)} · Talent Acquisition</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated notification from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `Interview assigned: ${data.candidateName} — ${data.jobTitle} (${data.interviewDate})`,
    html,
  };
}
