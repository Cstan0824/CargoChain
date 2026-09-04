import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keeps keyboard focus inside a modal and returns it to the control that
 * opened the modal. The topmost-dialog check lets a confirmation dialog sit
 * above another dialog without both responding to Escape or Tab.
 */
export function useDialogFocus({ enabled = true, onClose, initialFocusRef, closeDisabled = false } = {}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const initialFocusRefValue = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
    initialFocusRefValue.current = initialFocusRef;
  }, [onClose, closeDisabled, initialFocusRef]);

  useEffect(() => {
    if (!enabled || !dialogRef.current) return undefined;

    const dialog = dialogRef.current;
    const hadTabIndex = dialog.hasAttribute('tabindex');
    if (!hadTabIndex) dialog.setAttribute('tabindex', '-1');
    const restoreTarget = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusInitialControl = () => {
      const preferred = initialFocusRefValue.current?.current;
      const first = dialog.querySelector(FOCUSABLE_SELECTOR);
      (preferred || first || dialog).focus?.();
    };

    // Refs are attached before effects run, so focusing synchronously avoids a
    // visible focus flash and makes opening behavior deterministic for keyboard
    // and assistive-technology users.
    focusInitialControl();

    const isTopmostDialog = () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
      return dialogs[dialogs.length - 1] === dialog;
    };

    const onKeyDown = (event) => {
      if (!isTopmostDialog()) return;

      if (event.key === 'Escape') {
        if (closeDisabledRef.current) return;
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus?.();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!hadTabIndex) dialog.removeAttribute('tabindex');
      if (restoreTarget && document.contains(restoreTarget)) restoreTarget.focus?.();
    };
  }, [enabled]);

  return dialogRef;
}
