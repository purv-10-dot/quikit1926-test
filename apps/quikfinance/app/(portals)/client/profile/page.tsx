"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Mail, Phone, MapPin, ShieldCheck } from "lucide-react";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type Profile = {
  contact: { display_name?: string; email?: string; phone?: string; tax_id?: string; pan?: string; currency?: string; billing_address?: unknown; shipping_address?: unknown } | null;
  roleLabel: string;
  permissions: string[];
};

const addr = (a: unknown) => {
  if (!a) return "—";
  if (typeof a === "string") return a;
  const o = a as Record<string, unknown>;
  return [o.line1, o.line2, o.city, o.state, o.zip, o.country].filter(Boolean).join(", ") || "—";
};

export default function ClientProfilePage() {
  const { data } = useQuery({
    queryKey: ["client-profile"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/client/profile");
      return r.ok ? ((await r.json()).data as Profile) : null;
    }
  });
  const c = data?.contact;

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Profile" description="Your company information and access" />
      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="Company information">
          {!c ? <EmptyState icon={Building2} title="No company linked" /> : (
            <dl className="divide-y text-sm">
              <Row icon={Building2} label="Name" value={c.display_name} />
              <Row icon={Mail} label="Email" value={c.email} />
              <Row icon={Phone} label="Phone" value={c.phone} />
              <Row label="GSTIN" value={c.tax_id} />
              <Row label="PAN" value={c.pan} />
              <Row label="Currency" value={c.currency} />
            </dl>
          )}
        </WidgetCard>
        <WidgetCard title="Addresses">
          <dl className="divide-y text-sm">
            <Row icon={MapPin} label="Billing" value={addr(c?.billing_address)} />
            <Row icon={MapPin} label="Shipping" value={addr(c?.shipping_address)} />
          </dl>
        </WidgetCard>
      </div>
      <WidgetCard title="Your access">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"><ShieldCheck className="h-4 w-4" />{data?.roleLabel ?? "—"}</span>
          {(data?.permissions ?? []).map((p) => <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">{p.replace(/_/g, " ")}</span>)}
        </div>
      </WidgetCard>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value?: unknown }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <dt className="flex items-center gap-2 text-muted-foreground">{Icon ? <Icon className="h-4 w-4" /> : null}{label}</dt>
      <dd className="truncate text-right font-medium">{value ? String(value) : "—"}</dd>
    </div>
  );
}
