"use client";
import Link from "next/link";

/**
 * Marker for a card whose source is not connected, on a workspace that IS live.
 *
 * Counterpart to <MockBadge />, and they are mutually exclusive by design:
 * MockBadge means "these numbers are invented", this means "these numbers are
 * real and they are zero, because nothing is feeding them". Once a workspace
 * connects anything, samples stop everywhere (see lib/api/sample.ts), so the
 * honest state for a still-unconnected source is zeros plus this marker rather
 * than fabricated figures sitting beside genuine ones.
 *
 * Wrap the section in `.mock-wrap` (position: relative) and drop this inside.
 */
export default function ConnectSourceBadge({
  href = "/integrations",
  label = "Connect source",
  title = "No data — connect this source in Integrations to populate this card",
}: {
  href?: string;
  label?: string;
  title?: string;
}) {
  return (
    <Link href={href} className="connect-badge" title={title} aria-label={title}>
      {label}
    </Link>
  );
}
