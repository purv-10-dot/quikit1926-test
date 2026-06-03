/**
 * Shared error banner for form drawers across QuikScale (KPI, Priority, WWW,
 * Client Master, Client Members, Daily Huddle, Weekly Meeting).
 *
 * Render it inside each form's RightPanel `footer` slot, immediately above
 * the Cancel / Submit row. This keeps the most recent server error in the
 * user's eye-line at the moment they click Submit, regardless of how long
 * the form body is or whether the user has scrolled down.
 *
 * Accepts both common error shapes — single-string `error` state and the
 * `errors._` object key — by taking a plain `string | null | undefined`.
 */
type Props = {
  message?: string | null;
  className?: string;
};

export function FormErrorBanner({ message, className = "" }: Props) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 ${className}`}
    >
      {message}
    </div>
  );
}
