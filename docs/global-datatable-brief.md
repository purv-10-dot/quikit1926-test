# Shared Table Component — Change Summary (Brief)

**Project:** QuikScale — OPSP Review screen · **Date:** 21 July 2026

---

## 1. What changed in the global (shared) component

We added **one line** to the shared table component (`@quikit/ui` → `DataTable`).
It gives every column header a hidden **"name tag"** (`data-col-key`).

- Nothing was removed or renamed.
- Nothing looks different on screen.
- It is a small, additive, harmless change.

---

## 2. Why this change was required

QuikScale's table features — **drag to reorder** and **freeze columns** — work by
looking at the columns on screen and asking each one *"which column are you?"*

Without the name tag, the features **can't tell columns apart**, so they simply
**do nothing** (no error — they just don't work).

> Like reordering people in a line when nobody wears a name badge — you can't.
> The name tag is that badge.

Every other QuikScale table already had this tag. Only the shared table was missing
it, so we added it there.

---

## 3. Why not put everything only inside QuikScale?

We *could* have kept the tag inside QuikScale only. But this tag is useful to **any**
app and harms none — so the shared component is the right place for it.

**The rule we follow:**
> Put small, everyone-benefits changes in the shared component.
> Keep app-specific logic inside the app.

All the bigger QuikScale-only logic (the actual sorting, dragging, saving) **stays
inside QuikScale** — it was **not** added to the shared table.

---

## 4. How this affects code reusability

| If we... | Result |
|---|---|
| **Improve the shared component** (this approach) | Write once → every app can reuse it. One fix fixes all. |
| **Copy code into each app separately** | Same work repeated in every app. Every bug fixed many times. |

**Real proof in our repo:** because the shared table was kept simple, QuikInfra
re-wrote its own table (**~1,446 lines**) and QuikFinance re-wrote another
(**~341 lines**). That is duplicated effort we want to avoid.

Our one-line change keeps the shared table **reusable and safe**, and lets QuikScale
add features **without** copying code or touching other apps.

---

## 5. In one line

> We added a tiny, harmless "name tag" to the shared table so QuikScale could gain
> sort/freeze/drag features — while keeping the shared table reusable for every app.
