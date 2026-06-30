import { create } from "zustand";

type AppState = {
  sidebarOpen: boolean;
  searchOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  searchOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen })
}));
