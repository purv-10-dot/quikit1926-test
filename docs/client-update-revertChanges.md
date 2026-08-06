# QuikScale — Update Summary

**Branch:** `quikscale/revertChanges`  ·  **Baseline:** changes after the `common_setup25` merge

A summary of the enhancements and fixes delivered in this cycle. Each item shipped with unit tests, and changes were kept tightly scoped so no other features were affected.

---

## 1. Currency KPIs now display in their chosen scale (₹ Cr, $ M)

KPIs measured in a currency now show their **target and values in the selected scale unit** across the **KPI list** and the **Dashboard** (KPI cards + KPI table) — instead of raw/abbreviated numbers.

- **INR** always shows in Indian units (e.g. **₹8 Cr**, **₹25 L**), regardless of the number-format toggle.
- **Other currencies** (USD, etc.) follow the **Indian Number Format** setting:
  - Toggle **OFF** → native scale (e.g. **$9 M**)
  - Toggle **ON** → Indian magnitude, symbol kept (e.g. **$90 L**)
- Non-currency KPIs are unchanged.

*Display-only — stored values are never altered.*

---

## 2. OPSP threshold settings — clearer guidance + validation

On **Settings → Configurations**, both threshold cards were improved:

- **"Threshold days for OPSP"** and **"Threshold days for OPSP review"** now show a **context banner** explaining exactly how the countdown works — counted back from the quarter-end date, with the end date and days remaining shown.
- **Finalize threshold** is now **validated**: it cannot exceed the days remaining in the current quarter (with an inline message and the Save button disabled when invalid).
- **Review threshold** intentionally has **no day cap** — its reminder is meant to carry into the next quarter until the review is submitted — and its banner now describes that behaviour accurately (previously both cards showed identical text).
- The banners now also display correctly on the **quarter's final day** (previously they disappeared when "0 days left").

---

## 3. "Review OPSP" reminder now opens the right page

The **Review OPSP** button in the OPSP reminder banner now opens the **OPSP Review** page directly. (Previously it incorrectly routed to the Create OPSP page.)

---

## 4. WWW — Notes required on Edit (matches Add)

When **"WWW Notes Required"** is enabled, **editing** a WWW item now requires adding a note before saving — the same rule the Add form already enforced. A clear required indicator and "Notes are required" message are shown, and Save is blocked until a note is added.

---

## 5. KPI weekly editing — reliable past-week rules + 1-week grace

- **Reliability fix:** the past-week lock now applies consistently — past weeks are no longer briefly editable while the page is loading.
- **1-week grace:** when **"Edit Past Week Data"** is **OFF**, the **current week and the immediately-preceding week** are editable; weeks older than that stay locked. Future weeks remain locked.
- Applied **consistently** across the weekly editor and the server, so what you can edit on screen is exactly what saves.

---

## 6. OPSP edit-after-finalize — update Actions (QTR) one field at a time

After an OPSP is finalized, **Actions (QTR)** values can now be updated **one field at a time**. A valid change saves even when other rows are still incomplete (e.g. rows reset by a category change) — previously the **entire** grid had to be valid before any single edit could be saved.

- The change confirmation now shows a **clear, row-specific reason** when a particular row still needs a value (instead of a generic message).
- Full-grid validation is still enforced where it matters — the Actions modal's **Submit** and the **Finalize** step still require all rows to be valid.

---

### Quality notes
- All changes were delivered with **unit tests** covering the new logic and the key regression cases.
- Each change was **scoped narrowly** — the rest of the application's behaviour is unchanged.
