"use client";

/**
 * Multi-select user picker — thin wrapper around UserSelect.
 *
 * Exposes a simpler API (`values` + `onChange(ids[])`) than UserSelect's
 * discriminated union. Used everywhere the call site picks multiple users.
 */

import { UserSelect, type PickerUser } from "./user-select";

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
