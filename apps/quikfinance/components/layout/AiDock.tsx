"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, ArrowUp, Wand2 } from "lucide-react";
import { useAiDock } from "@/lib/stores/ai-dock";
import { cn } from "@/lib/utils/cn";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = [
  "Create invoice for a customer",
  "Show overdue payments",
  "Generate GST summary",
  "Predict cash flow",
  "Find duplicate expenses",
  "Why did profit change?"
];

/** Deterministic intent router — turns natural language into a real navigation/action. */
function route(input: string): { reply?: string; href?: string } {
  const q = input.toLowerCase();
  if (/create.*invoice|new invoice|bill .*customer/.test(q)) return { reply: "Opening the invoice builder…", href: "/invoices/new" };
  if (/add expense|create expense|record .*spend/.test(q)) return { reply: "Opening a new expense…", href: "/expenses/new" };
  if (/new customer|create customer/.test(q)) return { reply: "Opening the customer workspace…", href: "/customers/new" };
  if (/overdue|collect|receivable|aging/.test(q)) return { reply: "Here are your overdue receivables.", href: "/reports/aging" };
  if (/payable|bills to pay|owe/.test(q)) return { reply: "Here's what you owe vendors.", href: "/payables" };
  if (/gst|gstr|tax summary|tax return/.test(q)) return { reply: "Opening your GST (GSTR-3B) summary.", href: "/reports/gstr-3b" };
  if (/^(open|show|go to).*(cash ?flow)/.test(q)) return { reply: "Opening the cash flow view.", href: "/reports/cash-flow" };
  if (/^(open|show|go to).*(balance sheet)/.test(q)) return { reply: "Opening the Balance Sheet.", href: "/reports/balance-sheet" };
  if (/^(open|show|go to).*(p&l|profit)/.test(q)) return { reply: "Opening Profit & Loss.", href: "/reports/profit-loss" };
  if (/^(open|show|go to).*(bank|reconcil)/.test(q)) return { reply: "Opening Banking.", href: "/banking" };
  // Everything else is a free-form question → answered by the AI endpoint.
  return {};
}

export function AiDock() {
  const router = useRouter();
  const { open, seed, openDock, closeDock, toggleDock, clearSeed } = useAiDock();
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd + J toggles the dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); toggleDock(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleDock]);

  // Seed prompt from elsewhere (e.g. a card's "Explain with AI").
  useEffect(() => {
    if (open && seed) { setValue(seed); clearSeed(); }
  }, [open, seed, clearSeed]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const { reply, href } = route(trimmed);
    // Fast navigation/create shortcut.
    if (href) {
      setMessages((m) => [...m, { role: "user", text: trimmed }, { role: "ai", text: reply ?? "On it." }]);
      setValue("");
      setTimeout(() => { router.push(href); }, 350);
      return;
    }
    // Free-form question → ask the AI endpoint (Anthropic, if a key is set).
    setMessages((m) => [...m, { role: "user", text: trimmed }, { role: "ai", text: "…" }]);
    setValue("");
    setLoading(true);
    try {
      const r = await fetch("/api/v1/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: trimmed }) });
      const d = (await r.json().catch(() => null)) as { data?: { answer?: string } } | null;
      const answer = d?.data?.answer ?? "Sorry — I couldn't reach the AI service.";
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: answer }; return c; });
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: "Sorry — the AI service is unavailable right now." }; return c; });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating launcher (when closed) */}
      {!open ? (
        <button type="button" onClick={() => openDock()} aria-label="Open AI assistant (Ctrl+J)"
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-popover transition hover:-translate-y-0.5 hover:bg-indigo-500">
          <Sparkles className="h-5 w-5" />
        </button>
      ) : null}

      {/* Panel */}
      <div className={cn("fixed inset-y-0 right-0 z-50 w-[380px] max-w-[92vw] transform border-l bg-card shadow-popover transition-transform duration-300 ease-out", open ? "translate-x-0" : "translate-x-full")}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white"><Sparkles className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold leading-tight">AI Assistant</p>
                <p className="text-[10px] text-muted-foreground">Ask anything · Ctrl+J</p>
              </div>
            </div>
            <button type="button" onClick={closeDock} aria-label="Close"><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">Try one of these:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}
                      className="rounded-full border bg-muted/40 px-3 py-1.5 text-[12px] font-medium transition hover:-translate-y-0.5 hover:bg-card hover:shadow-card">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                    m.role === "user" ? "bg-indigo-600 text-white" : "bg-muted text-foreground")}>
                    {m.role === "ai" ? <Wand2 className="mb-1 inline h-3.5 w-3.5 text-indigo-500" /> : null} {m.text}
                  </div>
                </div>
              ))
            )}
          </div>

          <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); send(value); }}>
            <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ask or command…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <button type="submit" disabled={!value.trim() || loading} aria-label="Send"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
