/**
 * Generates a marketing feature-list PDF for QuikHRMS.
 * Run:  npx tsx scripts/generate-feature-pdf.ts
 * Output: QuikHRMS-Features.pdf (project root)
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { writeFileSync } from "fs";

const NAVY = rgb(0.086, 0.141, 0.227);   // #16243A
const BLUE = rgb(0.149, 0.388, 0.922);   // #2563eb
const GRAY = rgb(0.42, 0.45, 0.5);
const LIGHT = rgb(0.93, 0.95, 0.98);
const DARK = rgb(0.1, 0.12, 0.16);

interface Section { title: string; tagline: string; features: string[] }

const SECTIONS: Section[] = [
  {
    title: "Core Workspace",
    tagline: "A role-aware home for every employee, manager, and admin.",
    features: [
      "Personalised dashboard with role-based widgets (KPIs, approvals, announcements, check-in)",
      "Personal To-Do / task tracker",
      "Built-in Help Desk with ticket categories, auto-assignment & SLA tracking",
      "Real-time in-app notifications and email alerts",
    ],
  },
  {
    title: "People & Org Management",
    tagline: "Your single source of truth for the workforce.",
    features: [
      "Employee directory with rich profiles and document vault",
      "Interactive org chart (drag-to-reassign reporting lines)",
      "Employment history & career-change tracking (promotions, transfers, revisions)",
      "Guided onboarding & offboarding workflows with task checklists",
      "Delegation of duties for leave/approval coverage",
      "Bulk employee import",
    ],
  },
  {
    title: "Time & Attendance",
    tagline: "Accurate, automated attendance with zero spreadsheets.",
    features: [
      "Web check-in/out with self, team & admin views",
      "Attendance regularisation requests and approvals",
      "Duty roster & shift management",
      "Time logs / timesheets against projects",
    ],
  },
  {
    title: "Leave Management",
    tagline: "Flexible policies that match how your company actually works.",
    features: [
      "Configurable leave types: paid, half-day, carry-forward, encashment, comp-off",
      "Per-month / per-year frequency caps with enforcement on apply",
      "Eligibility, consecutive-day limits, holiday & week-off inclusion rules",
      "Leave groups assignable by employee or role",
      "Shared leave calendar and AI-parsed policy documents",
      "Work-from-home requests",
    ],
  },
  {
    title: "Payroll (India-ready)",
    tagline: "Run compliant payroll end-to-end.",
    features: [
      "Salary structures & templates, pay runs and payslips",
      "Statutory: PF, ESI, Professional Tax and TDS with overrides",
      "TDS challans, tax filings and Form-16 generation",
      "One-time pay & deductions, full-and-final settlement",
      "Mid-year joiner / prior-payroll handling",
      "Loans, advances & giving; payroll analytics and reports",
      "Self-service payslips for employees",
    ],
  },
  {
    title: "Expenses & Claims",
    tagline: "Spend control with policy-driven approvals.",
    features: [
      "Expense claims with receipts and policy validation",
      "Multi-level approval chains enforced by role (manager, department head, HR, finance)",
      "Reimbursements, FBP, IT declarations and proof-of-investment",
      "Spend limits per transaction / month / year",
    ],
  },
  {
    title: "Performance & Growth",
    tagline: "Continuous performance, not once-a-year reviews.",
    features: [
      "Goals / OKRs with progress tracking",
      "KRA / KPI templates and assignments",
      "Appraisal cycles and reviews",
      "Continuous feedback and recognition",
      "Performance Improvement Plans (PIP)",
    ],
  },
  {
    title: "Recruitment (ATS)",
    tagline: "From requisition to offer in one pipeline.",
    features: [
      "Job requisitions with approval flow",
      "Candidate pipeline with drag-and-drop stages",
      "AI resume parsing and ATS match scoring",
      "Interview scheduling & structured feedback",
      "Offer management and candidate document collection",
    ],
  },
  {
    title: "Engagement",
    tagline: "Build culture and hear your people.",
    features: [
      "Company social wall and announcements",
      "Recognition & shout-outs",
      "Pulse surveys",
    ],
  },
  {
    title: "Assets & Documents",
    tagline: "Track company property and paperwork.",
    features: [
      "Asset allocation, returns and scrap tracking",
      "Company document library with acknowledgements",
      "Document templates (offer/experience letters) with e-sign",
      "Personal document vault per employee",
    ],
  },
  {
    title: "Insights & Reporting",
    tagline: "Decisions backed by live data.",
    features: [
      "Custom dashboards and HR analytics",
      "Self-serve query builder and exports",
      "Attrition, headcount and compensation analytics",
    ],
  },
  {
    title: "Automation & Workflows",
    tagline: "Let the system do the repetitive work.",
    features: [
      "No-code workflow rules (triggers, conditions, actions)",
      "Event-driven emails, notifications and tasks",
      "Webhooks for external integrations",
      "Scheduled jobs (SLA breach, auto-close, payroll prep)",
    ],
  },
  {
    title: "Security & Administration",
    tagline: "Enterprise-grade control and isolation.",
    features: [
      "Multi-tenant SaaS — strict per-organisation data isolation",
      "Granular role-based access control (RBAC) with custom roles & permissions",
      "Self / team / org data scoping on every module",
      "Email + 2FA login, account lockout, audit trail of every change",
      "User invitations, bulk onboarding and lifecycle management",
    ],
  },
];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function main() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const footer = (p: PDFPage) => {
    p.drawText("QuikHRMS  |  Modern HR Management Suite", { x: MARGIN, y: 28, size: 8, font, color: GRAY });
    p.drawText("Confidential — for marketing use", { x: PAGE_W - MARGIN - font.widthOfTextAtSize("Confidential — for marketing use", 8), y: 28, size: 8, font, color: GRAY });
  };

  const newPage = () => { footer(page); page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (h: number) => { if (y - h < 60) newPage(); };

  // ── Cover band ──
  page.drawRectangle({ x: 0, y: PAGE_H - 150, width: PAGE_W, height: 150, color: NAVY });
  page.drawText("QuikHRMS", { x: MARGIN, y: PAGE_H - 78, size: 34, font: bold, color: rgb(1, 1, 1) });
  page.drawText("The all-in-one HR platform for modern teams", { x: MARGIN, y: PAGE_H - 104, size: 13, font, color: rgb(0.8, 0.86, 0.95) });
  page.drawText("Feature Overview", { x: MARGIN, y: PAGE_H - 132, size: 11, font: bold, color: BLUE });
  y = PAGE_H - 175;

  const intro = "QuikHRMS unifies the entire employee lifecycle — hire, onboard, pay, manage, engage and grow — in one secure, multi-tenant platform. Below is a module-by-module overview of what's included.";
  for (const ln of wrap(font, 10.5, intro, CONTENT_W)) {
    page.drawText(ln, { x: MARGIN, y, size: 10.5, font, color: DARK });
    y -= 15;
  }
  y -= 12;

  // ── Sections ──
  for (const s of SECTIONS) {
    ensure(70);
    // Heading bar
    page.drawRectangle({ x: MARGIN, y: y - 22, width: CONTENT_W, height: 26, color: LIGHT });
    page.drawRectangle({ x: MARGIN, y: y - 22, width: 4, height: 26, color: BLUE });
    page.drawText(s.title, { x: MARGIN + 12, y: y - 14, size: 13, font: bold, color: NAVY });
    y -= 30;
    page.drawText(s.tagline, { x: MARGIN + 12, y, size: 9.5, font, color: GRAY });
    y -= 18;

    for (const f of s.features) {
      const lines = wrap(font, 10, f, CONTENT_W - 28);
      ensure(lines.length * 14 + 4);
      page.drawText("•", { x: MARGIN + 12, y, size: 10, font: bold, color: BLUE });
      lines.forEach((ln, i) => {
        page.drawText(ln, { x: MARGIN + 26, y: y - i * 13, size: 10, font, color: DARK });
      });
      y -= lines.length * 13 + 4;
    }
    y -= 14;
  }

  footer(page);

  const bytes = await pdf.save();
  writeFileSync("QuikHRMS-Features.pdf", bytes);
  console.log("✅ Wrote QuikHRMS-Features.pdf (" + Math.round(bytes.length / 1024) + " KB, " + pdf.getPageCount() + " pages)");
}

main().catch((e) => { console.error(e); process.exit(1); });
