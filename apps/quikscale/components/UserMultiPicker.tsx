"use client";

/**
 * Back-compat shim — multi-select user picker.
 *
 * The real implementation moved to `components/UserSelect.tsx`. This file
 * keeps the `UserMultiPicker` named export alive so every existing call
 * site continues to work without edits.
 */
import { UserSelect, type PickerUser } from "./UserSelect";

interface Props {
  values: string[];
  onChange: (ids: string[]) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  chipLimit?: number;
  disabled?: boolean;
}

export function UserMultiPicker({ values, onChange, users, placeholder, error, chipLimit, disabled }: Props) {
  return (
    <UserSelect
      mode="multi"
      values={values}
      onChange={onChange}
      users={users}
      placeholder={placeholder}
      error={error}
      chipLimit={chipLimit}
      disabled={disabled}
    />
  );
}
