"use client";

import { create } from "zustand";

type AiDockState = {
  open: boolean;
  /** A prompt to pre-fill when the dock opens (e.g. from a card's "Ask AI"). */
  seed: string | null;
  openDock: (seed?: string) => void;
  closeDock: () => void;
  toggleDock: () => void;
  clearSeed: () => void;
};

export const useAiDock = create<AiDockState>((set) => ({
  open: false,
  seed: null,
  openDock: (seed) => set({ open: true, seed: seed ?? null }),
  closeDock: () => set({ open: false }),
  toggleDock: () => set((s) => ({ open: !s.open })),
  clearSeed: () => set({ seed: null })
}));
