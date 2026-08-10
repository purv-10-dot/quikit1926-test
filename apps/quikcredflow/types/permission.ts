export type ModuleAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "import"
  | "markComplete";

export interface ModulePermRow {
  module: string;
  actions: ModuleAction[];
  hiddenFields: string[];
  restrictedFields: string[];
}

export type PermissionMatrix = ModulePermRow[];

export interface SessionUser {
  userId: string;
  orgId: string;
  role: string;
  email: string;
  name: string;
}
