"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { ArrowLeft, Package, UserPlus, RotateCcw, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";

type Condition = "New" | "Good" | "Fair" | "Poor";

interface Assignment {
  id: string; employeeId: string; assignedBy: string; assignedAt: string; returnedAt: string | null;
  returnedTo: string | null; returnCondition: Condition | null; expectedReturnDate: string | null;
  status: string; notes: string | null;
}

interface Asset {
  id: string; assetCode: string; name: string; category: string; quantity: number; serialNumber: string | null;
  brand: string | null; model: string | null; purchaseDate: string | null; purchasePrice: string | number | null;
  warrantyExpiry: string | null; status: string; condition: Condition; location: string | null;
  notes: string | null; assignments: Assignment[];
}

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApiClient();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDupWarn, setShowDupWarn] = useState(false);
  const [showScrap, setShowScrap] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: "", expectedReturnDate: "", notes: "" });
  const [returnForm, setReturnForm] = useState({ returnCondition: "Good" as Condition, markLost: false, notes: "" });
  const [scrapForm, setScrapForm] = useState({ quantity: 1, disposalReason: "", disposalDate: "", scrapValue: null as number | null, markLost: false, notes: "" });
  const [editForm, setEditForm] = useState<{
    name: string; category: string; quantity: number; serialNumber: string; brand: string; model: string;
    purchaseDate: string; purchasePrice: number | null; warrantyExpiry: string; location: string;
    condition: Condition; notes: string; status: string;
  } | null>(null);

  const { data } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<Asset>(`/api/v1/hrms/assets/${id}`),
  });

  const assignMut = useMutation({
    mutationFn: (body: typeof assignForm & { force?: boolean }) => api.post(`/api/v1/hrms/assets/${id}/assign`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset", id] }); setShowAssign(false); setShowDupWarn(false); },
  });

  const returnMut = useMutation({
    mutationFn: (body: typeof returnForm) => api.post(`/api/v1/hrms/assets/${id}/return`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset", id] }); setShowReturn(false); },
  });

  const editMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/v1/hrms/assets/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset", id] }); qc.invalidateQueries({ queryKey: ["assets"] }); setShowEdit(false); },
  });

  const scrapMut = useMutation({
    mutationFn: (body: typeof scrapForm) => api.post(`/api/v1/hrms/assets/${id}/scrap`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset", id] }); qc.invalidateQueries({ queryKey: ["assets"] }); setShowScrap(false); },
  });

  const asset = data?.data;
  if (!asset) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  const activeAssignments = asset.assignments.filter((a) => a.status === "AssignmentActive");
  const history = asset.assignments.filter((a) => a.status !== "AssignmentActive");
  const totalQty = asset.quantity ?? 1;
  const assignedCount = activeAssignments.length;
  const availableCount = Math.max(0, totalQty - assignedCount);
  const canAssign = availableCount > 0 && asset.status !== "Retired" && asset.status !== "AssetLost";
  const canReturn = activeAssignments.length > 0;
  const scrappableQty = Math.max(0, totalQty - assignedCount);
  const canScrap = scrappableQty > 0 && asset.status !== "Retired" && asset.status !== "AssetLost";

  return (
    <div className="max-w-5xl">
      <Link href="/assets" className="inline-flex items-center gap-1 text-sm text-[#3b82f6] hover:underline mb-4">
        <ArrowLeft size={14} /> Back to inventory
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Package className="text-[#3b82f6]" />
              <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{asset.name}</h1>
              <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">{asset.assetCode}</span>
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">{asset.category}</span>
              {asset.brand && <span>{asset.brand} {asset.model}</span>}
              {asset.serialNumber && <><span>•</span><span className="font-mono">{asset.serialNumber}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditForm({
                  name: asset.name,
                  category: asset.category,
                  quantity: asset.quantity ?? 1,
                  serialNumber: asset.serialNumber ?? "",
                  brand: asset.brand ?? "",
                  model: asset.model ?? "",
                  purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
                  purchasePrice: asset.purchasePrice ? Number(asset.purchasePrice) : null,
                  warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.slice(0, 10) : "",
                  location: asset.location ?? "",
                  condition: asset.condition,
                  notes: asset.notes ?? "",
                  status: asset.status,
                });
                setShowEdit(true);
              }}
              className="flex items-center gap-1 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"
            >
              <Pencil size={14} /> Edit
            </button>
            {canAssign && (
              <button onClick={() => setShowAssign(true)} className="flex items-center gap-1 bg-[#16243A] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#2563eb]">
                <UserPlus size={14} /> Assign ({availableCount} free)
              </button>
            )}
            {canReturn && (
              <button onClick={() => setShowReturn(true)} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">
                <RotateCcw size={14} /> Return
              </button>
            )}
            {canScrap && (
              <button onClick={() => setShowScrap(true)} className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700">
                <Trash2 size={14} /> Scrap ({scrappableQty} free)
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div><div className="text-xs text-gray-500 uppercase">Status</div><div className="font-medium">{asset.status}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Quantity</div><div className="font-medium"><span className="text-green-600">{availableCount}</span> / {totalQty} <span className="text-xs text-gray-400 font-normal">available</span></div></div>
          <div><div className="text-xs text-gray-500 uppercase">Condition</div><div className="font-medium">{asset.condition}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Location</div><div className="font-medium">{asset.location ?? "—"}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Price</div><div className="font-medium">{asset.purchasePrice ? `₹${Number(asset.purchasePrice).toLocaleString("en-IN")}` : "—"}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Purchased</div><div className="font-medium text-sm">{asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString("en-IN") : "—"}</div></div>
          <div className="col-span-2"><div className="text-xs text-gray-500 uppercase">Warranty</div>
            <div className="font-medium text-sm">{asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString("en-IN") : "—"}
              {asset.warrantyExpiry && new Date(asset.warrantyExpiry) < new Date() && <span className="ml-2 text-red-600 text-xs">(expired)</span>}
            </div></div>
        </div>

        {asset.notes && <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">{asset.notes}</div>}
      </div>

      {activeAssignments.length > 0 && (
        <div className="bg-[#dbeafe] rounded-lg border border-[#bfdbfe] p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={14} className="text-[#3b82f6]" />
            <h2 className="font-semibold text-[#1d4ed8]">Active Assignments ({assignedCount}/{totalQty})</h2>
          </div>
          <div className="space-y-3">
            {activeAssignments.map((a) => (
              <div key={a.id} className="grid grid-cols-3 gap-4 text-sm border-b border-[#bfdbfe] pb-2 last:border-0 last:pb-0">
                <div><div className="text-xs text-[#2563eb] uppercase">Employee</div><div className="font-mono font-medium">{a.employeeId}</div></div>
                <div><div className="text-xs text-[#2563eb] uppercase">Assigned On</div><div>{new Date(a.assignedAt).toLocaleDateString("en-IN")}</div></div>
                <div><div className="text-xs text-[#2563eb] uppercase">Expected Return</div>
                  <div className="flex items-center gap-1">
                    {a.expectedReturnDate ? new Date(a.expectedReturnDate).toLocaleDateString("en-IN") : "—"}
                    {a.expectedReturnDate && new Date(a.expectedReturnDate) < new Date() && <AlertTriangle size={12} className="text-red-600" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">Assignment History ({history.length})</div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No past assignments</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-left px-4 py-2">Assigned</th>
                <th className="text-left px-4 py-2">Returned</th>
                <th className="text-left px-4 py-2">Condition</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-mono text-xs">{a.employeeId}</td>
                  <td className="px-4 py-2">{new Date(a.assignedAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2">{a.returnedAt ? new Date(a.returnedAt).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-4 py-2">{a.returnCondition ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium",
                      a.status === "AssignmentReturned" ? "bg-green-100 text-green-700" :
                      a.status === "AssignmentLost" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600")}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign Asset">
        <form onSubmit={(e) => {
          e.preventDefault();
          const dup = activeAssignments.some((x) => x.employeeId === assignForm.employeeId);
          if (dup) { setShowDupWarn(true); return; }
          assignMut.mutate(assignForm);
        }} className="space-y-4">
          <EmployeeSelect
            label="Employee"
            required
            value={assignForm.employeeId}
            onChange={(id) => setAssignForm({ ...assignForm, employeeId: id })}
          />
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Expected Return Date</label>
            <input type="date" value={assignForm.expectedReturnDate} onChange={(e) => setAssignForm({ ...assignForm, expectedReturnDate: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAssign(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Assign</button>
          </div>
        </form>
      </Modal>

      <Modal open={showDupWarn} onClose={() => setShowDupWarn(false)} title="Already Assigned">
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-gray-700">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              Employee <span className="font-mono font-medium">{assignForm.employeeId}</span> already has an active assignment of this asset.
              Assign another unit to the same employee?
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowDupWarn(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">No</button>
            <button
              type="button"
              disabled={assignMut.isPending}
              onClick={() => assignMut.mutate({ ...assignForm, force: true })}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {assignMut.isPending ? "Assigning..." : "Yes, Assign"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showReturn} onClose={() => setShowReturn(false)} title="Return Asset">
        <form onSubmit={(e) => { e.preventDefault(); returnMut.mutate(returnForm); }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Return Condition</label>
            <Select
              value={returnForm.returnCondition}
              onChange={(v) => setReturnForm({ ...returnForm, returnCondition: v as Condition })}
              options={["New", "Good", "Fair", "Poor"].map((c) => ({ value: c, label: c }))}
            /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={returnForm.markLost} onChange={(e) => setReturnForm({ ...returnForm, markLost: e.target.checked })} /> Mark as lost
          </label>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowReturn(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className={clsx("px-4 py-2 text-white rounded-lg text-sm font-medium", returnForm.markLost ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700")}>
              {returnForm.markLost ? "Mark Lost" : "Return"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showScrap} onClose={() => setShowScrap(false)} title="Scrap Asset Units">
        <form onSubmit={(e) => { e.preventDefault(); scrapMut.mutate(scrapForm); }} className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700 flex gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>{scrappableQty} of {totalQty} unit{totalQty > 1 ? "s" : ""} free to scrap. Assigned units must be returned first.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Scrap <span className="text-red-500">*</span></label>
              <input type="number" min={1} max={scrappableQty} value={scrapForm.quantity}
                onChange={(e) => setScrapForm({ ...scrapForm, quantity: Math.max(1, Math.min(scrappableQty, Number(e.target.value) || 1)) })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-0.5">max {scrappableQty}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disposal Date</label>
              <input type="date" value={scrapForm.disposalDate} onChange={(e) => setScrapForm({ ...scrapForm, disposalDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Disposal Reason <span className="text-red-500">*</span></label>
            <Select
              value={scrapForm.disposalReason}
              onChange={(v) => setScrapForm({ ...scrapForm, disposalReason: v })}
              placeholder="Select reason"
              options={["End of life", "Damaged beyond repair", "Obsolete", "Sold", "Donated", "Stolen", "Other"].map((r) => ({ value: r, label: r }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scrap Recovery (₹)</label>
            <NumberInput value={scrapForm.scrapValue} onChange={(v) => setScrapForm({ ...scrapForm, scrapValue: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={scrapForm.notes} onChange={(e) => setScrapForm({ ...scrapForm, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={scrapForm.markLost} onChange={(e) => setScrapForm({ ...scrapForm, markLost: e.target.checked })} />
            Mark as lost (instead of retired)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowScrap(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={scrapMut.isPending || !scrapForm.disposalReason || scrapForm.quantity < 1}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {scrapMut.isPending ? "Scrapping..." : `Scrap ${scrapForm.quantity} unit${scrapForm.quantity > 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Asset Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Asset">
        {editForm && (
          <form onSubmit={(e) => {
            e.preventDefault();
            editMut.mutate({
              name: editForm.name,
              category: editForm.category,
              quantity: editForm.quantity,
              serialNumber: editForm.serialNumber || undefined,
              brand: editForm.brand || undefined,
              model: editForm.model || undefined,
              purchaseDate: editForm.purchaseDate || undefined,
              purchasePrice: editForm.purchasePrice ?? undefined,
              warrantyExpiry: editForm.warrantyExpiry || undefined,
              location: editForm.location || undefined,
              condition: editForm.condition,
              status: editForm.status,
              notes: editForm.notes || undefined,
            });
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input type="number" min={1} value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select
                  value={editForm.status}
                  onChange={(v) => setEditForm({ ...editForm, status: v })}
                  options={["Available", "Assigned", "InRepair", "Retired", "AssetLost"].map((s) => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                <input value={editForm.serialNumber} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <Select
                  value={editForm.condition}
                  onChange={(v) => setEditForm({ ...editForm, condition: v as Condition })}
                  options={["New", "Good", "Fair", "Poor"].map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input type="date" value={editForm.purchaseDate} onChange={(e) => setEditForm({ ...editForm, purchaseDate: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                <NumberInput value={editForm.purchasePrice} onChange={(v) => setEditForm({ ...editForm, purchasePrice: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
                <input type="date" value={editForm.warrantyExpiry} onChange={(e) => setEditForm({ ...editForm, warrantyExpiry: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowEdit(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={editMut.isPending} className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">
                {editMut.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
