import { emailShell, hero, detailBlock, alert, btnSecondary, para, esc } from "./_base";

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

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildForm12BBAckEmail(input: Form12BBAckInput): { subject: string; html: string } {
  const subject = `Form 12BB acknowledgment — FY ${input.financialYear}`;

  const summaryRows: Array<[string, string]> = [
    ["Financial Year", esc(input.financialYear)],
    ["Submitted On", esc(formatDate(input.submittedAt))],
    ["HRA Claimed", input.hraClaimed ? "Yes" : "No"],
    ["Rent Paid", esc(`₹${input.rentPaid.toLocaleString("en-IN")}`)],
    ["LTA", input.ltaClaimed ? esc(`₹${input.ltaAmount.toLocaleString("en-IN")}`) : "Not claimed"],
    ["Home Loan Interest", esc(`₹${input.homeLoanInterest.toLocaleString("en-IN")}`)],
    ["Chapter VI-A Total", esc(`₹${input.chapterVIATotal.toLocaleString("en-IN")}`)],
  ];

  const dc = input.documentCounts;
  const totalDocs = dc.hra + dc.lta + dc.homeLoan + dc.chapterVIA;

  const docRows: Array<[string, string]> = [];
  if (dc.hra > 0) docRows.push(["HRA — Supporting Documents", esc(`${dc.hra} file${dc.hra > 1 ? "s" : ""}`)]);
  if (dc.lta > 0) docRows.push(["LTA — Travel Proofs", esc(`${dc.lta} file${dc.lta > 1 ? "s" : ""}`)]);
  if (dc.homeLoan > 0) docRows.push(["Home Loan — Interest Certificate", esc(`${dc.homeLoan} file${dc.homeLoan > 1 ? "s" : ""}`)]);
  if (dc.chapterVIA > 0) docRows.push(["Chapter VI-A — Investment Proofs", esc(`${dc.chapterVIA} file${dc.chapterVIA > 1 ? "s" : ""}`)]);

  const body = `
    ${hero({
      title: "Form 12BB Received",
      subtitle: `Your tax declaration for FY ${esc(input.financialYear)} has been recorded.`,
      accent: "blue",
    })}
    ${para(`Hi ${esc(input.employeeName.split(" ")[0] ?? input.employeeName)}, we have received your Form 12BB declaration (Employee ${esc(input.employeeCode)}). Your monthly TDS will be re-computed against the figures below.`)}
    ${detailBlock(summaryRows, { heading: "Declaration Summary", accent: "blue" })}
    ${docRows.length > 0
      ? detailBlock(docRows, { heading: `Supporting Documents (${totalDocs})`, accent: "blue" })
      : para(`No supporting documents were attached. If you claim exemptions or Chapter VI-A deductions, the payroll team may request proofs.`)}
    ${alert("success", "Your declaration has been received and recorded. No further action needed unless payroll requests documents.")}
    ${input.signedFileUrl ? btnSecondary("Download Signed Copy", input.signedFileUrl) : ""}
  `;

  const html = emailShell({
    accent: "blue",
    companyName: input.companyName,
    preheader: `Form 12BB received for FY ${input.financialYear}`,
    body,
  });

  return { subject, html };
}
