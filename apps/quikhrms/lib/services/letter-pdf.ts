import { PDFDocument, StandardFonts, rgb, PDFImage } from "pdf-lib";
import { getObject } from "@/lib/storage";
import { drawDefaultLetterhead } from "@/lib/services/letter-header";

// Generic branded A4 letter renderer: substitutes {{fields}} in an editable body
// template, draws the org letterhead (or the default teal/gold header), seal and
// signature. Shared by the relieving / experience / (future) exit letters.

export interface LetterBranding {
  companyName: string;
  companyAddress?: string | null;
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  footer?: string | null;
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
    console.error(`[letter-pdf] image fetch failed (${key}):`, err);
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

export async function generateLetterPdf(opts: {
  values: Record<string, string>;
  bodyTemplate: string | null | undefined;
  defaultBody: string;
  branding: LetterBranding;
}): Promise<Buffer> {
  const { values, branding } = opts;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const [width, height] = A4;
  const black = rgb(0.1, 0.1, 0.1);
  const marginX = 60;
  const topY = height - 150;
  const bottomY = 130;

  const letterhead = branding.letterheadKey ? await fetchImage(pdf, branding.letterheadKey) : null;
  const signature = branding.signatureKey ? await fetchImage(pdf, branding.signatureKey) : null;

  const newPage = () => {
    const p = pdf.addPage(A4);
    if (letterhead) p.drawImage(letterhead, { x: 0, y: 0, width, height });
    else drawDefaultLetterhead(p, { fontBold, font, companyName: branding.companyName, companyAddress: branding.companyAddress, width, height });
    return p;
  };

  let page = newPage();
  let y = topY;

  const template = opts.bodyTemplate?.trim() || opts.defaultBody;
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
    const bold = /^subject:/i.test(trimmed) || /^to whom it may concern/i.test(trimmed);
    for (const line of wrapText(rawLine, 92)) drawLine(line, bold);
  }

  if (!signatureDrawn) drawSignature();

  if (branding.sealKey) {
    const seal = await fetchImage(pdf, branding.sealKey);
    if (seal) {
      const s = 90;
      page.drawImage(seal, { x: width - marginX - s, y: 110, width: s, height: s, opacity: 0.85 });
    }
  }

  if (branding.footer) {
    let fy = 60;
    for (const line of wrapText(branding.footer, 110).slice(0, 2)) {
      page.drawText(line, { x: marginX, y: fy, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      fy -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
