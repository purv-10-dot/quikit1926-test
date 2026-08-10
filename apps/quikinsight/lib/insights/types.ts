// Shape of the rule-based insights report that gets rendered into the email.
// No AI — every field below is produced deterministically in generator.ts.

export type SectionKey = "seo" | "social" | "sales";

export interface MetricCard {
  label: string;
  value: string;          // preformatted for display (e.g. "12.4K", "$48K", "3.2%")
  /** Optional week-over-week style delta, already signed & formatted (e.g. "+8.1%"). */
  delta?: string | null;
  deltaDirection?: "up" | "down" | "flat" | null;
  /** Small caption under the value (e.g. "avg. position", "last 7 days"). */
  hint?: string | null;
}

export interface PlatformBlock {
  platform: string;       // display name, e.g. "Google Analytics 4"
  /** True when connected but the API returned no usable data (token/scope/etc.). */
  dataUnavailable?: boolean;
  note?: string | null;   // human explanation when data is limited/unavailable
  cards: MetricCard[];
}

export interface ReportSection {
  key: SectionKey;
  title: string;          // "SEO Team Performance"
  emoji: string;
  accent: string;         // hex accent used by the email template
  blocks: PlatformBlock[];
  summary: string;        // 1–3 sentence rollup for the section
  suggestions: string[];  // rule-based, actionable recommendations
}

export interface InsightsReport {
  periodLabel: string;    // e.g. "Jul 2–9, 2026" / "last 7 days"
  frequencyLabel: string; // "Daily" | "Weekly" | "Monthly"
  generatedAt: string;    // ISO
  /** Only sections whose group has at least one connected platform appear here. */
  sections: ReportSection[];
  /** Headline summary spanning all sections. */
  overallSummary: string;
  /** True when the user has no connected platforms at all → nothing to send. */
  empty: boolean;
}
