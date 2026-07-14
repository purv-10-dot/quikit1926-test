/**
 * Deterministic, fully-hermetic runtime stub (active default until the real
 * runtime's `/ai/chat/assist` ships). Streams a few `delta`s derived from the
 * prompt + pushed context, then a `done` carrying a generated `agentRunId`.
 * Configurable error/slow modes for tests via env.
 */
import { randomUUID } from "node:crypto";
import type { AssistInput, RuntimeClient, RuntimeEvent } from "./types";

export interface StubOptions {
  /** Emit an `error` event instead of a normal stream. */
  errorMode?: boolean;
  /** Per-delta delay (ms) to simulate streaming/cold-start. Default 0. */
  delayMs?: number;
}

export class StubRuntimeClient implements RuntimeClient {
  constructor(private readonly opts: StubOptions = {}) {}

  async *assist(input: AssistInput): AsyncIterable<RuntimeEvent> {
    if (this.opts.errorMode) {
      yield { type: "error", message: "stub runtime error", code: "stub_error" };
      return;
    }

    const count = input.history.length;
    const trimmedPrompt = input.prompt.trim().slice(0, 120);
    const chunks = [
      `Here's what I found across the last ${count} message${count === 1 ? "" : "s"}. `,
      trimmedPrompt ? `You asked: “${trimmedPrompt}”. ` : "",
      "This is a stubbed assistant reply — the live runtime isn't wired yet.",
    ].filter(Boolean);

    for (const text of chunks) {
      if (this.opts.delayMs) await delay(this.opts.delayMs);
      yield { type: "delta", text };
    }

    const finalText = chunks.join("");
    yield { type: "done", text: finalText, agentRunId: `stub-${randomUUID()}` };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
