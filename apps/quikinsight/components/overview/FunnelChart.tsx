export interface FunnelStage {
  label: string;
  value: number;
}

/** Generic labeled-bar funnel. Used by both the Dashboard (marketing funnel) and Leads (CRM funnel) pages. */
export default function FunnelChart({ stages, color = "#6C5CE0" }: { stages: FunnelStage[]; color?: string }) {
  const max = stages[0]?.value || 1;
  return (
    <div>
      {stages.map((s, i) => {
        const pct = Math.max(16, (s.value / max) * 100);
        const shade = color + (["22", "55", "99", "CC", ""][i] ?? "");
        return (
          <div className="funnel-row" key={s.label}>
            <div className="funnel-stage-label">{s.label}</div>
            <div
              className="funnel-bar"
              style={{ width: `${pct}%`, background: shade, color: i >= 2 ? "#fff" : "#5445D6" }}
            >
              <span>{s.value.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
