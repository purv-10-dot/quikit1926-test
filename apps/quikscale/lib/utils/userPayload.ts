/**
 * Request-body builder for the Org Setup → Users drawer.
 *
 * Extracted from the page component so the shape of what we POST/PUT is
 * unit-testable. The important guarantee: **no `password` key is ever
 * produced**. Admins cannot set another user's password from QuikScale —
 * Native invitees get a server-generated temporary password emailed to them
 * at create time and reset it on first sign-in; everyone else uses the
 * self-service reset flow.
 */

export type InvitationMethod = "native" | "sso";

/** Structural subset of the drawer's form state that the payload needs. */
export type UserPayloadForm = {
  firstName: string;
  lastName: string;
  email: string;
  teamIds: string[];
  status: string;
  /** Set when linking an existing QuikIT user instead of creating one. */
  linkExistingUserId: string | null;
  invitationMethod: InvitationMethod;
};

/**
 * @param form   current drawer form state
 * @param isEdit true → PUT /api/org/users/[id]; false → POST /api/org/users
 */
export function buildUserPayload(
  form: UserPayloadForm,
  isEdit: boolean
): Record<string, unknown> {
  // Legacy `role` is still required for back-compat with OrgMember.role.
  // The authoritative role assignment is the AppRole (PATCH /role).
  const payload: Record<string, unknown> = {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    role: "member",
    teamIds: form.teamIds,
  };

  // Status is editable only on an existing member.
  if (isEdit) payload.status = form.status;

  // Create-only branches: link an existing user, or pick an invite method.
  if (!isEdit && form.linkExistingUserId) {
    payload.linkExistingUserId = form.linkExistingUserId;
  }
  if (!isEdit && !form.linkExistingUserId) {
    payload.invitationMethod = form.invitationMethod;
  }

  return payload;
}
