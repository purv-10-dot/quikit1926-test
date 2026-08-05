"use client";

import { PortalDropdown, type DropdownOption } from "./portal-dropdown";
import {
  USER_OPTIONS,
  ROLE_OPTIONS,
  PERMISSION_OPTIONS,
  FIELD_OPTIONS,
  permissionKey,
} from "./restrict-options";

/* ── "Restrict who can move a work item" config form ─────────────────────── */

// Only the targets QuikTrack actually supports/enforces.
const RESTRICT_TO_OPTIONS: DropdownOption[] = [
  { value: "users", label: "Users" },
  { value: "roles", label: "Roles" },
  { value: "permissions", label: "Permissions" },
];

export function isRestrictWhoMovesValid(config: Record<string, unknown>): boolean {
  const restrictTo = String(config.restrictTo ?? "");
  if (!restrictTo) return false;
  if (restrictTo === "users") return Array.isArray(config.userIds) && config.userIds.length > 0;
  if (restrictTo === "roles") return Array.isArray(config.roleNames) && config.roleNames.length > 0;
  if (restrictTo === "permissions")
    return Array.isArray(config.permissions) && config.permissions.length > 0;
  return true;
}

export function RestrictWhoMovesForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const restrictTo = String(value.restrictTo ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  const userIds = Array.isArray(value.userIds) ? (value.userIds as string[]) : [];
  const roleNames = Array.isArray(value.roleNames) ? (value.roleNames as string[]) : [];
  const perms = Array.isArray(value.permissions)
    ? (value.permissions as { resource: string; action: string }[])
    : [];
  const permKeys = perms.map(permissionKey);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Restrict to</label>
        <PortalDropdown
          options={RESTRICT_TO_OPTIONS}
          selected={restrictTo ? [restrictTo] : []}
          onChange={(next) => set({ restrictTo: next[0] ?? "" })}
        />
      </div>

      {restrictTo === "users" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Users</label>
          <PortalDropdown
            multiple
            placeholder="Select users"
            options={USER_OPTIONS}
            selected={userIds}
            onChange={(next) => set({ userIds: next })}
          />
        </div>
      )}

      {restrictTo === "roles" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Project roles</label>
          <PortalDropdown
            multiple
            placeholder="Select roles"
            options={ROLE_OPTIONS}
            selected={roleNames}
            onChange={(next) => set({ roleNames: next })}
          />
        </div>
      )}

      {restrictTo === "permissions" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Permissions</label>
          <PortalDropdown
            multiple
            placeholder="Select permissions"
            options={PERMISSION_OPTIONS.map((p) => ({ value: p.key, label: p.label }))}
            selected={permKeys}
            onChange={(next) =>
              set({
                permissions: next.map((k) => {
                  const opt = PERMISSION_OPTIONS.find((p) => p.key === k)!;
                  return { resource: opt.resource, action: opt.action };
                }),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ── "Restrict from all users" config form ───────────────────────────────── */

const RESTRICT_FROM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "allow_apis", label: "All users, but allow APIs" },
  { value: "including_apis", label: "All users, including APIs" },
];

export function isRestrictFromAllValid(config: Record<string, unknown>): boolean {
  const mode = String(config.mode ?? "");
  return mode === "allow_apis" || mode === "including_apis";
}

export function RestrictFromAllForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const mode = String(value.mode ?? "");
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-gray-700">Restrict from</label>
      <div className="space-y-2">
        {RESTRICT_FROM_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="restrict-from-all-mode"
              checked={mode === o.value}
              onChange={() => onChange({ ...value, mode: o.value })}
              className="text-accent-600 focus:ring-accent-500"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ── "Restrict to when a field is a specific value" config form ──────────── */

const VALUE_TYPE_OPTIONS: DropdownOption[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "A number" },
];
const OP_OPTIONS: DropdownOption[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Doesn't equal" },
];

export function isRestrictFieldValueValid(config: Record<string, unknown>): boolean {
  const field = String(config.field ?? "");
  const op = String(config.op ?? "");
  const value = String(config.value ?? "").trim();
  if (!FIELD_OPTIONS.some((f) => f.value === field)) return false;
  if (op !== "eq" && op !== "neq") return false;
  return value.length > 0;
}

export function RestrictFieldValueForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const field = String(value.field ?? "");
  const valueType = String(value.valueType ?? "text");
  const op = String(value.op ?? "");
  const val = String(value.value ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">For this field</label>
        <PortalDropdown
          placeholder="Choose a field"
          options={FIELD_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
          selected={field ? [field] : []}
          onChange={(next) => set({ field: next[0] ?? "" })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Review its value as</label>
          <PortalDropdown
            options={VALUE_TYPE_OPTIONS}
            selected={[valueType]}
            onChange={(next) => set({ valueType: next[0] ?? "text" })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Check if it</label>
          <PortalDropdown
            placeholder="Choose an option"
            options={OP_OPTIONS}
            selected={op ? [op] : []}
            onChange={(next) => set({ op: next[0] ?? "" })}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">This value</label>
        {valueType === "number" ? (
          <input
            type="number"
            value={val}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="Enter a number"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        ) : (
          <textarea
            value={val}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="Enter some text"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}

// Status-based config forms live in a sibling file to keep this one under the
// 300-line ceiling; re-exported here so callers import from one place.
export {
  SubtaskStatusForm,
  BeenThroughStatusForm,
  PreviousUpdaterForm,
  isBeenThroughStatusValid,
  isPreviousUpdaterValid,
} from "./rule-forms-status";
