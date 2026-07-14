"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitePreview } from "@/lib/shared";
import { Button, Spinner } from "@/components/ui";
import { previewInvite } from "@/lib/api";

type State =
  | { status: "loading" }
  | { status: "ok"; preview: InvitePreview }
  | { status: "error"; message: string };

/**
 * Public invite landing page (the one routed URL). Renders the channel preview
 * without auth; "Accept & open" sends unauthenticated users through login and
 * back, then accepts and deep-links into the app at /?channel={id}.
 */
export default function InvitePage({ params }: { params: { code: string } }) {
  const { code } = params;
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    previewInvite(code)
      .then((preview) => setState({ status: "ok", preview }))
      .catch(() => setState({ status: "error", message: "This invite isn’t available." }));
  }, [code]);

  async function accept() {
    setAccepting(true);
    const res = await fetch(`/api/invites/${code}/accept`, {
      method: "POST",
      credentials: "include",
    });
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }
    if (!res.ok) {
      // 404 (cross-org / not found) or 410 (revoked / expired / maxed).
      setState({ status: "error", message: "This invite isn’t available." });
      setAccepting(false);
      return;
    }
    const channel = (await res.json()) as { channelId: string };
    router.push(`/?channel=${channel.channelId}`);
  }

  return (
    <main className="qc-invite-landing">
      {state.status === "loading" ? (
        <Spinner />
      ) : state.status === "error" ? (
        <>
          <h1>Invite unavailable</h1>
          <p style={{ color: "var(--qc-text-3)" }}>
            {state.message} It may have expired, been revoked, or reached its limit.
          </p>
          <Button variant="ghost" onClick={() => router.push("/")}>
            Go to QuikChat
          </Button>
        </>
      ) : (
        <>
          <h1>{state.preview.name ?? "Join the conversation"}</h1>
          {state.preview.description ? (
            <p style={{ color: "var(--qc-text-2)" }}>{state.preview.description}</p>
          ) : null}
          <p style={{ color: "var(--qc-text-3)" }}>
            {state.preview.memberCount} member{state.preview.memberCount === 1 ? "" : "s"} ·{" "}
            {state.preview.visibility}
            {state.preview.remainingUses != null
              ? ` · ${state.preview.remainingUses} use${state.preview.remainingUses === 1 ? "" : "s"} left`
              : ""}
          </p>
          <Button variant="primary" disabled={accepting} onClick={accept}>
            Accept &amp; open
          </Button>
        </>
      )}
    </main>
  );
}
