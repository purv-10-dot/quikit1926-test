/**
 * Pure builder for the POST /api/org/users and PUT /api/org/users/[id] request
 * bodies. Extracted from the Org Setup → Users drawer so the exact wire shape
 * can be unit-tested without rendering the panel.
 *
 * Deliberately never emits a `password` key. The QuikScale UI does not collect
 * passwords at all:
 *   - Native invites → the server generates a temporary password and emails it.
 *   - SSO invites    → the user has no password; they sign in via their provider.
 *   - Edit           → users change their own password via the reset flow.
 * The server-side schemas still accept an optional `password` for the QuikIT
 * super-admin / auth-service callers, so the contract is unchanged.
 */

export type InvitationMethod = "native" | "sso";

/** The subset of the drawer's form state that shapes the request body. */
export interface UserPayloadForm {
  firstName: string;
  lastName: string;
  email: string;
  /** Legacy OrgMember.role — always sent as "member"; the real role is a
   *  separate PATCH /role call with the chosen AppRole. */
  role: string;
  teamIds: string[];
  status: string;
  /** Set when linking an existing QuikIT user instead of creating one. */
  linkExistingUserId: string | null;
  invitationMethod: InvitationMethod;
}

/**
 * @param form   current drawer form state
 * @param isEdit true for PUT (an existing user), false for POST
 */
export function buildUserPayload(
  form: UserPayloadForm,
  isEdit: boolean,
): Record<string, unknown> {
  // Legacy `role` is pinned to "member" for back-compat with OrgMember.role.
  // The authoritative role assignment happens via PATCH /role.
  const payload: Record<string, unknown> = {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    role: "member",
    teamIds: form.teamIds,
  };

  if (isEdit) {
    payload.status = form.status;
    return payload;
  }

  if (form.linkExistingUserId) {
    payload.linkExistingUserId = form.linkExistingUserId;
  } else {
    payload.invitationMethod = form.invitationMethod;
  }

  return payload;
}
