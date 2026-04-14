import { Card } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
}

export function StatCard({ label, value, icon: Icon, color = "var(--color-secondary)" }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4" role="status" aria-label={`${label}: ${value}`}>
      <div
        className="flex items-center justify-center h-11 w-11 rounded-xl"
        style={{ backgroundColor: `${color}15` }}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
        <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
      </div>
    </Card>
  );
}
