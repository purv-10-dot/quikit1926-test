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
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: "asc" | "desc";
}
