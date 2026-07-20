import { PDFDocument, StandardFonts, rgb, PDFImage, PDFFont } from "pdf-lib";
import { getObject } from "@/lib/storage";

export interface OfferPdfInput {
  candidateName: string;
  candidateAddress?: string | null;
  jobTitle: string;
  designation?: string | null;
  offeredCTC: number;
  joiningDate: string;
  joiningBonus?: number | null;
  relocationBonus?: number | null;
  equityGrant?: string | null;
  expiresAt?: string | null;
  department?: string | null;
  reportingTo?: string | null;
  companyName: string;
  companyAddress?: string | null;
  letterDate: string;
  // Branding assets — storage object keys
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  footer?: string | null;
  /**
   * Editable body template with {{dynamic}} placeholders. When set, it fully
   * replaces the built-in hardcoded letter body (see lib/recruit/offer-letter-fields.ts).
   */
  bodyTemplate?: string | null;
}

/** Resolve every {{field}} in a template against the offer's values. */
function offerFieldValues(input: OfferPdfInput): Record<string, string> {
  return {
    candidateName: input.candidateName ?? "",
    candidateAddress: input.candidateAddress ?? "",
    jobTitle: input.jobTitle ?? "",
    designation: input.designation ?? input.jobTitle ?? "",
    ctc: inr(Number(input.offeredCTC)),
    joiningDate: input.joiningDate ?? "",
    joiningBonus: input.joiningBonus ? inr(Number(input.joiningBonus)) : "",
    relocationBonus: input.relocationBonus ? inr(Number(input.relocationBonus)) : "",
    equityGrant: input.equityGrant ?? "",
    offerValidUntil: input.expiresAt ?? "",
    department: input.department ?? "",
    reportingManager: input.reportingTo ?? "",
    companyName: input.companyName ?? "",
    companyAddress: input.companyAddress ?? "",
    letterDate: input.letterDate ?? "",
    signatoryName: input.signatoryName ?? "",
    signatoryDesignation: input.signatoryDesignation ?? "",
  };
}

function inr(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN")}`;
}

