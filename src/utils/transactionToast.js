// Shared transaction feedback lifecycle for Phase 1 and the Phase 2 workflow.
// Every state update reuses one Sonner id, so a wallet prompt never leaves a
// stale success/error toast behind it.

import { toast } from 'sonner';

let transactionSequence = 0;

export function startTransactionToast({
  id = `cargochain-transaction-${++transactionSequence}`,
  wallet = 'Confirm the transaction in MetaMask.',
  submitted = 'Waiting for blockchain confirmation…',
  success = 'Transaction confirmed.',
  error = 'Transaction failed.',
} = {}) {
  const update = (method, message) => toast[method](message, { id });

  update('loading', wallet);

  return {
    id,
    wallet: (message = wallet) => update('loading', message),
    submitted: (message = submitted) => update('loading', message),
    success: (message = success) => update('success', message),
    error: (message = error) => update('error', message),
    dismiss: () => toast.dismiss(id),
  };
}
