type Variant = "request_to_approver" | "approved_to_next" | "decision_to_raiser";

export interface RequisitionApprovalEmailData {
  variant: Variant;
  recipientName: string;
  approverRole?: "DeptHead" | "HR" | null;
  raiserName: string;
  title: string;
  department: string | null;
  positions: number;
  employmentType: string;
  workLocation: string;
  justification: string | null;
  reviewUrl?: string | null;
  companyName: string;
  status?: "Approved" | "Rejected";
  comment?: string | null;
  openDeptHeadcount?: number | null;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildRequisitionApprovalEmail(data: RequisitionApprovalEmailData): { subject: string; html: string } {
  const isDecision = data.variant === "decision_to_raiser";
  const approved = isDecision && data.status === "Approved";

  const accent =
    isDecision ? (approved ? "#059669" : "#dc2626") :
    "#1d4ed8";
  const accentSoft =
    isDecision ? (approved ? "#ecfdf5" : "#fef2f2") :
    "#eff6ff";
  const accentRing =
    isDecision ? (approved ? "#a7f3d0" : "#fecaca") :
    "#bfdbfe";

  const heading =
    data.variant === "request_to_approver" ? `Request for Approval — New Position: ${data.title}` :
    data.variant === "approved_to_next"   ? `Second-level approval needed — ${data.title}` :
    approved                               ? `Your requisition has been approved` :
                                             `Your requisition has been rejected`;

  const intro =
    data.variant === "request_to_approver"
      ? `<strong>${escape(data.raiserName)}</strong> has raised a new job requisition that requires your approval as ${data.approverRole === "HR" ? "HR" : "Department Head"}.`
      : data.variant === "approved_to_next"
        ? `The requisition raised by <strong>${escape(data.raiserName)}</strong> has been approved at the first level and now needs final HR approval.`
        : approved
          ? `The requisition you raised for <strong>${escape(data.title)}</strong> has been fully approved and is now live. Candidates can be sourced and applications will start flowing in.`
          : `The requisition you raised for <strong>${escape(data.title)}</strong> has been rejected.${data.comment ? ` Reason: <em>${escape(data.comment)}</em>` : ""}`;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;width:180px;vertical-align:top;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td>
    </tr>`;

  const rows: Array<[string, string] | null> = [
    ["Requisition Title", escape(data.title)],
    data.department ? ["Department", escape(data.department)] : null,
    ["Positions", String(data.positions)],
    ["Employment Type", escape(data.employmentType)],
    ["Work Location", escape(data.workLocation)],
    ["Raised By", escape(data.raiserName)],
    data.openDeptHeadcount !== null && data.openDeptHeadcount !== undefined ? ["Open in this Dept", `${data.openDeptHeadcount} requisition${data.openDeptHeadcount === 1 ? "" : "s"}`] : null,
    data.justification ? ["Business Justification", escape(data.justification)] : null,
    data.comment && !isDecision ? ["Previous Approver Note", escape(data.comment)] : null,
  ];
  const filtered = rows.filter((r): r is [string, string] => r !== null);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:${accentSoft};color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="background:${accent};padding:28px 36px;color:#ffffff;">
        <p style="margin:0;font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:0.9;">
          ${isDecision ? (approved ? "Requisition Approved" : "Requisition Rejected") : "Request for Approval"}
        </p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escape(heading)}</h1>
      </div>

      <div style="padding:26px 36px 4px;">
        <p style="margin:0;font-size:14px;color:#111827;">Hello <strong>${escape(data.recipientName)}</strong>,</p>
        <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#1f2937;">${intro}</p>

        <div style="margin:18px 0 0;padding:14px 20px;background:${accentSoft};border:1px solid ${accentRing};border-radius:8px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${accent};letter-spacing:0.5px;text-transform:uppercase;">Requisition Details</p>
          <table style="border-collapse:collapse;width:100%;">${filtered.map(([k, v]) => row(k, v)).join("")}</table>
        </div>

        ${!isDecision && data.reviewUrl ? `
          <div style="text-align:center;margin:28px 0 0;">
            <a href="${escape(data.reviewUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:14px 34px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              Review &amp; Decide →
            </a>
          </div>` : ""}

        <p style="margin:24px 0 28px;font-size:13px;color:#4b5563;">
          Best regards,<br/>${escape(data.companyName)} · People Operations
        </p>
      </div>

      <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated message from ${escape(data.companyName)} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;

  const subject =
    data.variant === "request_to_approver" ? `Request for Approval: ${data.title} (raised by ${data.raiserName})` :
    data.variant === "approved_to_next"   ? `[HR action] Final approval — ${data.title}` :
    approved                               ? `Requisition approved: ${data.title}` :
                                             `Requisition rejected: ${data.title}`;

  return { subject, html };
}
