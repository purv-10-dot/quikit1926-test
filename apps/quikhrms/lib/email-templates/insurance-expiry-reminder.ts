import { emailShell, hero, para, detailBlock, alert, esc } from "./_base";

export interface InsuranceExpiryEmailData {
  recipientName: string;
  companyName: string;
  policyName: string;
  expiryDate: string;
  daysLeft: number;
  /** true → HR/policy-owner copy (review & renew); false → covered-employee copy. */
  isOwner: boolean;
}

/** Sent when an Insurance-category document is nearing its configured notify-before window. */
export function buildInsuranceExpiryEmail(data: InsuranceExpiryEmailData): { subject: string; html: string } {
  const first = data.recipientName.split(/\s+/)[0] || data.recipientName;
  const dayWord = `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"}`;

  const body =
    hero({
      emoji: "🛡️",
      title: "Insurance policy expiring soon",
      subtitle: data.isOwner ? "Please review and renew before it lapses." : "Your coverage under this policy is ending soon.",
      accent: "amber",
    }) +
    para(`Hi <strong>${esc(first)}</strong>,`) +
    para(
      data.isOwner
        ? `The insurance policy <strong>${esc(data.policyName)}</strong> is expiring in <strong>${dayWord}</strong>. Please review vendor renewal before coverage lapses.`
        : `The insurance policy <strong>${esc(data.policyName)}</strong>, under which you are covered, is expiring in <strong>${dayWord}</strong>.`,
    ) +
    detailBlock([
      ["Policy", esc(data.policyName)],
      ["Expiry Date", esc(data.expiryDate)],
    ], { accent: "amber" }) +
    (data.isOwner
      ? alert("warning", "Renew or replace this policy before it expires to avoid a coverage gap.", "Action needed")
      : "");

  return {
    subject: `Insurance policy expiring in ${dayWord} — ${data.policyName}`,
    html: emailShell({
      accent: "amber",
      companyName: data.companyName,
      preheader: `${data.policyName} expires on ${data.expiryDate}`,
      body,
    }),
  };
}
