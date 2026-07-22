"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Avatar,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  Send,
  Users,
  Video,
  Voicemail,
} from "@/components/ui";

type Direction = "incoming" | "outgoing" | "missed" | "voicemail";
type CallFilter = "all" | "missed" | "incoming" | "outgoing" | "voicemail";

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

const CALLS: CallLog[] = [
  {
    id: "1",
    name: "Sanjana Shah",
    direction: "incoming",
    day: "Saturday",
    time: "8:26 PM",
    duration: "37s",
    date: "Saturday, July 4, 2026",
  },
  {
    id: "2",
    name: "Sanjana Shah",
    direction: "outgoing",
    day: "Saturday",
    time: "5:12 PM",
    duration: "52s",
    date: "Saturday, July 4, 2026",
  },
  {
    id: "3",
    name: "Akash Makhija",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    direction: "outgoing",
    day: "Friday",
    time: "3:04 PM",
    duration: "2m 11s",
    date: "Friday, July 3, 2026",
  },
  {
    id: "4",
    name: "Bhavya Thakkar",
    avatarUrl: "https://i.pravatar.cc/150?img=32",
    direction: "missed",
    day: "Friday",
    time: "1:20 PM",
    date: "Friday, July 3, 2026",
  },
  {
    id: "5",
    name: "Bhavya Thakkar",
    avatarUrl: "https://i.pravatar.cc/150?img=32",
    direction: "outgoing",
    day: "Friday",
    time: "11:48 AM",
    duration: "6s",
    date: "Friday, July 3, 2026",
  },
  {
    id: "6",
    name: "Rishika Arora",
    avatarUrl: "https://i.pravatar.cc/150?img=45",
    direction: "outgoing",
    day: "Tuesday",
    time: "6:30 PM",
    duration: "44s",
    date: "Tuesday, June 30, 2026",
  },
  {
    id: "7",
    name: "Ajay Kumar Bhargava",
    avatarUrl: "https://i.pravatar.cc/150?img=68",
    direction: "missed",
    day: "Tuesday",
    time: "4:15 PM",
    duration: "15s",
    date: "Tuesday, June 30, 2026",
  },
  {
    id: "8",
    name: "Sanjana Shah",
    direction: "outgoing",
    day: "Monday",
    time: "5:02 PM",
    duration: "1m 3s",
    date: "Monday, June 29, 2026",
  },
  {
    id: "9",
    name: "Sanjana Shah",
    direction: "outgoing",
    day: "Monday",
    time: "2:41 PM",
    duration: "1m 9s",
    date: "Monday, June 29, 2026",
  },
  {
    id: "10",
    name: "Sanjana Shah",
    direction: "outgoing",
    day: "Monday",
    time: "12:10 PM",
    duration: "1m 43s",
    date: "Monday, June 29, 2026",
  },
  {
    id: "11",
    name: "Sheetal Rana",
    direction: "missed",
    day: "Monday",
    time: "10:55 AM",
    duration: "19s",
    date: "Monday, June 29, 2026",
  },
  {
    id: "12",
    name: "Abhilasha Paliwal",
    avatarUrl: "https://i.pravatar.cc/150?img=47",
    direction: "missed",
    day: "Monday",
    time: "9:30 AM",
    date: "Monday, June 29, 2026",
  },
  {
    id: "13",
    name: "Sanjana Shah",
    direction: "incoming",
    day: "6/23/2026",
    time: "4:12 PM",
    duration: "7s",
    date: "Tuesday, June 23, 2026",
  },
  {
    id: "14",
    name: "Jayshree Umath",
    direction: "outgoing",
    day: "6/23/2026",
    time: "3:00 PM",
    duration: "13s",
    date: "Tuesday, June 23, 2026",
  },
  {
    id: "15",
    name: "Akash Makhija",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    direction: "outgoing",
    day: "6/23/2026",
    time: "11:20 AM",
    duration: "12m 46s",
    date: "Tuesday, June 23, 2026",
  },
  {
    id: "16",
    name: "Akash Makhija",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    direction: "outgoing",
    day: "6/23/2026",
    time: "10:02 AM",
    duration: "1m 48s",
    date: "Tuesday, June 23, 2026",
  },
  {
    id: "17",
    name: "Akash Makhija",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    direction: "incoming",
    day: "6/22/2026",
    time: "6:41 PM",
    duration: "35s",
    date: "Monday, June 22, 2026",
  },
];

const FILTERS: { key: CallFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missed", label: "Missed" },
  { key: "incoming", label: "Incoming" },
  { key: "outgoing", label: "Outgoing" },
  { key: "voicemail", label: "Voicemail" },
];

const DIR_META: Record<Direction, { icon: ReactNode; label: string; missed?: boolean }> = {
  incoming: { icon: <PhoneIncoming size={13} />, label: "Incoming" },
  outgoing: { icon: <PhoneOutgoing size={13} />, label: "Outgoing" },
  missed: { icon: <PhoneMissed size={13} />, label: "Missed", missed: true },
  voicemail: { icon: <Voicemail size={13} />, label: "Voicemail" },
};

export function CallsModule() {
  const [filter, setFilter] = useState<CallFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickMsg, setQuickMsg] = useState("");

  const visible = useMemo(
    () => (filter === "all" ? CALLS : CALLS.filter((c) => c.direction === filter)),
    [filter],
  );

  const selected = useMemo(() => CALLS.find((c) => c.id === selectedId) ?? null, [selectedId]);

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
            {visible.length === 0 ? (
              <div className="qc-nempty">
                <Phone size={26} aria-hidden />
                <div className="qc-nempty__title">No calls</div>
                <div className="qc-nempty__hint">Nothing matches this filter.</div>
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
