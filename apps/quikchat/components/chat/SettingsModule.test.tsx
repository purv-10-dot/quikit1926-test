import type { NotificationSettingsDto } from "@/lib/shared";
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controllable admin signal — the same hook the component reads.
const perms = { isAdmin: false };
vi.mock("@/lib/authz/useMyPermissions", () => ({
  useMyPermissions: () => perms,
}));

// Stub the admin surface so the test stays hermetic (real RolesTab fetches
// /api/org/roles). We only assert it mounts in-panel, not its internals.
vi.mock("@/app/(dashboard)/settings/roles/components/RolesTab", () => ({
  RolesTab: () => <div data-testid="roles-tab-stub" />,
}));

// The notifications section renders the real NotificationSettingsPanel inline,
// which fetches its settings + keywords on mount and reads the notification
// context. Mock both so this suite stays hermetic.
const api = {
  fetchNotificationSettings: vi.fn(),
  patchNotificationSettings: vi.fn(),
  fetchKeywords: vi.fn(),
  addKeywordApi: vi.fn(),
  removeKeywordApi: vi.fn(),
  // The Privacy panel's "Share my last seen" switch is really persisted, so the
  // module reads presence on mount and writes on toggle.
  fetchMyPresence: vi.fn(),
  updateMyPresence: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchNotificationSettings: (...a: unknown[]) => api.fetchNotificationSettings(...a),
  patchNotificationSettings: (...a: unknown[]) => api.patchNotificationSettings(...a),
  fetchKeywords: (...a: unknown[]) => api.fetchKeywords(...a),
  addKeywordApi: (...a: unknown[]) => api.addKeywordApi(...a),
  removeKeywordApi: (...a: unknown[]) => api.removeKeywordApi(...a),
  fetchMyPresence: (...a: unknown[]) => api.fetchMyPresence(...a),
  updateMyPresence: (...a: unknown[]) => api.updateMyPresence(...a),
}));
vi.mock("@/components/notifications/NotificationProvider", () => ({
  useNotifications: () => ({
    osPermission: "default",
    requestOsPermission: vi.fn(async () => undefined),
  }),
}));

import { SettingsModule } from "./SettingsModule";

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

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsModule currentUserId="u1" displayName="Alice" />
    </ToastProvider>,
  );
}

const openNotifications = () =>
  fireEvent.click(screen.getByRole("button", { name: /Notifications and activity/i }));

beforeEach(() => {
  perms.isAdmin = false;
  api.fetchNotificationSettings.mockResolvedValue(settings());
  api.patchNotificationSettings.mockImplementation(async (p) => settings(p as object));
  api.fetchKeywords.mockResolvedValue([]);
  api.fetchMyPresence.mockResolvedValue({
    status: "available",
    statusMessage: null,
    statusExpiresAt: null,
    shareLastSeen: true,
  });
  api.updateMyPresence.mockImplementation(async (p) => ({
    status: "available",
    statusMessage: null,
    statusExpiresAt: null,
    shareLastSeen: true,
    ...(p as object),
  }));
});
afterEach(() => {
  vi.clearAllMocks();
});

// The settings page shows the controls itself; only the floating surfaces (the
// Activity gear / the bell) still open them in a dialog.
describe("SettingsModule — notifications section is inline", () => {
  it("renders the controls directly, with no Manage button", async () => {
    renderSettings();
    // Not mounted until the section is active (no stray fetch on the general tab).
    expect(api.fetchNotificationSettings).not.toHaveBeenCalled();

    openNotifications();

    expect(await screen.findByTestId("notification-settings")).toBeInTheDocument();
    expect(screen.getByTestId("keyword-manager")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Manage$/i })).not.toBeInTheDocument();
  });

  it("the inline controls are live — toggling one persists", async () => {
    renderSettings();
    openNotifications();
    await screen.findByTestId("notification-settings");

    fireEvent.click(screen.getByLabelText("Email"));

    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith({ emailEnabled: true }),
    );
  });
});

function presence(shareLastSeen: boolean) {
  return { status: "available", statusMessage: null, statusExpiresAt: null, shareLastSeen };
}

