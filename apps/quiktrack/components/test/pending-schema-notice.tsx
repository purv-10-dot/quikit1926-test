import { Database } from "lucide-react";

/**
 * Placeholder shown by the QuikTest routes until the P0 schema lands.
 *
 * The sidebar tree and the per-project Tests tab are live, so their links must
 * resolve to something truthful rather than a 404 or a fake-looking empty
 * table. This states plainly that the surface exists but has no store behind it
 * yet — see QUIKTEST_MODULE_PLAN.md §0.
 *
 * Delete this component once P1 ships real views.
 */
export function PendingSchemaNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <Database className="h-6 w-6 text-gray-400" />
        </span>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{description}</p>
        <p className="mt-4 text-xs text-gray-400">
          Awaiting the test-management schema — no data is stored yet.
        </p>
      </div>
    </div>
  );
}
