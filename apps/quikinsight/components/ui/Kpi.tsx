export interface KpiProps {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  sub: string;
}

export default function Kpi({ label, value, delta, trend, sub }: KpiProps) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <div className="kpi-row">
        <span className="kpi-value">{value}</span>
        <span className={`kpi-delta ${trend}`}>{delta}</span>
      </div>
      <p className="kpi-sub">{sub}</p>
    </div>
  );
}
