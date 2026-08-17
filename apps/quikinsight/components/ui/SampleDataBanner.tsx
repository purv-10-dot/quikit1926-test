"use client";
import Link from "next/link";

/**
 * Shown on any page rendering sample data instead of the workspace's own.
 *
 * This is the honesty half of the sample-data fallback (see lib/api/sample.ts).
 * It is deliberately NOT dismissible-by-default-forever: the numbers behind it
 * are fictional, and a user who scrolls past a dismissed notice can screenshot
 * a dashboard of invented performance figures for a client. It stays until the
 * platform is actually connected.
 */
export default function SampleDataBanner({
  platform,
  href = "/integrations",
}: {
  /** Human name of the platform, e.g. "Google Analytics". */
  platform: string;
  href?: string;
}) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        background: "var(--accent-soft)",
        color: "var(--accent-ink)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 13,
      }}
    >
      {/* The same amber stamp the individual cards carry, so a page-level
          sample and a card-level one read as the same thing. */}
      <span className="mock-badge mock-badge-inline" aria-label="Mock data">Mock</span>
      <span>
        <b>Sample data.</b> These figures are an example, not your account.{" "}
        Connect {platform} to see your real numbers.
      </span>
      <Link href={href} className="btn btn-sm" style={{ marginLeft: "auto" }}>
        Connect {platform}
      </Link>
    </div>
  );
}