async function fetchImage(pdf: PDFDocument, key: string): Promise<PDFImage | null> {
  try {
    const obj = await getObject(key);
    const ct = (obj.contentType || "").toLowerCase();
    if (ct.includes("png")) return await pdf.embedPng(obj.body);
    if (ct.includes("jpeg") || ct.includes("jpg")) return await pdf.embedJpg(obj.body);
    // Fallback sniff by magic bytes
    if (obj.body[0] === 0x89 && obj.body[1] === 0x50) return await pdf.embedPng(obj.body);
    if (obj.body[0] === 0xff && obj.body[1] === 0xd8) return await pdf.embedJpg(obj.body);
    return null;
  } catch (err) {
    console.error(`[offer-pdf] image fetch failed (${key}):`, err);
    return null;
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const A4: [number, number] = [595.28, 841.89];

export async function generateOfferPdf(input: OfferPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  // ── Editable-template path ──────────────────────────────────────────────
  // When an org has authored a custom body, render it (with {{field}}
  // substitution, wrapping and pagination) instead of the built-in letter.
  if (input.bodyTemplate && input.bodyTemplate.trim()) {
    return renderTemplatePdf(pdf, font, fontBold, input);
  }

  const page = pdf.addPage(A4); // A4
  const { width, height } = page.getSize();

  // Letterhead background (full page)
  if (input.letterheadKey) {
    const img = await fetchImage(pdf, input.letterheadKey);
    if (img) {
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
  }

  // Content margins allow letterhead header/footer zones to show
  const marginX = 60;
  let y = height - 160; // leave space for letterhead header

  const black = rgb(0.1, 0.1, 0.1);

  // Letter date
  page.drawText(input.letterDate, { x: marginX, y, size: 11, font, color: black });
  y -= 30;

  // Candidate address block
  page.drawText(input.candidateName, { x: marginX, y, size: 11, font: fontBold, color: black });
  y -= 14;
  if (input.candidateAddress) {
    for (const line of input.candidateAddress.split(/\r?\n/).slice(0, 3)) {
      page.drawText(line, { x: marginX, y, size: 10, font, color: black });
      y -= 13;
    }
  }
  y -= 14;

  // Subject
  page.drawText(`Subject: Offer of Employment — ${input.jobTitle}`, {
    x: marginX, y, size: 12, font: fontBold, color: black,
  });
  y -= 24;

  page.drawText(`Dear ${input.candidateName},`, { x: marginX, y, size: 11, font, color: black });
  y -= 20;

  const intro = `We are pleased to offer you the position of ${input.designation ?? input.jobTitle} at ${input.companyName}. We believe your skills and experience will be a valuable addition to our team. Key terms of your employment are set out below.`;
  for (const line of wrapText(intro, 92)) {
    page.drawText(line, { x: marginX, y, size: 11, font, color: black });
    y -= 14;
  }
  y -= 10;

  // Terms
  const terms: Array<[string, string]> = [
    ["Designation", input.designation ?? input.jobTitle],
    ["Annual CTC", inr(Number(input.offeredCTC))],
    ["Joining Date", input.joiningDate],
  ];
  if (input.department) terms.push(["Department", input.department]);
  if (input.reportingTo) terms.push(["Reporting Manager", input.reportingTo]);
  if (input.joiningBonus) terms.push(["Joining Bonus", inr(Number(input.joiningBonus))]);
  if (input.relocationBonus) terms.push(["Relocation Allowance", inr(Number(input.relocationBonus))]);
  if (input.equityGrant) terms.push(["Equity Grant", input.equityGrant]);
  if (input.expiresAt) terms.push(["Offer Valid Until", input.expiresAt]);

  for (const [k, v] of terms) {
    page.drawText(`${k}:`, { x: marginX, y, size: 11, font: fontBold, color: black });
    page.drawText(v, { x: marginX + 150, y, size: 11, font, color: black });
    y -= 16;
  }
  y -= 10;

  const outro = `This offer is contingent upon successful completion of background verification and submission of required documents. Please sign and return this letter to confirm acceptance.`;
  for (const line of wrapText(outro, 92)) {
    page.drawText(line, { x: marginX, y, size: 11, font, color: black });
    y -= 14;
  }
  y -= 18;

  page.drawText("We look forward to welcoming you to the team.", {
    x: marginX, y, size: 11, font, color: black,
  });
  y -= 30;

  page.drawText("Sincerely,", { x: marginX, y, size: 11, font, color: black });
  y -= 50;

  // Signature image
  if (input.signatureKey) {
    const sig = await fetchImage(pdf, input.signatureKey);
    if (sig) {
      const sigDims = sig.scale(0.35);
      const capped = sigDims.width > 160 ? sig.scale((160 / sigDims.width) * 0.35) : sigDims;
      page.drawImage(sig, { x: marginX, y, width: capped.width, height: capped.height });
    }
  }
  y -= 10;

  if (input.signatoryName) {
    page.drawText(input.signatoryName, { x: marginX, y, size: 11, font: fontBold, color: black });
    y -= 13;
  }
  if (input.signatoryDesignation) {
    page.drawText(input.signatoryDesignation, { x: marginX, y, size: 10, font, color: black });
    y -= 13;
  }
  page.drawText(input.companyName, { x: marginX, y, size: 10, font, color: black });

  // Seal (bottom-right)
  if (input.sealKey) {
    const seal = await fetchImage(pdf, input.sealKey);
    if (seal) {
      const sealSize = 90;
      page.drawImage(seal, {
        x: width - marginX - sealSize,
        y: 110,
        width: sealSize,
        height: sealSize,
        opacity: 0.85,
      });
    }
  }

  // Footer text
  if (input.footer) {
    const footerLines = wrapText(input.footer, 110);
    let fy = 60;
    for (const line of footerLines.slice(0, 2)) {
      page.drawText(line, { x: marginX, y: fy, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      fy -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/**
 * Renders an org's editable body template: substitutes {{fields}}, wraps long
 * lines, and paginates over as many A4 pages as needed (letterhead repeated on
 * each). `{{signature}}` on its own line draws the uploaded signature image at
 * that position; the seal + footer are placed on the final page.
 */
async function renderTemplatePdf(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  input: OfferPdfInput,
): Promise<Buffer> {
  const [width, height] = A4;
  const black = rgb(0.1, 0.1, 0.1);
  const marginX = 60;
  const topY = height - 150; // leave room for the letterhead header band
  const bottomY = 130; // leave room for seal / footer

  const letterhead = input.letterheadKey ? await fetchImage(pdf, input.letterheadKey) : null;
  const signature = input.signatureKey ? await fetchImage(pdf, input.signatureKey) : null;

  const newPage = () => {
    const p = pdf.addPage(A4);
    if (letterhead) p.drawImage(letterhead, { x: 0, y: 0, width, height });
    return p;
  };

  let page = newPage();
  let y = topY;

  const values = offerFieldValues(input);
  const body = (input.bodyTemplate ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? values[k] : `{{${k}}}`,
  );

  const drawLine = (text: string, bold: boolean) => {
    if (y < bottomY) { page = newPage(); y = topY; }
    page.drawText(text, { x: marginX, y, size: 11, font: bold ? fontBold : font, color: black });
    y -= 15;
  };

  let signatureDrawn = false;
  const drawSignature = () => {
    if (!signature) return;
    const base = signature.scale(0.35);
    const dims = base.width > 160 ? signature.scale((160 / base.width) * 0.35) : base;
    if (y - dims.height < bottomY) { page = newPage(); y = topY; }
    page.drawImage(signature, { x: marginX, y: y - dims.height, width: dims.width, height: dims.height });
    y -= dims.height + 6;
    signatureDrawn = true;
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "{{signature}}") { drawSignature(); continue; }
    if (trimmed === "") { y -= 8; if (y < bottomY) { page = newPage(); y = topY; } continue; }
    const bold = /^subject:/i.test(trimmed);
    for (const line of wrapText(rawLine, 92)) drawLine(line, bold);
  }

  // If the template never placed the signature, drop it after the body.
  if (!signatureDrawn) drawSignature();

  // Seal (bottom-right) on the final page.
  if (input.sealKey) {
    const seal = await fetchImage(pdf, input.sealKey);
    if (seal) {
      const s = 90;
      page.drawImage(seal, { x: width - marginX - s, y: 110, width: s, height: s, opacity: 0.85 });
    }
  }

  // Footer text on the final page.
  if (input.footer) {
    let fy = 60;
    for (const line of wrapText(input.footer, 110).slice(0, 2)) {
      page.drawText(line, { x: marginX, y: fy, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      fy -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
