"use client";

/**
 * Read-only detail modal for one real Critical Number — opened by clicking a
 * row in the table on critical-numbers/page.tsx.
 *
 * Same approved layout as the mock `preview/CriticalNumberDetailPopup`
 * (gauge → trend chart → read-only details → update history), but driven by
 * a real `CriticalNumberRow` and the page's real user/team/category lists.
 * That mock version stays in place for reference; it can't be reused
 * directly because its pickers read the mock option arrays and its
 * "Add past update" flow points at a mock modal instead of the real POST.
 *
 * Nothing here is editable: the whole details block sits in a native
 * `<fieldset disabled>`, which the browser cascades to every nested form
 * control (including each picker's own trigger button). Editing a record
 * still happens through the page's own create/update flows.
 */

import { X } from "lucide-react";
import { UserPicker, FilterPicker, DropdownPicker, type PickerUser } from "@quikit/ui";
import { MEASUREMENT_UNITS, CRITICAL_NUMBER_FREQUENCIES } from "@/lib/schemas/criticalNumberSchema";
import type { CriticalNumberFrequency } from "@/lib/schemas/criticalNumberSchema";
import { CURRENCIES, getScales, getMultiplier, scaleDownForDisplay } from "@/lib/utils/currency";
import type { CriticalNumberRow } from "@/lib/hooks/useCriticalNumbers";
import { CriticalNumberCard } from "./CriticalNumberCard";
import { ComboTrendChart } from "./preview/ComboTrendChart";

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  record: CriticalNumberRow;
  users: PickerUser[];
  teams: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  subCategories: { id: string; categoryId: string; name: string }[];
  onClose: () => void;
  /** Opens the page's real `AddUpdateModal` for this record. */
  onAddUpdate?: () => void;
}

export function CriticalNumberDetailModal({
  record,
  users,
  teams,
  categories,
  subCategories,
  onClose,
  onAddUpdate,
}: Props) {
  const showUnit = record.measurementUnit === "Number";
  const showCurrency = record.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find((c) => c.code === record.currency);
  const scales = getScales(record.currency ?? "");
  const visibleSubs = subCategories.filter((s) => s.categoryId === record.categoryId);

  // Target Value is stored RAW; the form enters/displays it in the chosen
  // scale unit, so scale back down for this read-only view to match.
  const scaleMultiplier =
    showCurrency && record.currency && record.targetScale
      ? getMultiplier(record.currency, record.targetScale)
      : 1;
  const displayTarget =
    scaleMultiplier > 1 && record.currency && record.targetScale
      ? scaleDownForDisplay(record.targetValue, record.currency, record.targetScale)
      : String(record.targetValue);

  const categoryName = record.category?.name ?? null;
  const historyNewestFirst = [...record.updates].reverse();

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl my-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{record.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">Critical Number detail</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6 max-h-[calc(100vh-160px)] overflow-y-auto">
            {/* Gauge */}
            <div className="max-w-md mx-auto w-full">
              <CriticalNumberCard
                record={{
                  ...record,
                  teamName: record.team?.name,
                  ownerName: record.owner
                    ? `${record.owner.firstName} ${record.owner.lastName}`.trim()
                    : undefined,
                  categoryName,
                  subCategoryName: record.subCategory?.name ?? null,
                }}
                onAddUpdate={onAddUpdate}
              />
            </div>

            {/* Trend chart + the history that produced it, grouped together */}
            <div className="space-y-3">
              {record.updates.length >= 2 && (
                <ComboTrendChart
                  record={{
                    title: record.title,
                    categoryName: categoryName ?? "Uncategorised",
                    frequency: record.frequency,
                    targetValue: record.targetValue,
                    history: record.updates,
                  }}
                />
              )}

              <section className="border border-gray-200 rounded-xl overflow-hidden">
                <h3 className="text-sm font-semibold text-gray-900 px-5 py-3 border-b border-gray-200 bg-gray-50">
                  Update history
                </h3>
                {historyNewestFirst.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-gray-400">No updates logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {["Date", "Value", "Comment", "Updated By"].map((col) => (
                            <th
                              key={col}
                              className="bg-accent-50 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-600"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyNewestFirst.map((h) => (
                          <tr key={h.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(h.date)}</td>
                            <td className="px-4 py-2.5 text-gray-900 font-medium tabular-nums whitespace-nowrap">
                              {h.value}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">
                              {h.comment ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              {h.createdByName ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* Details — read-only. `disabled` on the fieldset cascades to
                every nested form control, including each picker's own
                trigger button. */}
            <fieldset disabled className="border border-gray-200 rounded-xl p-5 opacity-75">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
              <div className="space-y-5">
                <div>
                  <label className={LABEL}>Title</label>
                  <input value={record.title} readOnly className={INPUT} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Owner</label>
                    <UserPicker value={record.ownerId} onChange={() => {}} users={users} placeholder="—" />
                  </div>
                  <div>
                    <label className={LABEL}>Department</label>
                    <FilterPicker
                      value={record.teamId}
                      onChange={() => {}}
                      options={teams.map((t) => ({ value: t.id, label: t.name }))}
                      allLabel="—"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Category</label>
                    <FilterPicker
                      value={record.categoryId}
                      onChange={() => {}}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      allLabel="—"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>
                      Sub Category <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <FilterPicker
                      value={record.subCategoryId ?? ""}
                      onChange={() => {}}
                      options={visibleSubs.map((s) => ({ value: s.id, label: s.name }))}
                      allLabel="—"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Measurement Unit</label>
                    <DropdownPicker
                      value={record.measurementUnit}
                      onChange={() => {}}
                      options={MEASUREMENT_UNITS.map((m) => ({ value: m, label: m }))}
                      emptyLabel="—"
                    />
                  </div>
                  {showUnit && (
                    <div>
                      <label className={LABEL}>
                        Unit <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input value={record.unit ?? ""} readOnly className={INPUT} />
                    </div>
                  )}
                  {showCurrency && (
                    <div>
                      <label className={LABEL}>Currency</label>
                      <DropdownPicker
                        value={record.currency ?? ""}
                        onChange={() => {}}
                        options={CURRENCIES.map((c) => ({
                          value: c.code,
                          label: `${c.symbol} ${c.code} — ${c.name}`,
                        }))}
                        emptyLabel="—"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Target Value</label>
                    {showCurrency ? (
                      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                        {currencyObj && (
                          <span className="flex items-center px-3 bg-gray-50 border-r border-gray-300 text-sm text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                            {currencyObj.symbol}
                          </span>
                        )}
                        <input
                          value={displayTarget}
                          readOnly
                          className="flex-1 px-3 py-2.5 text-sm focus:outline-none min-w-0 bg-transparent"
                        />
                        <select
                          value={record.targetScale ?? ""}
                          className="border-l border-gray-300 pl-2 pr-1 py-2.5 text-sm text-gray-600 bg-white focus:outline-none flex-shrink-0"
                        >
                          {scales.map((s) => (
                            <option key={s.label} value={s.label}>
                              {s.label || "—"}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <input value={displayTarget} readOnly className={INPUT} />
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Frequency</label>
                    <DropdownPicker
                      value={record.frequency}
                      onChange={() => {}}
                      options={CRITICAL_NUMBER_FREQUENCIES.map((f) => ({
                        value: f,
                        label: FREQUENCY_LABELS[f],
                      }))}
                      emptyLabel="—"
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
