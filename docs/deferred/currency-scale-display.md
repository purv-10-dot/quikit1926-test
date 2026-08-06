# Deferred feature — Currency scale display for KPIs

**Status:** Built, then reverted before deployment (kept here to re-apply later).
**Scope:** Display-only. Stored values stay RAW; only what's *shown*/*typed* changes.
**Not reverted:** the KPI PUT currency-wipe bug fix (see §6) — it's a correctness fix, independent of this feature.

---

## 1. Goal
When a KPI's Measurement Unit is **Currency** with a chosen scale (the existing
Target-Value "Crore/Lakh/Million/…" dropdown, which already persists `targetScale`),
show and accept its values in that unit instead of the raw expanded number:

- Target Breakdown cells: `2.5` (Cr) instead of `25000000`, with a per-week unit label.
- Updates tab: weekly target + actual shown/typed in the unit, with inline `Cr`.
- Stats tab + KPI list (KPITable) + Dashboard cards/table: `₹4 Cr`, `$9 M`, etc.

### The Indian-toggle rule
`use_indian_numbering` (org config, `useNumberFormat()` → `"standard" | "indian"`):
- **INR** currency KPI → **always** Indian/₹ units (`₹4 Cr`), regardless of the toggle.
- **non-INR** currency (USD, …): toggle **OFF** → native scale (`$9 M`); toggle **ON**
  → Indian magnitude keeping the symbol (`$90 L`).
- non-currency → toggle-driven (unchanged, pre-existing).

---

## 2. Core helpers

### `lib/utils/currency.ts`
```ts
// Display/input scaling for currency weekly cells. Passthrough when multiplier 1.
export function scaleDownForDisplay(raw, currency, scale, maxDecimals = 2): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return "";
  const m = getMultiplier(currency, scale);
  if (m <= 1) return typeof raw === "string" ? raw : String(raw);
  return String(Number((n / m).toFixed(maxDecimals)));   // 25000000 → "2.5"
}
export function scaleUpFromInput(display, currency, scale): string {
  const t = (display ?? "").trim();
  if (t === "") return "";
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return "";
  return String(n * getMultiplier(currency, scale));      // "2.5" → "25000000"
}
const SHORT_SCALE_LABELS = { Thousand:"K", Lakh:"L", Million:"M", Crore:"Cr",
  Billion:"B", Trillion:"T", "Hundred Crore":"100 Cr" };
export function shortScaleLabel(scale): string { return SHORT_SCALE_LABELS[scale] ?? ""; }
```

### `lib/utils/kpiHelpers.ts`  (import `CURRENCIES, getMultiplier, shortScaleLabel` from `./currency`)
```ts
export function formatScaledKpiValue(val, { measurementUnit, currency, targetScale, numberFormat = "standard" }): string {
  if (val == null) return "—";
  if (measurementUnit === "Currency" && currency && targetScale) {
    const m = getMultiplier(currency, targetScale);
    if (m > 1) {
      const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? "";
      // non-INR + toggle ON → Indian magnitude with symbol ("$90 L"); INR ignores toggle
      if (currency !== "INR" && numberFormat === "indian") return `${symbol}${fmtCompactIndian(val)}`;
      const scaled = parseFloat((val / m).toFixed(2)).toString();
      const unit = shortScaleLabel(targetScale);
      return `${symbol}${scaled}${unit ? ` ${unit}` : ""}`;     // "₹4 Cr" / "$9 M"
    }
  }
  // no scale / non-currency: INR forces Indian even when toggle off
  const effective = currency === "INR" ? "indian" : numberFormat;
  return fmtCompactBy(val, effective);
}
```

---

