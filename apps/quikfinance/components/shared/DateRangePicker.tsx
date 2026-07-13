"use client";

import { Input } from "@/components/ui/input";

export function DateRangePicker({
  from,
  to,
  onChange
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} aria-label="Start date" />
      <Input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} aria-label="End date" />
    </div>
  );
}
