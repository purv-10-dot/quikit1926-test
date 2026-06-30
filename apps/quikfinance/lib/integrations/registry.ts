import type { AccountingProvider, ProviderContext } from "./provider";
import type { ProviderDescriptor, ProviderKey } from "./types";
import { ZohoBooksProvider, ZOHO_DESCRIPTOR } from "./providers/zoho";
import { TallyPrimeProvider, TALLY_DESCRIPTOR } from "./providers/tally";

type ProviderFactory = (ctx: ProviderContext) => AccountingProvider;

type Registration = {
  descriptor: ProviderDescriptor;
  factory: ProviderFactory;
};

/**
 * The provider registry. The Sync/Migration engines resolve providers ONLY
 * through here — they never import a concrete provider. To onboard QuickBooks,
 * Xero, Sage, NetSuite, Busy, Marg, Dynamics BC… write the provider class and
 * call registerProvider() once. Nothing else changes.
 */
const REGISTRY = new Map<ProviderKey, Registration>();

export function registerProvider(descriptor: ProviderDescriptor, factory: ProviderFactory): void {
  REGISTRY.set(descriptor.key, { descriptor, factory });
}

export function getProvider(key: ProviderKey, ctx: ProviderContext): AccountingProvider {
  const reg = REGISTRY.get(key);
  if (!reg) throw new Error(`No integration provider registered for "${key}".`);
  return reg.factory(ctx);
}

export function listProviderDescriptors(): ProviderDescriptor[] {
  return Array.from(REGISTRY.values()).map((r) => r.descriptor);
}

export function getDescriptor(key: ProviderKey): ProviderDescriptor | undefined {
  return REGISTRY.get(key)?.descriptor;
}

export function isProviderRegistered(key: ProviderKey): boolean {
  return REGISTRY.has(key);
}

// --- Built-in registrations -------------------------------------------------
registerProvider(ZOHO_DESCRIPTOR, (ctx) => new ZohoBooksProvider(ctx));
registerProvider(TALLY_DESCRIPTOR, (ctx) => new TallyPrimeProvider(ctx));
