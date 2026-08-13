import { create } from "zustand";

interface SidebarState {
  isOpenOnMobile: boolean;
  toggle: () => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpenOnMobile: false,
  toggle: () => set((s) => ({ isOpenOnMobile: !s.isOpenOnMobile })),
  close: () => set({ isOpenOnMobile: false }),
}));
