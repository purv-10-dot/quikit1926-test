// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhotoAttachmentsCard } from "@/components/PhotoAttachmentsCard";

describe("PhotoAttachmentsCard", () => {
  it("renders nothing when raw is null/empty", () => {
    const { container } = render(<PhotoAttachmentsCard title="Photos" raw={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when raw only holds placeholder dashes", () => {
    const { container } = render(<PhotoAttachmentsCard title="Photos" raw="—, —" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title with the usable URL count", () => {
    render(
      <PhotoAttachmentsCard
        title="Site Photos"
        raw="https://x.test/a.jpg, https://x.test/b.jpg"
      />,
    );
    expect(screen.getByText("Site Photos (2)")).toBeInTheDocument();
  });

  it("thumbnails variant renders an <img> for each image URL inside an open-in-new link", () => {
    render(
      <PhotoAttachmentsCard
        title="Photos"
        raw="https://x.test/a.jpg, https://x.test/b.png"
      />,
    );
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://x.test/a.jpg");
    expect(links[0]).toHaveAttribute("target", "_blank");
  });

  it("compact variant renders paperclip links using the filename", () => {
    render(
      <PhotoAttachmentsCard
        title="Docs"
        raw="https://x.test/path/report.pdf"
        variant="compact"
      />,
    );
    const link = screen.getByRole("link", { name: /report\.pdf/i });
    expect(link).toHaveAttribute("href", "https://x.test/path/report.pdf");
  });

  it("renders a non-openable legacy filename as static text (not a link)", () => {
    render(
      <PhotoAttachmentsCard title="Docs" raw="old-legacy-file.jpg" variant="compact" />,
    );
    expect(screen.getByText("old-legacy-file.jpg")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
