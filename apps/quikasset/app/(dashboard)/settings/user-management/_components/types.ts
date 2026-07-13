/** Shared types for the User Management surface. Shapes mirror the /api/org/*
 *  responses. */

export interface OrgUser {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  lastSignInAt: string | null;
  role: string;
  status: string;
  joinedAt: string;
  appRoleId: string | null;
  appRoleName: string | null;
  /** Present ONCE in the POST response when the server generated a temp password. */
  tempPassword?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { permissions: number; navigations: number; members: number };
}

export interface PermissionPair {
  resource: string;
  action: string;
}

export interface EffectiveEntry extends PermissionPair {
  source: "role" | "extra";
}

export interface UserPermissionsData {
  userId: string;
  roles: { id: string; name: string }[];
  roleGrants: PermissionPair[];
  extras: PermissionPair[];
  effective: EffectiveEntry[];
}

export interface SearchUser {
  userId: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  hasQuikAssetAccess: boolean;
}
