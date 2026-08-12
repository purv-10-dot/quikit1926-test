import Link from "next/link";
import type { ReactNode } from "react";

// Shown when a page's backing platform/account isn't connected — replaces the
// old sample/mock data so nothing fake is ever displayed.
export default function NotConnected({
  icon = "🔌",
  title,
  body,
  ctaHref = "/integrations",
  ctaLabel = "Go to Integrations",
  children,
}: {
  icon?: string;
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ textAlign: "center", padding: "48px 24px", maxWidth: 460, margin: "24px auto" }}
    >
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{title}</h3>
      <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>{body}</p>
      <Link href={ctaHref} className="btn btn-primary" style={{ display: "inline-flex" }}>
        {ctaLabel}
      </Link>
      {children}
    </div>
  );
}
