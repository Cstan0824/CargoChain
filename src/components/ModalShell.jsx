import { useId } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import styles from './ModalShell.module.css';

/**
 * Shared modal surface for all dialog families. Content components own their
 * header/body/footer layout; this component owns the scrim, focus lifecycle,
 * dismissal rules, sizing, and accessible dialog semantics.
 */
export function ModalShell({
  children,
  onClose,
  busy = false,
  size = 'md',
  role = 'dialog',
  labelledBy,
  describedBy,
  ariaLabel,
  initialFocusRef,
  closeOnBackdrop = true,
  className = '',
  overlayClassName = '',
}) {
  const fallbackId = useId();
  const dialogRef = useDialogFocus({
    onClose,
    closeDisabled: busy,
    initialFocusRef,
  });
  const ariaLabelledBy = labelledBy || undefined;
  const ariaDescribedBy = describedBy || undefined;

  return (
    <div
      className={`${styles.overlay} ${overlayClassName}`}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`${styles.modal} ${styles[size] || styles.md} ${className}`}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-label={!ariaLabelledBy ? (ariaLabel || `Dialog ${fallbackId}`) : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

