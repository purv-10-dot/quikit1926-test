// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SpacesGrid } from "@/app/(dashboard)/spaces/_components/spaces-grid";

function mockApiResponse(rows: Array<Record<string, unknown>>, totalPages = 1) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: rows,
          total: rows.length,
          page: 1,
          pageSize: rows.length,
          totalPages,
        }),
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [],
          total: 0,
          page: 1,
          pageSize: 0,
          totalPages: 1,
        }),
    }),
  ) as unknown as typeof fetch;
});

describe("<SpacesGrid />", () => {
  it("renders the page chrome (title + Create + Templates buttons)", () => {
    render(<SpacesGrid />);
    expect(screen.getByRole("heading", { name: /spaces/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create space/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /templates/i })).toBeInTheDocument();
  });

  it("renders shimmer skeletons while loading", () => {
    render(<SpacesGrid />);
    // Shimmer rows use animate-pulse on inner divs.
    const pulses = document.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });

  it("renders an empty-state message when API returns no spaces", async () => {
    render(<SpacesGrid />);
    await waitFor(() => {
      expect(
        screen.getByText(/no spaces match your filters/i),
      ).toBeInTheDocument();
    });
  });

  it("renders rows + lead avatar when API returns spaces", async () => {
    mockApiResponse([
      {
        id: "p1",
        name: "Test 2",
        projectKey: "T2",
        projectType: "software",
        icon: "🚀",
        color: "#2563eb",
        lead: { id: "u1", firstName: "Lucky", lastName: "Jedhe", email: "lj@x.com" },
      },
    ]);

    render(<SpacesGrid />);
    await waitFor(() => {
      expect(screen.getByText("Test 2")).toBeInTheDocument();
    });
    expect(screen.getByText("T2")).toBeInTheDocument();
    expect(screen.getByText(/team-managed software/i)).toBeInTheDocument();
    expect(screen.getByText("Lucky Jedhe")).toBeInTheDocument();
  });
});
