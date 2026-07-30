import { Clock } from "lucide-react";

/**
 * Placeholder shown for modules whose backend isn't built yet. Used by the
 * Finance pages — their data models were removed (no DB tables are created
 * for unbuilt functionality), so the screens render this until the feature
 * is implemented for real.
 */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        <Clock className="h-8 w-8" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        This module is coming soon. The screens are in place, but the feature
        isn&apos;t available yet.
      </p>
    </div>
  );
}
