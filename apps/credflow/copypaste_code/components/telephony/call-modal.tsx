// apps/quikcrm/components/telephony/call-modal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CallDispositionModal,
  LeadCallDispositionModal,
} from "@/components/leads/call-disposition-modal";
import { DialerPad } from "@/components/telephony/dialer-pad";
import { InCallModal } from "@/components/telephony/in-call-modal";
import {
  postClickToCall,
  fetchCallSessionStatus,
  fetchDispositions,
} from "@/lib/api-client";
import { getAgentNumber } from "@/lib/utils/agent-number";

interface DispositionSection {
  id: string;
  code: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fills the customer number (Party B). */
  to?: string | null;
  /** When provided, the resulting call log + disposition activity are linked to this lead. */
  leadId?: string;
  leadName?: string;
  leadStage?: string | null;
  /**
   * Optional pre-fetched disposition list. If omitted, the modal lazily fetches
   * /api/telephony/dispositions on first open.
   */
  dispositionSections?: DispositionSection[];
  /**
   * Render the keypad inline (no modal chrome). Used by the dedicated dialer
   * page where the keypad IS the page. The in-call and disposition overlays
   * still float above.
   */
  inline?: boolean;
}

type Stage = "dial" | "in-call" | "disposition";

const POLL_INTERVAL_MS = 2000;

