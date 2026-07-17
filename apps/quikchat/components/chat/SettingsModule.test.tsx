import { fireEvent, render, screen } from "@testing-library/react";
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

import { SettingsModule } from "./SettingsModule";

function renderSettings() {
  return render(<SettingsModule currentUserId="u1" displayName="Alice" />);
}

beforeEach(() => {
  perms.isAdmin = false;
});
afterEach(() => {
  vi.clearAllMocks();
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
