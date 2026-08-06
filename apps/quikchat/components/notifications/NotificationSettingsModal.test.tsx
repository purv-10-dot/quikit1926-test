import type { NotificationSettingsDto } from "@/lib/shared";
import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  fetchNotificationSettings: vi.fn(),
  patchNotificationSettings: vi.fn(),
  fetchKeywords: vi.fn(),
  addKeywordApi: vi.fn(),
  removeKeywordApi: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchNotificationSettings: (...a: unknown[]) => api.fetchNotificationSettings(...a),
  patchNotificationSettings: (...a: unknown[]) => api.patchNotificationSettings(...a),
  fetchKeywords: (...a: unknown[]) => api.fetchKeywords(...a),
  addKeywordApi: (...a: unknown[]) => api.addKeywordApi(...a),
  removeKeywordApi: (...a: unknown[]) => api.removeKeywordApi(...a),
}));

const nctx = {
  osPermission: "default" as string,
  requestOsPermission: vi.fn(async () => undefined),
};
vi.mock("./NotificationProvider", () => ({ useNotifications: () => nctx }));

import { NotificationSettingsModal } from "./NotificationSettingsModal";

function settings(over: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    defaultChannelLevel: "all",
    dmsLevel: "all",
    soundEnabled: true,
    callSoundsEnabled: true,
    desktopEnabled: false,
    emailEnabled: false,
    dndEnabled: false,
    dndStart: null,
    dndEnd: null,
    snoozedUntil: null,
    priorityDuringDnd: true,
    ...over,
  };
}

function renderModal() {
  return render(
    <ToastProvider>
      <NotificationSettingsModal open onClose={() => {}} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  nctx.osPermission = "default";
  nctx.requestOsPermission = vi.fn(async () => undefined);
  api.fetchNotificationSettings.mockResolvedValue(settings());
  api.patchNotificationSettings.mockImplementation(async (p) => settings(p as object));
  api.fetchKeywords.mockResolvedValue([]);
  api.addKeywordApi.mockImplementation(async (kw: string) => ({
    id: "k1",
    keyword: kw,
    createdAt: new Date().toISOString(),
  }));
  api.removeKeywordApi.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("settings form", () => {
  it("renders every section inside a scroll container so all are reachable (Bug 4)", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    // Top section (LEVELS) AND the bottom-most control (keyword input) both present.
    expect(screen.getByText("Default channel")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a keyword")).toBeInTheDocument();
    // The modal body is the scroll container (overflow-y:auto + flex:1/min-height:0 in CSS).
    expect(document.querySelector(".qc-modal-body")).not.toBeNull();
  });

  it("renders the current DTO", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    const row = screen.getByText("Default channel").closest(".qc-nset__row")!;
    expect(within(row as HTMLElement).getByRole("radio", { name: "All" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("changing the default level PATCHes that field", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    const row = screen.getByText("Default channel").closest(".qc-nset__row")!;
    fireEvent.click(within(row as HTMLElement).getByRole("radio", { name: "Mentions" }));
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({ defaultChannelLevel: "mentions" });
  });

  it("toggling Sound PATCHes soundEnabled", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({ soundEnabled: false });
  });

  // Call sounds are an independent toggle — muting message chimes must not mute
  // ringtones, and vice versa.
  it("toggling Call sounds PATCHes callSoundsEnabled alone", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByRole("switch", { name: "Call sounds" }));
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({ callSoundsEnabled: false });
    expect(api.patchNotificationSettings).toHaveBeenCalledTimes(1);
  });

  it("Sound and Call sounds render as separate switches", async () => {
    api.fetchNotificationSettings.mockResolvedValue(
      settings({ soundEnabled: true, callSoundsEnabled: false }),
    );
    renderModal();
    await screen.findByTestId("notification-settings");
    expect(screen.getByRole("switch", { name: "Sound" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Call sounds" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("enabling DND seeds both quiet-hour times", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByRole("switch", { name: "Quiet hours" }));
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({
      dndEnabled: true,
      dndStart: "22:00",
      dndEnd: "07:00",
    });
  });

  it("a snooze quick-option PATCHes an ISO snoozedUntil; Clear sends null", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    api.patchNotificationSettings.mockResolvedValueOnce(settings({ snoozedUntil: future }));
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByText("1 hour"));
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({
      snoozedUntil: expect.any(String),
    });
    // Reconciled into the active state → Clear sends null.
    const clear = await screen.findByText("Clear");
    fireEvent.click(clear);
    expect(api.patchNotificationSettings).toHaveBeenCalledWith({ snoozedUntil: null });
  });

  it("on PATCH failure it reverts and toasts", async () => {
    api.patchNotificationSettings.mockRejectedValueOnce(new Error("boom"));
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(await screen.findByText("Couldn't save — reverted")).toBeInTheDocument();
  });
});

describe("desktop toggle permission path", () => {
  it("requests OS permission when turned on", async () => {
    renderModal();
    await screen.findByTestId("notification-settings");
    fireEvent.click(screen.getByRole("switch", { name: "Desktop notifications" }));
    expect(nctx.requestOsPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith({ desktopEnabled: true }),
    );
  });

  it("shows a blocked hint when desktop is on but permission is denied", async () => {
    nctx.osPermission = "denied";
    api.fetchNotificationSettings.mockResolvedValue(settings({ desktopEnabled: true }));
    renderModal();
    await screen.findByTestId("notification-settings");
    expect(screen.getByText(/Blocked in your browser/)).toBeInTheDocument();
  });
});

describe("keyword manager", () => {
  it("shows the empty state and adds a trimmed/lowercased keyword", async () => {
    renderModal();
    await screen.findByTestId("keyword-manager");
    expect(screen.getByText("No keywords yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Add a keyword"), { target: { value: "  Deploy  " } });
    fireEvent.click(screen.getByText("Add"));
    expect(api.addKeywordApi).toHaveBeenCalledWith("deploy");
  });

  it("lists keywords and removes one", async () => {
    api.fetchKeywords.mockResolvedValue([
      { id: "k1", keyword: "deploy", createdAt: new Date().toISOString() },
    ]);
    renderModal();
    expect(await screen.findByText("deploy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove deploy" }));
    expect(api.removeKeywordApi).toHaveBeenCalledWith("k1");
  });
});
