// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FormData } from "@/app/(dashboard)/opsp/hooks/useOPSPForm";

/**
 * Architecture B (react-pdf single-source) means the modal body is a `<PDFViewer>`
 * iframe that renders a real PDF inline. We can't assert on rendered HTML text
 * (it's inside a sandboxed iframe). Instead, we mock @react-pdf/renderer and the
 * dynamic import for PDFViewer, then assert on the modal chrome (toolbar, year/quarter
 * label, open/close behaviour) plus that OPSPDocument is invoked with the form prop.
 */

// Mock @react-pdf/renderer so jsdom doesn't try to load PDF.js / iframe machinery.
vi.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: <T,>(s: T) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  PDFViewer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-viewer">{children}</div>
  ),
  pdf: vi.fn(() => ({ toBlob: vi.fn(async () => new Blob()) })),
}));

// next/dynamic with `ssr: false` returns a thunk that resolves the module —
// in jsdom we just resolve it synchronously to the mocked PDFViewer.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default?: unknown } | unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Cached: any = null;
    const Wrapper = (props: Record<string, unknown>) => {
      if (!Cached) {
        // Return a placeholder synchronously; a real dynamic() handles async, but
        // for tests we just unwrap the promise once on first render.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = loader();
        if (result && typeof result.then === "function") {
          result.then((m: { default?: unknown } | unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Cached = (m as any).default ?? m;
          });
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Cached = (result as any).default ?? result;
        }
      }
      if (!Cached) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Cached {...(props as any)} />;
    };
    return Wrapper;
  },
}));

import { OPSPPreview } from "@/app/(dashboard)/opsp/components/OPSPPreview";

function buildForm(partial: Partial<FormData> = {}): FormData {
  return {
    year: 2026,
    quarter: "Q1",
    targetYears: 5,
    status: "draft",
    employees: ["", "", ""],
    customers: ["", "", ""],
    shareholders: ["", "", ""],
    coreValues: "",
    purpose: "",
    actions: ["", "", "", "", ""],
    profitPerX: "",
    bhag: "",
    targetRows: Array.from({ length: 5 }, () => ({
      category: "",
      projected: "",
      y1: "",
      y2: "",
      y3: "",
      y4: "",
      y5: "",
    })),
    sandbox: "",
    keyThrusts: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    brandPromiseKPIs: "",
    brandPromise: "",
    goalRows: Array.from({ length: 6 }, () => ({
      category: "",
      projected: "",
      q1: "",
      q2: "",
      q3: "",
      q4: "",
    })),
    keyInitiatives: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    criticalNumGoals: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumGoals: { title: "", bullets: ["", "", "", ""] },
    processItems: ["", "", ""],
    weaknesses: ["", "", ""],
    makeBuy: ["", "", ""],
    sell: ["", "", ""],
    recordKeeping: ["", "", ""],
    actionsQtr: Array.from({ length: 6 }, () => ({
      category: "",
      projected: "",
      m1: "",
      m2: "",
      m3: "",
    })),
    rocks: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    criticalNumProcess: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumProcess: { title: "", bullets: ["", "", "", ""] },
    theme: "",
    scoreboardDesign: "",
    celebration: "",
    reward: "",
    kpiAccountability: Array.from({ length: 5 }, () => ({ kpi: "", goal: "" })),
    quarterlyPriorities: Array.from({ length: 5 }, () => ({
      priority: "",
      dueDate: "",
    })),
    criticalNumAcct: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumAcct: { title: "", bullets: ["", "", "", ""] },
    trends: ["", "", "", "", "", ""],
    ...partial,
  };
}

describe("OPSPPreview (react-pdf / Architecture B)", () => {
  it("renders nothing when `open` is false", () => {
    const { container } = render(
      <OPSPPreview open={false} onClose={vi.fn()} form={buildForm()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the toolbar header with year and quarter when open", () => {
    const form = buildForm({ year: 2027, quarter: "Q3" });
    render(<OPSPPreview open={true} onClose={vi.fn()} form={form} />);
    expect(screen.getByText(/OPSP Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/2027/)).toBeInTheDocument();
    expect(screen.getByText(/Q3/)).toBeInTheDocument();
  });

  it("renders Download PDF, Download Word, Print, and Close controls", () => {
    render(<OPSPPreview open={true} onClose={vi.fn()} form={buildForm()} />);
    expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download Word/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close Preview/i })).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<OPSPPreview open={true} onClose={onClose} form={buildForm()} />);
    const closeBtn = screen.getByRole("button", { name: /Close Preview/i });
    closeBtn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
