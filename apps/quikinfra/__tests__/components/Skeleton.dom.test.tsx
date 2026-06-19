// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Skeleton,
  TableRowSkeleton,
  TableSkeleton,
  CardSkeleton,
  CardRowSkeleton,
} from "@/components/ui/Skeleton";

describe("Skeleton re-exports from @quikit/ui", () => {
  it("Skeleton renders a pulsing block", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("animate-pulse");
  });

  it("TableRowSkeleton renders the requested number of cells", () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton cols={4} />
        </tbody>
      </table>,
    );
    expect(container.querySelectorAll("td").length).toBe(4);
  });

  it("TableSkeleton renders the requested rows x cols", () => {
    const { container } = render(<TableSkeleton rows={3} cols={2} />);
    expect(container.querySelectorAll("tr").length).toBe(3);
    expect(container.querySelectorAll("td").length).toBe(3 * 2);
  });

  it("CardSkeleton renders without crashing", () => {
    const { container } = render(<CardSkeleton />);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it("CardRowSkeleton renders the requested number of cards", () => {
    const { container } = render(<CardRowSkeleton count={3} />);
    // each card is a direct child of the grid wrapper
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.children.length).toBe(3);
  });
});
