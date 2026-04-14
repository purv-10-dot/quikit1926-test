"use client";

/**
 * Back-compat shim — single-select user picker.
 *
 * The real implementation moved to `components/UserSelect.tsx`. This file
 * keeps the `UserPicker` named export + `PickerUser` type alive so every
 * existing call site continues to work without edits.
 */
import { UserSelect, type PickerUser } from "./UserSelect";

export type { PickerUser };

interface Props {
  value: string;
  onChange: (id: string) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
}

export function UserPicker({ value, onChange, users, placeholder, error, disabled }: Props) {
  return (
    <UserSelect
      mode="single"
      value={value}
      onChange={onChange}
      users={users}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  );
}
