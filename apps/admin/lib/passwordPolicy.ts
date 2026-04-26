export interface PasswordRuleStatus {
  minLength: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
}

export const PASSWORD_MIN_LENGTH = 10;

export function checkPasswordRules(value: string): PasswordRuleStatus {
  return {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /[a-zA-Z]/.test(value),
    hasDigit: /\d/.test(value),
    hasSymbol: /[^a-zA-Z0-9\s]/.test(value),
  };
}

export function isPasswordValid(value: string): boolean {
  const r = checkPasswordRules(value);
  return r.minLength && r.hasLetter && r.hasDigit && r.hasSymbol;
}

export function passwordPolicyError(value: unknown): string | null {
  if (!value || typeof value !== "string") return "Password is required";
  const r = checkPasswordRules(value);
  if (!r.minLength) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (!r.hasLetter) return "Password must contain at least one letter";
  if (!r.hasDigit) return "Password must contain at least one digit";
  if (!r.hasSymbol) return "Password must contain at least one symbol";
  return null;
}
