import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Apply the error state style (red border + tint). Drive from validation errors. */
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", error = false, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`crm-input ${error ? "crm-input-error" : ""} ${className}`}
      {...rest}
    />
  );
});
