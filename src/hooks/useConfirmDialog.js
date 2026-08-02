import { useCallback, useEffect, useRef, useState } from 'react';

export function useConfirmDialog() {
  const [confirmation, setConfirmation] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((confirmed) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setConfirmation({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Go back',
      tone: options.tone || 'primary',
    });
  }), []);

  const accept = useCallback(() => settle(true), [settle]);
  const cancel = useCallback(() => settle(false), [settle]);

  useEffect(() => () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  return {
    confirm,
    confirmation: confirmation
      ? {
          ...confirmation,
          onConfirm: accept,
          onCancel: cancel,
        }
      : null,
  };
}