## 3. Cell-boundary scaling (KPIModal + LogModal Edit breakdown)
Stored `weeklyBreakdown`/`weeklyOwnerBreakdown` stay RAW. Wrap each cell:
```ts
const scaleMult = isCurrency ? getMultiplier(form.currency, form.targetScale) : 1;
const toDisp = (raw) => scaleMult > 1 ? scaleDownForDisplay(raw, form.currency, form.targetScale)
                                       : (typeof raw === "string" ? raw : String(raw));
const toRaw  = (input) => scaleMult > 1 ? scaleUpFromInput(input, form.currency, form.targetScale) : input;
const scaleUnitLabel = scaleMult > 1 ? ` — in ${currencyObj.symbol} ${form.targetScale}` : "";
const scaleUnitShort = scaleMult > 1 ? `${currencyObj.symbol} ${shortScaleLabel(form.targetScale)}`.trim() : "";
```
- Header: `Target Breakdown (Weekly){scaleUnitLabel}`.
- Each week `<th>`: add `{scaleUnitShort && <div>…{scaleUnitShort}</div>}`.
- Number cells: `value = editingCell match ? editingCell.raw : toDisp(stored)`,
  `onChange = setEditingCell({raw}) + setX(w, toRaw(input))`, `onBlur = setEditingCell(null)`.
  (LogModal's EditTab needs an added `editingCell` buffer; KPIModal already has one.)
- Standalone `<select>` toggles: keep option **values** RAW, scale only the **labels** via `toDisp`.

## 4. Updates tab (LogModal `UpdatesTab`)
```ts
const scaleMultU = isCurrencyU ? getMultiplier(kpi.currency ?? "", kpi.targetScale ?? "") : 1;
const toDispU/toRawU = …;   // same shape, from kpi.currency/kpi.targetScale
const fmtTargetU = (raw) => scaleMultU > 1 ? toDispU(raw) : fmt(raw);
const unitHintU  = scaleMultU > 1 ? ` (in ${curSymU} ${kpi.targetScale})` : "";
const [valBuf, setValBuf] = useState<{key,raw}|null>(null);   // decimal-keystroke buffer
```
- "Weekly Values{unitHintU}" header; Target/Value column headers get `(Cr)`.
- Team rows: total/owner-target via `fmtTargetU`; value input via `valBuf`+`toDispU`/`toRawU` + inline `Cr`.
- Individual rows → `WeekRow`: pass scaled `value` (buffered), `weeklyTarget = targetForWeek/scaleMultU`,
  `targetDisplay = fmtTargetU(...) + " Cr"`, and `unitSuffix = shortScaleLabel(kpi.targetScale)`.

### `WeekRow.tsx`
Add `unitSuffix?: string`; wrap the value `<input>` in a flex with `{unitSuffix && <span>{unitSuffix}</span>}`.

## 5. List + Dashboard + Stats
- **KPITable.tsx:** `const fmtGoal = (kpi, v) => formatScaledKpiValue(v, {measurementUnit, currency, targetScale, numberFormat})`.
  Replace `fmtN(...)` with `fmtGoal(kpi, ...)` for targetValue, quarterlyGoal, qtdGoal, weeklyGoal,
  qtdAchieved (×2), and the weekly value cell.
- **dashboard/page.tsx:** `KPICard` achieved/goal → `formatScaledKpiValue(..., {kpi fields, numberFormat})`.
  `KPISection`: add `const numberFormat = useNumberFormat()` (before the early return) + a `fmtKpiVal(kpi, v)`
  helper; replace `fmtCompact(...)` at qtdAchieved, qtrGoal, qtdGoal, weeklyGoal, weekly cell.
  (Then `fmtCompact`/`fmtCompactBy` imports become unused — remove or keep as needed.)
- **StatsTab.tsx:** add `useNumberFormat()` + `fmtStat(v)`:
  currency+scale → `formatScaledKpiValue(v, {…, numberFormat})`; currency no-scale → `formatActual(v, symbol, currency)`;
  non-currency → `fmt(v)`. Apply to achieved, target, avg/week, best-week, quarterly/QTD/weekly goal, QTD achieved.

## 6. KEPT (not part of this revert) — KPI PUT currency-wipe fix
`app/api/kpi/[id]/route.ts` — the edit form omits `currency` (immutable), so the route MUST
preserve it: use `currency: validated.currency` (NOT `?? null`, which wiped it to null and broke the
chosen scale). `targetScale` likewise. Guarded by `__tests__/api/kpi.put.test.ts`.

## 7. Tests to re-add when re-applying
- `__tests__/unit/currency.test.ts` — `scaleDownForDisplay`/`scaleUpFromInput`/`shortScaleLabel`.
- `__tests__/unit/kpiHelpers.test.ts` — `formatScaledKpiValue` (INR always ₹Cr; USD toggle off `$9 M` / on `$90 L`; non-currency passthrough).
- `__tests__/components/StatsTab.dom.test.tsx` — currency cases + `useNumberFormat` mock.
- `__tests__/components/LogModal.dom.test.tsx` — Updates-tab scaled display.

## 8. Files touched (revert list)
`lib/utils/currency.ts`, `lib/utils/kpiHelpers.ts`,
`app/(dashboard)/kpi/components/{KPIModal,LogModal,WeekRow,KPITable,StatsTab}.tsx`,
`app/(dashboard)/dashboard/page.tsx` — all reverted to pre-feature (raw-number) display.
