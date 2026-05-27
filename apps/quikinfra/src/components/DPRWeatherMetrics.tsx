import type { DprWeatherDetail } from "@/lib/weather/dpr-weather";

function fmtTemp(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${Math.round(v)}°C`;
}

function fmtMm(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const rounded = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded} mm`;
}

function fmtWind(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${Math.round(v)} km/h`;
}

export function DPRWeatherMetrics({
  detail,
  className = "",
}: {
  detail: DprWeatherDetail | null;
  className?: string;
}) {
  if (!detail) return null;

  const hi = fmtTemp(detail.tempMaxC);
  const lo = fmtTemp(detail.tempMinC);
  const rain = fmtMm(detail.precipitationMm);
  const wind = fmtWind(detail.windMaxKmh);

  const cells: { label: string; value: string }[] = [];
  if (hi && lo) cells.push({ label: "Temperature", value: `${lo} – ${hi}` });
  else if (hi) cells.push({ label: "Temp max", value: hi });
  else if (lo) cells.push({ label: "Temp min", value: lo });
  if (rain !== null) cells.push({ label: "Rainfall", value: rain });
  if (wind !== null) cells.push({ label: "Wind max", value: wind });

  if (cells.length === 0) return null;

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px] ${className}`}
    >
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <div className="font-bold uppercase tracking-wider text-slate-500">{c.label}</div>
          <div className="font-semibold text-slate-800 tabular-nums truncate">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
