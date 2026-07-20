"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  NotificationKeywordDto,
  NotificationLevel,
  NotificationSettingsDto,
} from "@/lib/shared";
import {
  Button,
  Input,
  Modal,
  Segmented,
  Spinner,
  Switch,
  TimeInput,
  useToast,
  X,
} from "@/components/ui";
import {
  addKeywordApi,
  fetchKeywords,
  fetchNotificationSettings,
  patchNotificationSettings,
  removeKeywordApi,
} from "@/lib/api";
import {
  dndValid,
  formatUntil,
  isActive,
  untilIso,
  type SnoozeOption,
} from "@/lib/notif-settings";
import { useNotifications } from "./NotificationProvider";

const LEVELS: { label: string; value: NotificationLevel }[] = [
  { label: "All", value: "all" },
  { label: "Mentions", value: "mentions" },
  { label: "None", value: "none" },
];

export interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationSettingsModal({ open, onClose }: NotificationSettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Notification settings">
      <NotificationSettingsPanel />
    </Modal>
  );
}

/** The settings form without a Modal wrapper — reused by the settings home (S14b). */
export function NotificationSettingsPanel() {
  const toast = useToast();
  const { osPermission, requestOsPermission } = useNotifications();
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchNotificationSettings()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => {
        if (alive) toast.error({ title: "Couldn't load settings" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const patch = useCallback(
    async (partial: Partial<NotificationSettingsDto>) => {
      setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
      try {
        const updated = await patchNotificationSettings(partial);
        setSettings(updated);
      } catch {
        // Revert by refetching the authoritative DTO.
        toast.error({ title: "Couldn't save — reverted" });
        try {
          setSettings(await fetchNotificationSettings());
        } catch {
          /* leave optimistic state */
        }
      }
    },
    [toast],
  );

  const onToggleDesktop = useCallback(
    async (next: boolean) => {
      // Turning Desktop ON must request OS permission on this user gesture.
      if (next) await requestOsPermission();
      await patch({ desktopEnabled: next });
    },
    [patch, requestOsPermission],
  );

  const onToggleDnd = useCallback(
    async (next: boolean) => {
      if (next && settings && (!settings.dndStart || !settings.dndEnd)) {
        // Seed sensible quiet hours so the "both required" rule is satisfied.
        await patch({
          dndEnabled: true,
          dndStart: settings.dndStart ?? "22:00",
          dndEnd: settings.dndEnd ?? "07:00",
        });
      } else {
        await patch({ dndEnabled: next });
      }
    },
    [patch, settings],
  );

  const snooze = (option: SnoozeOption) => void patch({ snoozedUntil: untilIso(option) });
  const clearSnooze = () => void patch({ snoozedUntil: null });

  return loading || !settings ? (
    <div className="qc-center-fill" style={{ padding: 24 }}>
      <Spinner />
    </div>
  ) : (
    <div data-testid="notification-settings">
      <div className="qc-nset__label">LEVELS</div>
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Default channel</div>
          <div className="qc-nset__d">For channels without an override</div>
        </div>
        <Segmented
          label="Default channel level"
          options={LEVELS}
          value={settings.defaultChannelLevel}
          onChange={(v) => void patch({ defaultChannelLevel: v })}
        />
      </div>
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Direct messages</div>
          <div className="qc-nset__d">Usually keep this on All</div>
        </div>
        <Segmented
          label="Direct message level"
          options={LEVELS}
          value={settings.dmsLevel}
          onChange={(v) => void patch({ dmsLevel: v })}
        />
      </div>

      <div className="qc-nset__label">DELIVERY</div>
      <div className="qc-nset__row">
        <div className="qc-nset__k">Sound</div>
        <Switch
          label="Sound"
          checked={settings.soundEnabled}
          onChange={(v) => void patch({ soundEnabled: v })}
        />
      </div>
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Desktop (OS) notifications</div>
          <div className="qc-nset__d">Pop a system alert when unfocused</div>
          {settings.desktopEnabled && osPermission === "denied" ? (
            <div className="qc-nset__hint qc-nset__hint--warn">
              Blocked in your browser — enable notifications in site settings.
            </div>
          ) : null}
        </div>
        <Switch
          label="Desktop notifications"
          checked={settings.desktopEnabled}
          onChange={(v) => void onToggleDesktop(v)}
        />
      </div>
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Email</div>
          <div className="qc-nset__d">Stored — delivery not enabled yet</div>
        </div>
        <Switch
          label="Email"
          checked={settings.emailEnabled}
          onChange={(v) => void patch({ emailEnabled: v })}
        />
      </div>

      <div className="qc-nset__label">DO NOT DISTURB</div>
      <div className="qc-nset__row">
        <div>
          <div className="qc-nset__k">Quiet hours</div>
          <div className="qc-nset__d">Local time</div>
        </div>
        <Switch
          label="Quiet hours"
          checked={settings.dndEnabled}
          onChange={(v) => void onToggleDnd(v)}
        />
      </div>
      {settings.dndEnabled ? (
        <>
          <div className="qc-nset__row">
            <div className="qc-nset__k">Window</div>
            <div className="qc-nset__window">
              <TimeInput
                label="Quiet hours start"
                value={settings.dndStart ?? ""}
                onChange={(v) => void patch({ dndStart: v })}
              />
              <span className="qc-nset__d">→</span>
              <TimeInput
                label="Quiet hours end"
                value={settings.dndEnd ?? ""}
                onChange={(v) => void patch({ dndEnd: v })}
              />
            </div>
          </div>
          {!dndValid(settings.dndEnabled, settings.dndStart, settings.dndEnd) ? (
            <div className="qc-nset__hint qc-nset__hint--warn">
              Set both a start and end time for quiet hours.
            </div>
          ) : null}
          <div className="qc-nset__row">
            <div>
              <div className="qc-nset__k">Allow priority during DND</div>
              <div className="qc-nset__d">Mentions, DMs &amp; keywords still alert</div>
            </div>
            <Switch
              label="Allow priority during DND"
              checked={settings.priorityDuringDnd}
              onChange={(v) => void patch({ priorityDuringDnd: v })}
            />
          </div>
        </>
      ) : null}

      <div className="qc-nset__label">SNOOZE</div>
      <div className="qc-nset__row qc-nset__row--block">
        <div className="qc-nset__d">Silence everything — even DMs — until:</div>
        {isActive(settings.snoozedUntil) ? (
          <div className="qc-snooze-active">
            <span>Snoozed {formatUntil(settings.snoozedUntil!)}</span>
            <Button variant="ghost" onClick={clearSnooze}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="qc-snooze-opts">
            <button type="button" className="qc-btn" onClick={() => snooze("30m")}>
              30 min
            </button>
            <button type="button" className="qc-btn" onClick={() => snooze("1h")}>
              1 hour
            </button>
            <button type="button" className="qc-btn" onClick={() => snooze("tomorrow")}>
              Until tomorrow
            </button>
          </div>
        )}
      </div>

      <KeywordManager />
    </div>
  );
}

function KeywordManager() {
  const toast = useToast();
  const [keywords, setKeywords] = useState<NotificationKeywordDto[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchKeywords()
      .then((k) => {
        if (alive) setKeywords(k);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const add = async () => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (value.length > 64) {
      toast.error({ title: "Keyword too long (max 64)" });
      return;
    }
    if (keywords.some((k) => k.keyword === value)) {
      setDraft("");
      return; // client-side dedupe
    }
    setDraft("");
    try {
      const created = await addKeywordApi(value);
      setKeywords((list) => (list.some((k) => k.id === created.id) ? list : [...list, created]));
    } catch {
      toast.error({ title: "Couldn't add keyword" });
    }
  };

  const remove = async (id: string) => {
    const prev = keywords;
    setKeywords((list) => list.filter((k) => k.id !== id));
    try {
      await removeKeywordApi(id);
    } catch {
      setKeywords(prev);
      toast.error({ title: "Couldn't remove keyword" });
    }
  };

  return (
    <div data-testid="keyword-manager">
      <div className="qc-nset__label">KEYWORDS</div>
      <div className="qc-nset__d">
        Get alerted when a message contains these (word-boundary, case-insensitive).
      </div>
      {keywords.length === 0 ? (
        <p className="qc-nset__hint">No keywords yet.</p>
      ) : (
        <div className="qc-chips">
          {keywords.map((k) => (
            <span key={k.id} className="qc-chip">
              {k.keyword}
              <button
                type="button"
                className="qc-chip__x"
                aria-label={`Remove ${k.keyword}`}
                onClick={() => void remove(k.id)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="qc-kw-add">
        <Input
          placeholder="Add a keyword…"
          maxLength={64}
          aria-label="Add a keyword"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <Button variant="primary" onClick={() => void add()}>
          Add
        </Button>
      </div>
    </div>
  );
}
