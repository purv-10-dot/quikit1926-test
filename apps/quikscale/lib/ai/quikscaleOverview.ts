/**
 * Static QuikScale context fed to the meeting-report model.
 *
 * The transcript alone doesn't tell the model what a "KPI", "Priority", or
 * "WWW" means in this product, nor what a good daily-huddle / weekly-meeting
 * report looks like. This constant supplies that framing so extraction and the
 * report structure stay faithful to the Scaling Up Meeting Rhythm the app is
 * built around. Kept in code (not the DB) — it's product vocabulary, not tenant
 * data, and it lets the prompt be prompt-cached and unit-tested deterministically.
 */
export const QUIKSCALE_OVERVIEW = `QuikScale is a performance-management app built on the Scaling Up / Rockefeller Habits framework. It runs a "Meeting Rhythm" of Daily Huddles and Weekly Meetings, and tracks three record types:

- KPI (Key Performance Indicator): a measurable metric with a name, a measurement unit (Number, Percentage, Currency, or Ratio) and a target, reviewed weekly. Example: "Avg. % of calls answered", target 95, unit Percentage.
- Priority: a named quarterly rock/objective an owner is accountable for. Example: "Launch India marketing plan".
- WWW (Who / What / When): a concrete action item — who owns it, what they will do, and by when. Example: who "Vikram", what "Finalise the KES-story deck", when 2026-06-20.

A Daily Huddle follows an adherence format: each participant states a Significant Achievement (yesterday), a Focus Area (today), and any Stuck / blocker. Each of the three is rated YES (complete, specific), PARTIAL (vague/incomplete), or NO (not addressed), producing a per-person score (x/3) and a rating (FULL / GOOD / PARTIAL / POOR).

A Weekly Meeting follows a segment agenda: Good News Sharing, K&P (KPI & Priority) Dashboard Review, GAPS & Action Plan, WWW review, Customer/Employee Feedback, Collective Intelligence, and OPSP Review. Each segment is assessed for coverage and time discipline; a scorecard rates the meeting on metrics like punctuality, end-time adherence, and attendance using a RAG (GREEN / AMBER / RED) scale.`;
