import { useEffect, useRef } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Button } from './Button.jsx';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({
  title,
  message,
  details = [],
  warning,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const isDanger = tone === 'danger';
  const Icon = isDanger ? HiOutlineExclamationTriangle : HiOutlineInformationCircle;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (isDanger ? cancelButtonRef.current : confirmButtonRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isDanger, onCancel]);

  return (
    <div className={styles.scrim} onMouseDown={onCancel}>
      <section
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${styles.iconWrap} ${isDanger ? styles.dangerIcon : styles.primaryIcon}`}>
          <Icon aria-hidden="true" />
        </div>
        <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="Close confirmation">
          <HiOutlineXMark aria-hidden="true" />
        </button>
        <div className={styles.content}>
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-message">{message}</p>
          {details.length > 0 && (
            <dl className={styles.details}>
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {warning && <p className={styles.warning}>{warning}</p>}
        </div>
        <div className={styles.actions}>
          <Button ref={cancelButtonRef} variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            ref={confirmButtonRef}
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
