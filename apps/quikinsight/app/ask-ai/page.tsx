"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { askAi, askAiBackendConfigured } from "@/lib/api/ask-ai";
import LineAreaChart from "@/components/charts/LineAreaChart";
import type { ChatMessage } from "@/types";

let idCounter = 0;
const nextId = () => `msg-${++idCounter}`;

export default function AskAiPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--text-muted)" }}>Loading…</p>}>
      <AskAiPageInner />
    </Suspense>
  );
}

function AskAiPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const initialQHandled = useRef(false);

  async function send(question: string) {
    if (!question.trim() || thinking) return;
    setMessages((m) => [...m, { id: nextId(), role: "user", text: question }]);
    setInput("");
    setThinking(true);
    const resp = await askAi(question);
    setThinking(false);
    setMessages((m) => [...m, { id: nextId(), role: "assistant", ...resp }]);
  }

  useEffect(() => {
    if (initialQHandled.current) return;
    initialQHandled.current = true;
    const q = searchParams.get("q");
    if (q) {
      send(q);
    } else {
      // Static welcome (UI copy, not fabricated data). Real answers come from the
      // Gemini-backed route grounded on the user's connected metrics.
      setMessages([{
        id: nextId(),
        role: "assistant",
        text: "Hi! Ask me anything about your connected marketing data — traffic, leads, pipeline, engagement, and more. I answer using your live metrics.",
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Ask AI</div>
          <p className="page-sub">
            Every answer is grounded in your connected data
            {!askAiBackendConfigured && (
              <span style={{ color: "var(--text-muted)" }}> · using sample responses (backend not configured)</span>
            )}
          </p>
        </div>
      </div>
      <div className="card chat-wrap">
        <div className="chat-log" ref={logRef}>
          {messages.map((m) =>
            m.role === "user" ? (
              <div className="msg-user" key={m.id}>{m.text}</div>
            ) : (
              <div className="msg-ai" key={m.id}>
                <div className="ai-avatar">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="msg-ai-body">{m.text}</div>
                  {m.chart && (
                    <div className="msg-chart">
                      <div style={{ height: 90 }}>
                        <LineAreaChart labels={m.chart.labels} data={m.chart.data} showLegendLabel={m.chart.label} />
                      </div>
                    </div>
                  )}
                  {m.suggestions && (
                    <div className="chat-suggestions">
                      {m.suggestions.map((s) => (
                        <button className="btn btn-sm" key={s} onClick={() => send(s)} type="button">
                          {s} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {thinking && (
            <div className="msg-ai">
              <div className="ai-avatar">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                  <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                </svg>
              </div>
              <div className="msg-ai-body" style={{ color: "var(--text-muted)" }}>Thinking…</div>
            </div>
          )}
        </div>
        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask a question about your marketing data…"
            disabled={thinking}
          />
          <button className="btn btn-primary" onClick={() => send(input)} type="button" disabled={thinking}>
            {thinking ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
