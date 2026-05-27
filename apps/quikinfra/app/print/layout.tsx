/**
 * Print-ready layout. Strips dashboard chrome and loads a tiny print.css.
 * Every printable doc lives under /print/<type>/<id>. Opening one renders a
 * browser-native page; user hits Cmd/Ctrl+P → Save as PDF.
 *
 * No dependencies, no PDF library. Production-grade enough for internal ERP.
 */
import "./print.css";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root">{children}</div>;
}
