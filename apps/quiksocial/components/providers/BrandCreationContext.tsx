"use client";

/**
 * BrandCreationContext
 *
 * When the brand creation wizard is active, all sidebar navigation,
 * settings gear, and header buttons must be disabled so the user
 * cannot leave mid-flow.
 *
 * Usage:
 *   - Wrap /dashboard/* with <BrandCreationProvider>
 *   - Wizard page calls setWizardActive(true) on mount, false on unmount
 *   - DashboardLayout reads wizardActive and applies pointer-events-none
 */

import { createContext, useContext, useState, type ReactNode } from "react";

interface BrandCreationContextValue {
  wizardActive: boolean;
  setWizardActive: (active: boolean) => void;
}

const BrandCreationContext = createContext<BrandCreationContextValue>({
  wizardActive: false,
  setWizardActive: () => {},
});

export function BrandCreationProvider({ children }: { children: ReactNode }) {
  const [wizardActive, setWizardActive] = useState(false);
  return (
    <BrandCreationContext.Provider value={{ wizardActive, setWizardActive }}>
      {children}
    </BrandCreationContext.Provider>
  );
}

export function useBrandCreation(): BrandCreationContextValue {
  return useContext(BrandCreationContext);
}
