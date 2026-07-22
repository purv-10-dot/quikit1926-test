"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, CalendarDays, ShieldCheck, Wrench } from "lucide-react";
import { RequirePerm } from "@/components/require-perm";
import { cn } from "@/lib/utils";
import RequestRepairDialog, { type RequestRepairPayload } from "@/components/repair-requests/RequestRepairDialog";

interface MyAsset {
  id: string;
  itemName: string;
  itemCode: string;
  serialNumber: string;
  assetType: string;
  location: string;
  condition: string;
  assetStatus: "Available" | "Assigned" | "InRepair" | "Retired";
  baseCategory?: { name: string } | null;
  category?: { name: string } | null;
  assignment: {
    id: string;
    assignedAt: string;
    condition: string;
    expectedReturn: string | null;
  };
}

const STATUS_STYLES: Record<MyAsset["assetStatus"], string> = {
  Available: "bg-green-100 text-green-700",
  Assigned: "bg-blue-100 text-blue-700",
  InRepair: "bg-orange-100 text-orange-700",
  Retired: "bg-gray-100 text-gray-500",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}

type Toast = { title: string; message: string; type?: "success" | "error" };

function MyAssets() {
  const [assets, setAssets] = useState<MyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairFor, setRepairFor] = useState<MyAsset | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assets/mine");
      const json = await res.json();
      setAssets(json?.data ?? []);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRequestRepair(payload: RequestRepairPayload) {
    const res = await fetch("/api/repair-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast("Error", j.error ?? "Failed to submit repair request", "error");
      return;
    }
    setRepairFor(null);
    showToast("Repair request submitted", "IT will review it shortly. Track it under My Repair Requests.");
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-800">My Assets</h1>
          <p className="text-xs text-gray-400">Assets currently assigned to you</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your assets…
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Package className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No assets assigned to you</p>
          <p className="mt-1 text-xs text-gray-400">
            When an administrator assigns an asset to you, it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{a.itemName}</p>
                  <p className="font-mono text-[10px] text-gray-400">{a.itemCode}</p>
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    STATUS_STYLES[a.assetStatus],
                  )}
                >
                  {a.assetStatus === "InRepair" ? "In Repair" : a.assetStatus}
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Category</dt>
                  <dd className="truncate text-gray-700">{a.category?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Serial No.</dt>
                  <dd className="truncate font-mono text-gray-600">{a.serialNumber}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Location</dt>
                  <dd className="truncate text-gray-700">{a.location}</dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Assigned {fmtDate(a.assignment.assignedAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> {a.assignment.condition}
                </span>
              </div>

              {/* Employee repair entry point — hidden once the asset is already
                  in repair (a second request would just be rejected downstream). */}
              <div className="mt-3">
                {a.assetStatus === "InRepair" ? (
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600">
                    <Wrench className="h-3.5 w-3.5" /> In repair
                  </p>
                ) : a.assetStatus === "Retired" ? null : (
                  <button
                    onClick={() => setRepairFor(a)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Request Repair
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {repairFor && (
        <RequestRepairDialog
          asset={{ id: repairFor.id, itemName: repairFor.itemName, itemCode: repairFor.itemCode }}
          onClose={() => setRepairFor(null)}
          onSubmit={handleRequestRepair}
        />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-5 right-5 z-[60] max-w-xs rounded-xl border px-4 py-3 shadow-lg",
          toast.type === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-200",
        )}>
          <p className={cn("text-xs font-semibold", toast.type === "error" ? "text-red-700" : "text-gray-800")}>{toast.title}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{toast.message}</p>
        </div>
      )}
    </div>
  );
}

export default function EmployeeViewPage() {
  return (
    <RequirePerm resource="Asset" action="view">
      <MyAssets />
    </RequirePerm>
  );
}
