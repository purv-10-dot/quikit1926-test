import { baseLayout, infoTable } from "./_base";

export interface Form12BBAckInput {
  employeeName: string;
  employeeCode: string;
  companyName: string;
  financialYear: string;
  submittedAt: Date;

  hraClaimed: boolean;
  rentPaid: number;
  ltaClaimed: boolean;
  ltaAmount: number;
  homeLoanInterest: number;
  chapterVIATotal: number;

  signedFileUrl?: string | null;
  documentCounts: {
    hra: number;
    lta: number;
    homeLoan: number;
    chapterVIA: number;
  };
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildForm12BBAckEmail(input: Form12BBAckInput): { subject: string; html: string } {
  const subject = `Form 12BB acknowledgment — FY ${input.financialYear}`;

  // Only render rows the employee actually engaged with — keeps the
  // summary readable when most sections are zero.
  const rows: Array<[string, string]> = [
    ["Financial Year", `FY ${input.financialYear}`],
    ["Submitted On", formatDate(input.submittedAt)],
  ];
  if (input.hraClaimed) rows.push(["HRA — Annual Rent", INR.format(input.rentPaid)]);
  if (input.ltaClaimed) rows.push(["LTA Amount", INR.format(input.ltaAmount)]);
  if (input.homeLoanInterest > 0) rows.push(["Home Loan Interest u/s 24", INR.format(input.homeLoanInterest)]);
  if (input.chapterVIATotal > 0) rows.push(["Chapter VI-A — Total Declared", INR.format(input.chapterVIATotal)]);

  const totalDocs =
    input.documentCounts.hra + input.documentCounts.lta +
    input.documentCounts.homeLoan + input.documentCounts.chapterVIA;

  const docRows: Array<[string, string]> = [];
  if (input.documentCounts.hra > 0) docRows.push(["HRA — Supporting Documents", `${input.documentCounts.hra} file${input.documentCounts.hra > 1 ? "s" : ""}`]);
  if (input.documentCounts.lta > 0) docRows.push(["LTA — Travel Proofs", `${input.documentCounts.lta} file${input.documentCounts.lta > 1 ? "s" : ""}`]);
  if (input.documentCounts.homeLoan > 0) docRows.push(["Home Loan — Interest Certificate", `${input.documentCounts.homeLoan} file${input.documentCounts.homeLoan > 1 ? "s" : ""}`]);
  if (input.documentCounts.chapterVIA > 0) docRows.push(["Chapter VI-A — Investment Proofs", `${input.documentCounts.chapterVIA} file${input.documentCounts.chapterVIA > 1 ? "s" : ""}`]);

  const body = `
    <p style="margin:0 0 16px;font-size:14px;">
      We have received your Form 12BB declaration for <strong>FY ${input.financialYear}</strong>.
      Your monthly TDS will be re-computed against the figures below.
    </p>

    <p style="margin:16px 0 8px;font-size:13px;font-weight:600;color:#374151;">Declared amounts</p>
    ${infoTable(rows)}

    ${docRows.length > 0 ? `
      <p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#374151;">Supporting documents (${totalDocs})</p>
      ${infoTable(docRows)}
    ` : `
      <p style="margin:16px 0 0;font-size:13px;color:#92400e;background:#fef3c7;padding:12px 14px;border-radius:6px;">
        No supporting documents attached. If you claim exemptions or Chapter VI-A deductions, the payroll team may ask for proofs.
      </p>
    `}

    ${input.signedFileUrl ? `
      <p style="margin:20px 0 0;font-size:13px;">
        Signed declaration: <a href="${input.signedFileUrl}" style="color:#2563eb;">View attached PDF</a>
      </p>
    ` : ""}

    <p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
      This is an acknowledgment, not an approval. A Proof of Investment review row has been created for each claimed section
      and queued for the payroll team. They will verify the attached documents during proof-of-investment season and may
      revise the deductible amount. Re-submit on the same page if you need to change anything for this FY — unreviewed rows
      will be refreshed automatically.
    </p>
  `;

  const html = baseLayout({
    title: "Form 12BB received",
    subtitle: `FY ${input.financialYear} · ${input.employeeCode}`,
    greeting: `Hi ${input.employeeName.split(" ")[0] ?? input.employeeName},`,
    body,
    companyName: input.companyName,
    accent: "#10b981",
  });

  return { subject, html };
}
