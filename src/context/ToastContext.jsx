// src/context/ToastContext.jsx — CargoChain's Sonner-backed feedback bridge.
// Existing callers keep using show(message, kind); Sonner owns the queue,
// timing, dismissal, live-region announcements, and presentation.

import { createContext, useCallback, useContext, useMemo } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { startTransactionToast } from '../utils/transactionToast.js';

const ToastContext = createContext(null);

const TOAST_METHODS = {
  success: sonnerToast.success,
  error: sonnerToast.error,
  warning: sonnerToast.warning,
  info: sonnerToast.info,
};

export function ToastProvider({ children }) {
  const show = useCallback((message, kind = 'info', ttl = undefined) => {
    const method = TOAST_METHODS[kind] || sonnerToast;
    const options = typeof ttl === 'number' ? { duration: ttl } : undefined;
    return method(message, options);
  }, []);

  const dismiss = useCallback((id) => sonnerToast.dismiss(id), []);
  const beginTransaction = useCallback((copy) => startTransactionToast(copy), []);

  const value = useMemo(() => ({
    show,
    dismiss,
    beginTransaction,
  }), [beginTransaction, dismiss, show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        closeButton
        duration={4000}
        visibleToasts={4}
        offset={{ top: 16, right: 16, bottom: 16, left: 16 }}
        toastOptions={{ className: 'cargochain-toast' }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast() called outside <ToastProvider>. Check src/main.jsx.');
  }
  return ctx;
}
