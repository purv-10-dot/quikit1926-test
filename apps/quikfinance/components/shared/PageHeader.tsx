"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type SecondaryAction = { label: string; href: string };

export function PageHeader({
  title,
  description,
  actionLabel,
  actionHref,
  secondaryActions
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryActions?: SecondaryAction[];
}) {
  const [open, setOpen] = useState(false);
  const hasMenu = Boolean(secondaryActions && secondaryActions.length > 0);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-normal text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        hasMenu ? (
          <div className="relative inline-flex">
            <Button asChild className="rounded-r-none">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
            <Button type="button" aria-label="More create options" className="rounded-l-none border-l border-l-white/20 px-2" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            {open ? (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
                <Link href={actionHref} className="block rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setOpen(false)}>{actionLabel}</Link>
                {secondaryActions!.map((action) => (
                  <Link key={action.href} href={action.href} className="block rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )
      ) : null}
    </div>
  );
}
