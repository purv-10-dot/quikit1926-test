/**
 * Sample-data fallback for platform pages.
 *
 * WHY. A brand-new workspace has nothing connected, so every platform page
 * would render a "not connected" empty state and the product would look broken
 * rather than un-configured. Until the first integration exists we show
 * representative sample data instead, so the value of each page is visible
 * before any OAuth is done.
 *
 * THE RULE IS PER-SOURCE.
 * Each surface answers for itself: a card or page backed by a CONNECTED source
 * shows real data; one whose source is not connected keeps showing sample data,
 * stamped "Mock". Connecting Google Analytics makes the GA4 page real and
 * leaves LinkedIn on stamped samples — the product stays fully populated while
 * a workspace is onboarded one source at a time, instead of half-emptying the
 * moment the first integration lands.
 *
 * The mix is only safe because every sampled surface is LABELLED at the point
 * of display (banner + Mock stamp). Without that labelling this rule would put
 * fabricated numbers beside real ones with nothing to tell them apart, which is
 * how an invented figure ends up in a client report.
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
 * Returns the live payload when THIS platform is connected; otherwise the
 * sample, marked as such.
 *
 * A connected platform is never overridden — a real account with genuinely zero
 * activity keeps showing its real zeros rather than being papered over with
 * invented traffic. That distinction is the whole point of keying on this
 * platform's own `connected` flag rather than any workspace-level state.
 */
export function withSample<T extends { connected: boolean }>(
  live: T,
  sample: Omit<T, "connected">,
): T & SampleFlag {
  if (live?.connected) return live;
  return { ...(sample as object), connected: true, isSampleData: true } as T & SampleFlag;
}
