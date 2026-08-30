import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: sonner.toast }));

import { startTransactionToast } from './transactionToast.js';

describe('startTransactionToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates wallet, confirmation, and terminal states with one stable toast id', () => {
    const lifecycle = startTransactionToast({
      id: 'request-create',
      wallet: 'Confirm request',
      submitted: 'Waiting for request',
      success: 'Request published',
      error: 'Request failed',
    });

    lifecycle.submitted();
    lifecycle.success();
    lifecycle.dismiss();

    expect(sonner.toast.loading).toHaveBeenNthCalledWith(1, 'Confirm request', { id: 'request-create' });
    expect(sonner.toast.loading).toHaveBeenNthCalledWith(2, 'Waiting for request', { id: 'request-create' });
    expect(sonner.toast.success).toHaveBeenCalledWith('Request published', { id: 'request-create' });
    expect(sonner.toast.dismiss).toHaveBeenCalledWith('request-create');
  });

  it('can resolve a failure without creating a second toast', () => {
    const lifecycle = startTransactionToast({ id: 'request-create' });
    lifecycle.error('Rejected by wallet');

    expect(sonner.toast.error).toHaveBeenCalledWith('Rejected by wallet', { id: 'request-create' });
    expect(sonner.toast.loading).toHaveBeenCalledTimes(1);
  });
});
