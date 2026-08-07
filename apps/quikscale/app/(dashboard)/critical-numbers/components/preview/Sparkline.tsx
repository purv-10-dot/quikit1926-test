/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Inline per-row trend line. Same scaling technique as
 * `performance/habits/components/TrendChart.tsx` (viewBox + linear x/y scale
 * + polyline path), stripped to just the line — no axes, gridlines or
 * tooltip, since a table cell has no room for them.
 */

const W = 72;
const H = 24;
const PAD = 3;

interface SparklineProps {
  values: number[];
  /** Stroke colour — pass the record's tier hex so the line matches its status pill. */
  color: string;
}

export function Sparkline({ values, color }: SparklineProps) {
  if (values.length < 2) {
    return <span className="text-[11px] text-gray-300">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (W - PAD * 2) / (values.length - 1);
  const yScale = (v: number) => PAD + (1 - (v - min) / range) * (H - PAD * 2);

  const points = values.map((v, i) => ({ x: PAD + i * xStep, y: yScale(v) }));
  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const last = points[points.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2" fill={color} />
    </svg>
  );
}
