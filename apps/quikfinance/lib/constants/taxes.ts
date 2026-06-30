export const defaultTaxRates = [
  { name: "GST 5%", rate: 5, tax_type: "GST", is_compound: false },
  { name: "VAT 20%", rate: 20, tax_type: "VAT", is_compound: false },
  { name: "Sales Tax 8.25%", rate: 8.25, tax_type: "Sales Tax", is_compound: false }
] as const;
