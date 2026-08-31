// @vitest-environment jsdom
/**
 * The avatar menu names the organisation the session is working in, directly
 * above Sign out.
 *
 * The load-bearing property is that it is DISPLAY ONLY. QuikTrack has no org
 * switcher — a session carries exactly one `orgId` claim — so the row must
 * never be a button, a menuitem, or anything else that reads as pressable.
 * Rendering it via the shared UserMenu's `items` prop would have made it one,
 * which is why this app has its own menu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setSession } from "../setup";
import { UserMenuWithOrg } from "@/components/shell/user-menu-with-org";

const USER = { name: "Pravin Sharma", email: "pravin.sharma@quikit.ai" };

function accessPayload(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      isOrgAdmin: true,
      isAppAdmin: false,
      isAdmin: true,
      hasProjects: true,
      projectCount: 3,
      canCreateProject: true,
      orgName: "MoreYeahs",
      roleName: null,
      adminEmails: [],
      ...over,
    },
  };
}

function stubAccess(payload: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => payload }) as unknown as Response),
  );
}

function renderMenu(onSignOut = vi.fn()) {
  // A fresh client per test: the hook shares the NoAccessGate's cache key, so a
  // reused client would leak one test's org into the next.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <UserMenuWithOrg user={USER} onSignOut={onSignOut} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setSession({ id: "u1", orgId: "org_1", role: "admin" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Open the dropdown. */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Pravin Sharma/ }));
}

describe("UserMenuWithOrg", () => {
  it("names the active organisation once the menu is open", async () => {
    stubAccess(accessPayload());
    renderMenu();
    openMenu();

    expect(await screen.findByText("MoreYeahs")).toBeTruthy();
    expect(screen.getByText("Organization")).toBeTruthy();
    // Role, humanised from the access summary.
    expect(screen.getByText("Org admin")).toBeTruthy();
  });

  it("renders the organisation ABOVE Sign out", async () => {
    stubAccess(accessPayload());
    renderMenu();
    openMenu();

    const org = await screen.findByText("MoreYeahs");
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    // Node.compareDocumentPosition: FOLLOWING (4) means signOut comes after org.
    expect(org.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is display-only — the org is not a button or menu item", async () => {
    stubAccess(accessPayload());
    renderMenu();
    openMenu();

    const org = await screen.findByText("MoreYeahs");
    expect(org.closest("button")).toBeNull();
    expect(org.closest('[role="menuitem"]')).toBeNull();
    // Sign out is the ONLY actionable row in the dropdown.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("shows no organisation row when the lookup fails", async () => {
    stubAccess({ success: false }, false);
    renderMenu();
    openMenu();

    // The menu still works; it just doesn't claim to know the workspace.
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Organization")).toBeNull());
  });

  it("omits the role line when the summary has no role", async () => {
    stubAccess(accessPayload({ isOrgAdmin: false, roleName: null }));
    renderMenu();
    openMenu();

    expect(await screen.findByText("MoreYeahs")).toBeTruthy();
    expect(screen.queryByText("Org admin")).toBeNull();
  });

  it("humanises a stored role slug", async () => {
    stubAccess(accessPayload({ isOrgAdmin: false, roleName: "space_creator" }));
    renderMenu();
    openMenu();

    expect(await screen.findByText("Space creator")).toBeTruthy();
  });

  it("still signs out", async () => {
    const onSignOut = vi.fn();
    stubAccess(accessPayload());
    renderMenu(onSignOut);
    openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
