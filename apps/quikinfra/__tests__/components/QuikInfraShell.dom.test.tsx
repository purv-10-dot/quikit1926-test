// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { setContext, makeAdminCtx } from "../setup";

// QuikInfraShell is heavily coupled: session (next-auth/react — mocked in
// setup.ts), navigation (next/navigation — mocked in setup.ts), and the
// permission hook. We mock usePermissions to a fully-loaded admin so the
// sidebar renders its nav rather than the loading skeleton. This is a
// focused render-smoke that asserts the shell chrome + a nav landmark.

const permState = {
  can: (_p: string | string[]) => true,
  hasModule: (_k: string) => true,
  canViewMenu: (_u: string | undefined) => true,
  isMenuGranted: (_u: string | undefined) => true,
  isLoading: false,
  roleKey: "admin" as string | null,
  userType: "ADMIN" as string | null,
};
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => permState,
}));

// client-logout pulls in next-auth signOut; keep it inert.
vi.mock("@/lib/auth/client-logout", () => ({ signOutAndClear: vi.fn() }));

import { QuikInfraShell } from "@/components/QuikInfraShell";

beforeEach(() => {
  setContext(makeAdminCtx());
  permState.isLoading = false;
  permState.roleKey = "admin";
  permState.hasModule = () => true;
  permState.canViewMenu = () => true;
  permState.isMenuGranted = () => true;
});

describe("QuikInfraShell (render-smoke)", () => {
  it("renders the header, a nav landmark, and the page children", () => {
    render(
      <QuikInfraShell>
        <div data-testid="page-body">Dashboard content</div>
      </QuikInfraShell>,
    );
    // Page children mount inside <main>.
    expect(screen.getByTestId("page-body")).toBeInTheDocument();
    // Sidebar nav landmark(s) exist.
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
    // Branded header / title.
    expect(screen.getAllByText(/quik infra/i).length).toBeGreaterThan(0);
  });

  it("shows the role-derived welcome label in the header", () => {
    render(
      <QuikInfraShell>
        <div>child</div>
      </QuikInfraShell>,
    );
    // roleKey "admin" → formatRoleNameFromDB → "Admin"
    expect(screen.getByText(/welcome, admin!/i)).toBeInTheDocument();
  });

  it("renders top-level nav groups for an unrestricted admin", () => {
    render(
      <QuikInfraShell>
        <div>child</div>
      </QuikInfraShell>,
    );
    // A couple of stable nav entries from CONSTRUCTION_NAV.
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Masters")).toBeInTheDocument();
    expect(screen.getByText("Project Mgmt")).toBeInTheDocument();
  });

  it("renders the menu search box", () => {
    render(
      <QuikInfraShell>
        <div>child</div>
      </QuikInfraShell>,
    );
    expect(screen.getByLabelText(/search navigation/i)).toBeInTheDocument();
  });

  // Regression: Projects renders in the MASTERS sidebar group, but
  // `construction.project` belongs to the project_mgmt module. Granting
  // Projects alone left the whole Masters group hidden, so the grant had no
  // visible effect. A module-denied group must survive on an explicit
  // per-page grant.
  it("keeps a module-denied group when one page inside it is granted", () => {
    permState.hasModule = (k: string) => k !== "masters";
    permState.isMenuGranted = (u: string | undefined) => u === "/masters/projects";
    render(
      <QuikInfraShell>
        <div>child</div>
      </QuikInfraShell>,
    );
    expect(screen.getByText("Masters")).toBeInTheDocument();
  });

  it("drops a module-denied group when nothing inside it is granted", () => {
    permState.hasModule = (k: string) => k !== "masters";
    permState.isMenuGranted = () => false;
    render(
      <QuikInfraShell>
        <div>child</div>
      </QuikInfraShell>,
    );
    expect(screen.queryByText("Masters")).not.toBeInTheDocument();
    // unrelated groups are untouched
    expect(screen.getByText("Project Mgmt")).toBeInTheDocument();
  });
});
