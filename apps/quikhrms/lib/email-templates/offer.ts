import {
  emailShell,
  hero,
  detailBlock,
  timeline,
  btnPrimary,
  para,
  esc,
} from "./_base";

export interface OfferEmailData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC: number;
  joiningDate: string;
  joiningBonus?: number | null;
  expiresAt?: string | null;
  companyName: string;
  acceptUrl?: string | null;
  companyAddress?: string | null;
  googleMapsUrl?: string | null;
  hrContactName?: string | null;
  hrContactPhone?: string | null;
  hrContactEmail?: string | null;
  managerName?: string | null;
  managerTitle?: string | null;
  reportingTime?: string | null;
  senderName?: string | null;
  senderPosition?: string | null;
}

export function buildOfferEmail(data: OfferEmailData): { subject: string; html: string } {
  const designation = data.designation ?? data.jobTitle;

  const rows: Array<[string, string]> = [["Position", esc(designation)]];
  if (data.managerName) {
    rows.push([
      "Reporting To",
      `${esc(data.managerName)}${data.managerTitle ? ` (${esc(data.managerTitle)})` : ""}`,
    ]);
  }
  rows.push(["Joining Date", esc(data.joiningDate)]);
  if (data.reportingTime) rows.push(["Reporting Time", esc(data.reportingTime)]);
  if (data.companyAddress) rows.push(["Location", esc(data.companyAddress)]);
  rows.push(["Employment Type", "Full-Time"]);
  rows.push(["CTC", `₹${Number(data.offeredCTC).toLocaleString("en-IN")}`]);
  if (data.joiningBonus) {
    rows.push(["Joining Bonus", `₹${Number(data.joiningBonus).toLocaleString("en-IN")}`]);
  }

  const subtitle = `Offer of Employment — we're delighted to offer you the position of ${esc(designation)} at ${esc(data.companyName)}.`;

  const cta = data.acceptUrl
    ? btnPrimary("Accept Offer", data.acceptUrl, "green")
    : para("Please reply to this email to accept your offer.");

  const body =
    hero({ emoji: "🎉", title: "Congratulations!", subtitle, accent: "green" }) +
    para(`Dear <strong>${esc(data.candidateName)}</strong>,`) +
    detailBlock(rows, { heading: "Offer Summary", accent: "green" }) +
    timeline(
      [
        { label: "Offer Sent" },
        { label: "Accept Offer", sub: data.expiresAt ? `By ${data.expiresAt}` : undefined },
        { label: "Joining Date", sub: data.joiningDate },
      ],
      "green",
    ) +
    cta;

  return {
    subject: `Offer of Employment from ${data.companyName} — ${designation}`,
    html: emailShell({
      accent: "green",
      companyName: data.companyName,
      preheader: `Your offer of employment from ${data.companyName}`,
      body,
      helpName: data.hrContactName ?? data.senderName ?? null,
      helpPhone: data.hrContactPhone ?? null,
      helpEmail: data.hrContactEmail ?? null,
      companyAddress: data.companyAddress ?? null,
    }),
  };
}
