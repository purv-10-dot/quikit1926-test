import { emailShell, hero, para, detailBlock, alert, btnPrimary, esc, BRAND } from "./_base";

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

export function buildInterviewInviteEmail(data: InterviewInviteData): { subject: string; html: string } {
  const designation = data.designation ?? data.jobTitle;

  const modeValue = data.meetingLink
    ? `${esc(data.type)} — <a href="${esc(data.meetingLink)}" style="color:${BRAND.primary};text-decoration:underline;word-break:break-all;">${esc(data.meetingLink)}</a>`
    : data.location
    ? `${esc(data.type)} — ${esc(data.location)}`
    : esc(data.type);

  const rows: Array<[string, string] | null> = [
    ["Position", esc(data.jobTitle || designation)],
    ["Date", esc(data.interviewDate)],
    ["Time", `${esc(data.interviewTime)} (IST)`],
    ["Duration", esc(data.duration)],
    ["Mode", modeValue],
    data.roundName ? ["Round", esc(data.roundName)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const body =
    hero({
      title: "Interview Invitation",
      subtitle: "Congratulations! You've been shortlisted for the next round of the selection process.",
      accent: "blue",
    }) +
    para(`Hello <strong>${esc(data.candidateName)}</strong>,`) +
    detailBlock(filtered, { heading: "Interview Details", accent: "blue" }) +
    alert("info", "Please join 5 minutes before the scheduled interview.", "Important") +
    // Button links straight to the meeting, so label it accordingly — "Confirm
    // Interview" was misleading (it joins the call, it doesn't record a confirmation).
    (data.meetingLink ? btnPrimary("Join Meeting", esc(data.meetingLink), "blue") : "");

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Interview invitation for ${designation}`,
    body,
    helpName: data.senderName ?? null,
    helpPhone: data.senderPhone ?? null,
    companyAddress: data.companyAddress ?? null,
  });

  const subject = `Interview Invite — ${designation} position at ${data.companyName}`;
  return { subject, html };
}
