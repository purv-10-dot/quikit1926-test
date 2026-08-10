import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/quotes/enterprise/pdf/render-quote-pdf-buffer", () => ({
  renderQuotePdfToBuffer: vi.fn(async () => Buffer.from("pdf-bytes")),
}));

const txMock = {
  crmQuotePdfSnapshot: {
    create: vi.fn(),
  },
  crmQuote: {
    update: vi.fn(),
  },
  crmActivity: {
    create: vi.fn(),
  },
} as any;

const dbMock = {
  $transaction: vi.fn(async (cb: any) => cb(txMock)),
  crmAccount: {
    findFirst: vi.fn(),
  },
  crmContact: {
    findFirst: vi.fn(),
  },
} as any;

const quoteMock = {
  id: "q1",
  tenantId: "t1",
  quoteNumber: "QT-2026-0001",
  versionNumber: 2,
  status: "Draft",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: new Date("2026-01-31T00:00:00Z"),
  ownerName: "Sales",
  termsText: "Pay within 15 days",
  grandTotalInWords: "Rupees One Thousand Only",
  watermarkText: null,
  bankDetailsJson: {
    bankName: "SBI",
    accountNo: "1234567890",
    ifsc: "SBI0001234",
    upi: "seller@upi",
  },
  templateKey: null,
  accountId: null,
  contactId: null,
  companyState: "Karnataka",
  billingState: "Karnataka",
  subtotal: 1000,
  totalLineDiscount: 0,
  overallDiscountAmount: 0,
  freightAmount: 0,
  taxableAmount: 1000,
  cgstAmount: 90,
  sgstAmount: 90,
  igstAmount: 0,
  grandTotal: 1180,
  lines: [
    {
      lineNumber: 1,
      productName: "Item A",
      sku: "SKU-A",
      hsnCode: "1001",
      quantity: 1,
      unitPrice: 1000,
      discountPct: 0,
      taxableAmount: 1000,
      gstRate: 18,
      lineTotal: 1180,
    },
  ],
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@/lib/services/quotes/quote-service", () => ({
  getQuote: vi.fn(async () => quoteMock),
  QuoteError: class QuoteError extends Error {},
}));

vi.mock("@/lib/services/company-profile", () => ({
  getTenantCompanyBranding: vi.fn(async () => ({
    companyName: "Acme Pvt Ltd",
    logoUrl: null,
    website: "acme.example",
    phone: "+91 99999 99999",
  })),
}));

vi.mock("../../../lib/services/quotes/enterprise/template-service", () => ({
  getQuoteTemplate: vi.fn(async () => ({
    themeColor: "#1d4ed8",
    watermarkText: null,
    termsDefault: "",
    bankDetailsJson: null,
    headerHtml: "",
    footerHtml: "",
  })),
}));

vi.mock("@/lib/storage/documents", () => ({
  buildCrmDocumentStorageKey: vi.fn(() => "crm-documents/x/y"),
  isS3Configured: vi.fn(() => false),
  getCrmUploadDownloadUrl: vi.fn(async () => "https://example.invalid"),
}));

describe("generateQuotePdfSnapshot", () => {
  it("writes CrmActivity.detailNotes (filename) instead of body", async () => {
    txMock.crmQuotePdfSnapshot.create.mockResolvedValueOnce({ id: "snap1" });
    txMock.crmQuote.update.mockResolvedValueOnce(undefined);
    txMock.crmActivity.create.mockResolvedValueOnce(undefined);

    const { generateQuotePdfSnapshot } = await import(
      "@/lib/services/quotes/enterprise/pdf/generate-pdf"
    );

    await generateQuotePdfSnapshot({
      tenantId: "t1",
      quoteId: "q1",
      userId: "u1",
      userName: null,
    });

    expect(txMock.crmActivity.create).toHaveBeenCalledTimes(1);
    const activityArg = txMock.crmActivity.create.mock.calls[0]![0];
    expect(activityArg.data).toEqual(
      expect.objectContaining({
        type: "QuotePdfGenerated",
        relatedKind: "Quote",
        relatedObjectId: "q1",
        subject: `PDF snapshot v${quoteMock.versionNumber}`,
        detailNotes: `${quoteMock.quoteNumber}-v${quoteMock.versionNumber}.pdf`,
        ownerId: "u1",
      }),
    );
    expect(activityArg.data).not.toHaveProperty("body");
  });
});

