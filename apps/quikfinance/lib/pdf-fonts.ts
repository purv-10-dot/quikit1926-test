import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Font family used by all document PDFs. DejaVu Sans is bundled in public/fonts
 * because the built-in Helvetica lacks glyphs for many currency symbols
 * (notably ₹), which would otherwise render as tofu/fallback characters.
 */
export const PDF_FONT = "DejaVuSans";

let registered = false;

/** Register the bundled PDF font once (idempotent). Node runtime only. */
export function registerPdfFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: path.join(dir, "DejaVuSans.ttf"), fontWeight: 400 },
      { src: path.join(dir, "DejaVuSans-Bold.ttf"), fontWeight: 700 }
    ]
  });
  // Keep words intact instead of hyphenating at arbitrary points.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
