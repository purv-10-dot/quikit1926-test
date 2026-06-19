import type { DocumentBundle } from "@quikit/database";

export interface DefaultDocType {
  code: string;
  name: string;
  bundle: DocumentBundle;
  isRequired: boolean;
  sortOrder: number;
  helpText?: string;
}

export const DEFAULT_CANDIDATE_DOC_TYPES: DefaultDocType[] = [
  // Pre-offer bundle
  { code: "pan_card",             name: "PAN Card",                          bundle: "PreOffer",  isRequired: true,  sortOrder: 10, helpText: "Clear scanned copy, both sides if needed." },
  { code: "aadhaar_card",         name: "Aadhaar Card",                      bundle: "PreOffer",  isRequired: true,  sortOrder: 20, helpText: "Front & back or a masked e-Aadhaar PDF." },
  { code: "last_offer_letter",    name: "Current/Last Company Offer Letter", bundle: "PreOffer",  isRequired: true,  sortOrder: 30 },
  { code: "last_payslips",        name: "Last 3 Months' Pay Slips",          bundle: "PreOffer",  isRequired: true,  sortOrder: 40, helpText: "Upload all three as separate files or a single combined PDF." },

  // Post-offer bundle
  { code: "marksheet_10th",       name: "10th Mark Sheet",                   bundle: "PostOffer", isRequired: true,  sortOrder: 10 },
  { code: "marksheet_12th",       name: "12th Mark Sheet",                   bundle: "PostOffer", isRequired: true,  sortOrder: 20 },
  { code: "graduation_cert",      name: "Graduation Degree / Certificate",   bundle: "PostOffer", isRequired: true,  sortOrder: 30 },
  { code: "pg_cert",              name: "Post-graduation Certificate",       bundle: "PostOffer", isRequired: false, sortOrder: 40 },
  { code: "passport_photo",       name: "Passport-size Photograph",          bundle: "PostOffer", isRequired: true,  sortOrder: 50, helpText: "JPG/PNG, white background preferred." },
  { code: "bank_proof",           name: "Bank Passbook / Cancelled Cheque",  bundle: "PostOffer", isRequired: true,  sortOrder: 60 },
  { code: "pan_card_post",        name: "PAN Card",                          bundle: "PostOffer", isRequired: true,  sortOrder: 70 },
  { code: "aadhaar_card_post",    name: "Aadhaar Card",                      bundle: "PostOffer", isRequired: true,  sortOrder: 80 },
  { code: "experience_letter",    name: "Experience Letter",                 bundle: "PostOffer", isRequired: false, sortOrder: 90 },
  { code: "relieving_letter",     name: "Relieving Letter",                  bundle: "PostOffer", isRequired: false, sortOrder: 100 },
  { code: "signed_offer",         name: "Signed Offer Letter",               bundle: "PostOffer", isRequired: true,  sortOrder: 110, helpText: "Sign every page of the offer letter." },
  { code: "signed_nda",           name: "Signed NDA / NCA / NSA",            bundle: "PostOffer", isRequired: true,  sortOrder: 120 },
  { code: "driving_license",      name: "Driving License",                   bundle: "PostOffer", isRequired: false, sortOrder: 130 },
];
