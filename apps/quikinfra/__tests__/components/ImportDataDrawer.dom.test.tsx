// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportDataDrawer } from "@/components/ImportDataDrawer";

// xlsx is dynamically imported inside parseFile(). Mock it so the parse
// stage resolves to a deterministic 2-row sheet without touching a real
// binary. The header row keys are what `sheet_to_json` would return.
vi.mock("xlsx", () => ({
  read: vi.fn(() => ({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      { Name: "Acme Co", Email: "a@acme.io" },
      { Name: "Globex", Email: "b@globex.io" },
    ]),
  },
}));

const fields = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email" },
];

function makeFile(name = "vendors.csv") {
  const f = new File(["x"], name, { type: "text/csv" });
  // arrayBuffer is used by parseFile; jsdom File may lack it.
  if (typeof f.arrayBuffer !== "function") {
    (f as any).arrayBuffer = async () => new ArrayBuffer(8);
  }
  return f;
}

function setup(props: Partial<React.ComponentProps<typeof ImportDataDrawer>> = {}) {
  const onClose = vi.fn();
  const onImport = vi.fn(async () => ({ ok: true as const }));
  const onComplete = vi.fn();
  const utils = render(
    <ImportDataDrawer
      open
      onClose={onClose}
      entityName="Vendor"
      fields={fields}
      onImport={onImport}
      onComplete={onComplete}
      {...props}
    />,
  );
  return { onClose, onImport, onComplete, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImportDataDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportDataDrawer
        open={false}
        onClose={() => {}}
        entityName="Vendor"
        fields={fields}
        onImport={async () => ({ ok: true })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the upload stage header and dropzone when open", () => {
    setup();
    expect(screen.getByText("Import Data")).toBeInTheDocument();
    expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^upload$/i })).toBeInTheDocument();
  });

  it("fires onClose from Cancel on the upload stage", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported file type with an inline error", () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bad = makeFile("notes.pdf");
    fireEvent.change(input, { target: { files: [bad] } });
    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
  });

  it("parses a picked file and advances to the mapping stage", async () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    expect(screen.getByText(/selected file:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() =>
      expect(screen.getByText(/map each vendor field/i)).toBeInTheDocument(),
    );
    // 2 detected rows -> import button label reflects the count
    expect(screen.getByRole("button", { name: /import 2 rows/i })).toBeInTheDocument();
    // Auto-mapping matched Name + Email columns; preview header shows field labels.
    expect(screen.getAllByText("Name").length).toBeGreaterThan(0);
  });

  it("runs the import: calls onImport per row and shows the done summary", async () => {
    const { onImport, onComplete } = setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /import 2 rows/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /import 2 rows/i }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport).toHaveBeenCalledWith({ name: "Acme Co", email: "a@acme.io" });
    await waitFor(() =>
      expect(screen.getByText(/2 imported, 0 failed/i)).toBeInTheDocument(),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
  });
});
