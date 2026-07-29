import { PDFPage, PDFFont, rgb } from "pdf-lib";

// Drawn default letterhead (teal block + gold accent + logo initial + company
// name) used on offer/joining/resignation letters when the org hasn't uploaded
// its own letterhead image. Approximates the branded template look.
export function drawDefaultLetterhead(
  page: PDFPage,
  opts: { fontBold: PDFFont; font: PDFFont; companyName: string; companyAddress?: string | null; width: number; height: number },
): void {
  const { fontBold, font, width, height } = opts;
  const teal = rgb(0.18, 0.28, 0.27);
  const gold = rgb(0.76, 0.63, 0.42);
  const grey = rgb(0.42, 0.45, 0.5);

  // Top-right teal block with a gold underline stripe.
  page.drawRectangle({ x: width - 160, y: height - 82, width: 160, height: 82, color: teal });
  page.drawRectangle({ x: width - 160, y: height - 88, width: 160, height: 5, color: gold });
  // Logo initial inside the block.
  const initial = `${(opts.companyName?.trim()?.[0] ?? "A").toUpperCase()}.`;
  page.drawText(initial, { x: width - 108, y: height - 52, size: 22, font: fontBold, color: rgb(1, 1, 1) });

  // Company name + address top-left, with a gold rule beneath.
  page.drawText(opts.companyName || "", { x: 60, y: height - 52, size: 15, font: fontBold, color: teal });
  if (opts.companyAddress) {
    page.drawText(opts.companyAddress.slice(0, 90), { x: 60, y: height - 68, size: 9, font, color: grey });
  }
  page.drawRectangle({ x: 60, y: height - 78, width: 190, height: 2.5, color: gold });
}
