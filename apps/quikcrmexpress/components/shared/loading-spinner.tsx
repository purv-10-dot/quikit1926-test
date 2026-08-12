export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-crm-border border-t-crm-blue"
      style={{ width: size, height: size }}
    />
  );
}
