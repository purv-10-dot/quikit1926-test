"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Auto-opens "New test run" pre-filled with a work item's key in References, when
 * arriving via the "QuikTest: Runs" link on that work item's Details panel
 * (QUIKTR-341).
 *
 * Mirrors `use-link-issue-deeplink.ts` (the case-creation equivalent) but simpler:
 * a run has no structured Coverage relation, so there is nothing to POST after
 * creation — the work item's key is just seeded into the run's own References
 * field, a plain editable value the user can change or remove before saving.
 *
 * Fires once; the query params are stripped immediately via `router.replace` so a
 * refresh or a later visit to the same URL doesn't reopen the panel.
 */
export function useLinkIssueRunDeeplink({
  onOpen,
}: {
  onOpen: (issueKey: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const sp = searchParams;
    if (!sp || sp.get("createRun") !== "1") return;

    const key = sp.get("linkIssueKey");
    if (!key) return;

    consumed.current = true;
    onOpen(key);

    const next = new URLSearchParams(sp.toString());
    next.delete("createRun");
    next.delete("linkIssueKey");
    next.delete("linkIssueId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
