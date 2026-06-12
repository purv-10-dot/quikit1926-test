/**
 * Server-only PDF render entrypoint for Salesperson Performance Reports.
 *
 * Must stay separate from route handlers so Next.js can externalize
 * `@react-pdf/renderer` (Node build). Bundling the browser build causes
 * "Component is not a constructor" at runtime.
 *
 * Usage:
 *   const buffer = await renderSalespersonPdfToBuffer(data);
 */

import type { SalespersonDetailDto } from "@/lib/dashboard/salesperson-detail-types";

export async function renderSalespersonPdfToBuffer(
  data: SalespersonDetailDto,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { SalespersonPdfDocument } = await import("./salesperson-pdf");

  const generatedAt = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const element = SalespersonPdfDocument({ data, generatedAt });
  const out = await renderToBuffer(element);
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

/** Build the standard report filename. */
export function salespersonPdfFileName(userName: string): string {
  const safe = userName.replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "-");
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `Salesperson-Report-${safe}-${date}.pdf`;
}
