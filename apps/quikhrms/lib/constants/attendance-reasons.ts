/** Sentinel value that lets the employee enter a free-text reason. */
export const OTHER_REASON = "Other";

/**
 * Predefined regularization reasons shown in the employee dropdown.
 * Selecting `OTHER_REASON` reveals a free-text field for unusual cases.
 */
export const REGULARIZATION_REASONS = [
  "Forgot to clock in",
  "Forgot to clock out",
  "Biometric / system error",
  "On official duty / client visit",
  "Working from home",
  "Network / power outage",
  "Late arrival (pre-approved)",
  "Early departure (pre-approved)",
  OTHER_REASON,
] as const;
