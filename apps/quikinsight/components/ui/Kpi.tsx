export interface KpiProps {
  label: string;
  value: string;
  /**
   * Comparison fields are optional: the platform pages (Mailchimp, YouTube, X,
   * Search Console, …) use Kpi as a plain label/value tile and have no delta to
   * show. The overview KPI strip passes all three.
   */
  delta?: string;
  trend?: "up" | "down" | "flat";
  sub?: string;
  /**
   * Why the delta reads the way it does.
   *
   * "unavailable" renders an em-dash with an explanatory tooltip, so a source
   * that genuinely cannot report a past window looks deliberate rather than
   * broken — and is never confused with a real 0% change.
   */
  comparison?: "available" | "unavailable" | "off";
  /** Tints the value, e.g. a platform brand colour or red for a bad-news metric. */
  color?: string;
}

export default function Kpi({ label, value, delta, trend = "flat", sub, comparison, color }: KpiProps) {
  const unavailable = comparison === "unavailable";

  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <div className="kpi-row">
        <span className="kpi-value" style={color ? { color } : undefined}>{value}</span>
        {unavailable ? (
          <span
            className="kpi-delta flat"
            title="This source only reports a current snapshot, so there is no earlier figure to compare against."
          >
            —
          </span>
        ) : (
          delta && <span className={`kpi-delta ${trend}`}>{delta}</span>
        )}
      </div>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}
