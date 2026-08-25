"use client";

/**
 * "Your approvals" — the Activity pane's section for the viewer's own parked
 * writes.
 *
 * ── THE HEADING IS PART OF THE FEATURE ──────────────────────────────────────
 * "Your approvals", never "Approvals". v1 is requester-only: the runtime scopes
 * the ledger on the minted token, so these are the writes YOU asked for and
 * nobody else's. A user who reads "Approvals" reasonably assumes it is a queue
 * of things awaiting their sign-off — a different feature, and one that would
 * make an empty section look like other people's requests were being hidden. The
 * scope has to be legible from the heading, because there is no documentation in
 * front of the person reading it.
 *
 * ── NOT A PAGINATING SURFACE ────────────────────────────────────────────────
 * The relay carries `limit`/`offset` and returns `total`, and Activity has no
 * pagination anywhere — the notification feed's "See all activity" is a
 * different mechanism owned by the notification store. Rather than grow one
 * here, this asks for the relay's default page and, when there is more, says so
 * in a caption. A silent truncation would read as "these are all of them", which
 * on a list of pending writes is the one thing it must not say.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { APPROVALS_QUERY_KEY, decideApproval, fetchApprovals } from "@/lib/api";
import { fromApprovalRow } from "@/lib/approval-card";
import { ApprovalCard } from "./ApprovalCard";

export interface ApprovalsSectionProps {
  /** Viewer id — checked against each row's requester. See `fromApprovalRow`. */
  currentUserId: string;
}

export function ApprovalsSection({ currentUserId }: ApprovalsSectionProps) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: fetchApprovals,
    // Pending writes age out on the runtime's clock, so a stale list is worse
    // here than on most surfaces: a card that expired two minutes ago should
    // stop offering buttons on the next look, not on the next reload.
    staleTime: 30_000,
    // NO `retry` override and deliberately no retry on the DECISION path — see
    // `decideApproval`. Refetching a list is safe; replaying a decision is not.
  });

  const onSettled = useCallback(() => {
    void qc.invalidateQueries({ queryKey: APPROVALS_QUERY_KEY });
  }, [qc]);

  /**
   * A FAILED read is not an empty inbox.
   *
   * `{ requests: [] }` means "you have none"; a throw means "we don't know", and
   * on a list of writes waiting on you those look identical and mean opposite
   * things. The relay goes to some trouble to keep them apart (502/504 with no
   * `requests` key rather than a synthesised page) and that effort is wasted if
   * the surface renders both as silence. So: an error shows, and it shows before
   * the empty case is even considered.
   */
  if (query.isError) {
    return (
      <section className="qc-approvals" aria-labelledby="qc-approvals-h">
        <h2 className="qc-approvals__title" id="qc-approvals-h">
          Your approvals
        </h2>
        <div className="qc-approvals__err" role="alert" data-testid="approvals-error">
          <span>Couldn&apos;t load your approvals, so this list may be incomplete.</span>
          <button type="button" className="qc-link" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  const page = query.data;
  // Hidden entirely when there is nothing and nothing went wrong. Activity is a
  // busy pane; a permanently-present empty block for a feature most turns never
  // trigger is clutter, and unlike the error above it carries no information.
  if (!page || page.requests.length === 0) return null;

  const hidden = page.total - page.requests.length;

  return (
    <section className="qc-approvals" aria-labelledby="qc-approvals-h" data-testid="approvals">
      <h2 className="qc-approvals__title" id="qc-approvals-h">
        Your approvals
      </h2>
      {/* Server order, kept as-is. The ledger decides what comes first; re-sorting
          pending-to-the-top here would put our idea of importance ahead of the
          runtime's and would diverge from what the same list shows elsewhere. */}
      {page.requests.map((row) => (
        <ApprovalCard
          key={row.id}
          model={fromApprovalRow(row, currentUserId)}
          onDecide={decideApproval}
          onSettled={onSettled}
        />
      ))}
      {hidden > 0 ? (
        // Says what is not shown rather than offering a "load more" this pane
        // has nowhere to put. If this caption starts appearing routinely, that
        // is the signal to give Activity real paging — not to raise the limit.
        <p className="qc-approvals__more" data-testid="approvals-truncated">
          Showing {page.requests.length} of {page.total}.
        </p>
      ) : null}
    </section>
  );
}
