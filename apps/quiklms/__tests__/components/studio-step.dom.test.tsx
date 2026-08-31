// @vitest-environment jsdom
/**
 * StudioStep — the collapsible step the sub-module editor is built from.
 *
 * Two behaviours matter beyond "it opens and closes":
 *
 *   1. `collapsible={false}` must render children with NO wrapper at all. That
 *      is what lets the tenant route use the stepped layout while the
 *      super-admin master-course builder keeps its single-card layout, without
 *      the editor being written twice.
 *   2. The summary must stay visible whether open or closed. Closed it says
 *      where the author left off; open it is a live count of what they are
 *      building.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import StudioStep from '@/components/StudioStep';

afterEach(cleanup);

const base = {
  index: 2,
  title: 'Content',
  open: false,
  onToggle: () => {},
};

describe('collapsing', () => {
  it('hides its body when closed and shows it when open', () => {
    const { rerender } = render(
      <StudioStep {...base} open={false}>
        <p>body content</p>
      </StudioStep>,
    );
    expect(screen.queryByText('body content')).toBeNull();

    rerender(
      <StudioStep {...base} open>
        <p>body content</p>
      </StudioStep>,
    );
    expect(screen.getByText('body content')).toBeTruthy();
  });

  it('reports its state to assistive tech', () => {
    const { rerender } = render(<StudioStep {...base} open={false}>x</StudioStep>);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');

    rerender(<StudioStep {...base} open>x</StudioStep>);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    render(<StudioStep {...base} onToggle={onToggle}>x</StudioStep>);

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('the header', () => {
  it('shows the summary both closed and open', () => {
    const { rerender } = render(
      <StudioStep {...base} summary="3 resources" open={false}>x</StudioStep>,
    );
    expect(screen.getByText('3 resources')).toBeTruthy();

    rerender(<StudioStep {...base} summary="3 resources" open>x</StudioStep>);
    expect(screen.getByText('3 resources')).toBeTruthy();
  });

  it('marks optional steps so nobody reads them as a skipped requirement', () => {
    render(<StudioStep {...base} optional>x</StudioStep>);
    expect(screen.getByText('optional')).toBeTruthy();
  });

  it('shows the step number until the step has content, then a tick', () => {
    const { rerender } = render(<StudioStep {...base} complete={false}>x</StudioStep>);
    expect(screen.getByText('2')).toBeTruthy();

    rerender(<StudioStep {...base} complete>x</StudioStep>);
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.getByText('✓')).toBeTruthy();
  });
});

describe('collapsible={false} — the super-admin passthrough', () => {
  it('renders children with no header, no chrome, nothing', () => {
    const { container } = render(
      <StudioStep {...base} collapsible={false} summary="3 resources" optional>
        <p>body content</p>
      </StudioStep>,
    );

    expect(screen.getByText('body content')).toBeTruthy();
    // No toggle, no title, no summary, no optional marker — the step must be
    // completely invisible in this mode or it would change the super-admin
    // layout that was deliberately left out of scope.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Content')).toBeNull();
    expect(screen.queryByText('3 resources')).toBeNull();
    expect(screen.queryByText('optional')).toBeNull();
    expect(container.innerHTML).toBe('<p>body content</p>');
  });

  it('ignores open={false} — children are never hidden in passthrough mode', () => {
    render(
      <StudioStep {...base} collapsible={false} open={false}>
        <p>body content</p>
      </StudioStep>,
    );
    expect(screen.getByText('body content')).toBeTruthy();
  });
});
