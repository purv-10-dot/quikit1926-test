import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc } from "./_base";

export interface ResignationNoticeData {
  recipientName: string;
  recipientRole: "direct_manager" | "skip_level";
  employeeName: string;
  employeeCode: string;
  jobTitle?: string | null;
  department?: string | null;
  resignationDate: string;
  lastWorkingDate: string;
  noticePeriodDays: number;
  reason?: string | null;
  notes?: string | null;
  companyName: string;
  portalUrl?: string | null;
}

export function buildResignationNoticeEmail(data: ResignationNoticeData): { subject: string; html: string } {
  const isDirect = data.recipientRole === "direct_manager";

  const rows: Array<[string, string] | null> = [
    ["Employee", `${esc(data.employeeName)} (${esc(data.employeeCode)})`],
    data.jobTitle ? ["Role", esc(data.jobTitle)] : null,
    data.department ? ["Department", esc(data.department)] : null,
    ["Submitted On", esc(data.resignationDate)],
    ["Last Working Day", esc(data.lastWorkingDate)],
    ["Notice Period", `${data.noticePeriodDays} days`],
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const intro = isDirect
    ? `<strong>${esc(data.employeeName)}</strong>, who reports directly to you, has submitted their resignation through the HRMS self-service portal.`
    : `This is to inform you that <strong>${esc(data.employeeName)}</strong>, an employee in your reporting tree, has submitted their resignation.`;

  const nextSteps = isDirect
    ? `<ul style="margin:8px 0 16px;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
        <li style="margin:3px 0;">Acknowledge the resignation with the employee.</li>
        <li style="margin:3px 0;">Plan knowledge transfer and handover before <strong>${esc(data.lastWorkingDate)}</strong>.</li>
        <li style="margin:3px 0;">Coordinate with HR for clearance, exit interview and final settlement.</li>
        <li style="margin:3px 0;">Initiate backfill request if the role needs replacement.</li>
      </ul>`
    : `<ul style="margin:8px 0 16px;padding-left:20px;font-size:13px;line-height:1.7;color:#1f2937;">
        <li style="margin:3px 0;">No direct action required — sharing for visibility.</li>
        <li style="margin:3px 0;">Direct manager is leading the offboarding process.</li>
        <li style="margin:3px 0;">Reach out to HR or the manager if you have specific concerns.</li>
      </ul>`;

  const body = `
    ${hero({
      title: "Resignation Notice",
      subtitle: `${esc(data.employeeName)} has submitted their resignation.`,
      accent: "red",
    })}
    ${para(`Hi <strong>${esc(data.recipientName)}</strong>,`)}
    ${para(intro)}
    ${detailBlock(filtered, { heading: "Resignation Details", accent: "red" })}
    ${data.reason ? alert("info", esc(data.reason), "Reason") : ""}
    ${data.notes ? para(`Notes: ${esc(data.notes)}`) : ""}
    ${para(`<span style="font-size:13px;font-weight:700;color:#111827;">Next steps</span>`)}
    ${nextSteps}
    ${data.portalUrl ? btnPrimary("View Resignation Details", data.portalUrl, "red") : ""}
  `;

  const html = emailShell({
    accent: "red",
    companyName: data.companyName,
    preheader: isDirect
      ? `${data.employeeName} has resigned — LWD ${data.lastWorkingDate}`
      : `Resignation in your reporting tree — ${data.employeeName}`,
    body,
    helpName: `${data.companyName} · People Operations`,
  });

  return {
    subject: isDirect
      ? `Resignation submitted: ${data.employeeName} (LWD ${data.lastWorkingDate})`
      : `[FYI] Resignation in reporting tree: ${data.employeeName}`,
    html,
  };
}
