import { HiOutlineXMark } from 'react-icons/hi2';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import styles from './BrandedModal.module.css';

export function BrandedModal({
  title,
  description,
  Icon,
  onClose,
  busy = false,
  size = 'md',
  children,
  footer,
  labelledBy,
}) {
  const dialogRef = useDialogFocus({ onClose, closeDisabled: busy });
  const titleId = labelledBy || `modal-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} className={`${styles.modal} ${styles[size] || styles.md}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div className={styles.heading}>
            {Icon && <span className={styles.icon} aria-hidden="true"><Icon /></span>}
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label={`Close ${title}`}>
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>
  );
}