export function CallModal({
  open,
  onClose,
  to,
  leadId,
  leadName,
  leadStage,
  dispositionSections,
  inline = false,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>("dial");
  const [number, setNumber] = useState(to ?? "");
  const [agent, setAgent] = useState("");
  const [providerCallSid, setProviderCallSid] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [latestStatus, setLatestStatus] = useState<string | null>(null);
  const [finalDuration, setFinalDuration] = useState<number>(0);
  // Authoritative attribution for who terminated the call. The agent's
  // End-call click sets this to "agent" — the disposition POST forwards it
  // and webhook-handler will not overwrite an "agent" value with its
  // inferred customer/system result.
  const [endedBy, setEndedBy] = useState<"agent" | "customer" | "system" | "unknown" | null>(null);
  const [sections, setSections] = useState<DispositionSection[]>(
    dispositionSections ?? [],
  );
  const pollRef = useRef<number | null>(null);

  // Reset on open + prefill incoming `to`. Agent (Party A) defaults to the
  // value the user saved on /settings/profile (stored in localStorage).
  useEffect(() => {
    if (!open) return;
    setNumber(to ?? "");
    setAgent(getAgentNumber());
    setStage("dial");
    setProviderCallSid(null);
    setCallStartedAt(null);
    setLatestStatus(null);
    setFinalDuration(0);
    setEndedBy(null);
  }, [open, to]);

  // Lazy-fetch dispositions if parent didn't supply them
  useEffect(() => {
    if (!open) return;
    if (sections.length > 0 || dispositionSections) return;
    fetchDispositions()
      .then((j) => setSections(Array.isArray(j?.items) ? j.items : []))
      .catch(() => {
        /* show empty list — picker explains how to configure */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Polling effect — runs only while we have a callSid AND the call hasn't
  // ended. setInterval guarantees a fresh tick every 2s; cleanup cancels on
  // stage change or unmount.
  useEffect(() => {
    if (stage !== "in-call" || !providerCallSid) return;
    let cancelled = false;
    const startedAt = callStartedAt ?? Date.now();
    const tick = async () => {
      try {
        const s = await fetchCallSessionStatus(providerCallSid);
        if (cancelled) return;
        if (s.status) setLatestStatus(s.status);
        if (s.callEnded) {
          // Webhook says the call is over. Snapshot duration from the
          // provider (authoritative), advance to disposition, drop a
          // toast so the agent gets immediate feedback.
          stopPolling();
          setFinalDuration(s.duration || 0);
          // Don't overwrite an explicit "agent" set by the End-call button.
          setEndedBy((prev) => prev ?? "customer");
          toast.info?.("Call ended");
          setStage("disposition");
          console.log(
            "[telephony] poll → callEnded sid=%s status=%s duration=%s elapsedMs=%s",
            providerCallSid,
            s.status,
            s.duration,
            Date.now() - startedAt,
          );
        }
      } catch (err) {
        // Don't silently swallow — surface in console so a tunnel/CORS/auth
        // issue is visible. Keep polling; the next tick may recover.
        console.warn("[telephony] poll error sid=%s:", providerCallSid, err);
      }
    };
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    // First poll right away so the initial status appears within ~0s rather
    // than waiting a full 2s for the first interval tick.
    void tick();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, providerCallSid]);

  function stopPolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Belt-and-braces: cleanup any lingering interval on unmount.
  useEffect(() => stopPolling, []);

  async function placeCall() {
    if (number.replace(/\D/g, "").length < 10) {
      toast.error("Customer number must have at least 10 digits");
      return;
    }
    setStage("in-call");
    setLatestStatus("dialing");
    try {
      const res = await postClickToCall(number, agent || undefined);
      if (!res.callSid) {
        // Provider returned 200 but no campid — treat as failure so the agent
        // doesn't sit on a "calling…" screen forever.
        throw new Error(res.providerMessage || "Provider did not return a call id");
      }
      setProviderCallSid(res.callSid);
      setCallStartedAt(Date.now());
      toast.success("Call initiated — your phone should ring shortly");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Call failed");
      setStage("dial");
      setLatestStatus(null);
    }
  }

  function handleDispositionClose() {
    stopPolling();
    setStage("dial");
    setProviderCallSid(null);
    setCallStartedAt(null);
    setLatestStatus(null);
    setFinalDuration(0);
    onClose();
    router.refresh();
  }

  function endCallEarly() {
    // Agent ended the call manually before the webhook arrived. Snapshot the
    // elapsed time as the final duration; the call_report webhook (when it
    // lands) will overwrite it with the provider's exact value via the
    // disposition-engine orphan backfill or the webhook-handler match.
    if (callStartedAt != null) {
      setFinalDuration(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    }
    stopPolling();
    setEndedBy("agent");
    toast.info?.("Call ended");
    console.log(
      "[telephony] agent ended call sid=%s elapsedMs=%s",
      providerCallSid,
      callStartedAt != null ? Date.now() - callStartedAt : null,
    );
    setStage("disposition");
  }

  // While in-call we mount ONLY the InCallModal — the dialer modal is hidden
  // so it doesn't bleed through the backdrop. (Earlier the two stacked, which
  // looked unprofessional and confused the visual hierarchy.)
  if (stage === "in-call" && callStartedAt != null) {
    return (
      <InCallModal
        callStartedAt={callStartedAt}
        providerCallSid={providerCallSid}
        status={latestStatus}
        partyA={agent || null}
        partyB={number}
        partyBName={leadName || null}
        onEndCall={endCallEarly}
      />
    );
  }

  // Disposition wizard renders as its own modal once the call ends. We pass
  // callLogContext so it submits to /api/telephony/call-logs (the new path),
  // and we pass leadId only when the parent supplied one — without leadId
  // the call log is logged but no lead is updated.
  if (stage === "disposition") {
    if (leadId) {
      return (
        <LeadCallDispositionModal
          open
          leadId={leadId}
          leadStage={leadStage ?? undefined}
          defaultToNumber={number}
          providerCallSid={providerCallSid ?? undefined}
          initialView="call"
          onClose={handleDispositionClose}
          onSaved={() => {
            handleDispositionClose();
          }}
        />
      );
    }
    return (
      <CallDispositionModal
        open
        leadId={leadId ?? null}
        sections={sections}
        onClose={handleDispositionClose}
        callLogContext={{
          toNumber: number,
          fromNumber: agent || null,
          durationSec: finalDuration,
          providerCallSid,
          endedBy,
        }}
      />
    );
  }

  const dialerBody = (
    <>
      {leadId && (
        <div className="mb-3 rounded-md border border-crm-blue/30 bg-crm-blue-soft px-2 py-1 text-center text-xs text-crm-blue-dark">
          Linked to lead{leadName ? ` · ${leadName}` : ""}
        </div>
      )}
      <DialerPad
        value={number}
        onChange={setNumber}
        onCall={placeCall}
        agentValue={agent}
        onAgentChange={setAgent}
        disabled={stage === "in-call"}
        callButtonLabel={stage === "in-call" ? "Calling…" : "Call"}
      />
      {!inline && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={stage === "in-call"}
          >
            Cancel
          </Button>
        </div>
      )}
    </>
  );

  // Stage === "dial" — the in-call and disposition stages are handled above
  // by early returns, so this code path only renders the keypad surface.
  if (inline) {
    return <>{dialerBody}</>;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={leadName ? `Call ${leadName}` : "Call"}
      width="max-w-sm"
    >
      {dialerBody}
    </Modal>
  );
}
