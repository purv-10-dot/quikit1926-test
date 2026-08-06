// @vitest-environment jsdom
//
// Regression: a Space Admin (project-scoped full-access role) must be able to
// change other members' project roles. The bug gated the editable RolePicker on
// `perms.isAdmin` (tenant/super admin only), so a Space Admin — whose effective
// permission set already includes `ProjectMember:update` and whom the backend
// PATCH .../members/[userId]/role already authorizes — saw a read-only lock
// instead of the dropdown. The gate must accept `ProjectMember:update`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MyProjectPermissionsApi } from "@/lib/hooks/useMyProjectPermissions";

// Mock the project-permissions hook — the unit under test is the members-tab
// gate logic, not the fetch plumbing (that hook has its own coverage).
const permsMock = vi.fn<() => MyProjectPermissionsApi>();
vi.mock("@/lib/hooks/useMyProjectPermissions", () => ({
  useMyProjectPermissions: () => permsMock(),
}));

import { MembersTab } from "@/app/(dashboard)/spaces/[id]/settings/user-management/_components/members-tab";

// One member row so the Project Role cell renders.
const MEMBER = {
  id: "m1",
  userId: "u1",
  role: "MEMBER",
  projectRoleId: null,
  projectRole: null,
  status: "active",
  joinedAt: "2026-07-21T00:00:00.000Z",
  user: {
    id: "u1",
    firstName: "Vishal",
    lastName: "Bhat",
    email: "vishal.bhat@moreyeahs.com",
    avatar: null,
    lastSignInAt: null,
  },
};

function mockFetch() {
  global.fetch = vi.fn((url: string) => {
    const body = url.includes("/roles")
      ? { success: true, data: [] }
      : { success: true, data: { members: [MEMBER] } };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

function perms(over: Partial<MyProjectPermissionsApi>): MyProjectPermissionsApi {
  return {
    isAdmin: false,
    loading: false,
    has: () => false,
    ...over,
  };
}

// MembersTab uses react-query (useQuery/useMutation) — provide a client with
// retries off so the mocked fetch resolves synchronously in tests.
function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MembersTab projectId="p1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch();
});

describe("<MembersTab /> role-picker gate", () => {
  it("shows the editable role picker for a Space Admin (has ProjectMember:update, not tenant admin)", async () => {
    permsMock.mockReturnValue(
      perms({
        isAdmin: false,
        has: (r, a) => r === "ProjectMember" && a === "update",
      }),
    );
    renderTab();

    // The RolePicker trigger is the only listbox-popup button in the row.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /unassigned/i }),
      ).toHaveAttribute("aria-haspopup", "listbox");
    });
    // And the read-only lock affordance must NOT be present.
    expect(
      screen.queryByTitle(/don't have permission to change member roles/i),
    ).not.toBeInTheDocument();
  });

  it("still shows the editable picker for a tenant/app admin", async () => {
    permsMock.mockReturnValue(perms({ isAdmin: true, has: () => true }));
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /unassigned/i }),
      ).toHaveAttribute("aria-haspopup", "listbox");
    });
  });

  it("shows the read-only lock for a member WITHOUT ProjectMember:update", async () => {
    permsMock.mockReturnValue(perms({ isAdmin: false, has: () => false }));
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByTitle(/don't have permission to change member roles/i),
      ).toBeInTheDocument();
    });
    // No editable picker for them.
    expect(
      screen.queryByRole("button", { name: /unassigned/i }),
    ).not.toBeInTheDocument();
  });
});
