/**
 * Guard against a `projectKey` reaching a write path where a cuid is required.
 *
 * QuikTrack URLs may carry either form — `/spaces/QUIKTR/test` and
 * `/spaces/cmpqrve9…/test` both work — so any value read from a URL or request
 * body is "id or key" until resolved. Routes resolve via `gateProjectResolved`.
 *
 * The failure this prevents is quiet and expensive: a key written into a
 * `projectId` column produces a row that no id-based query returns (so the UI
 * shows nothing and it reads as data loss), and it sidesteps the
 * `(projectId, automationId)` uniqueness index, letting duplicate automation ids
 * coexist. Both surface much later than the mistake.
 *
 * A cuid is 25 chars, starts with `c`, and is lowercase alphanumeric. Project
 * keys are short uppercase (QUIKTR, CHATAP), so the two are easy to separate.
 * The check is deliberately loose — it rejects the realistic mistake without
 * pretending to validate cuid internals.
 */

const CUID_LIKE = /^c[a-z0-9]{20,}$/;

/** True when `value` looks like a cuid rather than a project key. */
export function isResolvedProjectId(value: string): boolean {
  return CUID_LIKE.test(value);
}

/**
 * Throws when handed something that looks like a project key.
 *
 * Called at the top of service functions that persist `projectId`, so the error
 * names the real problem at the boundary instead of producing an orphan row.
 */
export function assertResolvedProjectId(value: string): void {
  if (!value) {
    throw new Error("projectId is required");
  }
  if (!isResolvedProjectId(value)) {
    throw new Error(
      `projectId "${value}" looks like a project key, not an id. ` +
        "Resolve it with gateProjectResolved() before writing — storing a key " +
        "creates a row that id-based queries can never find.",
    );
  }
}
