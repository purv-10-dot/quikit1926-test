"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CallDirection } from "@/lib/shared";
import {
  Avatar,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  Send,
  Spinner,
  Users,
  Video,
} from "@/components/ui";
import { fetchCallHistory } from "@/lib/api";
import {
  dateDividerLabel,
  formatCallDuration,
  formatFullDate,
  formatMessageTime,
} from "@/lib/format";

// Mirrors the server's CallDirection — there is no voicemail feature anywhere in
// the product, so the old fourth "voicemail" direction (and its always-empty
// filter chip) are gone.
type Direction = CallDirection;
type CallFilter = "all" | "missed" | "incoming" | "outgoing";

interface CallLog {
  id: string;
  name: string;
  avatarUrl?: string;
  direction: Direction;
  /** Relative day label shown on the right. */
  day: string;
  /** Clock time of the call. */
  time: string;
  /** Human duration (empty for missed). */
  duration?: string;
  /** Full date heading for the details pane. */
  date: string;
}

const FILTERS: { key: CallFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missed", label: "Missed" },
  { key: "incoming", label: "Incoming" },
  { key: "outgoing", label: "Outgoing" },
];

const DIR_META: Record<Direction, { icon: ReactNode; label: string; missed?: boolean }> = {
  incoming: { icon: <PhoneIncoming size={13} />, label: "Incoming" },
  outgoing: { icon: <PhoneOutgoing size={13} />, label: "Outgoing" },
  missed: { icon: <PhoneMissed size={13} />, label: "Missed", missed: true },
};

export function CallsModule() {
  const [filter, setFilter] = useState<CallFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickMsg, setQuickMsg] = useState("");

  const historyQuery = useQuery({ queryKey: ["calls-history"], queryFn: fetchCallHistory });

  // The DTO carries ISO timestamps + raw seconds; every label is formatted here
  // with the same helpers the rest of the app uses.
  const calls = useMemo<CallLog[]>(
    () =>
      (historyQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        avatarUrl: c.avatarUrl ?? undefined,
        direction: c.direction,
        day: dateDividerLabel(c.startedAt),
        time: formatMessageTime(c.startedAt),
        duration: formatCallDuration(c.durationSeconds),
        date: formatFullDate(c.startedAt),
      })),
    [historyQuery.data],
  );

  const visible = useMemo(
    () => (filter === "all" ? calls : calls.filter((c) => c.direction === filter)),
    [calls, filter],
  );

  const selected = useMemo(
    () => calls.find((c) => c.id === selectedId) ?? null,
    [calls, selectedId],
  );

  return (
    <div className="qc-card qc-calls">
      <div className="qc-calls-frame">
        {/* History */}
        <section className="qc-calls-history">
          <header className="qc-calls-hhead">
            <h1 className="qc-calls-htitle">History</h1>
            <div className="qc-calls-filters" role="tablist" aria-label="Filter calls">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  data-active={filter === f.key}
                  className="qc-calls-chip"
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </header>

          <div className="qc-calls-scroll">
            {historyQuery.isLoading ? (
              <div className="qc-nempty">
                <Spinner label="Loading call history" />
              </div>
            ) : visible.length === 0 ? (
              <div className="qc-nempty">
                <Phone size={26} aria-hidden />
                {calls.length === 0 ? (
                  <>
                    <div className="qc-nempty__title">No calls yet</div>
                    <div className="qc-nempty__hint">Your call history will show up here.</div>
                  </>
                ) : (
                  <>
                    <div className="qc-nempty__title">No calls</div>
                    <div className="qc-nempty__hint">Nothing matches this filter.</div>
                  </>
                )}
              </div>
            ) : (
              visible.map((c) => {
                const meta = DIR_META[c.direction];
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="qc-calls-row"
                    data-active={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <Avatar name={c.name} id={c.name} avatarUrl={c.avatarUrl} size={36} />
                    <span className="qc-calls-row__main">
                      <span className="qc-calls-row__name">{c.name}</span>
                      <span className="qc-calls-row__dir" data-missed={meta.missed}>
                        {meta.icon} {meta.label}
                      </span>
                    </span>
                    <span className="qc-calls-row__meta">
                      <span className="qc-calls-row__day">{c.day}</span>
                      {c.duration ? <span className="qc-calls-row__dur">{c.duration}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Details */}
        <aside className="qc-calls-details">
          {selected ? (
            <>
              <div className="qc-calls-det__hero">
                <span className="qc-calls-det__avatar">
                  <Avatar
                    name={selected.name}
                    id={selected.name}
                    avatarUrl={selected.avatarUrl}
                    size={56}
                  />
                  <span className="qc-calls-det__status" aria-hidden />
                </span>
                <div className="qc-calls-det__name">{selected.name}</div>
                <div className="qc-calls-det__actions">
                  <button type="button" className="qc-iconbtn" aria-label="Chat">
                    <MessageSquare size={17} />
                  </button>
                  <button type="button" className="qc-iconbtn" aria-label="Org chart">
                    <Users size={17} />
                  </button>
                  <button type="button" className="qc-iconbtn" aria-label="Video call">
                    <Video size={17} />
                  </button>
                  <button type="button" className="qc-iconbtn" aria-label="Call">
                    <Phone size={17} />
                  </button>
                </div>
                <div className="qc-calls-det__quick">
                  <input
                    className="qc-input"
                    placeholder="Send a quick message"
                    aria-label="Send a quick message"
                    value={quickMsg}
                    onChange={(e) => setQuickMsg(e.target.value)}
                  />
                  <button type="button" className="qc-iconbtn qc-calls-det__send" aria-label="Send">
                    <Send size={15} />
                  </button>
                </div>
              </div>

              <div className="qc-calls-det__log">
                <div className="qc-calls-det__date">{selected.date}</div>
                <div className="qc-calls-det__event">
                  <span
                    className="qc-calls-det__evicon"
                    data-missed={selected.direction === "missed"}
                  >
                    {DIR_META[selected.direction].icon}
                  </span>
                  <div className="qc-calls-det__evbody">
                    <div className="qc-calls-det__evtitle">
                      <span>{DIR_META[selected.direction].label}</span>
                      <span className="qc-calls-det__evtime">{selected.time}</span>
                    </div>
                    <div className="qc-calls-det__evsub">
                      {selected.direction === "missed"
                        ? "You missed this call"
                        : selected.direction === "incoming"
                          ? "Answered by you"
                          : "Answered"}
                    </div>
                  </div>
                </div>
                {selected.duration ? (
                  <>
                    <div className="qc-calls-det__event">
                      <span className="qc-calls-det__evicon">
                        <PhoneOutgoing size={13} style={{ transform: "rotate(135deg)" }} />
                      </span>
                      <div className="qc-calls-det__evbody">
                        <div className="qc-calls-det__evtitle">
                          <span>Call ended</span>
                          <span className="qc-calls-det__evtime">{selected.time}</span>
                        </div>
                      </div>
                    </div>
                    <div className="qc-calls-det__total">
                      <span>Total call time</span>
                      <span>{selected.duration}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="qc-act-detail__empty">
              <Search size={28} />
              <div className="qc-act-detail__empty-title">Select a call</div>
              <div className="qc-act-detail__empty-hint">
                Choose a call from the history to see its details.
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
