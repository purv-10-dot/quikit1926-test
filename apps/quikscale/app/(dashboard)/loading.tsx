export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-neutral-200)] border-t-[var(--color-primary)]" />
    </div>
  );
}
