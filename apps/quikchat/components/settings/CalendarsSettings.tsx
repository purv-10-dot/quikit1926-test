"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Calendar, Spinner, useToast } from "@/components/ui";
import {
  disconnectMicrosoftApi,
  fetchCalendarConnection,
  MICROSOFT_CONNECT_URL,
} from "@/lib/api";

const PROVIDER_LABEL: Record<string, string> = {
  stub: "Demo calendar (no real provider configured)",
  google: "Google Calendar (shared workspace account)",
  microsoft: "Microsoft 365 / Outlook",
};

/**
 * "Calendars" settings (S15b). Shows the active provider and — for the per-user
 * Microsoft provider — a Connect / Disconnect control. Google is single-account
 * (no per-user connect); stub is demo-only.
 */
export function CalendarsSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["calendar-connection"],
    queryFn: fetchCalendarConnection,
  });

  if (isLoading || !data) {
    return (
      <div className="qc-center-fill" data-testid="calendars-settings">
        <Spinner />
      </div>
    );
  }

  async function disconnect() {
    try {
      await disconnectMicrosoftApi();
      await qc.invalidateQueries({ queryKey: ["calendar-connection"] });
      toast.success({ title: "Microsoft calendar disconnected" });
    } catch {
      toast.error({ title: "Could not disconnect" });
    }
  }

  return (
    <div className="qc-calsettings" data-testid="calendars-settings">
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Active calendar</div>
          <div className="qc-nset__d">{PROVIDER_LABEL[data.provider] ?? data.provider}</div>
        </div>
        <span className="qc-cal-icon" aria-hidden>
          <Calendar size={20} />
        </span>
      </div>

      {data.requiresUserConnect ? (
        data.connected ? (
          <div className="qc-nset__row" data-testid="cal-connected">
            <div>
              <div className="qc-nset__k">Connected</div>
              <div className="qc-nset__d">{data.email}</div>
            </div>
            <Button variant="ghost" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="qc-nset__row" data-testid="cal-disconnected">
            <div>
              <div className="qc-nset__k">Not connected</div>
              <div className="qc-nset__d">
                Connect your Microsoft calendar to see availability and create meetings with Teams
                links.
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = MICROSOFT_CONNECT_URL;
              }}
            >
              <Calendar size={16} aria-hidden /> Connect Microsoft
            </Button>
          </div>
        )
      ) : (
        <div className="qc-nset__d" data-testid="cal-no-connect">
          {data.provider === "google"
            ? "Meetings are organized through the shared workspace account — no per-user connection needed."
            : "No real calendar is configured; meetings use demo data."}
        </div>
      )}
    </div>
  );
}
