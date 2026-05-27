"use client";

import { ReactNode } from "react";

// Passthrough — native HTML5 DnD lives directly on row + group nodes.
export function DndProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
