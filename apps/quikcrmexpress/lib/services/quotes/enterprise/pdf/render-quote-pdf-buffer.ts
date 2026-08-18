/**
 * Server-only PDF render entrypoint.
 *
 * Must stay separate from route handlers so Next can externalize
 * `@react-pdf/renderer` (Node build). Bundling the browser build causes
 * "Component is not a constructor" at runtime.
 */
import type { QuotePrintPayload } from "./types";

export async function renderQuotePdfToBuffer(payload: QuotePrintPayload): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { QuotePdfDocument } = await import("./render-pdf");
  const element = QuotePdfDocument({ payload });
  const out = await renderToBuffer(element);
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
