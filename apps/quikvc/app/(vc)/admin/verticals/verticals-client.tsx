"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
  dealCount: number;
  criteriaCount: number;
}

export default function VerticalsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy("add"); setError(null);
    try {
      const r = await fetch("/api/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      setName(""); setDescription("");
      router.refresh();
    } finally { setBusy(null); }
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(`toggle-${id}`); setError(null);
    try {
      const r = await fetch(`/api/verticals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this vertical? Only allowed if no deals reference it.")) return;
    setBusy(`del-${id}`); setError(null);
    try {
      const r = await fetch(`/api/verticals/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Add vertical</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            placeholder="Vertical name (e.g. AgriTech)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm md:col-span-1"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm md:col-span-2"
          />
        </div>
        <button
          type="button"
          disabled={busy === "add" || !name.trim()}
          onClick={add}
          className="text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "add" ? "Adding…" : "+ Add"}
        </button>
      </section>

      {initial.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No verticals yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2.5 text-left">Name</th>
                <th className="px-5 py-2.5 text-left">Slug</th>
                <th className="px-5 py-2.5 text-right">Criteria</th>
                <th className="px-5 py-2.5 text-right">Deals</th>
                <th className="px-5 py-2.5 text-center">Enabled</th>
                <th className="px-5 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {initial.map((v) => (
                <tr key={v.id} className="border-t border-gray-100">
                  <td className="px-5 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-5 py-3 text-xs text-gray-500 font-mono">{v.slug}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-700">{v.criteriaCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-700">{v.dealCount}</td>
                  <td className="px-5 py-3 text-center">
                    <button
                      type="button"
                      disabled={busy === `toggle-${v.id}`}
                      onClick={() => toggle(v.id, v.enabled)}
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        v.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {v.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === `del-${v.id}` || v.dealCount > 0}
                      onClick={() => remove(v.id)}
                      title={v.dealCount > 0 ? "Has deals — disable instead" : ""}
                      className="text-xs text-red-600 hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
