"use client";

/**
 * "See form details" — a small button + read-only popover that shows the custom
 * disposition form fields an agent filled for ONE disposition activity. Used on
 * both the timeline and the disposition tab.
 *
 * Self-gating (2026-08-06): the component fetches its activity's saved values
 * ONCE on mount and renders NOTHING until it knows there is at least one value.
 * Because the custom field values are keyed to a single activity, this makes the
 * button appear on exactly the ONE entry that owns the data (e.g. the
 * "Disposition update" row) and never on the sibling "Call" / empty entries of
 * the same disposition — so there are no empty popovers and no duplicate buttons.
 *
 * The values are already resolved server-side (user IDs -> names, dates
 * formatted, ordered) and are grouped here by tab name for readability.
 */
import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";

interface DispositionValueView {
  fieldKey: string;
  label: string;
  tabName: string | null;
  fieldType: string;
  display: string;
}

// Module-level cache so re-renders / re-mounts (timeline paging, tab switches)
// don't refetch the same activity's values. null entry = "known to be empty".
const valuesCache = new Map<string, DispositionValueView[]>();

export function DispositionFormDetails({
  activityId,
  className,
}: {
  activityId: string;
  className?: string;
}) {
  const [values, setValues] = useState<DispositionValueView[] | null>(
    () => valuesCache.get(activityId) ?? null,
  );
  const [checked, setChecked] = useState<boolean>(() => valuesCache.has(activityId));
  const [open, setOpen] = useState(false);

  // Self-check on mount: fetch this activity's values once so we can decide
  // whether to render the button at all. Renders nothing until we know.
  useEffect(() => {
    let cancelled = false;
    if (valuesCache.has(activityId)) {
      setValues(valuesCache.get(activityId)!);
      setChecked(true);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/forms/disposition-values?activityId=${encodeURIComponent(activityId)}`,
          { credentials: "include" },
        );
        const json = await res.json();
        const list: DispositionValueView[] =
          res.ok && Array.isArray(json.data) ? json.data : [];
        valuesCache.set(activityId, list);
        if (!cancelled) {
          setValues(list);
          setChecked(true);
        }
      } catch {
        if (!cancelled) {
          valuesCache.set(activityId, []);
          setValues([]);
          setChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  // Render nothing until we've checked, or when this activity has no form data.
  if (!checked || !values || values.length === 0) return null;

  // Group values by tab for display (unassigned fields under "Details").
  const groups = new Map<string, DispositionValueView[]>();
  for (const v of values) {
    const key = v.tabName ?? "Details";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1 text-xs font-medium text-crm-blue hover:underline " + (className ?? "")
        }
      >
        <FileText size={12} />
        See form details
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-crm-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-crm-border pb-2">
              <h3 className="text-sm font-semibold text-crm-text">Disposition form details</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-crm-muted hover:bg-crm-panel"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {[...groups.entries()].map(([tabName, fields]) => (
                <div key={tabName}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">
                    {tabName}
                  </p>
                  <dl className="divide-y divide-crm-border rounded-md border border-crm-border">
                    {fields.map((f) => (
                      <div key={f.fieldKey} className="flex justify-between gap-4 px-3 py-2">
                        <dt className="text-sm text-crm-muted">{f.label}</dt>
                        <dd className="text-right text-sm font-medium text-crm-text">{f.display}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
