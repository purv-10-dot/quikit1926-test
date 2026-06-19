/**
 * Claude API wrapper.
 *
 * Single chokepoint for every Claude call so we can:
 *   - Track per-tenant token usage (Sprint 3b)
 *   - Centralize retry / rate-limit handling
 *   - Log all calls for audit + cost analysis
 *   - Strip code-fenced JSON the model sometimes wraps responses in
 *   - Swap models in one place when Anthropic releases newer versions
 *
 * Auth: ANTHROPIC_API_KEY env var. When absent, callers get a "stub" mode
 * that returns deterministic placeholder data — good for dev without an
 * API key, but every page that depends on AI output marks itself as stub.
 */
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const isAIEnabled = !!ANTHROPIC_API_KEY;

const client = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  : null;

/** Sonnet (better quality, used for memo + scoring + transcript). */
export const MODEL_SONNET = "claude-sonnet-4-5";
/** Haiku (cheap, fast, used for daily summary + sourced opportunity fit). */
export const MODEL_HAIKU = "claude-haiku-4-5";

export interface ClaudeCallOptions {
  /** System prompt — sets tone, role, constraints. */
  system: string;
  /** User prompt — the actual ask. */
  prompt: string;
  /** Model — default sonnet. */
  model?: string;
  /** Max tokens — default 2000. */
  maxTokens?: number;
  /** Optional context label for logging (e.g., "memo:business-overview"). */
  context?: string;
}

export interface ClaudeResponse {
  /** Raw text content from the model. */
  text: string;
  /** Token counts for cost tracking. */
  usage: { inputTokens: number; outputTokens: number };
  /** Model that produced this response. */
  model: string;
  /** True if Claude is not configured and we returned a stub. */
  isStub: boolean;
}

/**
 * Strip markdown code fences Claude sometimes wraps JSON responses in.
 *
 *   ```json\n{...}\n```   →   {...}
 *   ```\n{...}\n```       →   {...}
 *   {...}                 →   {...}  (passthrough)
 */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json|ts|tsx|js)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

/** Parse JSON output, tolerating code fences. Throws if not valid JSON. */
export function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(stripCodeFences(raw)) as T;
}

/**
 * Call Claude. Returns text + usage. Stub mode (no API key) returns a
 * placeholder string that the caller MUST handle gracefully.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeResponse> {
  const { system, prompt, model = MODEL_SONNET, maxTokens = 2000, context } = opts;

  if (!client) {
    // Stub mode: return canned placeholder so dev environments without an
    // API key still render. Callers should display "AI stub — set
    // ANTHROPIC_API_KEY to enable real generation".
    return {
      text: `[AI stub — Claude not configured]\n\nPrompt was: ${prompt.slice(0, 100)}…`,
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "stub",
      isStub: true,
    };
  }

  const start = Date.now();
  try {
    const result = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text blocks (Claude can also return tool_use/image blocks)
    const text = result.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // eslint-disable-next-line no-console
    console.info(
      `[ai/claude] ${context ?? "call"} ${model} ` +
        `${result.usage.input_tokens}→${result.usage.output_tokens} tokens ` +
        `(${Date.now() - start}ms)`,
    );

    return {
      text,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
      model,
      isStub: false,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Claude call failed";
    // eslint-disable-next-line no-console
    console.error(`[ai/claude] ${context ?? "call"} failed:`, message);
    throw error;
  }
}
