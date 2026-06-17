/**
 * Decide whether a user can read a given ticket based on perms + ownership.
 * Returns true if user has full read OR is raiser/assignee with matching scoped perm.
 */
export function canReadTicket(
  ticket: { raisedById: string; assignedToId: string | null },
  userId: string,
  permissions: string[]
): boolean {
  if (permissions.includes("*")) return true;
  if (permissions.includes("hrms.ticket.read")) return true;
  if (
    ticket.raisedById === userId &&
    permissions.includes("hrms.ticket.read_self")
  ) {
    return true;
  }
  if (
    ticket.assignedToId === userId &&
    permissions.includes("hrms.ticket.read_assigned")
  ) {
    return true;
  }
  return false;
}

/** Whether user can see internal-only comments. */
export function canSeeInternalComments(permissions: string[]): boolean {
  return (
    permissions.includes("*") ||
    permissions.includes("hrms.ticket.read") ||
    permissions.includes("hrms.ticket.write")
  );
}

/** Whether user can write/comment on a ticket (raiser or agent). */
export function canWriteTicket(
  ticket: { raisedById: string; assignedToId: string | null },
  userId: string,
  permissions: string[]
): boolean {
  if (permissions.includes("*")) return true;
  if (permissions.includes("hrms.ticket.write")) return true;
  // Raiser can comment on own ticket
  if (
    ticket.raisedById === userId &&
    permissions.includes("hrms.ticket.raise")
  ) {
    return true;
  }
  return false;
}
