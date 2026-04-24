"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GanttChart, Save } from "lucide-react";
import { Button, EmptyState } from "@quikit/ui";

interface Boq { id: string; boqNumber: string; status: string; project: { name: string } | null; }
interface BoqItem {
  id: string; code: string | null; description: string; kind: string;
  parentId: string | null; sortOrder: number;
  quantity: string | null; percentComplete: string | null;
  scheduledStart: string | null; scheduledEnd: string | null;
}
interface BoqDetail { id: string; boqNumber: string; items: BoqItem[] }

// ms in a day
const MS_DAY = 86400000;

function fmtDateIso(d: Date) { return d.toISOString().slice(0, 10); }

export default function GanttPage() {
  const [boqs, setBoqs] = useState<Boq[]>([]);
  const [boqId, setBoqId] = useState<string>("");
  const [detail, setDetail] = useState<BoqDetail | null>(null);
  const [dirty, setDirty] = useState<Map<string, Partial<BoqItem>>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetch("/api/projects/boq").then(r => r.json()).then(j => j.success && setBoqs(j.data)); }, []);

  const loadBoq = useCallback(async (id: string) => {
    setDirty(new Map()); setErr(null);
    const r = await fetch(`/api/projects/boq/${id}`); const j = await r.json();
    if (j.success) setDetail(j.data);
  }, []);
  useEffect(() => { if (boqId) loadBoq(boqId); }, [boqId, loadBoq]);

  function update(itemId: string, patch: Partial<BoqItem>) {
    setDetail(d => d ? { ...d, items: d.items.map(i => i.id === itemId ? { ...i, ...patch } : i) } : d);
    setDirty(prev => {
      const m = new Map(prev);
      m.set(itemId, { ...(m.get(itemId) ?? {}), ...patch });
      return m;
    });
  }

  async function saveAll() {
    if (dirty.size === 0) return;
    setBusy(true); setErr(null);
    try {
      const updates = Array.from(dirty.entries()).map(([itemId, p]) => ({
        itemId,
        scheduledStart: p.scheduledStart ?? null,
        scheduledEnd: p.scheduledEnd ?? null,
        percentComplete: p.percentComplete == null ? null : Number(p.percentComplete),
      }));
      const r = await fetch(`/api/projects/boq/${boqId}/items`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setDirty(new Map());
      loadBoq(boqId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  // Compute timeline range from all scheduled items (fallback to a 4-week window from today)
  const { minDate, maxDate, days } = useMemo(() => {
    if (!detail) return { minDate: new Date(), maxDate: new Date(), days: 0 };
    const starts = detail.items.map(i => i.scheduledStart ? new Date(i.scheduledStart).getTime() : null).filter(Boolean) as number[];
    const ends = detail.items.map(i => i.scheduledEnd ? new Date(i.scheduledEnd).getTime() : null).filter(Boolean) as number[];
    if (starts.length === 0 || ends.length === 0) {
      const today = new Date();
      const start = new Date(today); start.setDate(start.getDate() - 7);
      const end = new Date(today); end.setDate(end.getDate() + 28);
      return { minDate: start, maxDate: end, days: Math.round((end.getTime() - start.getTime()) / MS_DAY) };
    }
    const lo = new Date(Math.min(...starts)); lo.setDate(lo.getDate() - 3);
    const hi = new Date(Math.max(...ends)); hi.setDate(hi.getDate() + 3);
    return { minDate: lo, maxDate: hi, days: Math.round((hi.getTime() - lo.getTime()) / MS_DAY) };
  }, [detail]);

  const PX_PER_DAY = 20;
  const chartWidth = Math.max(800, days * PX_PER_DAY);
  const rowH = 32;

  function barPos(item: BoqItem) {
    if (!item.scheduledStart || !item.scheduledEnd) return null;
    const s = new Date(item.scheduledStart).getTime();
    const e = new Date(item.scheduledEnd).getTime();
    const x = ((s - minDate.getTime()) / MS_DAY) * PX_PER_DAY;
    const w = Math.max(4, ((e - s) / MS_DAY) * PX_PER_DAY);
    return { x, w };
  }

  return (
    <div className="p-6 max-w-7xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Gantt</h1>
          <p className="text-xs text-gray-500">Schedule and progress tracking on BOQ items. Inline edit dates + % complete, save to persist.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={boqId} onChange={e => setBoqId(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1">
            <option value="">— pick a BOQ —</option>
            {boqs.map(b => <option key={b.id} value={b.id}>{b.boqNumber} — {b.project?.name ?? ""}</option>)}
          </select>
          {dirty.size > 0 && <Button onClick={saveAll} disabled={busy}><Save className="h-3.5 w-3.5 mr-1" />{busy ? "Saving…" : `Save ${dirty.size}`}</Button>}
        </div>
      </div>
      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{err}</div>}
      {!boqId ? (
        <EmptyState icon={GanttChart} title="Pick a BOQ" message="Select a BOQ above to load its items and schedule them." />
      ) : !detail ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex" style={{ minHeight: 500 }}>
            {/* Left: item list with inline fields */}
            <div className="w-[420px] border-r border-gray-200 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-accent-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">Item</th>
                    <th className="text-left px-2 py-1.5">Start</th>
                    <th className="text-left px-2 py-1.5">End</th>
                    <th className="text-right px-2 py-1.5">%</th>
                  </tr>
                </thead>
                <tbody>{detail.items.map(i => (
                  <tr key={i.id} className="border-t border-gray-100" style={{ height: rowH }}>
                    <td className="px-2" style={{ height: rowH }}>
                      <div className={`truncate ${i.kind === "group" ? "font-semibold text-gray-900" : "text-gray-700"}`}>{i.code ? `${i.code} — ` : ""}{i.description}</div>
                    </td>
                    <td className="px-2"><input type="date" value={i.scheduledStart ? fmtDateIso(new Date(i.scheduledStart)) : ""} onChange={e => update(i.id, { scheduledStart: e.target.value || null })} className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5" /></td>
                    <td className="px-2"><input type="date" value={i.scheduledEnd ? fmtDateIso(new Date(i.scheduledEnd)) : ""} onChange={e => update(i.id, { scheduledEnd: e.target.value || null })} className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5" /></td>
                    <td className="px-2 text-right"><input type="number" min={0} max={100} step={1} value={i.percentComplete ?? ""} onChange={e => update(i.id, { percentComplete: e.target.value || null })} className="w-14 text-[11px] border border-gray-200 rounded px-1 py-0.5 text-right" /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {/* Right: SVG Gantt */}
            <div className="flex-1 overflow-auto">
              <svg width={chartWidth} height={(detail.items.length + 1) * rowH} style={{ display: "block", background: "#fff" }}>
                {/* Header band */}
                <rect x={0} y={0} width={chartWidth} height={rowH} fill="#f8fafc" />
                {Array.from({ length: days + 1 }).map((_, d) => {
                  const dt = new Date(minDate.getTime() + d * MS_DAY);
                  const isMonday = dt.getDay() === 1;
                  const isMonthStart = dt.getDate() === 1;
                  return (
                    <g key={d}>
                      <line x1={d * PX_PER_DAY} y1={0} x2={d * PX_PER_DAY} y2={(detail.items.length + 1) * rowH} stroke={isMonday || isMonthStart ? "#e5e7eb" : "#f3f4f6"} />
                      {isMonday && <text x={d * PX_PER_DAY + 2} y={rowH - 8} fontSize="9" fill="#6b7280">{fmtDateIso(dt).slice(5)}</text>}
                      {isMonthStart && <text x={d * PX_PER_DAY + 2} y={12} fontSize="9" fontWeight="bold" fill="#374151">{dt.toLocaleString("en", { month: "short" })} {dt.getFullYear()}</text>}
                    </g>
                  );
                })}
                {/* Rows */}
                {detail.items.map((i, idx) => {
                  const y = (idx + 1) * rowH;
                  const pos = barPos(i);
                  const pct = i.percentComplete ? Number(i.percentComplete) : 0;
                  return (
                    <g key={i.id}>
                      <line x1={0} y1={y} x2={chartWidth} y2={y} stroke="#f3f4f6" />
                      {pos && (
                        <g>
                          <rect x={pos.x} y={y + 6} width={pos.w} height={rowH - 12} rx={3} fill={i.kind === "group" ? "#818cf8" : "#60a5fa"} opacity={0.8} />
                          {pct > 0 && <rect x={pos.x} y={y + 6} width={pos.w * (pct / 100)} height={rowH - 12} rx={3} fill="#22c55e" opacity={0.9} />}
                          <text x={pos.x + 4} y={y + rowH / 2 + 4} fontSize="10" fill="#1f2937">{i.code ?? ""} {pct > 0 ? `(${pct}%)` : ""}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
                {/* Today line */}
                {(() => {
                  const today = new Date();
                  if (today < minDate || today > maxDate) return null;
                  const x = ((today.getTime() - minDate.getTime()) / MS_DAY) * PX_PER_DAY;
                  return (
                    <g>
                      <line x1={x} y1={0} x2={x} y2={(detail.items.length + 1) * rowH} stroke="#ef4444" strokeDasharray="3,3" />
                      <text x={x + 2} y={10} fontSize="9" fill="#ef4444">today</text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
