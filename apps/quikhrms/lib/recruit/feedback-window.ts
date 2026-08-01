/**
 * Interview feedback window.
 *
 * A scorecard may only be filled once the interview's scheduled start time has
 * arrived — an interviewer must not be able to rate a candidate before the
 * conversation happened. The pipeline UI greys the action out; these helpers
 * enforce the same rule server-side on EVERY submit path (in-app scorecard,
 * stage feedback, and the emailed feedback link).
 */
export function feedbackNotYetOpen(scheduledAt: Date | string | null | undefined): boolean {
  if (!scheduledAt) return false;
  const t = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  return t.getTime() > Date.now();
}

export function feedbackNotOpenMessage(scheduledAt: Date | string): string {
  const t = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  return `Feedback opens when the interview starts (${t.toISOString()}). Please submit it after the interview.`;
}
