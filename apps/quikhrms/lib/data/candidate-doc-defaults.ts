export interface DefaultDocType {
  code: string;
  name: string;
  isRequired: boolean;
  sortOrder: number;
  helpText?: string;
}

// One flat, unified list — HR can request any of these at any time, no
// Before/After Offer split. PAN/Aadhaar previously existed as two separate
// rows (one per bundle, since the old unique constraint needed one); merged
// here into a single entry each now that bundle no longer exists.
export const DEFAULT_CANDIDATE_DOC_TYPES: DefaultDocType[] = [
  { code: "pan_card",             name: "PAN Card",                          isRequired: true,  sortOrder: 10, helpText: "Clear scanned copy, both sides if needed." },
  { code: "aadhaar_card",         name: "Aadhaar Card",                      isRequired: true,  sortOrder: 20, helpText: "Front & back or a masked e-Aadhaar PDF." },
  { code: "last_offer_letter",    name: "Current/Last Company Offer Letter", isRequired: true,  sortOrder: 30 },
  { code: "last_payslips",        name: "Last 3 Months' Pay Slips",          isRequired: true,  sortOrder: 40, helpText: "Upload all three as separate files or a single combined PDF." },
  { code: "marksheet_10th",       name: "10th Mark Sheet",                   isRequired: true,  sortOrder: 50 },
  { code: "marksheet_12th",       name: "12th Mark Sheet",                   isRequired: true,  sortOrder: 60 },
  { code: "graduation_cert",      name: "Graduation Degree / Certificate",   isRequired: true,  sortOrder: 70 },
  { code: "pg_cert",              name: "Post-graduation Certificate",       isRequired: false, sortOrder: 80 },
  { code: "passport_photo",       name: "Passport-size Photograph",          isRequired: true,  sortOrder: 90, helpText: "JPG/PNG, white background preferred." },
  { code: "bank_proof",           name: "Bank Passbook / Cancelled Cheque",  isRequired: true,  sortOrder: 100 },
  { code: "experience_letter",    name: "Experience Letter",                 isRequired: false, sortOrder: 110 },
  { code: "relieving_letter",     name: "Relieving Letter",                  isRequired: false, sortOrder: 120 },
  { code: "signed_offer",         name: "Signed Offer Letter",               isRequired: true,  sortOrder: 130, helpText: "Sign every page of the offer letter." },
  { code: "signed_nda",           name: "Signed NDA / NCA / NSA",            isRequired: true,  sortOrder: 140 },
  { code: "driving_license",      name: "Driving License",                   isRequired: false, sortOrder: 150 },
];
