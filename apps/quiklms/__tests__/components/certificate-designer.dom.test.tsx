// @vitest-environment jsdom
/**
 * The designer and the PDF renderer had NEVER been coupled by a test, and they
 * silently disagreed in production.
 *
 * The previous designer saved `textPlacements: { design: {title, body, accent,
 * orientation, fields} }`. `buildCertificatePdf` reads `textPlacements.userName
 * / .courseName / .date / .signatoryName / .designation` plus `logoPlacement`
 * and `signaturePlacement`. Nothing in the app produced those keys, so EVERY
 * certificate rendered with the renderer's hardcoded defaults while the
 * designer's live preview showed something else entirely.
 *
 * `RENDERER_CONTRACT` below mirrors what `certificates-service.ts` actually
 * reads. If either half drifts again, this fails.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { z } from 'zod';

const h = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post: h.post, put: h.put, get: h.get } }));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import CertificateDesigner from '@/components/CertificateDesigner';

/** Exactly the shape `buildCertificatePdf` destructures. */
const placement = z.object({
  x: z.number(),
  y: z.number(),
  fontSize: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const box = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
const RENDERER_CONTRACT = z.object({
  name: z.string().min(1),
  backgroundImageUrl: z.string().min(1),
  textPlacements: z.object({
    userName: placement.optional(),
    courseName: placement.optional(),
    date: placement.optional(),
    signatoryName: placement.optional(),
    designation: placement.optional(),
  }),
  logoPlacement: box,
  signaturePlacement: box,
  selectedTenants: z.array(z.string()),
});

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

/** Fill the two required fields by driving the real UI. */
async function makeSaveable() {
  fireEvent.click(screen.getByText('Basics'));
  fireEvent.change(screen.getByPlaceholderText('Master Certification 2024'), {
    target: { value: 'Master Cert 2024' },
  });
  // Upload the background through the hidden file input.
  fireEvent.click(screen.getByText('Images'));
  const file = new File(['x'], 'bg.png', { type: 'image/png' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(h.post).toHaveBeenCalledWith('/certificates/upload-background', expect.anything()));
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.get.mockResolvedValue({ data: [] });
  h.post.mockResolvedValue({ data: { dataUrl: DATA_URL } });
  h.put.mockResolvedValue({ data: {} });
  global.URL.createObjectURL = vi.fn(() => 'blob:x');
  global.URL.revokeObjectURL = vi.fn();
  localStorage.clear();
});
afterEach(cleanup);

describe('the payload satisfies the renderer contract', () => {
  it('POSTs placement keys the PDF renderer actually reads', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();

    fireEvent.click(screen.getByText('Save Template'));

    await waitFor(() => {
      const call = h.post.mock.calls.find((c) => c[0] === '/certificates');
      expect(call).toBeTruthy();
    });
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1];

    // The whole point: it parses against what the renderer reads.
    expect(() => RENDERER_CONTRACT.parse(body)).not.toThrow();
  });

  it('never resurrects the legacy `design` blob', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();
    fireEvent.click(screen.getByText('Save Template'));

    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as {
      textPlacements: Record<string, unknown>;
    };
    expect(body.textPlacements).not.toHaveProperty('design');
  });

  it('sends logo and signature boxes with width/height, not just coordinates', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();
    fireEvent.click(screen.getByText('Save Template'));

    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as {
      logoPlacement: Record<string, number>;
      signaturePlacement: Record<string, number>;
    };
    // Defaults mirror the reference designer.
    expect(body.logoPlacement).toEqual({ x: 50, y: 15, width: 120, height: 60 });
    expect(body.signaturePlacement).toEqual({ x: 75, y: 80, width: 420, height: 150 });
  });
});

