"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { MODULE_TOGGLES, WEEK_DAYS } from "@/lib/general-modules";

type GeneralSettings = { disabled_modules: string[]; week_start: string };

export function GeneralSettings() {
  const qc = useQueryClient();
  const { data } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/general");
      return r.ok ? (((await r.json()) as { data?: GeneralSettings }).data ?? { disabled_modules: [], week_start: "Sunday" }) : { disabled_modules: [], week_start: "Sunday" };
    },
    initialData: { disabled_modules: [], week_start: "Sunday" }
  });

  const [disabled, setDisabled] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState("Sunday");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) { setDisabled(data.disabled_modules ?? []); setWeekStart(data.week_start ?? "Sunday"); } }, [data]);

  const enabled = (key: string) => !disabled.includes(key);
  const toggle = (key: string) => setDisabled((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/settings/general", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled_modules: disabled, week_start: weekStart }) });
      if (!res.ok) { toast.error("Could not save general settings."); return; }
      toast.success("General settings saved.");
      qc.invalidateQueries({ queryKey: ["general-settings"] }); // re-renders sidebar with new module visibility
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl space-y-6 animate-fade-up">
      <PageHeader title="General" description="Enable the modules your team uses and set workspace preferences." />

      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">Select the modules you would like to enable</p>
        <p className="mb-4 text-[13px] text-muted-foreground">Disabled modules are hidden from the sidebar across the app.</p>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {MODULE_TOGGLES.map((m) => (
            <label key={m.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/40">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-600" checked={enabled(m.key)} onChange={() => toggle(m.key)} />
              <span><span className="block text-sm font-medium">{m.label}</span>{m.hint ? <span className="block text-[12px] text-muted-foreground">{m.hint}</span> : null}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <Label className="text-sm font-semibold">Set the first day of your work week</Label>
        <select className="mt-2 h-9 w-full max-w-xs rounded-lg border bg-background px-3 text-sm" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
          {WEEK_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
