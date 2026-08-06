"use client";

/**
 * Manual "Print" button used on the /quotes/[id]/print toolbar when the
 * page was opened without ?auto=1. Server Components can't attach
 * onClick handlers, so this tiny island provides the click target.
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="crm-btn-primary">
      Print / Save as PDF
    </button>
  );
}
