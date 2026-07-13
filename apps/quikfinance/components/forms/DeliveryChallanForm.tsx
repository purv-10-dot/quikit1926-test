"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { Trash2, Plus } from "lucide-react";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type Line = { item_id: string; description: string; quantity: string; rate: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const CHALLAN_TYPES = [
  { value: "supply_on_approval", label: "Supply on approval" },
  { value: "job_work", label: "Job work" },
  { value: "supply_of_liquid_gas", label: "Supply of liquid gas" },
  { value: "lines_sales", label: "Line sales" },
  { value: "others", label: "Others" }
];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

const emptyLine = (): Line => ({ item_id: "", description: "", quantity: "1", rate: "0" });

export function DeliveryChallanForm() {
  const router = useRouter();

  const [contactId, setContactId] = useState("");
  const [challanDate, setChallanDate] = useState(todayISO());
  const [challanType, setChallanType] = useState("supply_on_approval");
  const [reference, setReference] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["dc-customers"],
    queryFn: async () => (await fetchList("/api/v1/customers?per_page=100")).map((row) => ({ id: String(row.id), label: String(row.display_name ?? "Customer") }) as Option)
  });
  const { data: items = [] } = useQuery({
    queryKey: ["dc-items"],
    queryFn: async () =>
      (await fetchList("/api/v1/inventory?per_page=200")).map((row) => ({ id: String(row.id), label: `${row.sku ?? ""} · ${row.name ?? ""}`.trim(), price: Number(row.sales_price ?? 0) }))
  });

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const onItemPick = (index: number, itemId: string) => {
    const picked = items.find((item) => item.id === itemId);
    updateLine(index, { item_id: itemId, description: picked ? picked.label.split(" · ").slice(1).join(" · ") || picked.label : lines[index].description, rate: picked ? String(picked.price) : lines[index].rate });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactId) {
      toast.error("Select a customer.");
      return;
    }
    const payloadLines = lines
      .filter((line) => line.description.trim() && Number(line.quantity) > 0)
      .map((line) => ({ item_id: line.item_id || null, description: line.description.trim(), quantity: Number(line.quantity), rate: Number(line.rate || 0) }));
    if (payloadLines.length === 0) {
      toast.error("Add at least one line with a description and quantity.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/delivery-challans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          challan_date: challanDate,
          challan_type: challanType,
          status: "delivered",
          reference: reference || null,
          place_of_supply: placeOfSupply || null,
          notes: notes || null,
          lines: payloadLines
        })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not create the delivery challan.");
        return;
      }
      const body = (await response.json()) as { data?: { id?: string } };
      toast.success("Delivery challan created.");
      router.push(body.data?.id ? `/delivery-challans/${body.data.id}` : "/delivery-challans");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-up">
      <PageHeader title="New delivery challan" description="Record goods dispatched to a customer. Convert to an invoice later to post the sale and issue stock." />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="contact">Customer</Label>
            <select id="contact" className={`${selectClass} mt-2`} value={contactId} onChange={(event) => setContactId(event.target.value)} required>
              <option value="">Select…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="type">Challan type</Label>
            <select id="type" className={`${selectClass} mt-2`} value={challanType} onChange={(event) => setChallanType(event.target.value)}>
              {CHALLAN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="date">Challan date</Label>
            <Input id="date" type="date" className="mt-2" value={challanDate} onChange={(event) => setChallanDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" className="mt-2" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="pos">Place of supply (state code)</Label>
            <Input id="pos" maxLength={2} className="mt-2" placeholder="e.g. 27" value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1.4fr_2fr_100px_120px_40px] items-center gap-3">
              <select className={selectClass} value={line.item_id} onChange={(event) => onItemPick(index, event.target.value)}>
                <option value="">— Item —</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <Input placeholder="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
              <Input type="number" min="0" step="0.01" placeholder="Qty" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
              <Input type="number" min="0" step="0.01" placeholder="Rate" value={line.rate} onChange={(event) => updateLine(index, { rate: event.target.value })} />
              <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => setLines((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus className="mr-1 h-4 w-4" /> Add line
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/delivery-challans")}>Cancel</Button>
        <Button type="submit" disabled={submitting}>Create challan</Button>
      </div>
    </form>
  );
}
