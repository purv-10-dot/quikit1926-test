// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HiddenColsPill } from "@/components/table/HiddenColsPill";

const LABELS = {
  name: "Name",
  owner: "Owner",
  team: "Team",
  target: "Target",
};

describe("HiddenColsPill", () => {
  it("renders nothing when no columns are hidden", () => {
    const { container } = render(
      <HiddenColsPill hiddenCols={[]} colLabels={LABELS} onRestore={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a count badge for the number of hidden columns", () => {
    render(
      <HiddenColsPill
        hiddenCols={["owner", "team"]}
        colLabels={LABELS}
        onRestore={() => {}}
      />
    );
    expect(screen.getByText(/Hidden \(2\)/i)).toBeInTheDocument();
  });

  it("dropdown is closed by default — no column labels visible", () => {
    render(
      <HiddenColsPill
        hiddenCols={["owner"]}
        colLabels={LABELS}
        onRestore={() => {}}
      />
    );
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("clicking the pill opens the dropdown and shows column labels", () => {
    render(
      <HiddenColsPill
        hiddenCols={["owner", "team"]}
        colLabels={LABELS}
        onRestore={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hidden \(/i }));
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("clicking a column label fires onRestore with the column key", () => {
    const onRestore = vi.fn();
    render(
      <HiddenColsPill
        hiddenCols={["owner", "team"]}
        colLabels={LABELS}
        onRestore={onRestore}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hidden \(/i }));
    fireEvent.click(screen.getByText("Owner"));
    expect(onRestore).toHaveBeenCalledWith("owner");
  });

  it("'Show all' button appears only when there are ≥2 hidden cols AND onRestoreAll is provided", () => {
    const onRestoreAll = vi.fn();
    render(
      <HiddenColsPill
        hiddenCols={["owner", "team"]}
        colLabels={LABELS}
        onRestore={() => {}}
        onRestoreAll={onRestoreAll}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hidden \(/i }));
    const showAll = screen.getByText(/show all/i);
    expect(showAll).toBeInTheDocument();
    fireEvent.click(showAll);
    expect(onRestoreAll).toHaveBeenCalled();
  });

  it("'Show all' button is hidden when only one column is hidden", () => {
    render(
      <HiddenColsPill
        hiddenCols={["owner"]}
        colLabels={LABELS}
        onRestore={() => {}}
        onRestoreAll={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hidden \(/i }));
    expect(screen.queryByText(/show all/i)).not.toBeInTheDocument();
  });

  it("falls back to the column key when no label is provided", () => {
    render(
      <HiddenColsPill
        hiddenCols={["unlabeled"]}
        colLabels={{}}
        onRestore={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Hidden \(/i }));
    expect(screen.getByText("unlabeled")).toBeInTheDocument();
  });
});
