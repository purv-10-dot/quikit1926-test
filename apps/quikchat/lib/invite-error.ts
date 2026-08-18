/**
 * Turn a failed `POST /api/invites/{code}/accept` into something true.
 *
 * The landing page used to render ONE sentence for every failure —
 * "This invite isn't available. It may have expired, been revoked, or reached
 * its limit." — while the server was already sending four distinct, accurate
 * reasons. For a user in the wrong organisation, or one without QuikChat
 * access, that sentence was simply false: their link is fine, and nothing has
 * expired. This maps the response back onto what actually happened.
 *
 * The statuses in play:
 *   403  no QuikChat access (the withOrgAuth entitlement gate), or the invite
 *        belongs to a different organisation
 *   404  no invite with that code exists
 *   410  revoked / expired / use limit reached / channel deleted
 *   401  handled by the caller — it redirects to login, never reaches here
 *
 * PREFER THE SERVER'S OWN MESSAGE. It is more specific than anything this
 * function can reconstruct from a status code alone: 410 covers four different
 * situations and the server names which one. The per-status fallbacks below
 * exist only for a response that carried no body.
 */
export function inviteErrorMessage(status: number, serverError?: string | null): string {
  const fromServer = typeof serverError === "string" ? serverError.trim() : "";
  if (fromServer) return fromServer;

  switch (status) {
    case 403:
      return "You don't have access to this invite.";
    case 404:
      return "This invite link isn't valid.";
    case 410:
      return "This invite is no longer usable.";
    default:
      // Deliberately says nothing about WHY. An unrecognised status is exactly
      // the case the old copy got wrong — it asserted expiry/revocation/limit
      // for failures that were neither. Inventing a cause we cannot know is the
      // bug being removed here, not a nicety.
      return "This invite couldn't be opened.";
  }
}
