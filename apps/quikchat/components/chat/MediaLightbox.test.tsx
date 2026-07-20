import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaLightbox, type LightboxItem } from "./MediaLightbox";

const items: LightboxItem[] = [
  { url: "/img1.png", mediaType: "image/png", originalName: "one.png" },
  { url: "/clip.mp4", mediaType: "video/mp4", originalName: "two.mp4" },
];

describe("MediaLightbox", () => {
  it("renders an image and a download link", () => {
    render(<MediaLightbox items={items} index={0} onIndex={() => {}} onClose={() => {}} />);
    expect(screen.getByAltText("one.png")).toBeInTheDocument();
    const dl = screen.getByText("Download") as HTMLAnchorElement;
    expect(dl.getAttribute("href")).toBe("/img1.png");
  });

  it("renders a <video> for a video item", () => {
    const { container } = render(
      <MediaLightbox items={items} index={1} onIndex={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelector("video")?.getAttribute("src")).toBe("/clip.mp4");
  });

  it("prev/next cycle through the gallery", () => {
    const onIndex = vi.fn();
    render(<MediaLightbox items={items} index={0} onIndex={onIndex} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Next"));
    expect(onIndex).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText("Previous"));
    expect(onIndex).toHaveBeenCalledWith(1); // (0 - 1 + 2) % 2 = 1
  });

  it("closes on Escape and on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MediaLightbox items={items} index={0} onIndex={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.querySelector(".qc-lightbox")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not show nav with a single item", () => {
    render(<MediaLightbox items={[items[0]!]} index={0} onIndex={() => {}} onClose={() => {}} />);
    expect(screen.queryByLabelText("Next")).not.toBeInTheDocument();
  });

  it("renders a PDF in an iframe with a Download link (Bug 3)", () => {
    const pdf: LightboxItem = {
      url: "/doc.pdf",
      mediaType: "application/pdf",
      originalName: "spec.pdf",
    };
    const { container } = render(
      <MediaLightbox items={[pdf]} index={0} onIndex={() => {}} onClose={() => {}} />,
    );
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("/doc.pdf");
    expect((screen.getByText("Download") as HTMLAnchorElement).getAttribute("href")).toBe(
      "/doc.pdf",
    );
  });
});
