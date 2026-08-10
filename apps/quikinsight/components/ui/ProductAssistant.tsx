"use client";
import { useEffect, useRef, useState } from "react";
import { getAssistantReply, WELCOME, type AssistantMessage } from "@/lib/productAssistant";

let _id = 0;
const uid = () => `pa-${++_id}`;

interface Msg extends AssistantMessage { id: string; }

// Render assistant text: bold (**text**) and newlines
function BotText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return (
          <p key={i} style={{ margin: i === 0 ? 0 : "4px 0 0", lineHeight: 1.6 }}>
            {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
          </p>
        );
      })}
    </div>
  );
}

export default function ProductAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ ...WELCOME, id: uid() }]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, open]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", text: q };
    const reply = getAssistantReply(q);
    setMsgs((prev) => [...prev, userMsg, { ...reply, id: uid() }]);
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        className="pa-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open product assistant"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="pa-panel">
          {/* Header */}
          <div className="pa-header">
            <div className="pa-header-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>QuikInsight Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Always here to help</div>
            </div>
            <button className="pa-close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="pa-log" ref={logRef}>
            {msgs.map((m) =>
              m.role === "user" ? (
                <div className="pa-msg-user" key={m.id}>{m.text}</div>
              ) : (
                <div className="pa-msg-bot" key={m.id}>
                  <BotText text={m.text} />
                  {m.suggestions?.length && (
                    <div className="pa-suggestions">
                      {m.suggestions.map((s) => (
                        <button key={s} className="pa-suggestion" onClick={() => send(s)}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Input */}
          <div className="pa-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask a question…"
              autoFocus
            />
            <button className="pa-send" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
