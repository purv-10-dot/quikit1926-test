"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";

type AiStatus = { configured: boolean; masked: string | null; model: string };

export function AiSettings() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data } = useQuery<AiStatus>({
    queryKey: ["ai-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/ai");
      return r.ok ? (((await r.json()) as { data?: AiStatus }).data ?? { configured: false, masked: null, model: "" }) : { configured: false, masked: null, model: "" };
    },
    initialData: { configured: false, masked: null, model: "" }
  });

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (key.trim()) payload.api_key = key.trim();
      if (model.trim()) payload.model = model.trim();
      if (Object.keys(payload).length === 0) { toast.error("Enter an API key or model to save."); return; }
      const r = await fetch("/api/v1/settings/ai", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const b = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!r.ok) { toast.error(b?.error?.message ?? "Could not save."); return; }
      toast.success("AI settings saved.");
      setKey("");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    } finally { setBusy(false); }
  };

  const clearKey = async () => {
    if (!window.confirm("Remove the saved Anthropic key? AI answers will be disabled.")) return;
    await fetch("/api/v1/settings/ai", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: "" }) });
    toast.success("API key removed.");
    qc.invalidateQueries({ queryKey: ["ai-settings"] });
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/v1/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Reply with just the word: connected." }) });
      const d = (await r.json().catch(() => null)) as { data?: { configured?: boolean; error?: boolean; answer?: string } } | null;
      const ans = d?.data;
      if (!ans?.configured) toast.error("No key configured yet — save one first.");
      else if (ans.error) toast.error(ans.answer ?? "Connection failed.");
      else toast.success(`Connected — model replied: “${(ans.answer ?? "").slice(0, 40)}”`);
    } finally { setTesting(false); }
  };

  return (
    <div className="max-w-2xl space-y-5 animate-fade-up">
      <PageHeader title="AI Assistant" description="Connect Anthropic (Claude) to power the AI Dock with free-form answers grounded in your books." />

      <div className="rounded-3xl border border-border/50 bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Sparkles className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold">Anthropic (Claude)</p>
            {data.configured ? (
              <p className="flex items-center gap-1 text-[12px] font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Connected · {data.masked}</p>
            ) : <p className="text-[12px] text-muted-foreground">Not connected</p>}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="aikey">API Key</Label>
            <Input id="aikey" type="password" className="mt-1.5" value={key} onChange={(e) => setKey(e.target.value)} placeholder={data.configured ? "•••••••• (enter a new key to replace)" : "sk-ant-…"} autoComplete="off" />
            <p className="mt-1 text-[11px] text-muted-foreground">Stored securely server-side and never shown again. Get one at console.anthropic.com.</p>
          </div>
          <div>
            <Label htmlFor="aimodel">Model <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="aimodel" className="mt-1.5" value={model} onChange={(e) => setModel(e.target.value)} placeholder={data.model || "claude-3-5-sonnet-latest"} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button variant="secondary" onClick={test} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>
            {data.configured ? <Button variant="ghost" className="text-destructive" onClick={clearKey}><Trash2 className="mr-1 h-4 w-4" />Remove key</Button> : null}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">Once connected, open the AI Dock (✨ top bar or Ctrl/⌘+J) and ask anything — e.g. “Why did profit change this month?” or “Summarize my receivables.”</p>
    </div>
  );
}
