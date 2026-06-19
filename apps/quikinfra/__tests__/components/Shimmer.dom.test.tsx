// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ShimmerBlock,
  TableShimmer,
  MasterPageShimmer,
} from "@/components/Shimmer";

describe("ShimmerBlock", () => {
  it("renders a div with the base shimmer classes", () => {
    const { container } = render(<ShimmerBlock />);
    const block = container.firstElementChild as HTMLElement;
    expect(block).toBeInTheDocument();
    expect(block.className).toContain("rounded-md");
    expect(block.className).toContain("bg-slate-200/70");
    // inner gradient layer carries the shimmer animation
    expect(block.querySelector(".animate-shimmer")).toBeInTheDocument();
  });

  it("appends a custom className alongside the base classes", () => {
    const { container } = render(<ShimmerBlock className="h-4 w-32" />);
    const block = container.firstElementChild as HTMLElement;
    expect(block.className).toContain("h-4");
    expect(block.className).toContain("w-32");
    expect(block.className).toContain("bg-slate-200/70");
  });
});

describe("TableShimmer", () => {
  it("renders the default 8 rows x 6 columns plus the toolbar", () => {
    const { container } = render(<TableShimmer />);
    // toolbar (5 blocks) + header (6) + body rows (8 * 6 = 48) => structural smoke
    const blocks = container.querySelectorAll(".bg-slate-200\\/70");
    expect(blocks.length).toBe(5 + 6 + 8 * 6);
  });

  it("honours custom rows/columns and hides the toolbar", () => {
    const { container } = render(
      <TableShimmer rows={2} columns={3} showToolbar={false} />,
    );
    const blocks = container.querySelectorAll(".bg-slate-200\\/70");
    // no toolbar blocks; header (3) + body (2 * 3 = 6)
    expect(blocks.length).toBe(3 + 2 * 3);
  });
});

describe("MasterPageShimmer", () => {
  it("renders without crashing and contains shimmer blocks", () => {
    const { container } = render(<MasterPageShimmer rows={2} columns={2} />);
    const blocks = container.querySelectorAll(".bg-slate-200\\/70");
    expect(blocks.length).toBeGreaterThan(0);
  });
});
