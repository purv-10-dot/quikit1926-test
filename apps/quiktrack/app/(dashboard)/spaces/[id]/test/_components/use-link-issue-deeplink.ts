"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import type { LinkToIssue } from "./use-case-panels";

/**
 * Auto-opens "New test case" pre-linked to a work item, when arriving via the
 * "QuikTest: Cases" link on that work item's Details panel (QUIKTR-341).
 *
 * The link is a plain URL (`?createCase=1&linkIssueId=…&linkIssueKey=…`) rather than
 * app state, because it has to survive a full navigation from the issue drawer/full
 * page — there is no shared React tree between "looking at a work item" and "looking
 * at the Tests tab" to pass a prop through.
 *
 * Fires ONCE per deep-link: the params are stripped from the URL immediately after
 * opening, via `router.replace`. Without that, a browser refresh (or the user just
 * navigating back to this exact URL later) would reopen "New test case" every time
 * — the params would otherwise never go away on their own.
 *
 * Waits for `ready` (suites loaded + a destination folder resolved) before firing:
 * opening the create form needs a `sectionId`, which is not known until the suite
 * tree has loaded.
 */
export function useLinkIssueDeeplink({
  ready,
  onOpen,
}: {
  ready: boolean;
  onOpen: (link: LinkToIssue) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || !ready) return;
    const sp = searchParams;
    if (!sp || sp.get("createCase") !== "1") return;

    const id = sp.get("linkIssueId");
    const key = sp.get("linkIssueKey");
    if (!id || !key) return;

    consumed.current = true;
    onOpen({ id, key });

    const next = new URLSearchParams(sp.toString());
    next.delete("createCase");
    next.delete("linkIssueId");
    next.delete("linkIssueKey");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // onOpen/router/pathname are stable enough for this one-shot effect; searchParams
    // is the real trigger and is read fresh via the ref guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, searchParams]);
}
