/**
 * Print route-group layout.
 *
 * Parallel to (vc) / (founder) / (investor). Renders only the page contents
 * with print-friendly styles — no portal chrome (header / sidebar / nav).
 *
 * The root app/layout.tsx still wraps this with <html><body><Providers>, so
 * Tailwind / fonts / theme work, but nothing else from a portal layer
 * leaks through.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
