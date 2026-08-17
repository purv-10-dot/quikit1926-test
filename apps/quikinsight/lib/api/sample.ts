/**
 * Sample-data fallback for platform pages.
 *
 * WHY. A brand-new workspace has nothing connected, so every platform page
 * would render a "not connected" empty state and the product would look broken
 * rather than un-configured. Until the first integration exists we show
 * representative sample data instead, so the value of each page is visible
 * before any OAuth is done.
 *
 * THE RULE IS ALL-OR-NOTHING, PER WORKSPACE.
 * A workspace with NO integrations at all sees sample data everywhere, so the
 * product demonstrates itself before any OAuth is done. The moment ANYTHING is
 * connected the workspace is live, and samples stop completely — including on
 * pages whose own source is still unconnected. Those show their real zeros and
 * a "Connect source" marker instead.
 *
 * WHY NOT PER-SOURCE. Mixing fabricated figures beside real ones in a document
 * people email to clients is how an invented number gets quoted as fact. A
 * stamp on the card is not enough protection once the rest of the page is
 * genuine: the reader's default assumption flips from "this is a demo" to
 * "this is my account". Zeros are unhelpful but they are true, and a marker
 * tells the user exactly how to fix them.
 *
 * WHERE IT LIVES. Every `lib/api/<platform>.ts` wrapper funnels through here,
 * so the behaviour is one line per platform and the page components stay
 * unchanged. The API ROUTES are untouched: the server still honestly reports
 * `connected: false`, and only this client layer substitutes.
 *
 * THE HONESTY RULE. Substituted payloads carry `isSampleData: true`, and every
 * page renders <SampleDataBanner /> when it sees that flag. Sample figures must
 * never appear without it. If you add a platform here, add the banner to its
 * page in the same commit.
 */
import { getConnectors } from "./connectors";

export interface SampleFlag {
  /** True when the payload is representative sample data, not the workspace's. */
  isSampleData?: boolean;
}

/**
 * Cached answer to "does this workspace have any connection at all?".
 *
 * Cached because a single page render can call several platform wrappers, and
 * each would otherwise re-fetch /api/connections. Cleared on `workspace-changed`
 * so switching workspaces re-evaluates — the same event Sidebar already listens
 * to.
 */
let anyConnectionPromise: Promise<boolean> | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("workspace-changed", () => {
    anyConnectionPromise = null;
  });
}

/** Call after connecting/disconnecting so the next read re-evaluates. */
export function resetConnectionCache(): void {
  anyConnectionPromise = null;
}

export function hasAnyConnection(): Promise<boolean> {
  if (!anyConnectionPromise) {
    anyConnectionPromise = getConnectors()
      .then((list) => list.some((c) => c.connected))
      // Fail OPEN: a lookup failure is treated as "nothing connected", so the
      // page falls back to sample data rather than an empty state. The product
      // rule is that a user must never hit a dead dashboard, and every sampled
      // surface is labelled — the banner and the connect prompt both say the
      // figures are not theirs, so a mislabelled-but-visible page is the safer
      // failure than a blank one.
      .catch(() => false);
  }
  return anyConnectionPromise;
}

/**
 * Sample data only for a workspace that has connected nothing at all.
 *
 * Two guards, in order:
 *   1. This platform is connected  -> its real payload, always. A live account
 *      with genuinely zero activity keeps its real zeros rather than being
 *      papered over with invented traffic.
 *   2. Any OTHER platform is connected -> still the real payload (zeros), not a
 *      sample. The workspace is live, and fabricated figures must not appear
 *      beside real ones. The page marks the card "Connect source".
 *
 * Only when neither holds does the sample stand in.
 */
export async function withSample<T extends { connected: boolean }>(
  live: T,
  sample: Omit<T, "connected">,
): Promise<T & SampleFlag> {
  if (live?.connected) return live as T & SampleFlag;
  if (await hasAnyConnection()) return live as T & SampleFlag;
  return { ...(sample as object), connected: true, isSampleData: true } as T & SampleFlag;
}
