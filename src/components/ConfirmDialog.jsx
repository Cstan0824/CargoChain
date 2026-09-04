import { useRef } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { ModalShell } from './ModalShell.jsx';
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
  return (
    <ModalShell
      size="sm"
      role="alertdialog"
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-message"
      onClose={onCancel}
      className={styles.dialog}
      initialFocusRef={isDanger ? cancelButtonRef : confirmButtonRef}
    >
        <div className={`${styles.iconWrap} ${isDanger ? styles.dangerIcon : styles.primaryIcon}`}>
          <Icon aria-hidden="true" />
        </div>
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
        <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="Close confirmation">
          <HiOutlineXMark aria-hidden="true" />
        </button>
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
    </ModalShell>
  );
}
