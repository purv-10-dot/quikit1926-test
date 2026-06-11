"use client";

export function LeadFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-crm-border bg-white">
      <div className="border-b border-crm-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-crm-text">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-crm-muted">{description}</p> : null}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function LeadFormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}
