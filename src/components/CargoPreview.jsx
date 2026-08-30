import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HiOutlineCube } from 'react-icons/hi2';
import styles from './CargoPreview.module.css';

/**
 * Compact cargo summary with a pointer, keyboard, and touch-friendly manifest
 * preview. The optional span trigger keeps card views valid when the parent is
 * already a clickable element.
 */
export function CargoPreview({ items = [], as = 'button', interactive = as !== 'span', className = '' }) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, ready: false });
  const rawId = useId();
  const previewId = `cargo-preview-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimerRef = useRef(null);
  const suppressFocusOpenRef = useRef(false);
  const itemRows = Array.from(items || []);
  const totalUnits = itemRows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const itemLabel = `${itemRows.length} item${itemRows.length === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePreview = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    setPopoverPosition((current) => ({ ...current, ready: false }));
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closePreview();
    }, 120);
  }, [clearCloseTimer, closePreview]);

  const openPreview = useCallback(() => {
    if (!interactive) return;
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer, interactive]);

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const gutter = 16;
    const gap = 8;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter);
    const left = Math.min(Math.max(gutter, triggerRect.left), maxLeft);
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - height - gap;
    const top = below + height <= window.innerHeight - gutter
      ? below
      : Math.max(gutter, above);

    setPopoverPosition({ top, left, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (open) positionPopover();
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        closePreview();
        suppressFocusOpenRef.current = true;
        triggerRef.current?.focus();
      }
    };
    const closeOnOutsidePointer = (event) => {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      closePreview();
    };
    const reposition = () => positionPopover();
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [closePreview, open, positionPopover]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const triggerProps = { className: styles.trigger, ref: triggerRef };
  if (interactive) {
    Object.assign(triggerProps, {
      'aria-expanded': open,
      'aria-controls': previewId,
      onClick: (event) => {
        event.stopPropagation();
        if (open) closePreview();
        else openPreview();
      },
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (open) closePreview();
          else openPreview();
        }
      },
      onFocus: () => {
        if (suppressFocusOpenRef.current) {
          suppressFocusOpenRef.current = false;
          return;
        }
        if (triggerRef.current?.matches(':focus-visible')) openPreview();
      },
      onBlur: (event) => {
        if (event.relatedTarget !== popoverRef.current && !popoverRef.current?.contains(event.relatedTarget)) scheduleClose();
      },
    });
  }

  const Trigger = as === 'span' ? 'span' : 'button';
  if (Trigger === 'span' && interactive) {
    triggerProps.role = 'button';
    triggerProps.tabIndex = 0;
  }

  return (
    <span
      className={`${styles.root} ${className}`}
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClose}
    >
      <Trigger {...triggerProps} type={Trigger === 'button' ? 'button' : undefined}>
        <HiOutlineCube className={styles.icon} aria-hidden="true" />
        <span className={styles.summary} title={interactive ? 'View cargo manifest' : undefined}>{itemLabel}</span>
      </Trigger>
      {open && createPortal(
        <span
          ref={popoverRef}
          id={previewId}
          className={styles.popover}
          role="dialog"
          aria-label="Shipment contents"
          data-ready={popoverPosition.ready}
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <span className={styles.popoverHeader}>
            <span className={styles.popoverIcon} aria-hidden="true">
              <HiOutlineCube />
            </span>
            <span className={styles.popoverHeading}>
              <strong className={styles.popoverTitle}>Shipment contents</strong>
              <span className={styles.popoverMeta}>
                {itemRows.length} item type{itemRows.length === 1 ? '' : 's'}
              </span>
            </span>
          </span>
          <span className={styles.popoverDivider} aria-hidden="true" />
          {itemRows.length > 0 ? (
            <span className={styles.items}>
              {itemRows.map((item, index) => (
                <span className={styles.item} key={`${item.itemName || item.name || 'item'}-${index}`}>
                  <span className={styles.itemInfo}>
                    <strong>{item.itemName || item.name || 'Unnamed item'}</strong>
                    <span
                      className={styles.description}
                      title={item.itemDescription || item.description || 'No description provided.'}
                      aria-label={item.itemDescription || item.description || 'No description provided.'}
                    >
                      {truncateDescription(item.itemDescription || item.description || 'No description provided.')}
                    </span>
                  </span>
                  <span className={styles.quantity}>Qty {item.quantity}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.empty}>No item manifest was recorded.</span>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** Keep manifest previews scannable without losing the full description. */
export function truncateDescription(value, maxLength = 50) {
  const description = String(value || '');
  if (description.length <= maxLength) return description;
  if (maxLength <= 0) return '';
  return `${description.slice(0, maxLength)}…`;
}
