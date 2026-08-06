"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tags } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface PriceListOption {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
}

export function AccountDefaultPriceList({
  accountId,
  initialPriceListId,
}: {
  accountId: string;
  initialPriceListId: string | null;
}) {
  const toast = useToast();
  const [value, setValue] = useState(initialPriceListId ?? "");
  const [options, setOptions] = useState<PriceListOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/price-lists?page=1&pageSize=100&isActive=true", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setOptions(body.data.items ?? []);
      });
  }, []);

  const save = useCallback(
    async (nextId: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ defaultPriceListId: nextId || null }),
        });
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error(j.error ?? "Failed to save");
        toast.success("Default price list updated");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
        setValue(initialPriceListId ?? "");
      } finally {
        setSaving(false);
      }
    },
    [accountId, initialPriceListId, toast],
  );

  return (
    <div className="rounded-lg border border-crm-border bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-crm-text">
        <Tags size={16} className="text-accent-600" />
        Default price list
      </div>
      <p className="mb-3 text-xs text-crm-muted">
        Quotes and opportunities for this account inherit this price book unless overridden.
      </p>
      <Select
        value={value}
        disabled={saving}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          void save(next);
        }}
        aria-label="Default price list"
      >
        <option value="">— None (use tenant default) —</option>
        {options.map((pl) => (
          <option key={pl.id} value={pl.id}>
            {pl.name} ({pl.currency}){pl.isDefault ? " · tenant default" : ""}
          </option>
        ))}
      </Select>
      {value && (
        <p className="mt-2 text-xs">
          <Link href={`/price-lists/${value}`} className="text-accent-700 hover:underline">
            Open price list →
          </Link>
        </p>
      )}
    </div>
  );
}
