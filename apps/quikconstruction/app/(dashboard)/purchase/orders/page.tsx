"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { ShoppingCart, ArrowLeft, Send, X, Eye } from "lucide-react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

interface Opt { id: string; name: string; code?: string; prNumber?: string }

interface Po {
  id: string;
  poNumber: string;
  poDate: string;
  status: string;
  subtotal: string;
  totalAmount: string;
  project: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft:              "bg-gray-100 text-gray-600",
  sent:               "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700",
  fully_received:     "bg-green-100 text-green-700",
  closed:             "bg-gray-200 text-gray-700",
  cancelled:          "bg-red-100 text-red-700 line-through",
};

export default function PoListPage() {
  const [items, setItems] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [vendors, setVendors] = useState<Opt[]>([]);
  const [prs, setPrs] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [its, setIts] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/vendors").then(r => r.json()).then(j => j.success && setVendors(j.data));
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setIts(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
    // PRs that are eligible for conversion (submitted or approved)
    fetch("/api/purchase/requisitions?status=submitted").then(r => r.json()).then(j => {
      if (j.success) setPrs(j.data.map((p: { id: string; prNumber: string }) => ({ id: p.id, name: p.prNumber })));
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase/orders");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function send(po: Po) {
    const ok = await confirm({ title: "Send this PO to vendor?", description: `"${po.poNumber}" moves to 'sent'.`, confirmLabel: "Send", tone: "default" });
    if (!ok) return;
    await fetch(`/api/purchase/orders/${po.id}/send`, { method: "POST" });
    refresh();
  }

  async function close(po: Po) {
    const ok = await confirm({ title: "Close this PO?", description: `"${po.poNumber}" moves to 'closed' (no further receipts).`, confirmLabel: "Close", tone: "default" });
    if (!ok) return;
    await fetch(`/api/purchase/orders/${po.id}/close`, { method: "POST" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/purchase" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Purchase
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Purchase Orders</h1>
          <p className="text-xs text-gray-500">Multi-line create UI ships next. POST to <code className="bg-gray-100 px-1 rounded">/api/purchase/orders</code> today.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add PO</AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No purchase orders yet" message="POs can be created blank or converted from an approved PR." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">PO #</th>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-left px-3 py-2">Project</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((po) => (
                <tr key={po.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900">{po.poNumber}</td>
                  <td className="px-3 py-2 text-gray-700">{po.vendor?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{po.project?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(po.poDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">₹{po.totalAmount}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[po.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {po.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/purchase/orders/${po.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block" title="View"><Eye className="h-3.5 w-3.5" /></Link>
                    {po.status === "draft" && <button onClick={() => send(po)} className="text-gray-400 hover:text-accent-600 p-1" title="Send"><Send className="h-3.5 w-3.5" /></button>}
                    {po.status !== "closed" && po.status !== "cancelled" && <button onClick={() => close(po)} className="text-gray-400 hover:text-red-600 p-1" title="Close"><X className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MultiLineDocForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Purchase Order"
        endpoint="/api/purchase/orders"
        onSaved={refresh}
        addLineLabel="Add Item"
        showTotal
        headerDefaults={{
          poNumber: `PO-${Date.now().toString().slice(-6)}`,
          poDate: new Date().toISOString().slice(0, 10),
        }}
        lineDefault={{ itemId: "", orderedQty: null, unitRate: null, gstRate: null, uomId: "", deliveryDate: null, remarks: "" }}
        headerFields={[
          { name: "poNumber", label: "PO #", type: "text", required: true, width: "half", transform: "uppercase" },
          { name: "poDate", label: "PO Date", type: "text", required: true, width: "half", placeholder: "YYYY-MM-DD" },
          { name: "projectId", label: "Project", type: "select", required: true, width: "half", options: projects.map(p => ({ value: p.id, label: p.name })) },
          { name: "vendorId", label: "Vendor", type: "select", required: true, width: "half", options: vendors.map(v => ({ value: v.id, label: v.name })) },
          { name: "prId", label: "Source PR (optional)", type: "select", width: "half", options: [{ value: "", label: "— blank PO —" }, ...prs.map(p => ({ value: p.id, label: p.name }))] },
          { name: "deliveryLocationId", label: "Delivery Location", type: "select", width: "half", options: [{ value: "", label: "— none —" }, ...locations.map(l => ({ value: l.id, label: l.name }))] },
          { name: "deliveryDate", label: "Delivery Date", type: "text", width: "half", placeholder: "YYYY-MM-DD" },
          { name: "paymentTermsDays", label: "Payment Terms (days)", type: "number", width: "half", integerOnly: true, min: 0, max: 365 },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ] as FieldConfig[]}
        lineColumns={[
          { key: "itemId", label: "Item", type: "select", required: true, width: 220, options: its.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` })) },
          { key: "orderedQty", label: "Qty", type: "number", required: true, width: 80, min: 0 },
          { key: "uomId", label: "UOM", type: "select", required: true, width: 90, options: uoms.map(u => ({ value: u.id, label: u.code ?? u.name })) },
          { key: "unitRate", label: "Rate", type: "number", required: true, width: 90, min: 0 },
          { key: "gstRate", label: "GST %", type: "number", width: 70, min: 0, max: 100 },
          {
            key: "amount",
            label: "Amount",
            type: "number",
            width: 100,
            compute: (line) => {
              const q = Number(line.orderedQty ?? 0);
              const r = Number(line.unitRate ?? 0);
              const g = Number(line.gstRate ?? 0);
              if (!q || !r) return null;
              return q * r * (1 + g / 100);
            },
          },
          { key: "remarks", label: "Remarks", type: "text", width: 120 },
        ] as LineColumn[]}
      />
    </div>
  );
}
