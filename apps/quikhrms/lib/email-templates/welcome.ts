import {
  emailShell,
  hero,
  detailBlock,
  timeline,
  btnPrimary,
  btnSecondary,
  esc,
  BRAND,
} from "./_base";

export interface CredentialSet {
  label: string;
  items: Array<{ key: string; value: string }>;
  loginUrl?: string | null;
}

export interface WelcomeEmailData {
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  department?: string | null;
  dateOfJoining: string;
  managerName?: string | null;
  companyName: string;
  portalUrl?: string | null;
  senderName?: string | null;
  senderPosition?: string | null;
  credentials?: CredentialSet[] | null;
}

export function buildWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const senderName = data.senderName ?? "HR Department";

  const detailRows: Array<[string, string]> = [];
  if (data.jobTitle) detailRows.push(["Position", esc(data.jobTitle)]);
  if (data.department) detailRows.push(["Department", esc(data.department)]);
  if (data.managerName) detailRows.push(["Manager", esc(data.managerName)]);
  detailRows.push(["Reporting Date", esc(data.dateOfJoining)]);
  detailRows.push(["Employee Code", esc(data.employeeCode)]);

  const creds = data.credentials ?? [];
  const credBlocks = creds
    .map((set) => {
      const block = detailBlock(
        set.items.map((i): [string, string] => [i.key, esc(i.value)]),
        { heading: set.label, accent: "blue" },
      );
      const cta = set.loginUrl ? btnSecondary(`Open ${set.label}`, set.loginUrl, "blue") : "";
      return block + cta;
    })
    .join("");

  const heading = (text: string) =>
    `<div style="font-size:12px;font-weight:800;color:${BRAND.primary};text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px;">${esc(text)}</div>`;

  const body =
    hero({
      title: `Welcome to ${data.companyName}!`,
      subtitle: "We're excited to have you on board.",
      accent: "blue",
      emoji: "🎉",
    }) +
    detailBlock(detailRows, { heading: "Your Details", accent: "blue" }) +
    credBlocks +
    heading("What's Next?") +
    timeline(
      [
        { label: "Offer Accepted", done: true },
        { label: "Documents" },
        { label: "Onboarding" },
        { label: "Welcome Session" },
        { label: "First Day" },
      ],
      "blue",
    ) +
    (data.portalUrl ? btnPrimary("Complete Onboarding", data.portalUrl, "blue") : "");

  const html = emailShell({
    accent: "blue",
    companyName: data.companyName,
    preheader: `Welcome to ${data.companyName}, ${data.employeeName}!`,
    body,
    helpName: senderName,
    helpPhone: null,
  });

  return {
    subject: `Welcome to ${data.companyName}, ${data.employeeName}! — Login credentials inside`,
    html,
  };
}
