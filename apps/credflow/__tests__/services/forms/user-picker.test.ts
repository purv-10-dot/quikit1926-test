/**
 * FR-RE Unit 3a (FR-RE-3 user_picker) — selection validation (single vs multi).
 *
 * A user_picker field is configured single or multi via userPickerMode. On
 * save, the selected user IDs (-> QcfFieldValue.valueUserIds) must respect that
 * mode: single accepts at most one, multi accepts many. Empty is allowed here
 * (required-ness is enforced separately by the field's requiredLevel).
 */
import { describe, it, expect } from "vitest";
import {
  validateUserPickerSelection,
  UserPickerValidationError,
} from "@/lib/services/forms/user-picker.service";

describe("validateUserPickerSelection (FR-RE-3)", () => {
  it("single mode accepts exactly one selected user", () => {
    expect(() => validateUserPickerSelection("single", ["u_1"])).not.toThrow();
  });

  it("single mode rejects more than one selected user", () => {
    expect(() => validateUserPickerSelection("single", ["u_1", "u_2"])).toThrow(
      UserPickerValidationError,
    );
  });

  it("multi mode accepts many selected users", () => {
    expect(() =>
      validateUserPickerSelection("multi", ["u_1", "u_2", "u_3"]),
    ).not.toThrow();
  });

  it("either mode accepts an empty selection (required-ness handled elsewhere)", () => {
    expect(() => validateUserPickerSelection("single", [])).not.toThrow();
    expect(() => validateUserPickerSelection("multi", [])).not.toThrow();
  });

  it("rejects duplicate user IDs in a selection", () => {
    expect(() =>
      validateUserPickerSelection("multi", ["u_1", "u_1"]),
    ).toThrow(UserPickerValidationError);
  });
});
