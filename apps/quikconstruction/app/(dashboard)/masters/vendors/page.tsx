"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Users, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { VendorFormPanel, type VendorInitial } from "./_components/VendorFormPanel";

interface Vendor {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  paymentTermsDays: number | null;
  rating: number | null;
  status: string;
}

export default function VendorsList() {
  const [items, setItems] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<VendorInitial | undefined>(undefined);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/masters/vendors");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } catch (e) {
      console.error("[vendors] list failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(v: Vendor) {
    const ok = await confirm({
      title: "Archive this vendor?",
      description: `"${v.name}" will be moved to trash. This can be undone from the trash view.`,
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    await fetch(`/api/masters/vendors/${v.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/masters" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Masters
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Vendors</h1>
          <p className="text-xs text-gray-500">Suppliers for materials and services. Code is unique per tenant.</p>
        </div>
        <AddButton onClick={() => { setEditing(undefined); setPanelOpen(true); }}>
          Add Vendor
        </AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No vendors yet"
          message="Register your first vendor with their GSTIN, contact + banking details."
          action={{ label: "Add Vendor", onClick: () => { setEditing(undefined); setPanelOpen(true); } }}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">GSTIN</th>
                <th className="text-left px-3 py-2">City</th>
                <th className="text-left px-3 py-2">Terms</th>
                <th className="text-left px-3 py-2">Rating</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900">{v.code}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{v.name}</div>
                    {v.contactPerson && <div className="text-xs text-gray-500">{v.contactPerson}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{v.gstin ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{v.city ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{v.paymentTermsDays ? `${v.paymentTermsDays}d` : "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{v.rating ? `${v.rating}★` : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={
                      v.status === "active"
                        ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded"
                      : v.status === "blacklisted"
                        ? "text-[10px] font-semibold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded"
                        : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                    }>{v.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setEditing(v as VendorInitial); setPanelOpen(true); }}
                      className="text-gray-400 hover:text-accent-600 p-1"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(v)}
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

      <VendorFormPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        initial={editing}
        onSaved={refresh}
      />
    </div>
  );
}
