"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportExportButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Download className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
