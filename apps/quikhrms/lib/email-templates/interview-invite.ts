export interface InterviewInviteData {
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  duration: string;
  interviewerName: string;
  type: string;
  meetingLink?: string | null;
  location?: string | null;
  companyName: string;
  senderName?: string | null;
  senderPosition?: string | null;
  senderPhone?: string | null;
  companyAddress?: string | null;
  companyContact?: string | null;
  letterDate?: string | null;
  dayOfWeek?: string | null;
  totalExperience?: string | null;
  currentCTC?: string | null;
  expectedCTC?: string | null;
  joiningAvailability?: string | null;
  jobDescription?: string | null;
  roundName?: string | null;
  designation?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jobDescriptionHtml(jd: string): string {
  const esc = escapeHtml(jd);
  const withBullets = esc
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^(•|-|\*)\s/.test(trimmed)) {
        return `<li style="margin:4px 0;">${trimmed.replace(/^(•|-|\*)\s/, "")}</li>`;
      }
      if (/^[A-Z][A-Za-z /&()-]+:$/.test(trimmed)) {
        return `</ul><p style="margin:10px 0 4px;font-weight:700;color:#111827;">${trimmed}</p><ul style="margin:0;padding-left:18px;">`;
      }
      return `<p style="margin:4px 0;">${trimmed}</p>`;
    })
    .join("");
  return `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#1f2937;">${withBullets}</ul>`;
}

export function buildInterviewInviteEmail(data: InterviewInviteData): { subject: string; html: string } {
  const dateStr = data.letterDate ?? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const senderName = data.senderName ?? "Hiring Team";
  const senderPosition = data.senderPosition ?? "HR Executive";
  const roundName = data.roundName ?? "Technical Interview";
  const designation = data.designation ?? data.jobTitle;

  const infoRow = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const mainInfo = [
    ["Interview Mode", `${data.type}${data.meetingLink ? " (Virtual)" : data.location ? ` (In-person — ${escapeHtml(data.location)})` : ""}`],
    ["Date", escapeHtml(data.interviewDate)],
    data.dayOfWeek ? ["Day", escapeHtml(data.dayOfWeek)] : null,
    ["Time", escapeHtml(data.interviewTime)],
    ["Duration", `${escapeHtml(data.duration)} minutes`],
    ["Designation", escapeHtml(designation)],
    ["Interviewer", escapeHtml(data.interviewerName)],
    data.meetingLink ? ["Meeting Link", `<a href="${data.meetingLink}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${data.meetingLink}</a>`] : null,
  ].filter((r): r is [string, string] => r !== null);

  const discussionRows = [
    data.totalExperience ? ["Total Experience", escapeHtml(data.totalExperience)] : null,
    data.currentCTC ? ["Current CTC", escapeHtml(data.currentCTC)] : null,
    data.expectedCTC ? ["Expected CTC", escapeHtml(data.expectedCTC)] : null,
    data.joiningAvailability ? ["Joining Availability", escapeHtml(data.joiningAvailability)] : null,
  ].filter((r): r is [string, string] => r !== null);

  const jdBlock = data.jobDescription
    ? `
      <div style="margin:20px 0 0;padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;text-transform:uppercase;">Job Description</p>
        <p style="margin:0 0 10px;font-size:13px;color:#111827;font-weight:700;">${escapeHtml(data.jobTitle)}</p>
        ${jobDescriptionHtml(data.jobDescription)}
      </div>`
    : "";

  const discussionBlock = discussionRows.length > 0
    ? `
      <div style="margin:16px 0 0;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e40af;letter-spacing:0.5px;text-transform:uppercase;">From our recent discussion</p>
        <table style="border-collapse:collapse;width:100%;">${discussionRows.map(([k, v]) => infoRow(k, v)).join("")}</table>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#eef2f7;color:#1f2937;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

      <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 60%,#0ea5e9 100%);padding:32px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">${escapeHtml(data.companyName)}</p>
        <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Interview Invite — ${escapeHtml(designation)}</h1>
      </div>

      <div style="padding:28px 36px 4px;">
        <p style="margin:0;font-size:13px;color:#4b5563;">${escapeHtml(dateStr)}</p>
        <p style="margin:20px 0 0;font-size:14px;color:#111827;">Hello <strong>${escapeHtml(data.candidateName)}</strong>,</p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          Greetings from <strong>${escapeHtml(data.companyName)}</strong>!
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          We are reaching out to inform you about an exciting opportunity for a <strong>${escapeHtml(designation)}</strong> position at <strong>${escapeHtml(data.companyName)}</strong>. Based on your background and skills, we believe you could be a great fit for our team.
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          Following our review of your resume and our recent discussion, we are pleased to inform you that you have been shortlisted for the <strong>${escapeHtml(roundName)}</strong> round. Below are the details for your scheduled interview:
        </p>
      </div>

      <div style="padding:8px 36px 0;">
        <table style="border-collapse:collapse;width:100%;margin-top:10px;">${mainInfo.map(([k, v]) => infoRow(k, v)).join("")}</table>
      </div>

      <div style="padding:4px 36px 0;">
        <p style="margin:14px 0 0;font-size:13px;color:#b45309;background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:4px;">
          Please join the interview <strong>5 minutes prior</strong> to the scheduled time.
        </p>
        ${discussionBlock}
        ${jdBlock}
      </div>

      <div style="padding:18px 36px 4px;">
        <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">
          Kindly confirm your availability by replying to this email. If you have any questions or require further assistance, please don&apos;t hesitate to reach out.
        </p>

        <p style="margin:28px 0 0;font-size:14px;color:#111827;">Thanks &amp; Regards,</p>
        <p style="margin:20px 0 0;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(senderName)}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(senderPosition)}</p>
        ${data.senderPhone ? `<p style="margin:2px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(data.senderPhone)}</p>` : ""}
        <p style="margin:2px 0 28px;font-size:13px;color:#4b5563;">${escapeHtml(data.companyName)}</p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        ${data.companyAddress ? `${escapeHtml(data.companyAddress)} · ` : ""}This is an automated message from ${escapeHtml(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  const subject = `Interview Invite — ${designation} position at ${data.companyName}`;
  return { subject, html };
}
