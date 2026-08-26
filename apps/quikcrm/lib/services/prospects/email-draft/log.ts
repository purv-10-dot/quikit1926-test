/**
 * Drafting trace log.
 *
 * Drafting is a multi-stage pipeline (load prospect → build context → call the
 * AI runtime → validate → respond) where every stage can silently degrade into
 * the template. Without a trace, "the draft looks generic" is indistinguishable
 * from "the runtime was down", "the prospect had no data to work with", and
 * "the model returned something we rejected". These lines make the stage that
 * decided the outcome visible.
 *
 * Server-side only — this never runs in the browser.
 *
 * WHAT IS NOT LOGGED. Prospect and company text (About sections, posts, DMs)
 * are the org's customer data; they are summarised as counts and lengths, never
 * echoed. The generated subject and a short body preview ARE logged, because
 * they are the thing under inspection and are useless to review blind. Set
 * DRAFT_LOG_VERBOSE=1 to log the full body while tuning the prompt.
 */
const VERBOSE = process.env.DRAFT_LOG_VERBOSE === "1";

const PREFIX = "[draft]";

function stamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

/** One drafting run. `id` ties every line of a run together. */
export interface DraftLogger {
  step(stage: string, detail?: Record<string, unknown>): void;
  done(stage: string, detail?: Record<string, unknown>): void;
  fail(stage: string, detail?: Record<string, unknown>): void;
  /** Milliseconds since the run started. */
  elapsed(): number;
}

function format(detail?: Record<string, unknown>): string {
  if (!detail) return "";
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}

export function createDraftLogger(prospectId: string): DraftLogger {
  const started = Date.now();
  // Short run id so concurrent drafts stay readable when interleaved.
  const runId = Math.random().toString(36).slice(2, 8);
  const head = `${PREFIX} ${runId} ${prospectId.slice(-6)}`;

  const line =
    (level: "log" | "warn") =>
    (stage: string, detail?: Record<string, unknown>) => {
      const ms = Date.now() - started;
      // eslint-disable-next-line no-console -- this module IS the trace logger;
      // the rule's allow-list (warn/error) exists to stop stray debug output in
      // feature code, and routing progress lines through console.warn would
      // misreport a healthy draft as a problem.
      console[level](`${head} ${stamp()} +${ms}ms ${stage} ${format(detail)}`.trimEnd());
    };

  return {
    step: line("log"),
    done: line("log"),
    fail: line("warn"),
    elapsed: () => Date.now() - started,
  };
}

/** First `n` characters on one line, for logging generated copy. */
export function preview(text: string, n = 160): string {
  const flat = text.replace(/<br\s*\/?>/gi, " ⏎ ").replace(/\s+/g, " ").trim();
  if (VERBOSE) return flat;
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

export const draftLogVerbose = VERBOSE;
