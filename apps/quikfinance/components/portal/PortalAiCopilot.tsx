"use client";

import { useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PortalKey } from "@/lib/portal/hosts";

const QUICK_PROMPTS: Record<PortalKey, string[]> = {
  client: ["Explain my latest invoice", "Summarise my account statement", "When is my next payment due?", "How much do I owe in total?"],
  vendor: ["Explain this purchase order", "What's the ETA on my pending payments?", "Validate my latest bill", "Show my outstanding balance"],
  ca: ["What GST returns are due this month?", "Summarise this client's P&L", "Explain this ledger movement", "List pending compliance items"]
};

type Msg = { role: "user" | "assistant"; text: string };

export function PortalAiCopilot({ portal }: { portal: PortalKey }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);

  const ask = async (prompt: string) => {
    if (!prompt.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: `[${portal} portal] ${prompt}` }) });
      const data = (await res.json().catch(() => null))?.data as { answer?: string } | undefined;
      setMessages((m) => [...m, { role: "assistant", text: data?.answer ?? "I couldn't reach the assistant just now." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong reaching the assistant." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-popover transition hover:scale-[1.03]">
          <Sparkles className="h-4 w-4" />AI Copilot
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[min(560px,80vh)] w-[min(380px,92vw)] flex-col overflow-hidden rounded-3xl border bg-card shadow-popover">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <span className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />QuikFinance AI</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Ask me anything, or try:</p>
                {QUICK_PROMPTS[portal].map((q) => (
                  <button key={q} onClick={() => ask(q)} className="block w-full rounded-xl border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:text-primary">{q}</button>
                ))}
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>{m.text}</div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-center gap-2 border-t p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the AI copilot…" className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  );
}
