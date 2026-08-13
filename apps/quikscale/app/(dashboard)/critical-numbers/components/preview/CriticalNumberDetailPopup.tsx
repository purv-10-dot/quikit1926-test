"use client";

/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Detail-preview popup for one Critical Number — read-only, not an edit
 * screen. Same modal shell the real create panel uses
 * (critical-numbers/page.tsx — fixed overlay + centered card, not a route).
 *
 * Reuses `CriticalNumberCard` as-is for the gauge and `ComboTrendChart`
 * as-is for the trend, paired directly with the update-history table that
 * produced it — both sit together right below the gauge, ahead of the
 * (read-only) fields.
 *
 * The gauge's own "Add past update" button opens `MockAddUpdateModal` — a
 * disposable stand-in for the real `components/AddUpdateModal.tsx` (which
 * can't be reused as-is here; it hard-calls the real PATCH mutation). Each
 * submitted reading is appended to LOCAL state (`historyEntries`), and the
 * gauge/chart/table all re-derive from it — so logging 30, then 60, then 79
 * against a target of 100 actually moves the gauge and adds bars, entirely
 * client-side, with no network call.
 *
 * The fields below mirror `CriticalNumberForm`'s field set/styling/picker
 * components field-for-field (same `CriticalNumberFormValues` shape, same
 * UserPicker/FilterPicker/DropdownPicker) purely for layout — the whole
 * block sits in a native `<fieldset disabled>`, which the browser cascades
 * to every nested form control (including each picker's own internal
 * trigger button) without needing a `disabled` prop on each one
 * individually. Nothing here is editable — this popup only ever changes the
 * record via the update-log flow above, same as the real app.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { UserPicker, FilterPicker, DropdownPicker } from "@quikit/ui";
import {
  MEASUREMENT_UNITS,
  CRITICAL_NUMBER_FREQUENCIES,
} from "@/lib/schemas/criticalNumberSchema";
import type { CriticalNumberFormValues } from "../CriticalNumberForm";
import { CriticalNumberCard } from "../CriticalNumberCard";
import { CURRENCIES, getScales } from "@/lib/utils/currency";
import { ComboTrendChart } from "./ComboTrendChart";
import { MockAddUpdateModal, type MockUpdateEntry } from "./MockAddUpdateModal";
import {
  MOCK_USERS,
  MOCK_TEAMS,
  MOCK_CATEGORIES,
  MOCK_SUB_CATEGORIES,
  type MockCriticalNumber,
  type MockUpdate,
} from "./mockData";

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function toFormValues(record: MockCriticalNumber): CriticalNumberFormValues {
  return {
    title: record.title,
    ownerId: record.ownerId ?? "",
    teamId: record.teamId ?? "",
    categoryId: record.categoryId ?? "",
    subCategoryId: record.subCategoryId ?? "",
    measurementUnit: record.measurementUnit,
    unit: record.unit ?? "",
    currency: record.currency ?? "",
    targetScale: record.targetScale ?? "",
    targetValue: String(record.targetValue),
    frequency: record.frequency,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Same rule the real API uses: currentValue is whichever row is newest BY
 *  DATE (ties broken by insertion order), not just the last one appended —
 *  so a backdated entry never overwrites a genuinely newer reading. */
function latestByDate(history: MockUpdate[]): MockUpdate | null {
  if (history.length === 0) return null;
  return history.reduce((latest, h) => (h.date >= latest.date ? h : latest));
}

interface Props {
  record: MockCriticalNumber;
  onClose: () => void;
}

export function CriticalNumberDetailPopup({ record, onClose }: Props) {
  const [values, setValues] = useState<CriticalNumberFormValues>(() => toFormValues(record));
  const [saving, setSaving] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<MockUpdate[]>(record.history);
  const [addUpdateOpen, setAddUpdateOpen] = useState(false);

  function patch(p: Partial<CriticalNumberFormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function recordUpdate(entry: MockUpdateEntry) {
    setHistoryEntries((h) => [...h, { ...entry, createdBy: "You" }]);
    setAddUpdateOpen(false);
  }

  // Save itself is still not wired to the real PATCH — see file header. This
  // just proves the button/loading state render correctly for the layout
  // review; wiring it is a `useUpdateCriticalNumber(record.id).mutate(values)`
  // call once the real API hookup lands.
  function handleSave() {
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
  }

  const showUnit = values.measurementUnit === "Number";
  const showCurrency = values.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find((c) => c.code === values.currency);
  const scales = getScales(values.currency);
  const visibleSubs = MOCK_SUB_CATEGORIES.filter((s) => s.categoryId === values.categoryId);

  const liveCurrentValue = latestByDate(historyEntries)?.value ?? record.currentValue;
  const liveRecord: MockCriticalNumber = { ...record, currentValue: liveCurrentValue, history: historyEntries };
  const historyNewestFirst = [...historyEntries].reverse();

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
            {/* 1. Gauge */}
            <div className="max-w-md mx-auto w-full">
              <CriticalNumberCard
                record={{
                  ...liveRecord,
                  teamName: MOCK_TEAMS.find((t) => t.id === record.teamId)?.name,
                  ownerName: (() => {
                    const u = MOCK_USERS.find((u) => u.id === record.ownerId);
                    return u ? `${u.firstName} ${u.lastName}` : undefined;
                  })(),
                }}
                onAddUpdate={() => setAddUpdateOpen(true)}
              />
            </div>

            {/* Trend chart + the history rows that produced it, grouped
                together right below the gauge — not after the fields. */}
            <div className="space-y-3">
              <ComboTrendChart record={liveRecord} />

              <section className="border border-gray-200 rounded-xl overflow-hidden">
                <h3 className="text-sm font-semibold text-gray-900 px-5 py-3 border-b border-gray-200 bg-gray-50">
                  Update history
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {["Date", "Value", "Comment", "Updated By"].map((col) => (
                          <th key={col} className="bg-accent-50 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {historyNewestFirst.map((h) => (
                        <tr key={h.date} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(h.date)}</td>
                          <td className="px-4 py-2.5 text-gray-900 font-medium tabular-nums whitespace-nowrap">{h.value}</td>
                          <td className="px-4 py-2.5 text-gray-500">{h.comment ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{h.createdBy ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Fields — same set/styling as CriticalNumberForm, read-only here.
                `disabled` on the fieldset cascades to every native form
                control nested inside it, including each picker's own
                trigger button, without touching each field individually. */}
            <fieldset disabled className="border border-gray-200 rounded-xl p-5 opacity-75">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
              <div className="space-y-5">
                <div>
                  <label className={LABEL}>Title</label>
                  <input
                    value={values.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    className={INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Owner</label>
                    <UserPicker
                      value={values.ownerId}
                      onChange={(v: string) => patch({ ownerId: v })}
                      users={MOCK_USERS}
                      placeholder="Select owner…"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Department</label>
                    <FilterPicker
                      value={values.teamId}
                      onChange={(v: string) => patch({ teamId: v })}
                      options={MOCK_TEAMS.map((t) => ({ value: t.id, label: t.name }))}
                      allLabel="Select department…"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Category</label>
                    <FilterPicker
                      value={values.categoryId}
                      onChange={(v: string) => patch({ categoryId: v, subCategoryId: "" })}
                      options={MOCK_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
                      allLabel="Select category…"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>
                      Sub Category <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <FilterPicker
                      value={values.subCategoryId}
                      onChange={(v: string) => patch({ subCategoryId: v })}
                      options={visibleSubs.map((s) => ({ value: s.id, label: s.name }))}
                      allLabel={values.categoryId ? "Select sub category…" : "Pick a category first"}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Measurement Unit</label>
                    <DropdownPicker
                      value={values.measurementUnit}
                      onChange={(v) =>
                        patch({
                          measurementUnit: v as CriticalNumberFormValues["measurementUnit"],
                          ...(v === "Number" ? {} : { unit: "" }),
                          ...(v === "Currency" ? {} : { currency: "", targetScale: "" }),
                        })
                      }
                      options={MEASUREMENT_UNITS.map((m) => ({ value: m, label: m }))}
                      emptyLabel="Select unit type…"
                    />
                  </div>
                  {showUnit && (
                    <div>
                      <label className={LABEL}>
                        Unit <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        value={values.unit}
                        onChange={(e) => patch({ unit: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                  )}
                  {showCurrency && (
                    <div>
                      <label className={LABEL}>Currency</label>
                      <DropdownPicker
                        value={values.currency}
                        onChange={(v) => patch({ currency: v })}
                        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code} — ${c.name}` }))}
                        searchable
                        emptyLabel="Select currency…"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Target Value</label>
                    {showCurrency ? (
                      <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-accent-500">
                        {currencyObj && (
                          <span className="flex items-center px-3 bg-gray-50 border-r border-gray-300 text-sm text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                            {currencyObj.symbol}
                          </span>
                        )}
                        <input
                          type="number"
                          inputMode="decimal"
                          value={values.targetValue}
                          onChange={(e) => patch({ targetValue: e.target.value })}
                          className="flex-1 px-3 py-2.5 text-sm focus:outline-none min-w-0"
                        />
                        <select
                          value={values.targetScale}
                          onChange={(e) => patch({ targetScale: e.target.value })}
                          className="border-l border-gray-300 pl-2 pr-1 py-2.5 text-sm text-gray-600 bg-white focus:outline-none flex-shrink-0 cursor-pointer"
                        >
                          {scales.map((s) => (
                            <option key={s.label} value={s.label}>{s.label || "—"}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        value={values.targetValue}
                        onChange={(e) => patch({ targetValue: e.target.value })}
                        className={INPUT}
                      />
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Frequency</label>
                    <DropdownPicker
                      value={values.frequency}
                      onChange={(v) => patch({ frequency: v as CriticalNumberFormValues["frequency"] })}
                      options={CRITICAL_NUMBER_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
                      emptyLabel="Select frequency…"
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-white"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {addUpdateOpen && (
        <MockAddUpdateModal
          title={record.title}
          onSubmit={recordUpdate}
          onClose={() => setAddUpdateOpen(false)}
        />
      )}
    </div>
  );
}
