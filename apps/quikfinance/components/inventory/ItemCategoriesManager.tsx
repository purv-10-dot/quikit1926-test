"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus, Trash2, Pencil, Check, X, Loader2, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Category = { id: string; name: string; parent_id: string | null; is_active: boolean };

export function ItemCategoriesManager() {
  const router = useRouter();
  const qc = useQueryClient();
  const [newTop, setNewTop] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 401-aware fetch: a lapsed session sends the user to sign in instead of a dead-end error.
  const api = async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      toast.error("Your session expired — please sign in again.");
      router.push("/login");
      throw new Error("unauthenticated");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message ?? "Request failed");
    return body?.data;
  };

  const { data: categories = [], isPending } = useQuery({
    queryKey: ["item-categories-all"],
    queryFn: () => api("/api/v1/inventory/categories?all=1") as Promise<Category[]>
  });

  const top = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subsByParent = useMemo(() => {
    const m: Record<string, Category[]> = {};
    for (const c of categories) if (c.parent_id) (m[c.parent_id] ??= []).push(c);
    return m;
  }, [categories]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["item-categories-all"] });
  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); refresh(); }
    catch (e) { if (e instanceof Error && e.message !== "unauthenticated") toast.error(e.message); }
    finally { setBusy(false); }
  };

  const addTop = () => { if (!newTop.trim()) return; run(async () => { await api("/api/v1/inventory/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newTop.trim() }) }); setNewTop(""); }, "Category added."); };
  const addSub = (parentId: string) => { const name = (newSub[parentId] ?? "").trim(); if (!name) return; run(async () => { await api("/api/v1/inventory/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent_id: parentId }) }); setNewSub((s) => ({ ...s, [parentId]: "" })); }, "Sub-category added."); };
  const rename = () => { if (!editing?.name.trim()) return; const { id, name } = editing; run(async () => { await api(`/api/v1/inventory/categories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }); setEditing(null); }, "Renamed."); };
  const remove = (c: Category) => { if (!confirm(`Delete “${c.name}”${c.parent_id ? "" : " and its sub-categories"}? Items keep their data but lose the link.`)) return; run(() => api(`/api/v1/inventory/categories/${c.id}`, { method: "DELETE" }), "Deleted."); };

  const NameCell = ({ c }: { c: Category }) =>
    editing?.id === c.id ? (
      <span className="flex items-center gap-1">
        <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} className="h-8 w-48" onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
        <button onClick={rename} disabled={busy} className="rounded p-1 text-emerald-600 hover:bg-muted"><Check className="h-4 w-4" /></button>
        <button onClick={() => setEditing(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </span>
    ) : (
      <span className="group inline-flex items-center gap-2">
        {c.name}
        <button onClick={() => setEditing({ id: c.id, name: c.name })} className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
      </span>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderTree className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Item Categories</h1>
          <p className="text-sm text-muted-foreground">Manage product categories and nested sub-categories.</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border bg-card p-3 shadow-card">
        <Input value={newTop} onChange={(e) => setNewTop(e.target.value)} placeholder="New category name" onKeyDown={(e) => e.key === "Enter" && addTop()} />
        <Button onClick={addTop} disabled={busy || !newTop.trim()}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}Add category</Button>
      </div>

      {isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : top.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">No categories yet — add your first one above.</div>
      ) : (
        <div className="space-y-3">
          {top.map((cat) => (
            <div key={cat.id} className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="font-semibold"><NameCell c={cat} /></span>
                <button onClick={() => remove(cat)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="divide-y">
                {(subsByParent[cat.id] ?? []).map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground"><CornerDownRight className="h-3.5 w-3.5" /><span className="text-foreground"><NameCell c={sub} /></span></span>
                    <button onClick={() => remove(sub)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-4 py-2">
                  <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={newSub[cat.id] ?? ""} onChange={(e) => setNewSub((s) => ({ ...s, [cat.id]: e.target.value }))} placeholder="Add sub-category" className="h-8 max-w-xs" onKeyDown={(e) => e.key === "Enter" && addSub(cat.id)} />
                  <Button size="sm" variant="secondary" onClick={() => addSub(cat.id)} disabled={busy || !(newSub[cat.id] ?? "").trim()}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
