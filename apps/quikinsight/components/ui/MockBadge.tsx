"use client";

/**
 * "Mock" stamp for a card or section whose data source is not connected.
 *
 * QuikInsight shows sample data per-source: a connected source renders real
 * numbers, an unconnected one keeps its sample so the page stays populated
 * while a workspace is onboarded. That mix is only acceptable if every sampled
 * surface says so AT THE POINT OF DISPLAY — a reader glancing at one card must
 * not have to remember which integrations exist. This stamp is that guarantee;
 * do not render sample figures without it.
 *
 * Wrap the section in `.mock-wrap` (position: relative) and drop this inside.
 */
export default function MockBadge({
  title = "Sample data — connect this source to see your real numbers",
}: {
  title?: string;
}) {
  return (
    <span className="mock-badge" title={title} aria-label="Mock data">
      Mock
    </span>
  );
}
