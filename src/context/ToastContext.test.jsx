import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    loading: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: sonner.toast,
  Toaster: ({ children }) => <div data-testid="root-toaster">{children}</div>,
}));

import { ToastProvider, useToast } from './ToastContext.jsx';

function ToastProbe() {
  const { show } = useToast();
  return <button type="button" onClick={() => show('Saved', 'success')}>Show toast</button>;
}

describe('ToastProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mounts one root Toaster and keeps the compatibility show hook', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );

    expect(screen.getByTestId('root-toaster')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(sonner.toast.success).toHaveBeenCalledWith('Saved', undefined);
  });
});
