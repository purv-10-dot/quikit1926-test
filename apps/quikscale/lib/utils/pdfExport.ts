/**
 * Single-page A4 PDF export — captures an HTML element with html2canvas and
 * places it on one A4 portrait page, scaled to fit with an 8 mm safety margin
 * so nothing is clipped at the edges.
 *
 * Used by the FACe / PACe / SWT "Export PDF" buttons.
 *
 * Hardening applied:
 *   - Waits for web fonts before capture (avoids metric drift between the
 *     on-screen preview and the bitmap, which the user perceived as "words
 *     cut off")
 *   - Uses explicit element width/height (not windowWidth/Height) so the
 *     canvas is exactly the element's box
 *   - Renders at scale 2 in pure raster mode (NO foreignObjectRendering —
 *     that path returns canvases with non-pixel units that confuse jsPDF
 *     and balloon the PDF to hundreds of pages)
 *   - Outputs as PNG (lossless — no JPEG chroma-subsampling halos)
 *   - Exactly one addImage call on exactly one A4 page — never paginates
 */

export async function exportElementAsA4PDF(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Wait for any web fonts to finish loading before capture, otherwise text
  // widths shift between layout and capture.
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { /* not fatal */ }
  }

  const [jsPDFMod, h2cMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const JsPDF: any = (jsPDFMod as any).jsPDF ?? (jsPDFMod as any).default;
  const html2canvas: any = (h2cMod as any).default ?? h2cMod;

  // Use the element's natural rendered box for the capture canvas.
  const rect = element.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);

  const canvas: HTMLCanvasElement = await html2canvas(element, {
    width:   w,
    height:  h,
    scale:   2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 0,
    removeContainer: true,
  });

  // A4 portrait in mm with an 8 mm safety margin on every side.
  const pdf = new JsPDF("p", "mm", "a4");
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 8;
  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2;

  // Defensive: if the canvas came back with bogus 0-sized dimensions (rare,
  // but the failure mode is a 100+ page blank PDF if we don't guard), bail
  // with a small error image rather than letting jsPDF auto-paginate.
  const cw = canvas.width  || 1;
  const ch = canvas.height || 1;
  const canvasRatio = cw / ch;
  const boxRatio    = maxW / maxH;
  let renderW: number;
  let renderH: number;
  if (canvasRatio > boxRatio) {
    renderW = maxW;
    renderH = maxW / canvasRatio;
  } else {
    renderH = maxH;
    renderW = maxH * canvasRatio;
  }
  const xOffset = (PAGE_W - renderW) / 2;
  const yOffset = MARGIN;

  // Exactly one PNG image on exactly one A4 page. No addPage() anywhere.
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    xOffset,
    yOffset,
    renderW,
    renderH,
  );
  pdf.save(filename);
}
