"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InvoiceGst = {
  irn?: string | null;
  ack_no?: string | null;
  einvoice_status?: string | null;
  eway_bill_no?: string | null;
  eway_status?: string | null;
};

const statusLabel = (status?: string | null) => {
  switch (status) {
    case "registered":
    case "generated":
      return { text: status === "registered" ? "Registered with IRP" : "Generated", tone: "text-emerald-600" };
    case "pending":
      return { text: "Built — awaiting GSP credentials", tone: "text-amber-600" };
    case "error":
      return { text: "Failed — see details", tone: "text-red-600" };
    default:
      return { text: "Not filed", tone: "text-muted-foreground" };
  }
};

export function EInvoicePanel({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"einvoice" | "eway" | null>(null);
  const [vehicleNo, setVehicleNo] = useState("");
  const [distance, setDistance] = useState("");

  const { data } = useQuery<InvoiceGst | null>({
    queryKey: ["invoice-gst", invoiceId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/invoices/${invoiceId}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: InvoiceGst };
      return payload.data ?? null;
    }
  });

  const generateEInvoice = async () => {
    setBusy("einvoice");
    try {
      const response = await fetch(`/api/v1/invoices/${invoiceId}/einvoice`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { data?: { status?: string; message?: string; irn?: string }; error?: { message?: string } } | null;
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not generate the e-Invoice.");
        return;
      }
      if (body?.data?.status === "registered") toast.success(`e-Invoice registered. IRN ${body.data.irn?.slice(0, 12)}…`);
      else toast.success(body?.data?.message ?? "e-Invoice payload built and saved.");
      queryClient.invalidateQueries({ queryKey: ["invoice-gst", invoiceId] });
    } finally {
      setBusy(null);
    }
  };

  const generateEWay = async () => {
    setBusy("eway");
    try {
      const response = await fetch(`/api/v1/invoices/${invoiceId}/eway-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_no: vehicleNo || null, distance_km: distance ? Number(distance) : 0, transport_mode: "1" })
      });
      const body = (await response.json().catch(() => null)) as { data?: { status?: string; message?: string; eway_bill_no?: string }; error?: { message?: string } } | null;
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not generate the e-Way bill.");
        return;
      }
      if (body?.data?.status === "generated") toast.success(`e-Way bill ${body.data.eway_bill_no} generated.`);
      else toast.success(body?.data?.message ?? "e-Way bill payload built and saved.");
      queryClient.invalidateQueries({ queryKey: ["invoice-gst", invoiceId] });
    } finally {
      setBusy(null);
    }
  };

  const ei = statusLabel(data?.einvoice_status);
  const ew = statusLabel(data?.eway_status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST e-Invoice &amp; e-Way bill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">e-Invoice (IRP)</p>
              <p className={`text-xs ${ei.tone}`}>{ei.text}</p>
              {data?.irn ? <p className="mt-1 break-all font-mono text-xs text-muted-foreground">IRN: {data.irn}</p> : null}
            </div>
            <Button size="sm" onClick={generateEInvoice} disabled={busy !== null}>
              {busy === "einvoice" ? "Working…" : data?.irn ? "Re-file" : "Generate e-Invoice"}
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">e-Way bill (NIC)</p>
            <p className={`text-xs ${ew.tone}`}>{ew.text}</p>
            {data?.eway_bill_no ? <p className="mt-1 font-mono text-xs text-muted-foreground">No: {data.eway_bill_no}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vehicle">Vehicle no.</Label>
              <Input id="vehicle" className="mt-1" placeholder="MH12AB1234" value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="distance">Distance (km)</Label>
              <Input id="distance" type="number" min="0" className="mt-1" placeholder="0" value={distance} onChange={(event) => setDistance(event.target.value)} />
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={generateEWay} disabled={busy !== null}>
            {busy === "eway" ? "Working…" : data?.eway_bill_no ? "Re-generate" : "Generate e-Way bill"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-3">
          Payloads are built to the GSTN e-Invoice v1.1 and NIC e-Way v1.03 schemas and saved on the invoice. Filing
          with the portal happens automatically once <span className="font-mono">GSP_*</span> credentials are set in the environment.
        </p>
      </CardContent>
    </Card>
  );
}
