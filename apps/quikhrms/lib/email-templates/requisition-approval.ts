import { emailShell, hero, detailBlock, alert, btnPrimary, para, esc } from "./_base";

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

export function buildRequisitionApprovalEmail(data: RequisitionApprovalEmailData): { subject: string; html: string } {
  const isDecision = data.variant === "decision_to_raiser";
  const approved = isDecision && data.status === "Approved";

  const accent: "blue" | "green" | "red" = isDecision ? (approved ? "green" : "red") : "blue";

  // Decisions are addressed to the raiser; requests to the recipient (approver).
  const greetName = isDecision ? data.raiserName : data.recipientName;

  const heroBlock = isDecision
    ? hero({
        title: approved ? "✅ Requisition Approved" : "Requisition Rejected",
        subtitle: approved
          ? `Your requisition for <strong>${esc(data.title)}</strong> has been approved.`
          : `Your requisition for <strong>${esc(data.title)}</strong> has been rejected.`,
        accent,
      })
    : hero({
        title: "Requisition Approval Needed",
        subtitle: "A new job requisition needs your review.",
        accent,
      });

  const lead = isDecision
    ? para(
        approved
          ? `The requisition you raised for <strong>${esc(data.title)}</strong> has been fully approved and is now live.`
          : `The requisition you raised for <strong>${esc(data.title)}</strong> has not been approved.`,
      )
    : para(`<strong>${esc(data.raiserName)}</strong> has raised a job requisition that requires your approval.`);

  const rows = ([
    ["Title", esc(data.title)],
    data.department ? ["Department", esc(data.department)] : null,
    ["Positions", esc(String(data.positions))],
    ["Employment Type", esc(data.employmentType)],
    ["Work Location", esc(data.workLocation)],
    ["Raised by", esc(data.raiserName)],
    data.openDeptHeadcount !== null && data.openDeptHeadcount !== undefined
      ? ["Open Dept Headcount", esc(String(data.openDeptHeadcount))]
      : null,
  ] as Array<[string, string] | null>).filter((r): r is [string, string] => r !== null);

  const details = detailBlock(rows, { heading: "Requisition Details", accent });

  const justificationBlock = data.justification ? alert("info", esc(data.justification), "Justification") : "";

  const commentBlock =
    isDecision && data.comment
      ? alert(data.status === "Rejected" ? "warning" : "success", esc(data.comment), "Reviewer Note")
      : "";

  const cta = data.reviewUrl
    ? btnPrimary(isDecision ? "View Requisition" : "Review Requisition", data.reviewUrl, accent)
    : "";

  const body = `${heroBlock}${para(`Hello <strong>${esc(greetName)}</strong>,`)}${lead}${details}${justificationBlock}${commentBlock}${cta}`;

  const html = emailShell({
    accent,
    companyName: data.companyName,
    preheader: isDecision
      ? approved
        ? `Requisition approved: ${data.title}`
        : `Requisition rejected: ${data.title}`
      : `Requisition awaiting approval: ${data.title}`,
    body,
  });

  const subject =
    data.variant === "request_to_approver" ? `Request for Approval: ${data.title} (raised by ${data.raiserName})` :
    data.variant === "approved_to_next"   ? `[HR action] Final approval — ${data.title}` :
    approved                               ? `Requisition approved: ${data.title}` :
                                             `Requisition rejected: ${data.title}`;

  return { subject, html };
}
