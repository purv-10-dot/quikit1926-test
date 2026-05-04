"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

interface OrgOption {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
}

export default function SelectOrgPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Guards prevent the effect + auto-pick from re-entering when
  // `useSession().update()` briefly flips `status` back to "loading".
  // Without these we ping-pong: update() -> status change -> effect fires ->
  // auto-pick -> update() -> ... (the infinite loop the user reported).
  const fetchedRef = useRef(false);
  const pickingRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    fetch("/api/org/memberships", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        const list: OrgOption[] = data.orgs ?? [];
        setOrgs(list);

        if (list.length === 0) {
          setError(
            "You're not a member of any organization yet. Ask your admin to invite you."
          );
          return;
        }
        if (list.length === 1 && !pickingRef.current) {
          pickingRef.current = true;
          void pick(list[0]!.orgId);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your organizations.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  async function pick(orgId: string) {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch("/api/auth/select-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        setError("Could not select that organization.");
        pickingRef.current = false;
        setPicking(false);
        return;
      }
      const body = await res.json();
      await update({ orgId: orgId, membershipRole: body.role });

      const launcher = process.env.NEXT_PUBLIC_LAUNCHER_URL;
      if (launcher) {
        window.location.assign(launcher);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not select that organization.");
      pickingRef.current = false;
      setPicking(false);
    }
  }

  // While loading, auto-picking the only org, or before the membership fetch
  // resolves — show a single spinner. Prevents the flash of the picker UI the
  // user sees for users that belong to exactly one org.
  if (status === "loading" || !orgs || picking) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-500">
          {picking ? "Signing you in..." : "Loading your organizations..."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <h1 className="text-2xl font-semibold text-center">Select an organization</h1>
      <p className="text-sm text-gray-500 mt-1 text-center">
        Signed in as <span className="font-medium">{session?.user?.email}</span>
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {orgs.map((o) => (
          <li key={o.orgId}>
            <button
              onClick={() => pick(o.orgId)}
              disabled={picking}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 px-4 py-3 text-left transition-colors disabled:opacity-60"
            >
              <span>
                <span className="block font-medium">{o.orgName}</span>
                <span className="block text-xs text-gray-500">{o.role}</span>
              </span>
              <span className="text-indigo-600 text-sm">Enter →</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 text-center">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-500 hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
