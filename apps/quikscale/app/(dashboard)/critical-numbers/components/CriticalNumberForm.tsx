"use client";

/**
 * Create form for a Critical Number (v2 — approved layout).
 *
 * v1's mode toggle and four threshold rows are gone. A Critical Number is now
 * a categorised metric with a unit, a cadence and a target, scored on KPI's
 * percentage bands.
 *
 * Styling reuses quikscale's existing form language (the Unit Master / KPI
 * panels) — `border-gray-300 rounded-lg px-3 py-2.5 text-sm` inputs with
 * `focus:ring-accent-500`, a gray-50 header strip, and a gray-900 submit.
 *
 * "Department" and "Team" are the SAME field (`teamId`). The label is the
 * client's wording; quikscale has no separate department entity. It's required
 * because the 5-per-department cap has no other unambiguous anchor — a user can
 * belong to several teams and nothing designates a primary one.
 *
 * "+ New Category" writes a real CategoryMaster row (a confirmed, deliberate
 * exception to Critical Numbers otherwise being read-only against it) and is
 * disabled until Measurement Unit is chosen: the new category's `dataType`
 * reuses that selection so the user isn't asked to pick a data type twice.
 * Every unit in MEASUREMENT_UNITS now has a CategoryMaster.dataType
 * equivalent, so "nothing chosen yet" is the only thing that disables it.
 *
 * Currency + target-scale, when Measurement Unit is "Currency": Currency is
 * REQUIRED (the type alone isn't a complete answer); the K/L/Cr/M scale next
 * to Target Value is optional. Target Value itself is typed in the SCALE
 * UNIT when one's picked (e.g. "10" with "Lakh" selected means 10 Lakh) —
 * same convention as KPI's own target field — with a "= ₹1,000,000" preview
 * showing the raw equivalent. `submit()` in page.tsx multiplies by the scale
 * before sending `targetValue`; the API and everything downstream (the
 * gauge, the analytics section) only ever sees/stores the raw number.
 *
 * Presentational only: the parent owns state, submission, and both category
 * mutations.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { UserPicker, FilterPicker, DropdownPicker, type PickerUser } from "@quikit/ui";
import {
  MEASUREMENT_UNITS,
  CRITICAL_NUMBER_FREQUENCIES,
  type MeasurementUnit,
  type CriticalNumberFrequency,
} from "@/lib/schemas/criticalNumberSchema";
// Same fixed lists/helpers KPI's own Currency + scale picker use — reused,
// not duplicated, so the two currency dropdowns and the scale math can never
// drift apart.
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
// Target Value caps at 2 decimals, refused as the 3rd digit is typed. `type="number"`
// can't do this: `step` only flags validity (and nothing here submits a <form>), and
// once the content is invalid the browser reports `value === ""`, so an onChange guard
// can neither see what was typed nor restore what was there. Hence text +
// inputMode="decimal" + sanitiser, the same shape as OPSP's ProjectedInput.
import { clampDecimalInput } from "@/lib/utils/decimalPrecision";

export interface CriticalNumberFormValues {
  title: string;
  ownerId: string;
  teamId: string;
  categoryId: string;
  subCategoryId: string;
  measurementUnit: MeasurementUnit | "";
  unit: string;
  /** ISO 4217 code ("USD", "INR", …). Required when measurementUnit = "Currency". */
  currency: string;
  /** K/L/Cr/M display-scale label ("Crore", "Million", …). Optional even for
   *  Currency metrics — "" means "show the raw number." */
  targetScale: string;
  targetValue: string;
  frequency: CriticalNumberFrequency | "";
}

export const EMPTY_FORM: CriticalNumberFormValues = {
  title: "",
  ownerId: "",
  teamId: "",
  categoryId: "",
  subCategoryId: "",
  measurementUnit: "",
  unit: "",
  currency: "",
  targetScale: "",
  targetValue: "",
  frequency: "",
};

const INPUT =
  "w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export interface FormCategory { id: string; name: string }
export interface FormSubCategory { id: string; categoryId: string; name: string }

/** Inline "+ New Sub Category" row — mirrors OPSP's add affordance. */
function InlineCreate({
  label,
  onCreate,
  disabled,
  pending,
}: {
  label: string;
  onCreate: (name: string) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
    setOpen(false);
  };

  if (disabled) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 hover:text-accent-800"
      >
        <Plus className="h-3 w-3" /> {label}
      </button>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        // Enter must not bubble to the panel and submit the whole form.
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setName(""); setOpen(false); }
        }}
        placeholder="Name…"
        className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => { setName(""); setOpen(false); }}
        className="p-1.5 text-gray-400 hover:text-gray-600"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface CriticalNumberFormProps {
  values: CriticalNumberFormValues;
  onChange: (patch: Partial<CriticalNumberFormValues>) => void;
  errors?: Partial<Record<keyof CriticalNumberFormValues, string>>;
  users: PickerUser[];
  teams: { id: string; name: string }[];
  categories: FormCategory[];
  subCategories: FormSubCategory[];
  units: string[];
  onCreateCategory: (name: string) => void;
  creatingCategory?: boolean;
  onCreateSubCategory: (name: string) => void;
  creatingSubCategory?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
}

