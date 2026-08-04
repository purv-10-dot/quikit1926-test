"use client";

/**
 * AI Copilot chat view — message list, typing indicator and composer.
 *
 * Conversation state lives here rather than in the panel, so it resets whenever
 * the view unmounts — entering chat always starts fresh from the greeting.
 *
 * Replies come from the scripted per-app KB in `@quikit/shared/supportContent`
 * (no backend). `replyTo` is the single seam to swap for a real LLM call: make
 * it async, await it in `send`, and the UI needs no other change.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { replyTo, type KbEntry } from "@quikit/shared/supportContent";

interface ChatMessage {
  role: "bot" | "user";
  text: string;
}

/** Fake latency so the typing indicator is perceptible rather than a flicker. */
const REPLY_DELAY_MS = 650;

export function SupportChat({ greeting, kb }: { greeting: string; kb: KbEntry[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "bot", text: greeting }]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the newest message in view.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  // Cancel a pending reply if the user navigates away mid-"typing", otherwise
  // setState fires on an unmounted component.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setDraft("");
    setTyping(true);

    const answer = replyTo(text, kb);
    timerRef.current = setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { role: "bot", text: answer }]);
    }, REPLY_DELAY_MS);
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) =>
          m.role === "bot" ? (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 mt-0.5">
                <Sparkles className="h-3 w-3" />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[var(--color-neutral-100)] px-3 py-2 text-sm text-[var(--color-text-primary)] leading-relaxed">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-600 px-3 py-2 text-sm text-white leading-relaxed">
                {m.text}
              </div>
            </div>
          ),
        )}

        {typing && (
          <div className="flex items-start gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 mt-0.5">
              <Sparkles className="h-3 w-3" />
            </span>
            <div
              className="rounded-2xl rounded-tl-sm bg-[var(--color-neutral-100)] px-3 py-3 flex items-center gap-1"
              aria-label="Assistant is typing"
            >
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-secondary)] animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-neutral-50)]"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tell me more…"
          aria-label="Message"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
