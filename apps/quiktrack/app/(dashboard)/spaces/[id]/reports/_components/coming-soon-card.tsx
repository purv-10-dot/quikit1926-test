import type { LucideIcon } from "lucide-react";

/**
 * A greyed-out placeholder card for a report that isn't built yet. Mirrors the
 * Jira "More reports" grid — title, one-line description, a "Coming soon" chip.
 * Purely presentational; the real report replaces it when shipped.
 */
export function ComingSoonCard({
  title,
  description,
  Icon,
}: {
  title: string;
  description: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="relative rounded-lg border border-gray-200 bg-gray-50/60 p-5 opacity-90">
      <span className="absolute right-3 top-3 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">
        Coming soon
      </span>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-white text-gray-400 ring-1 ring-gray-200">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-gray-700">{title}</h3>
      <p className="mt-1 text-xs leading-snug text-gray-500">{description}</p>
    </div>
  );
}
