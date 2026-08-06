# The Shared Table Component — A Simple Explanation

**Project:** QuikScale (OPSP Review screen)
**What changed:** One small line added to a shared table component
**Date:** 21 July 2026

---

## 1. The Big Picture (in one minute)

Our company has **many apps** — QuikScale, QuikInfra, QuikFinance, and more.
All of them need to show data in **tables** (rows and columns).

Instead of every app building its own table from zero, we keep **one shared table
component** in a common folder. Think of it like a **shared template** that every
app can reuse.

On this project, we needed the tables on the **OPSP Review screen** to do a few
extra things:

- **Sort** columns (click to arrange A–Z, high–low)
- **Hide** columns you don't want to see
- **Freeze** the first columns so they stay put when you scroll sideways
- **Resize** columns (drag to make wider/narrower)
- **Drag** columns to reorder them
- **Remember** each user's choices next time they log in

To make this work, we changed **only one tiny thing** in the shared table.
Everything else was built **inside QuikScale**, without disturbing the other apps.

---

## 2. What Is the "Shared Table"?

The shared table is a small, simple building block. Its only job is to **draw** rows
and columns on the screen. It does **not** know how to sort, hide, or drag columns by
itself — those extras are added on top by each app when it needs them.

> **Simple analogy:** the shared table is like a **plain notebook with lines on it**.
> The lines help you write neatly, but the notebook doesn't do your homework. Each app
> writes its own "homework" (the special features) on top of those lines.

Because it is kept simple, the shared table can be safely reused by every app.

---

## 3. What We Changed (and why it is tiny)

We added **one line** to the shared table. In plain words, we gave every column
header a **name tag**.

```
Before:  a column header with no name tag
After:   a column header that quietly carries its own name (e.g. "Category")
```

That's the whole change. Nothing was removed, nothing was renamed, nothing looks
different on screen.

### Why was this needed?

QuikScale's special features (drag, freeze) work by **looking at the columns on the
screen** and asking each one, *"Which column are you?"*

If a column has **no name tag**, the feature can't tell them apart — so drag and
freeze simply **do nothing**. No error, they just don't work.

> **Simple analogy:** imagine trying to reorder people in a line, but nobody is
> wearing a name badge. You can't tell who is who, so you can't organise them.
> The name tag (our one-line change) is the **badge** that makes it possible.

Every other QuikScale table already had these name tags. Only the shared table was
missing them — so we added it there too.

### Why this change is safe for everyone

- It **only adds** a hidden label. It doesn't change how anything looks or behaves.
- Apps that don't use this label are **not affected at all** — the label just sits
  there, unused.
- It cannot break other apps, because nothing they rely on was touched.

---

## 4. What This Enables on the OPSP Review Screen

With the name tags in place, the OPSP Review tables now let each user:

| Feature | What the user can do |
|---|---|
| **Sort** | Click a column to arrange the rows (e.g. by Target, Achieved, Growth). |
| **Hide columns** | Remove columns they don't care about. |
| **Freeze columns** | Keep the left columns fixed while scrolling right. |
| **Resize** | Drag a column edge to change its width. |
| **Reorder** | Drag a column to a new position. |
| **Remembered** | All these choices are saved per user, for next time. |

These are **reporting tables**, so we deliberately left out things they don't need,
like page-by-page navigation or deleting rows.

---

## 5. The Key Question: Change the Shared Component, or Copy Code Into Each App?

This is the important decision. There are two ways to give an app new table features:

### Option A — Improve the shared component (write once)
Everyone benefits. Fix a bug once, and it's fixed everywhere.

### Option B — Copy the code into each app separately (write again and again)
Each app repeats the same work. A bug must be fixed in every app, one by one.

### What is actually happening in our company today

This is real, not hypothetical:

| App | How its table is built | Amount of code |
|---|---|---|
| **QuikScale** | Reuses the shared table + small add-ons | Small shared piece + light extras |
| **QuikInfra** | Built its **own** full table from scratch | **~1,446 lines** |
| **QuikFinance** | Built its **own** full table from scratch | **~341 lines** |

Because the shared table was kept very simple, **QuikInfra and QuikFinance each
re-wrote the whole table themselves.** That is a lot of duplicated work — exactly the
"writing the same code again and again" problem.

> **Simple analogy:** three teams each cooking the same dish. Instead of sharing one
> recipe, two teams wrote their own long recipe from scratch. Now if the recipe needs
> a fix, those two teams must each fix their own copy.

---

## 6. So — Is It Feasible to Change the Shared Component?

**Yes — when the change is small, safe, and helps everyone.** Here is the simple rule
we followed:

> **Put in the shared component only things that help every app and harm none.**
> **Keep app-specific behaviour inside that app.**

Our one-line "name tag" fits this perfectly: it helps any app that wants it, and it
hurts none. So it belongs in the shared component.

All the bigger, QuikScale-only logic (the actual sorting, dragging, saving) stays
**inside QuikScale**. We did **not** dump QuikScale's special rules into the shared
table.

### Quick guide — where should a change go?

| Ask yourself... | If YES | If NO |
|---|---|---|
| Does this help every app (or at least harm none)? | Shared component | Keep it in the app |
| Is it just adding something (not removing/renaming)? | Safe to share | Be very careful |
| Is it a special rule for only one app? | Keep it in the app | — |

### Simple do / don't list for the shared table

| ✅ Safe to do | ❌ Avoid |
|---|---|
| Add a small hidden label (like our name tag) | Rename or delete existing settings |
| Add a new **optional** setting with a default | Change how it looks for everyone |
| — | Put one app's special business rules inside it |

---

## 7. A Note for the Future (optional idea)

Right now, QuikInfra and QuikFinance keep their own big table copies (about **1,700
lines** of repeated work between them). One day it may be worth moving the common
features **into the shared table** as optional add-ons, so those copies can be
removed. That would save a lot of duplicated code.

But that is a **separate, planned project** with proper testing — not something to do
quietly during a bug fix.

---

## 8. Summary of Everything Changed on This Project

**In the shared component (affects the reusable table):**
- Added a hidden "name tag" to each column header. *(One line. Safe. Only QuikScale
  uses it today.)*

**Inside QuikScale (does not affect other apps):**
- Added the logic that gives OPSP Review tables sort / hide / freeze / resize / drag.
- Added a smart sorting helper for grouped rows.
- Turned on those features for the OPSP Review Primary, Secondary, and Critical tables.
- Made sure each user's column choices are saved and loaded correctly.

**The result:**
- The shared table stays simple and safe for every app.
- OPSP Review tables now work like the rest of QuikScale.
- No other app was touched, and no code was duplicated.

---

## 9. One-Line Takeaway

> We added a tiny, harmless "name tag" to the shared table so QuikScale's OPSP Review
> tables could gain sorting, freezing, and drag features — while keeping the shared
> table safe and reusable for every other app.
