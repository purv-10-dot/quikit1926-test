"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "@/lib/toast";

export type WhitebooksVendorOption = { value: string; label: string };

/**
 * Vendor combobox for PO / RFQ drawers: optional Whitebooks GST verify on pick,
 * then fills `vendorId` + `email` on the secondary line row.
 */
export function WhitebooksVendorSelect(props: {
  line: Record<string, any>;
  update: (patch: Record<string, any>) => void;
  vendorOptions: WhitebooksVendorOption[];
  vendorById: Map<string, any>;
}): ReactNode {
  const { line, update, vendorOptions, vendorById } = props;
  const [busy, setBusy] = useState(false);
  const { data: wb } = useQuery({
    queryKey: ["integrations", "whitebooks-config"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/whitebooks/config");
      const json = await res.json().catch(() => null);
      if (!json?.ok) return { gstVerifyEnabled: false };
      return json.data as { gstVerifyEnabled: boolean };
    },
    staleTime: 5 * 60_000,
  });
  const gstVerifyEnabled = wb?.gstVerifyEnabled === true;

  const onPick = async (value: string) => {
    if (!value) {
      update({ vendorId: "", email: "" });
      return;
    }
    const v = vendorById.get(value);
    if (gstVerifyEnabled) {
      const g = String(v?.gstin ?? "").trim();
      if (!g) {
        const label = v?.companyName || v?.name || "This vendor";
        toast.error(
          `${label} has no GSTIN saved under Masters → Vendors. Edit the vendor, enter the 15-character GSTIN, save — then select them here again. (Your .env email is only for Whitebooks; GSTIN always comes from the vendor record.)`,
        );
        update({ vendorId: "", email: "" });
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/whitebooks/vendor-gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: value }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        toast.error(String(json?.error ?? "GST verification failed"));
        update({ vendorId: "", email: "" });
        return;
      }
      const d = json.data;
      if (d?.skipped) {
        const row = vendorById.get(value);
        update({
          vendorId: value,
          email: row?.email ? String(row.email) : "",
        });
        return;
      }
      if (d?.active) {
        const row = vendorById.get(value);
        update({
          vendorId: value,
          email: row?.email ? String(row.email) : "",
        });
        return;
      }
      toast.error(String(d?.message ?? "GST is not active for this vendor."));
      update({ vendorId: "", email: "" });
    } catch {
      toast.error("GST verification failed. Try again.");
      update({ vendorId: "", email: "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full">
      <SearchableSelect
        size="sm"
        value={line.vendorId ?? ""}
        onChange={onPick}
        options={vendorOptions}
        placeholder="Select vendor…"
        disabled={busy}
      />
      {busy ? (
        <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[9px] text-orange-600 font-semibold pointer-events-none">
          Verifying…
        </span>
      ) : null}
    </div>
  );
}
