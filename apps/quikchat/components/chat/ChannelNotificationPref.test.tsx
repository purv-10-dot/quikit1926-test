import type { NotificationPreferenceDto } from "@/lib/shared";
import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  fetchChannelNotificationPreference: vi.fn(),
  patchChannelNotificationPreference: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchChannelNotificationPreference: (...a: unknown[]) =>
    api.fetchChannelNotificationPreference(...a),
  patchChannelNotificationPreference: (...a: unknown[]) =>
    api.patchChannelNotificationPreference(...a),
}));

import { ChannelNotificationPref } from "./ChannelNotificationPref";

function pref(over: Partial<NotificationPreferenceDto> = {}): NotificationPreferenceDto {
  return { channelId: "c1", level: null, mutedUntil: null, ...over };
}

function renderPref() {
  return render(
    <ToastProvider>
      <ChannelNotificationPref channelId="c1" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  api.fetchChannelNotificationPreference.mockResolvedValue(pref());
  api.patchChannelNotificationPreference.mockImplementation(async (_c, p) => pref(p as object));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChannelNotificationPref", () => {
  it("GETs the preference on open and shows the inherit affordance when there's no override", async () => {
    renderPref();
    await screen.findByTestId("channel-notif-pref");
    expect(api.fetchChannelNotificationPreference).toHaveBeenCalledWith("c1");
    expect(screen.getByText("No override — using your default")).toBeInTheDocument();
  });

  it("changing the level PATCHes {level}", async () => {
    renderPref();
    await screen.findByTestId("channel-notif-pref");
    fireEvent.click(screen.getByRole("radio", { name: "Mentions" }));
    expect(api.patchChannelNotificationPreference).toHaveBeenCalledWith("c1", {
      level: "mentions",
    });
  });

  it("a mute quick-option PATCHes {mutedUntil}; Unmute sends null", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    api.patchChannelNotificationPreference.mockResolvedValueOnce(pref({ mutedUntil: future }));
    renderPref();
    await screen.findByTestId("channel-notif-pref");
    fireEvent.click(screen.getByText("1 hour"));
    expect(api.patchChannelNotificationPreference).toHaveBeenCalledWith("c1", {
      mutedUntil: expect.any(String),
    });
    const unmute = await screen.findByText("Unmute");
    fireEvent.click(unmute);
    expect(api.patchChannelNotificationPreference).toHaveBeenCalledWith("c1", { mutedUntil: null });
  });

  it("shows the active muted state when the preference is muted", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    api.fetchChannelNotificationPreference.mockResolvedValue(pref({ mutedUntil: future }));
    renderPref();
    expect(await screen.findByText(/Muted until/)).toBeInTheDocument();
  });
});