describe("SettingsModule — Privacy: share my last seen", () => {
  const openPrivacy = () => fireEvent.click(screen.getByRole("button", { name: /Privacy/i }));

  it("reflects the persisted value from the server", async () => {
    api.fetchMyPresence.mockResolvedValue({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: false,
    });
    renderSettings();
    openPrivacy();
    await waitFor(() =>
      expect(screen.getByLabelText("Share my last seen")).not.toBeChecked(),
    );
  });

  it("persists the toggle as a privacy-only patch (no status restated)", async () => {
    renderSettings();
    openPrivacy();
    await waitFor(() => expect(screen.getByLabelText("Share my last seen")).toBeChecked());

    fireEvent.click(screen.getByLabelText("Share my last seen"));

    await waitFor(() =>
      expect(api.updateMyPresence).toHaveBeenCalledWith({ shareLastSeen: false }),
    );
  });

  it("reverts the switch when the write fails", async () => {
    api.updateMyPresence.mockRejectedValue(new Error("offline"));
    renderSettings();
    openPrivacy();
    await waitFor(() => expect(screen.getByLabelText("Share my last seen")).toBeChecked());

    fireEvent.click(screen.getByLabelText("Share my last seen"));

    await waitFor(() => expect(screen.getByLabelText("Share my last seen")).toBeChecked());
  });

  it("a click before the seed GET resolves survives the late response", async () => {
    // Hold the mount seed open — nothing resolves it until the test says so.
    let resolveSeed!: (v: ReturnType<typeof presence>) => void;
    // Reset first: `vi.clearAllMocks()` in afterEach clears call history but
    // NOT a queued mockImplementationOnce/mockResolvedValueOnce left unconsumed
    // by a differently-shaped code path in another test — this test needs a
    // clean queue, not just a clean call log.
    api.fetchMyPresence.mockReset();
    api.fetchMyPresence.mockImplementation(
      () => new Promise((resolve) => { resolveSeed = resolve; }),
    );
    renderSettings();
    openPrivacy();
    // Still the useState default — the seed hasn't landed yet.
    expect(screen.getByLabelText("Share my last seen")).toBeChecked();

    fireEvent.click(screen.getByLabelText("Share my last seen"));
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();

    // The seed finally lands, carrying the OLD (pre-click) server value. Before
    // the fix, this overwrote the optimistic flip — the actual bug.
    await act(async () => {
      resolveSeed(presence(true));
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();
  });

  it("a click after the seed has already landed behaves normally", async () => {
    renderSettings();
    openPrivacy();
    // Wait for the seed to actually resolve before touching the switch — the
    // non-racing path this fix must leave alone.
    await waitFor(() => expect(api.fetchMyPresence).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Share my last seen")).toBeChecked());

    fireEvent.click(screen.getByLabelText("Share my last seen"));

    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();
    await waitFor(() =>
      expect(api.updateMyPresence).toHaveBeenCalledWith({ shareLastSeen: false }),
    );
  });

  it("a failed PUT reverts to the server's ACTUAL value, not a guessed inverse", async () => {
    // The mount seed never resolves during this test, so the switch is still
    // showing its useState default (true) when the click happens — an
    // unverified guess. The PUT then fails, and the recovery re-fetch reports
    // the real current value: false. A naive `!next` revert (`!false` = true)
    // would flip the switch back to true here — wrong, and indistinguishable
    // from correct ONLY when the guess happens to match reality, which this
    // test deliberately avoids by making them differ.
    // See the comment in the test above — clear the queue, not just the log,
    // so an unconsumed entry here can't leak into whichever test runs next.
    api.fetchMyPresence.mockReset();
    api.fetchMyPresence
      .mockImplementationOnce(() => new Promise(() => {})) // mount seed: never lands
      .mockResolvedValueOnce(presence(false)); // recovery re-fetch after the failed PUT
    api.updateMyPresence.mockRejectedValue(new Error("offline"));

    renderSettings();
    openPrivacy();
    expect(screen.getByLabelText("Share my last seen")).toBeChecked();

    fireEvent.click(screen.getByLabelText("Share my last seen"));
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();

    await waitFor(() => expect(api.fetchMyPresence).toHaveBeenCalledTimes(2));
    // Must still read unchecked — a naive `!next` revert would have flipped it
    // back to checked instead.
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();
  });

  it("StrictMode's double mount-GET does not clobber a click made before either resolves", async () => {
    const resolvers: Array<(v: ReturnType<typeof presence>) => void> = [];
    api.fetchMyPresence.mockReset();
    api.fetchMyPresence.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); }),
    );
    render(
      <StrictMode>
        <ToastProvider>
          <SettingsModule currentUserId="u1" displayName="Alice" />
        </ToastProvider>
      </StrictMode>,
    );
    openPrivacy();
    // StrictMode double-invokes the mount effect in dev — two GETs in flight,
    // matching next.config.js's reactStrictMode: true.
    await waitFor(() => expect(resolvers.length).toBe(2));

    fireEvent.click(screen.getByLabelText("Share my last seen"));
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();

    // Both late GETs land with the OLD value — neither may clobber the click.
    await act(async () => {
      resolvers.forEach((resolve) => resolve(presence(true)));
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Share my last seen")).not.toBeChecked();
  });
});

describe("SettingsModule — Roles & Permissions (admin-only)", () => {
  it("hides the nav item for non-admins", () => {
    perms.isAdmin = false;
    renderSettings();
    expect(
      screen.queryByRole("button", { name: /Roles & Permissions/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the nav item for admins", () => {
    perms.isAdmin = true;
    renderSettings();
    expect(
      screen.getByRole("button", { name: /Roles & Permissions/i }),
    ).toBeInTheDocument();
  });

  it("renders RolesTab in-panel when the admin selects the section", () => {
    perms.isAdmin = true;
    renderSettings();
    // Not mounted until the section is active.
    expect(screen.queryByTestId("roles-tab-stub")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Roles & Permissions/i }));
    expect(screen.getByTestId("roles-tab-stub")).toBeInTheDocument();
  });
});
