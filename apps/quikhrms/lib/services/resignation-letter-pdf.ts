import { PDFDocument, StandardFonts, rgb, PDFImage } from "pdf-lib";
import { getObject } from "@/lib/storage";
import { DEFAULT_RESIGNATION_LETTER_BODY } from "@/lib/offboarding/resignation-letter-fields";
import { drawDefaultLetterhead } from "@/lib/services/letter-header";

export interface ResignationLetterPdfInput {
  employeeName: string;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  resignationDate: string;
  lastWorkingDay: string;
  noticePeriod?: string | null;
  companyName: string;
  companyAddress?: string | null;
  letterDate: string;
  // Branding assets — storage object keys (shared with offer/joining letters).
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  footer?: string | null;
  /** Editable body with {{placeholders}}. Falls back to the built-in default. */
  bodyTemplate?: string | null;
}

function fieldValues(input: ResignationLetterPdfInput): Record<string, string> {
  return {
    employeeName: input.employeeName ?? "",
    employeeCode: input.employeeCode ?? "",
    designation: input.designation ?? "",
    department: input.department ?? "",
    resignationDate: input.resignationDate ?? "",
    lastWorkingDay: input.lastWorkingDay ?? "",
    noticePeriod: input.noticePeriod ?? "",
    companyName: input.companyName ?? "",
    companyAddress: input.companyAddress ?? "",
    letterDate: input.letterDate ?? "",
    signatoryName: input.signatoryName ?? "",
    signatoryDesignation: input.signatoryDesignation ?? "",
  };
}

async function fetchImage(pdf: PDFDocument, key: string): Promise<PDFImage | null> {
  try {
    const obj = await getObject(key);
    const ct = (obj.contentType || "").toLowerCase();
    if (ct.includes("png")) return await pdf.embedPng(obj.body);
    if (ct.includes("jpeg") || ct.includes("jpg")) return await pdf.embedJpg(obj.body);
    if (obj.body[0] === 0x89 && obj.body[1] === 0x50) return await pdf.embedPng(obj.body);
    if (obj.body[0] === 0xff && obj.body[1] === 0xd8) return await pdf.embedJpg(obj.body);
    return null;
  } catch (err) {
    console.error(`[resignation-letter-pdf] image fetch failed (${key}):`, err);
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

/** Renders the resignation-acceptance letter as an A4 PDF. Mirrors the joining
 *  letter: org branding (letterhead/seal/signature) + editable {{body}} template. */
export async function generateResignationLetterPdf(input: ResignationLetterPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const [width, height] = A4;
  const black = rgb(0.1, 0.1, 0.1);
  const marginX = 60;
  const topY = height - 150;
  const bottomY = 130;

  const letterhead = input.letterheadKey ? await fetchImage(pdf, input.letterheadKey) : null;
  const signature = input.signatureKey ? await fetchImage(pdf, input.signatureKey) : null;

  const newPage = () => {
    const p = pdf.addPage(A4);
    if (letterhead) p.drawImage(letterhead, { x: 0, y: 0, width, height });
    else drawDefaultLetterhead(p, { fontBold, font, companyName: input.companyName, companyAddress: input.companyAddress, width, height });
    return p;
  };

  let page = newPage();
  let y = topY;

  const values = fieldValues(input);
  const template = input.bodyTemplate?.trim() || DEFAULT_RESIGNATION_LETTER_BODY;
  const body = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) =>
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

  if (!signatureDrawn) drawSignature();

  if (input.sealKey) {
    const seal = await fetchImage(pdf, input.sealKey);
    if (seal) {
      const s = 90;
      page.drawImage(seal, { x: width - marginX - s, y: 110, width: s, height: s, opacity: 0.85 });
    }
  }

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
