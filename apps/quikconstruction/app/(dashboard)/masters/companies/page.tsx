"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Building2, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { CompanyFormPanel, type CompanyInitial } from "./_components/CompanyFormPanel";

interface Company {
  id: string;
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  city: string;
  state: string;
  status: string;
  phone: string | null;
  email: string | null;
}

export default function CompaniesList() {
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyInitial | undefined>(undefined);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/masters/companies");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } catch (e) {
      console.error("[companies] list failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(c: Company) {
    const ok = await confirm({
      title: "Archive this company?",
      description: `"${c.name}" will be moved to trash. This can be undone from the trash view.`,
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    await fetch(`/api/masters/companies/${c.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/masters" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Masters
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Companies</h1>
          <p className="text-xs text-gray-500">Legal entities with GSTIN/PAN/CIN.</p>
        </div>
        <AddButton
          onClick={() => {
            setEditing(undefined);
            setPanelOpen(true);
          }}
        >
          Add Company
        </AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          message="Register your first construction company with its legal details."
          action={{ label: "Add Company", onClick: () => { setEditing(undefined); setPanelOpen(true); } }}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">GSTIN</th>
                <th className="text-left px-3 py-2">PAN</th>
                <th className="text-left px-3 py-2">City</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.legalName}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{c.gstin}</td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{c.pan}</td>
                  <td className="px-3 py-2 text-gray-700">{c.city}, {c.state}</td>
                  <td className="px-3 py-2">
                    <span className={
                      c.status === "active"
                        ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded"
                        : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                    }>{c.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setEditing(c as CompanyInitial); setPanelOpen(true); }}
                      className="text-gray-400 hover:text-accent-600 p-1"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="text-gray-400 hover:text-red-600 p-1"
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompanyFormPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        initial={editing}
        onSaved={refresh}
      />
    </div>
  );
}
