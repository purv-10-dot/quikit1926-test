export function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function getCurrentWeek(): string {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(
    ((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7
  );
  return `Week ${week} · ${now.getFullYear()}`;
}

export function deltaDir(delta: number): "up" | "down" {
  return delta >= 0 ? "up" : "down";
}
