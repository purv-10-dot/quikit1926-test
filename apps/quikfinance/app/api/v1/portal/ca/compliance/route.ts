import { ok, fail, errorMessage } from "@/lib/api/responses";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

type Item = { id: string; title: string; category: "GST" | "TDS" | "Income Tax" | "ROC"; dueDate: string; status: "overdue" | "due_soon" | "upcoming" };

const pad = (x: number) => String(x).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Next occurrence (>= today) of a given day-of-month. */
function nextMonthly(today: Date, day: number): Date {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
  if (d < today) d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}
/** Next occurrence (>= today) from a list of {month(0-based), day}. */
function nextFromSet(today: Date, set: { m: number; d: number }[]): Date {
  const yr = today.getUTCFullYear();
  const candidates = [...set.map((s) => new Date(Date.UTC(yr, s.m, s.d))), ...set.map((s) => new Date(Date.UTC(yr + 1, s.m, s.d)))];
  return candidates.filter((c) => c >= today).sort((a, b) => a.getTime() - b.getTime())[0];
}

/**
 * CA portal compliance calendar — statutory Indian filing deadlines computed
 * relative to today, for the selected company. (Standard recurring due dates;
 * filing-status integration is the next layer.)
 */
export async function GET() {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const raw: Array<{ title: string; category: Item["category"]; date: Date }> = [
      { title: "GSTR-1 (monthly outward supplies)", category: "GST", date: nextMonthly(today, 11) },
      { title: "GSTR-3B (monthly summary & tax)", category: "GST", date: nextMonthly(today, 20) },
      { title: "TDS payment (challan)", category: "TDS", date: nextMonthly(today, 7) },
      { title: "TDS return (quarterly)", category: "TDS", date: nextFromSet(today, [{ m: 6, d: 31 }, { m: 9, d: 31 }, { m: 0, d: 31 }, { m: 4, d: 31 }]) },
      { title: "Advance tax instalment", category: "Income Tax", date: nextFromSet(today, [{ m: 5, d: 15 }, { m: 8, d: 15 }, { m: 11, d: 15 }, { m: 2, d: 15 }]) },
      { title: "GSTR-9 (annual return)", category: "GST", date: nextFromSet(today, [{ m: 11, d: 31 }]) },
      { title: "ROC AOC-4 (financials)", category: "ROC", date: nextFromSet(today, [{ m: 9, d: 30 }]) },
      { title: "ROC MGT-7 (annual return)", category: "ROC", date: nextFromSet(today, [{ m: 10, d: 29 }]) }
    ];

    const DAY = 86_400_000;
    const items: Item[] = raw.map((r, i) => {
      const days = Math.round((r.date.getTime() - today.getTime()) / DAY);
      const status: Item["status"] = days < 0 ? "overdue" : days <= 15 ? "due_soon" : "upcoming";
      return { id: `cmp-${i}`, title: r.title, category: r.category, dueDate: iso(r.date), status };
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return ok({ today: iso(today), items, dueSoon: items.filter((i) => i.status === "due_soon").length });
  } catch (error) {
    return fail(500, { code: "CA_COMPLIANCE_FAILED", message: errorMessage(error) });
  }
}
