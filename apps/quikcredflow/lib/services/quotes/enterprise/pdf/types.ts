export interface QuotePrintLine {
  lineNumber: number;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxableAmount: number;
  gstRate: number;
  lineTotal: number;
}

export interface QuotePrintPayload {
  quote: {
    quoteNumber: string;
    versionNumber: number;
    status: string;
    effectiveFrom: Date | string | null;
    effectiveTo: Date | string | null;
    ownerName: string | null;
    termsText: string | null;
    grandTotalInWords: string | null;
    watermarkText: string | null;
    bankDetailsJson: unknown;
    templateKey: string;
  };
  company: {
    companyName: string;
    logoUrl: string | null;
    website: string | null;
    phone: string | null;
  };
  account: { name: string } | null;
  contact: {
    firstName: string;
    lastName: string | null;
    email: string | null;
  } | null;
  template: {
    themeColor: string;
    watermarkText: string | null;
    termsDefault: string | null;
    bankDetailsJson: unknown;
    headerHtml: string | null;
    footerHtml: string | null;
  } | null;
  lines: QuotePrintLine[];
  totals: {
    subtotal: number;
    totalLineDiscount: number;
    overallDiscountAmount: number;
    freightAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    grandTotal: number;
  };
  isIntraState: boolean;
}
