import { HiOutlineXMark } from 'react-icons/hi2';
import { useId } from 'react';
import { ModalShell } from './ModalShell.jsx';
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
  initialFocusRef,
}) {
  const generatedId = useId();
  const titleId = labelledBy || `modal-${generatedId.replace(/[^a-z0-9]+/gi, '')}`;
  const descriptionId = description ? `${titleId}-description` : undefined;
  return (
    <ModalShell
      size={size}
      onClose={onClose}
      busy={busy}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={initialFocusRef}
    >
        <header className={styles.header}>
          <div className={styles.heading}>
            {Icon && <span className={styles.icon} aria-hidden="true"><Icon /></span>}
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label={`Close ${title}`}>
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
    </ModalShell>
  );
}
