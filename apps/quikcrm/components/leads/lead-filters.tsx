"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounce";

const STAGES = ["", "New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];
const STATUSES = ["", "Open", "Working", "Disqualified", "Converted"];

export function LeadFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const debouncedQ = useDebouncedValue(q, 300);

  useEffect(() => {
    const sp = new URLSearchParams(params.toString());
    if (debouncedQ) sp.set("q", debouncedQ);
    else sp.delete("q");
    sp.delete("page");
    router.push(`/leads?${sp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page");
    router.push(`/leads?${sp.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search name, email, company…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs"
      />
      <Select value={params.get("stage") || ""} onChange={(e) => set("stage", e.target.value)}>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s || "All stages"}
          </option>
        ))}
      </Select>
      <Select value={params.get("status") || ""} onChange={(e) => set("status", e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s || "All statuses"}
          </option>
        ))}
      </Select>
    </div>
  );
}
