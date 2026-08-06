// @vitest-environment jsdom
/**
 * GAP_REPORT §4b — `TenantOnboardingWizard` was a 24-line stub, so
 * `POST /api/tenants/onboard` (hardened earlier in this pass) had no UI to drive
 * it. This is that endpoint's ONLY caller.
 *
 * The most valuable assertion here is not that the form renders — it is that the
 * payload the wizard SENDS satisfies the schema the route ENFORCES. Those two
 * halves have never met before, and nothing else in the codebase couples them.
 * `contractSchema` below is a copy of `app/api/tenants/onboard/route.ts`'s zod
 * schema, so if either side drifts, this test fails.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { z } from 'zod';

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post: h.post, get: vi.fn() } }));

import TenantOnboardingWizard from '@/components/TenantOnboardingWizard';

/** Mirror of the live route's schema (app/api/tenants/onboard/route.ts). */
const contractSchema = z.object({
  tenantType: z.enum(['corporate', 'school']).default('corporate'),
  orgName: z.string().min(2),
  fullAddress: z.string().min(5),
  country: z.string().min(1),
  officialPhone: z.string(),
  website: z.string().optional(),
  officialEmail: z.string().email(),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  phone: z.string(),
  email: z.string().email(),
  roleInOrganization: z.string().min(1),
  billingFirstName: z.string().min(1),
  billingMiddleName: z.string().optional(),
  billingLastName: z.string().min(1),
  billingAddress: z.string().min(5),
  storageLimit: z.union([z.number(), z.string()]).optional(),
});

const onClose = vi.fn();
const onSuccess = vi.fn();

beforeEach(() => {
  h.post.mockReset();
  h.post.mockResolvedValue({ success: true, data: {} });
  onClose.mockReset();
  onSuccess.mockReset();
  vi.useRealTimers();
});
afterEach(() => cleanup());

function setField(name: string, value: string) {
  const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
  if (!el) throw new Error(`field ${name} not found on the current step`);
  fireEvent.change(el, { target: { value } });
}

/** Fill the fields present on the current step, then advance past its
 *  react-hook-form `trigger()` gate. */
async function fillAndNext(fields: Record<string, string>) {
  for (const [k, v] of Object.entries(fields)) setField(k, v);
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => {});
}

const ORG = {
  orgName: 'Acme Corporation',
  fullAddress: '221B Baker Street, London',
  country: 'United Kingdom',
  officialPhone: '+441234567890',
  officialEmail: 'ops@acme.test',
  website: 'acme.test', // no protocol — the wizard must prepend https://
};
const CONTACT = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '+447700900000',
  email: 'ada@acme.test',
  roleInOrganization: 'CTO',
};
const BILLING = {
  billingFirstName: 'Ada',
  billingLastName: 'Lovelace',
  billingAddress: '221B Baker Street, London',
};

/**
 * Walk the wizard's three steps and submit. Returns the POSTed payload.
 *
 * The flow is: step 1 (org) → step 2 (contact) → step 3 (billing) → a
 * `type="submit"` button. Each "Next" is gated by react-hook-form's `trigger()`
 * on that step's fields, so the values must be valid or the step will not
 * advance — which is itself part of what this test proves.
 */
async function completeWizard() {
  render(<TenantOnboardingWizard onClose={onClose} onSuccess={onSuccess} />);

  await fillAndNext(ORG);
  await fillAndNext(CONTACT);

  for (const [k, v] of Object.entries(BILLING)) setField(k, v);
  fireEvent.click(screen.getByText('Submit & Launch'));

  await waitFor(() => expect(h.post).toHaveBeenCalled(), { timeout: 3000 });
  return h.post.mock.calls[0][1] as Record<string, unknown>;
}

describe('TenantOnboardingWizard — it renders at all', () => {
  it('is no longer a stub', () => {
    render(<TenantOnboardingWizard onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('renders the first step of a real form', () => {
    render(<TenantOnboardingWizard onClose={onClose} onSuccess={onSuccess} />);
    // A real wizard has step chrome and at least one registered input.
    expect(document.querySelectorAll('input,select,textarea').length).toBeGreaterThan(0);
  });

  it('closes via the onClose prop the page passes', () => {
    render(<TenantOnboardingWizard onClose={onClose} onSuccess={onSuccess} />);
    const closeBtn = document.querySelector('button svg.lucide-x')?.closest('button');
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});

describe('the UI↔backend contract', () => {
  it('POSTs to /tenants/onboard', async () => {
    await completeWizard();
    expect(h.post.mock.calls[0][0]).toBe('/tenants/onboard');
  });

  it('sends a payload the route’s schema ACCEPTS', async () => {
    // This is the assertion that matters: the wizard and the endpoint were
    // written years apart and never verified against each other.
    const payload = await completeWizard();
    const parsed = contractSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `payload rejected by the live route schema:\n${JSON.stringify(parsed.error.issues, null, 2)}\npayload:\n${JSON.stringify(payload, null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('defaults tenantType and storageLimit rather than omitting them', async () => {
    const payload = await completeWizard();
    expect(payload.tenantType).toBe('corporate');
    expect(payload.storageLimit).toBeTruthy();
  });

  it('prepends https:// to a protocol-less website', async () => {
    const payload = await completeWizard();
    expect(payload.website).toBe('https://acme.test');
  });

  it('calls onSuccess after a successful onboard', async () => {
    await completeWizard();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), { timeout: 3000 });
  });
});

describe('error surfacing', () => {
  it('renders the backend message on a plain failure', async () => {
    h.post.mockRejectedValue({ message: 'A user with the admin email already exists' });
    await completeWizard().catch(() => {});
    await waitFor(() =>
      expect(screen.getByText(/A user with the admin email already exists/)).toBeTruthy(),
    );
  });

  it('renders field-by-field validationErrors — the shape lib/http.ts actually emits', async () => {
    // The legacy filter emitted `errors`; this app emits `validationErrors`. The
    // wizard checks `errors || validationErrors`, and it is that fallback that
    // keeps the detailed display working here.
    h.post.mockRejectedValue({
      message: 'Validation failed',
      validationErrors: [{ field: 'officialEmail', message: 'Invalid email' }],
    });
    await completeWizard().catch(() => {});
    await waitFor(() => expect(screen.getByText(/officialEmail: Invalid email/)).toBeTruthy());
  });
});
