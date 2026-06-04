/** Lead-shaped input for picking an address to compose mail to. */
export type LeadComposeEmailSource = {
  email?: string | null;
  secondaryEmail?: string | null;
};

/** First non-empty email on the lead record (primary, then secondary). */
export function resolveLeadComposeEmail(lead: LeadComposeEmailSource): string | null {
  const primary = lead.email?.trim();
  if (primary) return primary;
  const secondary = lead.secondaryEmail?.trim();
  if (secondary) return secondary;
  return null;
}