describe('layout editing', () => {
  it('font size and colour edits reach the payload', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();

    fireEvent.click(screen.getByText('Layout'));
    const sizes = screen.getAllByRole('spinbutton');
    fireEvent.change(sizes[0], { target: { value: '48' } }); // userName scale

    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as {
      textPlacements: { userName?: { fontSize: number } };
    };
    expect(body.textPlacements.userName?.fontSize).toBe(48);
  });

  it('dragging a chip writes percentage coordinates, not pixels', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();

    // The canvas is the drag frame; percentages are computed against its rect.
    const canvas = document.querySelector('[style*="aspect-ratio"]') as HTMLElement;
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 707 }) as DOMRect;

    fireEvent.mouseDown(screen.getByText('{learner_name}'));
    fireEvent.mouseMove(canvas, { clientX: 250, clientY: 353.5 });
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as {
      textPlacements: { userName?: { x: number; y: number } };
    };
    expect(body.textPlacements.userName?.x).toBeCloseTo(25, 1);
    expect(body.textPlacements.userName?.y).toBeCloseTo(50, 1);
  });

  it('clamps a drag past the canvas edge into 0..100', async () => {
    render(<CertificateDesigner />);
    await makeSaveable();
    const canvas = document.querySelector('[style*="aspect-ratio"]') as HTMLElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 707 }) as DOMRect;

    fireEvent.mouseDown(screen.getByText('{course_title}'));
    fireEvent.mouseMove(canvas, { clientX: 5000, clientY: -400 });
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as {
      textPlacements: { courseName?: { x: number; y: number } };
    };
    expect(body.textPlacements.courseName?.x).toBe(100);
    expect(body.textPlacements.courseName?.y).toBe(0);
  });
});

describe('guards', () => {
  it('cannot save without a name and a background', () => {
    render(<CertificateDesigner />);
    expect((screen.getByText('Save Template').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides tenant assignment from a tenant admin', () => {
    render(<CertificateDesigner isTenantAdmin />);
    expect(screen.queryByText('Node Distribution')).toBeNull();
  });

  it('a super admin can assign tenants', async () => {
    h.get.mockResolvedValue({ data: [{ _id: 't1', orgName: 'Acme' }] });
    render(<CertificateDesigner />);
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('/tenants'));

    fireEvent.click(screen.getByText('Tenants'));
    await waitFor(() => expect(screen.getByText('Acme')).toBeTruthy());
    fireEvent.click(screen.getByText('Acme'));

    await makeSaveable();
    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(true));
    const body = h.post.mock.calls.find((c) => c[0] === '/certificates')![1] as { selectedTenants: string[] };
    expect(body.selectedTenants).toEqual(['t1']);
  });

  it('edits PUT to the id instead of POSTing a duplicate', async () => {
    h.get.mockImplementation(async (p: string) =>
      p === '/tenants'
        ? { data: [] }
        : { data: { name: 'Existing', backgroundImageUrl: DATA_URL, textPlacements: { userName: { x: 10, y: 20, fontSize: 30, color: '#123456' } } } },
    );
    render(<CertificateDesigner certificateId="c1" />);
    await waitFor(() => expect(screen.getByDisplayValue('Existing')).toBeTruthy());

    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.put).toHaveBeenCalled());
    expect(h.put.mock.calls[0][0]).toBe('/certificates/c1');
    expect(h.post.mock.calls.some((c) => c[0] === '/certificates')).toBe(false);
    // The loaded placement survives a round trip untouched.
    const body = h.put.mock.calls[0][1] as { textPlacements: { userName: { x: number; color: string } } };
    expect(body.textPlacements.userName).toEqual({ x: 10, y: 20, fontSize: 30, color: '#123456' });
  });

  it('discards a legacy `design` blob on load rather than saving it back', async () => {
    h.get.mockImplementation(async (p: string) =>
      p === '/tenants'
        ? { data: [] }
        : {
            data: {
              name: 'Legacy',
              backgroundImageUrl: DATA_URL,
              textPlacements: { design: { title: 'x', accent: '#fff', orientation: 'portrait' } },
            },
          },
    );
    render(<CertificateDesigner certificateId="c9" />);
    await waitFor(() => expect(screen.getByDisplayValue('Legacy')).toBeTruthy());

    fireEvent.click(screen.getByText('Save Template'));
    await waitFor(() => expect(h.put).toHaveBeenCalled());
    const body = h.put.mock.calls[0][1] as { textPlacements: Record<string, unknown> };
    expect(body.textPlacements).not.toHaveProperty('design');
  });
});
