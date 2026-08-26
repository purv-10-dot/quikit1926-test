import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc } from "./_base";

type Variant = "at_risk" | "missed";
type Audience = "recruiter" | "escalation";

export interface RecruitSlaEmailData {
  variant: Variant;
  audience: Audience;
  recipientName: string;
  positionCode: string;
  requisitionTitle: string;
  recruiterName: string;
  targetDays: number;
  daysLeft: number;
  reviewUrl?: string | null;
  companyName: string;
}

/**
 * Position -> Offer SLA email — recruiter gets it at both AT_RISK and
 * MISSED; HR/Admin (performance.read holders) only at MISSED, worded as an
 * escalation rather than a personal miss.
 */
export function buildRecruitSlaEmail(data: RecruitSlaEmailData): { subject: string; html: string } {
  const missed = data.variant === "missed";
  const accent: "amber" | "red" = missed ? "red" : "amber";
  const overdue = data.daysLeft < 0;

  const heroBlock = hero({
    title: missed ? "Recruitment SLA Breached" : "Recruitment SLA At Risk",
    subtitle: missed
      ? `The Position &rarr; Offer SLA for <strong>${esc(data.requisitionTitle)}</strong> (${esc(data.positionCode)}) has been missed.`
      : `The Position &rarr; Offer SLA for <strong>${esc(data.requisitionTitle)}</strong> (${esc(data.positionCode)}) is approaching its deadline.`,
    accent,
  });

  const lead = data.audience === "escalation"
    ? para(`This is an escalation — <strong>${esc(data.recruiterName)}</strong>'s assigned position has crossed its hiring SLA and needs attention.`)
    : para("Please review this position and either move it forward or revise its SLA with a reason if the delay isn't on you.");

  const rows: Array<[string, string]> = [
    ["Position", esc(data.positionCode)],
    ["Requisition", esc(data.requisitionTitle)],
    ["Recruiter", esc(data.recruiterName)],
    ["Target (Position → Offer)", `${esc(String(data.targetDays))} days`],
    [overdue ? "Days Over" : "Days Left", `${esc(String(Math.abs(data.daysLeft)))} day${Math.abs(data.daysLeft) === 1 ? "" : "s"}`],
  ];

  const details = detailBlock(rows, { heading: "Position Details", accent });
  const banner = missed
    ? alert("danger", "The offer hasn't gone out within the level's standard SLA window.", "SLA Missed")
    : alert("warning", "Only a small window remains before this position's SLA is breached.", "SLA At Risk");

  const cta = data.reviewUrl ? btnPrimary("View Position", data.reviewUrl, accent) : "";

  const body = `${heroBlock}${para(`Hello <strong>${esc(data.recipientName)}</strong>,`)}${lead}${banner}${details}${cta}`;

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: missed
      ? `SLA breached: ${data.positionCode} — ${data.requisitionTitle}`
      : `SLA at risk: ${data.positionCode} — ${data.requisitionTitle}`,
    body,
  });

  const subject = missed
    ? `[Action needed] SLA breached — ${data.requisitionTitle} (${data.positionCode})`
    : `SLA at risk — ${data.requisitionTitle} (${data.positionCode})`;

  return { subject, html };
}
