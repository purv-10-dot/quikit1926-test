"use client";

/**
 * Record one reading against a Critical Number.
 *
 * Deliberately minimal — date, value, optional comment. The date defaults to
 * today but is editable, because the whole point of an append-only history is
 * being able to log a reading you forgot at the time. Backdating is safe: the
 * server re-derives `currentValue` from the newest row BY DATE, so an old entry
 * lands in the history without moving the gauge.
 *
 * The Value field adapts to the record's measurement unit, so a reading is
 * entered in the same terms as its target rather than as a bare number:
 *   - Currency → ₹ prefix + a Thousand/Lakh/Crore scale selector (pre-set to
 *     the record's own `targetScale`), with a raw-value preview. Stored values
 *     stay RAW, so the entered number is multiplied by the scale on submit —
 *     the same convention as the create form's Target Value field.
 *   - Percentage / Number → a "%" or Unit Master suffix.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { notify } from "@/lib/utils/notify";
import { useAddCriticalNumberUpdate } from "@/lib/hooks/useCriticalNumbers";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
import type { MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent";
const LABEL = "block text-sm font-medium text-gray-700 mb-1.5";

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Plain suffix for the non-currency units — currency uses a prefix instead. */
function unitSuffix(measurementUnit?: MeasurementUnit, unit?: string | null): string {
  if (measurementUnit === "Percentage") return "%";
  if (measurementUnit === "Number" && unit) return unit;
  return "";
}

export function AddUpdateModal({
  criticalNumberId,
  title,
  measurementUnit,
  currency,
  targetScale,
  unit,
  onClose,
}: {
  criticalNumberId: string;
  title: string;
  /** Omitting these keeps the original plain-number field (no prefix/scale). */
  measurementUnit?: MeasurementUnit;
  currency?: string | null;
  targetScale?: string | null;
  unit?: string | null;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayInputValue());
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Defaults to the record's own target scale, so a reading is entered in the
  // same unit the target was set in — still switchable per reading.
  const [scale, setScale] = useState(targetScale ?? "");
  const add = useAddCriticalNumberUpdate(criticalNumberId);

  const isCurrency = measurementUnit === "Currency" && !!currency;
  const currencyObj = CURRENCIES.find((c) => c.code === currency);
  const scales = getScales(currency ?? "");
  const scaleMultiplier = isCurrency && scale ? getMultiplier(currency, scale) : 1;
  const suffix = unitSuffix(measurementUnit, unit);

  const entered = Number(value);
  const rawPreview =
    isCurrency && currencyObj && scaleMultiplier > 1 && value.trim() !== "" && Number.isFinite(entered)
      ? formatActual(entered * scaleMultiplier, currencyObj.symbol, currencyObj.code)
      : null;

  async function submit() {
    const num = Number(value);
    if (value.trim() === "" || !Number.isFinite(num)) {
      setError("Enter a number");
      return;
    }
    if (!date) {
      setError("Pick a date");
      return;
    }
    setError(null);
    try {
      await add.mutateAsync({
        // A date input yields YYYY-MM-DD; the API expects a full ISO datetime.
        date: new Date(`${date}T00:00:00.000Z`).toISOString(),
        // Scale up to the RAW value the API stores — the field above accepts
        // the scale unit (e.g. "5" meaning 5 Lakh). Multiplier is 1 for every
        // non-currency/no-scale case, so this is a passthrough there.
        value: num * scaleMultiplier,
        comment: comment.trim() || null,
      });
      notify.success("Update recorded");
      onClose();
    } catch (err) {
      notify.error(err, { context: "update", fallback: "Couldn't record that update." });
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Add update</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            <p className="text-[11px] text-gray-400 mt-1">
              Backdating is fine — it won&apos;t overwrite a newer reading.
            </p>
          </div>
          <div>
            <label className={LABEL}>
              Value <span className="text-red-500">*</span>
            </label>
            {isCurrency ? (
              // Same composed layout as the create form's Target Value field:
              // symbol prefix + number + scale selector in one bordered box.
              <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-accent-500">
                {currencyObj && (
                  <span className="flex items-center px-3 bg-gray-50 border-r border-gray-300 text-sm text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                    {currencyObj.symbol}
                  </span>
                )}
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none min-w-0"
                  autoFocus
                />
                <select
                  value={scale}
                  onChange={(e) => setScale(e.target.value)}
                  className="border-l border-gray-300 pl-2 pr-1 py-2.5 text-sm text-gray-600 bg-white focus:outline-none flex-shrink-0 cursor-pointer"
                >
                  {scales.map((s) => (
                    <option key={s.label} value={s.label}>{s.label || "—"}</option>
                  ))}
                </select>
              </div>
            ) : suffix ? (
              <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-accent-500">
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none min-w-0"
                  autoFocus
                />
                <span className="flex items-center px-3 bg-gray-50 border-l border-gray-300 text-sm text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                  {suffix}
                </span>
              </div>
            ) : (
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                className={INPUT}
                autoFocus
              />
            )}
            {rawPreview && <p className="text-[11px] text-gray-400 mt-1">= {rawPreview}</p>}
          </div>
          <div>
            <label className={LABEL}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Optional context for this reading…"
              className={`${INPUT} resize-none`}
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={add.isPending}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {add.isPending ? "Saving…" : "Record update"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
