export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  TENANT_MISMATCH = "TENANT_MISMATCH",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  INSUFFICIENT_LEAVE_BALANCE = "INSUFFICIENT_LEAVE_BALANCE",
  APPROVAL_CHAIN_NOT_CONFIGURED = "APPROVAL_CHAIN_NOT_CONFIGURED",
  PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED",
  RATE_LIMITED = "RATE_LIMITED",
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface AuthContext {
  userId: string;
  orgId: string;
  roles: string[];
  permissions: string[];
  roleCode: string | null;
  /** True when the user must change a temporary password before doing anything else. */
  mustChangePassword?: boolean;
  /**
   * Who is making the request. "user" for a normal session/dev-header caller;
   * "ai_agent" when the AI Runtime is acting on an employee's behalf via the
   * service-auth path (withServiceAuth). Mutating routes should stamp this onto
   * the audit trail so agent-triggered changes are attributable.
   */
  actorType?: "user" | "ai_agent";
  /**
   * The AI Runtime agent identity, present only when actorType === "ai_agent".
   * Carry through to HrmsAuditLog alongside userId (the acting employee).
   */
  actingAgentId?: string;
  /**
   * Active delegations lending this user extra permissions — one entry per
   * delegator, each listing exactly the codes granted. Present only when the
   * user is currently acting under at least one delegation. Routes use it to
   * stamp on-behalf-of attribution into the audit trail and to surface the
   * delegator's own pending items.
   */
  delegatedFrom?: { delegatorId: string; permissions: string[] }[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: "asc" | "desc";
}