export function CriticalNumberForm({
  values,
  onChange,
  errors = {},
  users,
  teams,
  categories,
  subCategories,
  units,
  onCreateCategory,
  creatingCategory,
  onCreateSubCategory,
  creatingSubCategory,
  onCancel,
  onSubmit,
  submitting,
}: CriticalNumberFormProps) {
  // Sub-categories are scoped to the chosen category — nothing to pick until
  // one is selected.
  const visibleSubs = subCategories.filter((s) => s.categoryId === values.categoryId);
  // KPI's rule: the Unit Master label only applies to Number metrics, and the
  // API force-nulls it for every other measurement type.
  const showUnit = values.measurementUnit === "Number";
  // Same rule, mirrored for the Currency-only fields.
  const showCurrency = values.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find((c) => c.code === values.currency);
  // Defaults to the Western list before a currency is chosen — matches
  // getScales' own fallback (only "INR" gets the Lakh/Crore list).
  const scales = getScales(values.currency);
  // The Target Value input holds the SCALE-UNIT number the user types (e.g.
  // "10" with "Lakh" selected) — same convention as KPI's own `form.target`
  // (see KPIModal.tsx's `actualNum`/`scaledTarget`: it multiplies by the
  // scale multiplier to get the stored raw value, it never divides). This
  // preview shows that raw equivalent as a sanity check ("= ₹1,000,000"),
  // mirroring KPI's `rawTip` tooltip on its scaled breakdown cells. `submit()`
  // in page.tsx does the same multiplication before sending `targetValue`.
  const enteredTarget = parseFloat(values.targetValue);
  const targetPreview =
    showCurrency && currencyObj && values.targetScale && Number.isFinite(enteredTarget) && enteredTarget > 0
      ? formatActual(
          enteredTarget * getMultiplier(currencyObj.code, values.targetScale),
          currencyObj.symbol,
          currencyObj.code,
        )
      : null;

  /** Mirrors KPI's setCurrency: dropping a scale that doesn't exist for the
   *  newly-chosen currency (e.g. INR "Crore" has no equivalent in the USD list). */
  function handleCurrencyChange(code: string) {
    const validScale = getScales(code).some((s) => s.label === values.targetScale);
    onChange({ currency: code, ...(validScale ? {} : { targetScale: "" }) });
  }

  // "+ New Category" reuses whichever Measurement Unit is already selected as
  // the new row's dataType — nothing to reuse until one is picked.
  const canCreateCategory = values.measurementUnit !== "";

  const err = (k: keyof CriticalNumberFormValues) =>
    errors[k] ? (
      <p className="text-[11px] text-red-600 mt-1">{errors[k]}</p>
    ) : null;
  const ring = (k: keyof CriticalNumberFormValues) =>
    errors[k] ? "border-red-400" : "border-gray-300";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Critical Number</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create new record</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 mt-0.5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Title */}
        <div>
          <label className={LABEL}>
            Title <span className="text-red-500">*</span>
          </label>
          <input
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Monthly Recurring Revenue"
            className={`${INPUT} ${ring("title")}`}
          />
          {err("title")}
        </div>

        {/* Department + Owner (the Team picker, relabelled, comes FIRST) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Department <span className="text-red-500">*</span>
            </label>
            <FilterPicker
              value={values.teamId}
              onChange={(v: string) => onChange({ teamId: v })}
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              allLabel="Select department…"
            />
            {err("teamId") ?? (
              <p className="text-[11px] text-gray-400 mt-1">
                Backed by Teams. Max 5 Critical Numbers per department.
              </p>
            )}
          </div>
          {/* Owner second because its list is scoped to the Department above —
              the parent fetches that team's candidates (join rows ∪ head) and
              clears an owner who isn't among them. Disabled until a Department
              is chosen: with nothing selected the list is empty, and an empty
              picker reads as "no one available" rather than "pick a department
              first". */}
          <div>
            <label className={LABEL}>
              Owner <span className="text-red-500">*</span>
            </label>
            <UserPicker
              value={values.ownerId}
              onChange={(v: string) => onChange({ ownerId: v })}
              users={users}
              placeholder={values.teamId ? "Select owner…" : "Select a department first…"}
              disabled={!values.teamId}
            />
            {err("ownerId") ??
              (values.teamId && users.length === 0 ? (
                <p className="text-[11px] text-amber-600 mt-1">
                  This department has no members yet — add one under Teams.
                </p>
              ) : null)}
          </div>
        </div>

        {/* Category + Sub Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Category <span className="text-red-500">*</span>
            </label>
            <FilterPicker
              value={values.categoryId}
              // Changing category invalidates any sub-category beneath it.
              onChange={(v: string) => onChange({ categoryId: v, subCategoryId: "" })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              allLabel="Select category…"
            />
            {err("categoryId") ?? (
              <p className="text-[11px] text-gray-400 mt-1">
                From Category Master (Org Setup).
              </p>
            )}
            {canCreateCategory ? (
              <InlineCreate
                label="New Category"
                onCreate={onCreateCategory}
                pending={creatingCategory}
              />
            ) : (
              <p className="mt-1 text-[11px] text-gray-400">
                Select a Measurement Unit below to add a new category.
              </p>
            )}
          </div>
          <div>
            <label className={LABEL}>
              Sub Category <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <FilterPicker
              value={values.subCategoryId}
              onChange={(v: string) => onChange({ subCategoryId: v })}
              options={visibleSubs.map((s) => ({ value: s.id, label: s.name }))}
              allLabel={values.categoryId ? "Select sub category…" : "Pick a category first"}
            />
            <InlineCreate
              label="New Sub Category"
              onCreate={onCreateSubCategory}
              disabled={!values.categoryId}
              pending={creatingSubCategory}
            />
            {err("subCategoryId")}
          </div>
        </div>

        {/* Measurement Unit (+ Unit Master label, Number only) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Measurement Unit <span className="text-red-500">*</span>
            </label>
            <DropdownPicker
              value={values.measurementUnit}
              onChange={(v) =>
                onChange({
                  measurementUnit: v as CriticalNumberFormValues["measurementUnit"],
                  // Switching away clears whichever companion field the API
                  // would discard anyway, so the form never shows a value it
                  // won't save.
                  ...(v === "Number" ? {} : { unit: "" }),
                  ...(v === "Currency" ? {} : { currency: "", targetScale: "" }),
                })
              }
              options={MEASUREMENT_UNITS.map((m) => ({ value: m, label: m }))}
              emptyLabel="Select unit type…"
            />
            {err("measurementUnit")}
          </div>
          {showUnit && (
            <div>
              <label className={LABEL}>
                Unit <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <FilterPicker
                value={values.unit}
                onChange={(v: string) => onChange({ unit: v })}
                options={units.map((u) => ({ value: u, label: u }))}
                allLabel="Select unit…"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                From Unit Master. Display label only — no effect on calculation.
              </p>
            </div>
          )}
          {showCurrency && (
            <div>
              <label className={LABEL}>
                Currency <span className="text-red-500">*</span>
              </label>
              <DropdownPicker
                value={values.currency}
                onChange={handleCurrencyChange}
                options={CURRENCIES.map((c) => ({
                  value: c.code,
                  label: `${c.symbol} ${c.code} — ${c.name}`,
                }))}
                searchable
                emptyLabel="Select currency…"
              />
              {err("currency")}
            </div>
          )}
        </div>

        {/* Target + Frequency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Target Value <span className="text-red-500">*</span>
            </label>
            {showCurrency ? (
              // Currency prefix + number + scale suffix in one bordered box —
              // same layout as KPI's Target Value field.
              <div
                className={`flex rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-accent-500 ${ring("targetValue")}`}
              >
                {currencyObj && (
                  <span className="flex items-center px-3 bg-gray-50 border-r border-gray-300 text-sm text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                    {currencyObj.symbol}
                  </span>
                )}
                <input
                  type="text"
                  inputMode="decimal"
                  value={values.targetValue}
                  onChange={(e) => onChange({ targetValue: clampDecimalInput(e.target.value) })}
                  placeholder="e.g. 100"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none min-w-0"
                />
                <select
                  value={values.targetScale}
                  onChange={(e) => onChange({ targetScale: e.target.value })}
                  className="border-l border-gray-300 pl-2 pr-1 py-2.5 text-sm text-gray-600 bg-white focus:outline-none flex-shrink-0 cursor-pointer"
                >
                  {scales.map((s) => (
                    <option key={s.label} value={s.label}>{s.label || "—"}</option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={values.targetValue}
                onChange={(e) => onChange({ targetValue: clampDecimalInput(e.target.value) })}
                placeholder="e.g. 100"
                className={`${INPUT} ${ring("targetValue")}`}
              />
            )}
            {err("targetValue")}
            {targetPreview && (
              <p className="text-[11px] text-gray-400 mt-1">= {targetPreview}</p>
            )}
          </div>
          <div>
            <label className={LABEL}>
              Frequency <span className="text-red-500">*</span>
            </label>
            <DropdownPicker
              value={values.frequency}
              onChange={(v) => onChange({ frequency: v as CriticalNumberFormValues["frequency"] })}
              options={CRITICAL_NUMBER_FREQUENCIES.map((f) => ({
                value: f,
                label: FREQUENCY_LABELS[f],
              }))}
              emptyLabel="Select frequency…"
            />
            {err("frequency")}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Critical Number"}
          </button>
        </div>
      </div>
    </div>
  );
}
