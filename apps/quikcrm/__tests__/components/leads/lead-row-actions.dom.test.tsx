// @vitest-environment jsdom
/**
 * Verifies the Leads-grid row actions consolidated into a single three-dot (⋮)
 * menu: the former standalone Log + Call columns are gone, and Log Activity /
 * Call / Delete (active) or Restore / Permanently delete (trash) live in the
 * dropdown.
 *
 * Assertions use plain DOM queries (toBeTruthy / null) rather than jest-dom
 * matchers so the suite doesn't depend on the matcher registration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadRowActions } from "@/components/leads/lead-row-actions";
import type { LeadRow } from "@/components/leads/lead-table";

afterEach(() => cleanup());

const lead: LeadRow = {
  id: "lead-1",
  name: "Acme Corp",
  email: "a@acme.test",
  phone: "+919876543210",
  company: "Acme",
  stage: "New",
  status: "Open",
  score: 0,
  ownerName: "Owner",
  isStarred: false,
};

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Actions for Acme Corp/i }));
}

describe("LeadRowActions — active row", () => {
  it("renders a single three-dot trigger (no inline Log/Call buttons)", () => {
    render(
      <LeadRowActions
        lead={lead}
        viewTrash={false}
        isAdmin={false}
        onLogActivity={vi.fn()}
        onCall={vi.fn()}
        onLeadDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Actions for Acme Corp/i })).toBeTruthy();
    // No standalone Call icon-button exists anymore.
    expect(screen.queryByRole("button", { name: /^Call$/i })).toBeNull();
  });

  it("opens to Log Activity / Call / Delete", () => {
    render(
      <LeadRowActions
        lead={lead}
        viewTrash={false}
        isAdmin={false}
        onLogActivity={vi.fn()}
        onCall={vi.fn()}
        onLeadDelete={vi.fn()}
      />,
    );
    openMenu();
    expect(screen.getByText("Log Activity")).toBeTruthy();
    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
    // Trash-only actions must not appear on an active row.
    expect(screen.queryByText("Restore")).toBeNull();
    expect(screen.queryByText(/Permanently delete/i)).toBeNull();
  });

  it("invokes the matching callback for each item", () => {
    const onLogActivity = vi.fn();
    const onCall = vi.fn();
    const onLeadDelete = vi.fn();
    render(
      <LeadRowActions
        lead={lead}
        viewTrash={false}
        isAdmin={false}
        onLogActivity={onLogActivity}
        onCall={onCall}
        onLeadDelete={onLeadDelete}
      />,
    );

    openMenu();
    fireEvent.click(screen.getByText("Log Activity"));
    expect(onLogActivity).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByText("Call"));
    expect(onCall).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByText("Delete"));
    expect(onLeadDelete).toHaveBeenCalledTimes(1);
    expect(onLeadDelete).toHaveBeenCalledWith(lead);
  });

  it("disables Call when the lead has no phone (does not fire onCall)", () => {
    const onCall = vi.fn();
    render(
      <LeadRowActions
        lead={{ ...lead, phone: null }}
        viewTrash={false}
        isAdmin={false}
        onLogActivity={vi.fn()}
        onCall={onCall}
        onLeadDelete={vi.fn()}
      />,
    );
    openMenu();
    fireEvent.click(screen.getByText("Call"));
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("LeadRowActions — trash row", () => {
  it("shows Restore and (admin) Permanently delete, but not active actions", () => {
    render(
      <LeadRowActions
        lead={lead}
        viewTrash
        isAdmin
        onLogActivity={vi.fn()}
        onCall={vi.fn()}
        onLeadRestore={vi.fn()}
        onLeadPermanentDelete={vi.fn()}
      />,
    );
    openMenu();
    expect(screen.getByText("Restore")).toBeTruthy();
    expect(screen.getByText(/Permanently delete/i)).toBeTruthy();
    expect(screen.queryByText("Log Activity")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("hides Permanently delete for non-admins", () => {
    render(
      <LeadRowActions
        lead={lead}
        viewTrash
        isAdmin={false}
        onLogActivity={vi.fn()}
        onCall={vi.fn()}
        onLeadRestore={vi.fn()}
        onLeadPermanentDelete={vi.fn()}
      />,
    );
    openMenu();
    expect(screen.getByText("Restore")).toBeTruthy();
    expect(screen.queryByText(/Permanently delete/i)).toBeNull();
  });

  it("renders nothing when a trash row has no permitted actions", () => {
    const { container } = render(
      <LeadRowActions
        lead={lead}
        viewTrash
        isAdmin={false}
        onLogActivity={vi.fn()}
        onCall={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
