// Multi-tenant guard helpers. Every Prisma query in a route handler should
// be scoped by tenantId — these helpers make that enforcement uniform.

export type OrgScope = { tenantId: string };

export function whereOrg<T extends Record<string, unknown>>(
  tenantId: string,
  rest?: T,
): T & OrgScope {
  return { tenantId, ...(rest ?? {}) } as T & OrgScope;
}

export function dataOrg<T extends Record<string, unknown>>(
  tenantId: string,
  rest: T,
): T & OrgScope {
  return { tenantId, ...rest };
}
