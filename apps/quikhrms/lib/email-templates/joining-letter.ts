import { emailShell, hero, detailBlock, para, esc } from "./_base";

export interface JoiningLetterData {
  candidateName: string;
  jobTitle: string;
  designation?: string | null;
  offeredCTC?: number | null;
  joiningDate: string;
  department?: string | null;
  reportingTo?: string | null;
  workLocation?: string | null;
  companyName: string;
  companyAddress?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  letterDate?: string | null;
  employeeCode?: string | null;
}

export function buildJoiningLetterEmail(data: JoiningLetterData): { subject: string; html: string } {
  const designation = data.designation ?? data.jobTitle;

  const rows: Array<[string, string]> = [];
  if (data.employeeCode) rows.push(["Employee ID", esc(data.employeeCode)]);
  rows.push(["Position", esc(designation)]);
  if (data.department) rows.push(["Department", esc(data.department)]);
  if (data.reportingTo) rows.push(["Manager", esc(data.reportingTo)]);
  rows.push(["Joining Date", esc(data.joiningDate)]);
  if (data.workLocation) rows.push(["Work Location", esc(data.workLocation)]);
  if (data.offeredCTC != null) {
    rows.push(["CTC", esc(`₹${Number(data.offeredCTC).toLocaleString("en-IN")}`)]);
  }

  const closingBits: string[] = [];
  if (data.signatoryName) closingBits.push(`<strong>${esc(data.signatoryName)}</strong>`);
  if (data.signatoryDesignation) closingBits.push(esc(data.signatoryDesignation));
  const closing = closingBits.length
    ? para(`Warm regards,<br>${closingBits.join("<br>")}`)
    : "";

  const body =
    hero({
      title: "Welcome Aboard!",
      subtitle: "We are thrilled to have you join our team.",
      accent: "blue",
      emoji: "🎉",
    }) +
    para(`Dear <strong>${esc(data.candidateName)}</strong>,`) +
    detailBlock(rows, { heading: "Employee Details", accent: "blue" }) +
    para("Your manager will share portal access on your first day.") +
    closing;

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Your joining letter for ${designation} at ${data.companyName}`,
    body,
    companyAddress: data.companyAddress ?? null,
  });

  const subject = `Joining Letter — ${designation} at ${data.companyName}`;
  return { subject, html };
}
