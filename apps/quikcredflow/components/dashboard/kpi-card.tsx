import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type KpiTone = "blue" | "emerald" | "violet" | "amber" | "sky" | "rose";

const TONE: Record<KpiTone, string> = {
  blue: "text-crm-blue",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  rose: "text-rose-600",
};

export function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  tone,
  delta,
  footnote,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone: KpiTone;
  delta?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <div className="crm-card p-4 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-crm-muted">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-crm-text">{value}</p>
          {delta ? <div className="mt-1">{delta}</div> : null}
          {sub ? <p className="mt-1 text-xs text-crm-muted">{sub}</p> : null}
          {footnote ? <p className="mt-1 text-[11px] text-crm-muted">{footnote}</p> : null}
        </div>
        <Icon className={`h-8 w-8 shrink-0 ${TONE[tone]}`} strokeWidth={1.5} />
      </div>
    </div>
  );
}
