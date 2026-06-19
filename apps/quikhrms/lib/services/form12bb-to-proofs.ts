import { prisma } from "@/lib/prisma";

// Tag we stamp into InvestmentProof.remarks so we can identify rows this
// service auto-generated (vs ones HR or the employee created directly).
// On re-sync we only delete rows that still carry this tag AND are still
// in Submitted status — once HR has reviewed (Approved/Rejected/etc.) we
// leave the row alone.
const AUTO_TAG = "[Form 12BB Auto]";

interface Form12BBDoc {
  url: string;
  name: string;
  size: number;
  type: string;
  label?: string | null;
  uploadedAt: string;
}

interface DocumentsJson {
  hra?: Form12BBDoc[];
  lta?: Form12BBDoc[];
  homeLoan?: Form12BBDoc[];
  chapterVIA?: Form12BBDoc[];
}

interface DeclSnapshot {
  rentPaid: number;
  hraClaimed: boolean;
  ltaAmount: number;
  ltaClaimed: boolean;
  homeLoanInterest: number;
  section80C: number;
  section80CCC: number;
  section80CCD1: number;
  nps80CCD1B: number;
  section80D: number;
  section80E: number;
  section80G: number;
  section80TTA: number;
}

interface ProofRow {
  section: string;
  investmentType: string;
  declaredAmount: number;
  files: Form12BBDoc[];
}

/**
 * Pull the section code out of a chapterVIA document label.
 * Recognises "80C", "80C — LIC", "80CCD(1B)", "80CCD(1B) — NPS", case-insensitive.
 * Returns the canonical section string (e.g. "80C", "80CCD(1B)") or null.
 */
function parseSectionFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const m = label.trim().match(/^(80[A-Z]+(?:\(1[A-Z]?\))?)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Group chapterVIA documents by the section code parsed from their label.
 * Files without a recognisable label land in the "_unmatched" bucket.
 */
function groupChapterVIADocs(docs: Form12BBDoc[]): Record<string, Form12BBDoc[]> {
  const groups: Record<string, Form12BBDoc[]> = {};
  for (const d of docs) {
    const section = parseSectionFromLabel(d.label) ?? "_unmatched";
    if (!groups[section]) groups[section] = [];
    groups[section].push(d);
  }
  return groups;
}

/**
 * Build the candidate proof rows from a Form 12BB declaration. One row per
 * section that has either a non-zero declared amount OR at least one
 * attached file — so HR sees both "claim with no proof yet" rows (to chase)
 * and "proof for a claim already settled" rows.
 */
function buildProofRows(decl: DeclSnapshot, docs: DocumentsJson): ProofRow[] {
  const rows: ProofRow[] = [];

  // HRA — one row per claim, all hra files attached.
  if (decl.hraClaimed && (decl.rentPaid > 0 || (docs.hra && docs.hra.length > 0))) {
    rows.push({
      section: "10(13A)",
      investmentType: "HouseRent",
      declaredAmount: decl.rentPaid,
      files: docs.hra ?? [],
    });
  }

  // LTA — one row per claim, all lta files attached.
  if (decl.ltaClaimed && (decl.ltaAmount > 0 || (docs.lta && docs.lta.length > 0))) {
    rows.push({
      section: "10(5)",
      investmentType: "LeaveTravel",
      declaredAmount: decl.ltaAmount,
      files: docs.lta ?? [],
    });
  }

  // Home loan interest — one row per claim, all homeLoan files attached.
  if (decl.homeLoanInterest > 0 || (docs.homeLoan && docs.homeLoan.length > 0)) {
    rows.push({
      section: "24B",
      investmentType: "HomeLoanInterest",
      declaredAmount: decl.homeLoanInterest,
      files: docs.homeLoan ?? [],
    });
  }

  // Chapter VI-A — one row per declared section, files split by label parse.
  const chapterDocs = groupChapterVIADocs(docs.chapterVIA ?? []);
  const sections: { key: string; amount: number; type: string }[] = [
    { key: "80C",       amount: decl.section80C,    type: "Section80C" },
    { key: "80CCC",     amount: decl.section80CCC,  type: "PensionFund" },
    { key: "80CCD(1)",  amount: decl.section80CCD1, type: "NPSEmployee" },
    { key: "80CCD(1B)", amount: decl.nps80CCD1B,    type: "NPSAdditional" },
    { key: "80D",       amount: decl.section80D,    type: "HealthInsurance" },
    { key: "80E",       amount: decl.section80E,    type: "EducationLoan" },
    { key: "80G",       amount: decl.section80G,    type: "Donation" },
    { key: "80TTA",     amount: decl.section80TTA,  type: "SavingsInterest" },
  ];
  for (const s of sections) {
    const matched = chapterDocs[s.key] ?? [];
    if (s.amount > 0 || matched.length > 0) {
      rows.push({
        section: s.key,
        investmentType: s.type,
        declaredAmount: s.amount,
        files: matched,
      });
    }
  }

  // Unmatched chapterVIA files — attach to the largest 80* row so HR doesn't
  // lose them. If no 80* row exists, create a generic Section80CMisc row.
  const unmatched = chapterDocs["_unmatched"] ?? [];
  if (unmatched.length > 0) {
    const chapterRows = rows.filter((r) => r.section.startsWith("80"));
    if (chapterRows.length > 0) {
      const target = chapterRows.reduce((a, b) => (a.declaredAmount >= b.declaredAmount ? a : b));
      target.files.push(...unmatched);
    } else {
      rows.push({
        section: "80C",
        investmentType: "Misc",
        declaredAmount: 0,
        files: unmatched,
      });
    }
  }

  return rows;
}

function buildRemarks(files: Form12BBDoc[]): string {
  const header = AUTO_TAG;
  if (files.length === 0) {
    return `${header} Auto-generated from Form 12BB submission. No supporting document attached yet — HR may chase the employee.`;
  }
  if (files.length === 1) {
    return `${header} Auto-generated from Form 12BB submission. Supporting file: ${files[0].name}`;
  }
  const additional = files.slice(1).map((f) => `${f.name} (${f.url})`).join("; ");
  return `${header} Auto-generated from Form 12BB submission. Primary file shown; additional attachments: ${additional}`;
}

/**
 * Idempotent sync of Form 12BB → InvestmentProof rows.
 *
 * Behaviour on re-submit:
 *   - Auto-generated rows still in Submitted status are deleted and re-created
 *     against the latest declaration (amounts may have changed).
 *   - Auto-generated rows that HR has already acted on (Approved / Rejected /
 *     PartiallyApproved / UnderReview) are LEFT UNTOUCHED — HR's review wins.
 *   - Manually-created proof rows (no AUTO_TAG) are never touched.
 *
 * Fire and forget: catches its own errors so a sync failure cannot break
 * the Form 12BB submit.
 */
export async function syncInvestmentProofsFromForm12BB(args: {
  orgId: string;
  employeeId: string;
  financialYear: string;
  decl: DeclSnapshot;
  documents: DocumentsJson;
  userId: string;
}): Promise<{ created: number; replaced: number; preserved: number }> {
  try {
    const { orgId, employeeId, financialYear, decl, documents, userId } = args;
    const rows = buildProofRows(decl, documents);

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.investmentProof.findMany({
        where: { orgId, employeeId, financialYear, deletedAt: null },
        select: { id: true, status: true, remarks: true },
      });

      const autoUnreviewed = existing.filter(
        (r) => r.status === "Submitted" && (r.remarks ?? "").startsWith(AUTO_TAG),
      );
      const preserved = existing.length - autoUnreviewed.length;

      if (autoUnreviewed.length > 0) {
        await tx.investmentProof.deleteMany({
          where: { id: { in: autoUnreviewed.map((r) => r.id) } },
        });
      }

      if (rows.length === 0) {
        return { created: 0, replaced: autoUnreviewed.length, preserved };
      }

      await tx.investmentProof.createMany({
        data: rows.map((r) => ({
          orgId,
          employeeId,
          financialYear,
          section: r.section,
          investmentType: r.investmentType,
          declaredAmount: r.declaredAmount,
          proofAmount: 0,
          fileUrl: r.files[0]?.url ?? null,
          remarks: buildRemarks(r.files),
          status: "Submitted" as const,
          createdBy: userId,
          updatedBy: userId,
        })),
      });

      return { created: rows.length, replaced: autoUnreviewed.length, preserved };
    });
  } catch (err) {
    console.error("[form12bb-to-proofs] sync failed:", err);
    return { created: 0, replaced: 0, preserved: 0 };
  }
}
