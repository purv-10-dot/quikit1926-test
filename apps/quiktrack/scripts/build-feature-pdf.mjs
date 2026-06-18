// Builds QUIKTRACK_FEATURE_DOC.pdf from QUIKTRACK_FEATURE_DOC.md
// Uses `marked` for MD->HTML and Playwright's chromium (system Chrome) for HTML->PDF.
// Run: node scripts/build-feature-pdf.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { marked } from "marked";
import { chromium } from "playwright-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "..");
const mdPath = resolve(appDir, "QUIKTRACK_FEATURE_DOC.md");
const outPath = resolve(appDir, "QUIKTRACK_FEATURE_DOC.pdf");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const md = readFileSync(mdPath, "utf8");
const bodyHtml = marked.parse(md, { gfm: true });

// CSS lifted from _DOCS_COVER.md (QuikTrack docs theme) so the PDF matches house style.
const css = `
  body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1f2937; line-height: 1.55; font-size: 11px; margin: 0; }
  h1 { color: #1e40af; font-size: 26px; margin-top: 38px; padding-bottom: 8px; border-bottom: 3px solid #1e40af; }
  h2 { color: #1e3a8a; font-size: 18px; margin-top: 26px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; page-break-after: avoid; }
  h3 { color: #2563eb; font-size: 14px; margin-top: 18px; page-break-after: avoid; }
  h4 { color: #4b5563; font-size: 12px; margin-top: 12px; }
  p { margin: 6px 0; }
  strong { color: #111827; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-family: "Cascadia Code", Consolas, Menlo, monospace; font-size: 10px; color: #be185d; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10px; page-break-inside: avoid; }
  th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  blockquote { border-left: 4px solid #2563eb; background: #eff6ff; margin: 8px 0; padding: 8px 14px; color: #1e3a8a; font-size: 10.5px; page-break-inside: avoid; }
  blockquote p { margin: 0; }
  ul, ol { margin: 6px 0; padding-left: 22px; }
  li { margin: 2px 0; }
  a { color: #2563eb; text-decoration: none; }
  hr { border: none; border-top: 2px dashed #d1d5db; margin: 22px 0; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`;

const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
const pdf = await page.pdf({
  format: "A4",
  margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-size: 9px; color: #888; width: 100%; text-align: center; padding-top: 6px;">QuikTrack — Feature Guide</div>',
  footerTemplate:
    '<div style="font-size: 9px; color: #888; width: 100%; text-align: center; padding-bottom: 6px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> &nbsp;·&nbsp; QuikIT Platform &nbsp;·&nbsp; Confidential</div>',
});
await browser.close();
writeFileSync(outPath, pdf);
console.log("Wrote " + outPath + " (" + (pdf.length / 1024).toFixed(0) + " KB)");
