// Canonical port of quikcrm-backend/src/activities/smb-outreach.meta.ts.
// Diffed against the Next.js app on 2026-05-05 — no existing copy of the
// SMB_OUTREACH_* constants, so this is the single source of truth.

export type SmbSubDispositionMeta = { value: string; subSub: string[] };
export type SmbDispositionMeta = { value: string; sub: SmbSubDispositionMeta[] };

export const SMB_OUTREACH_COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Singapore",
  "United Arab Emirates",
  "Australia",
  "Canada",
] as const;

export const SMB_OUTREACH_PRIORITIES = ["P0", "P1", "P2", "P3", "P4"] as const;

export const SMB_OUTREACH_CHANNELS = [
  "Phone",
  "Email",
  "WhatsApp",
  "LinkedIn",
  "SMS",
  "In person",
] as const;

export const SMB_OUTREACH_COMPETITORS = [
  "No Software",
  "Salesforce",
  "HubSpot",
  "Zoho",
  "Freshsales",
  "Microsoft Dynamics",
  "Other CRM",
  "Spreadsheets / Manual",
] as const;

export const SMB_OUTREACH_DISPOSITIONS: SmbDispositionMeta[] = [
  {
    value: "Interested",
    sub: [
      {
        value: "Follow Up Required",
        subSub: ["Product Demo", "Pricing Discussion", "Documentation Request", "Security Review"],
      },
      {
        value: "Interested Meeting",
        subSub: ["Executive Briefing", "Site Visit", "Virtual Discovery"],
      },
      {
        value: "Active BO",
        subSub: ["Technical Validation", "Pilot Scope", "Commercial Terms"],
      },
    ],
  },
  {
    value: "Not Interested",
    sub: [
      { value: "Timing", subSub: ["Budget next year", "Revisit Q3", "Project paused"] },
      { value: "Fit", subSub: ["Wrong ICP", "Too small", "Too enterprise"] },
    ],
  },
  {
    value: "Not Reachable",
    sub: [
      { value: "Phone", subSub: ["No answer", "Busy", "Invalid number", "Voicemail"] },
      { value: "Email", subSub: ["Bounced", "No response"] },
    ],
  },
  {
    value: "Callback Requested",
    sub: [
      { value: "Same day", subSub: ["Morning", "Afternoon"] },
      { value: "Later", subSub: ["This week", "Next week"] },
    ],
  },
];

export const SMB_OUTREACH_TOP_LEVEL_VALUES = SMB_OUTREACH_DISPOSITIONS.map((d) => d.value);

export function validateSmbDispositionChain(
  disposition: string,
  subDisposition: string,
  subSubDisposition: string,
): boolean {
  const d = SMB_OUTREACH_DISPOSITIONS.find((x) => x.value === disposition);
  if (!d) return false;
  const s = d.sub.find((x) => x.value === subDisposition);
  if (!s) return false;
  return s.subSub.includes(subSubDisposition);
}

export function getSmbOutreachMetaResponse() {
  return {
    countries: [...SMB_OUTREACH_COUNTRIES],
    priorities: [...SMB_OUTREACH_PRIORITIES],
    channels: [...SMB_OUTREACH_CHANNELS],
    competitors: [...SMB_OUTREACH_COMPETITORS],
    dispositions: SMB_OUTREACH_DISPOSITIONS,
  };
}
