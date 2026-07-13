"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "@/components/layout/Sidebar";
import { useSidebar } from "@/components/layout/sidebar-context";
import { Button } from "@/components/ui/button";

/**
 * Mobile navigation: a hamburger trigger plus a left drawer (shown below `lg`).
 * The drawer is always expanded (icons + labels + nested items) and closes on
 * outside click (Radix overlay) or when a navigation item is selected.
 */
export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" />
        <Dialog.Content
          aria-label="Navigation"
          className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-card shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <div className="flex h-16 shrink-0 items-center justify-between border-b px-3">
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2" aria-label="QuikFinance home">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">QF</span>
              <span className="text-base font-bold">QuikFinance</span>
            </Link>
            <Dialog.Close
              aria-label="Close navigation"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
