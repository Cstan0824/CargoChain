import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Phase 11 shipment and marketplace layout structure', () => {
  it('keeps shipment chat before the compact bordered edit action', () => {
    const page = source('./MyShipments.jsx');
    const styles = source('./MyShipments.module.css');

    expect(page.indexOf('<ChatButton')).toBeLessThan(page.indexOf('styles.editBtn'));
    expect(page).toContain('className={styles.shipmentChatButton}');
    expect(styles).toContain('.shipmentChatButton {');
    expect(styles).toContain('.editBtn {');
    expect(styles).toContain('width: 40px;');
    expect(styles).toContain('box-shadow: var(--shadow-border);');
  });

  it('uses an unlabeled chevron action and right-aligned marketplace view toggle', () => {
    const page = source('./Marketplace.jsx');
    const styles = source('./Marketplace.module.css');

    expect(page).toContain("header: 'Shipment contents'");
    expect(page).not.toContain("header: 'Action'");
    expect(page).toContain('HiOutlineChevronRight');
    expect(page).toContain('event.stopPropagation()');
    expect(page).toContain('className={styles.search}');
    expect(styles).toContain('flex-wrap: nowrap;');
    expect(styles).toContain('margin-left: auto;');
  });

  it('keeps open-request content in separate full-width rows and reserves the proposal action track', () => {
    const page = source('./Track.jsx');
    const styles = source('./Track.module.css');

    expect(page).not.toContain('openRequestContentsGrid');
    expect(styles).not.toContain('.openRequestContentsGrid');
    expect(page).toContain('className={styles.proposalSummaryActionLabel}');
    expect(page).toContain('Review proposal');
    expect(page).not.toContain('proposalSummaryReviewHint');
    expect(styles).toContain('grid-template-columns: minmax(150px, 1fr) auto 136px;');
    expect(styles).toContain('transition-property: width, background-color, box-shadow, color, scale;');
    expect(styles).toContain('filter: blur(4px);');
    expect(styles).toContain('filter: blur(0px);');
    expect(styles).toContain('transition-duration: 200ms;');
    expect(styles).toContain('cubic-bezier(0.2, 0, 0, 1)');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('box-shadow: none;');
    expect(styles).not.toContain('transition: all');
  });
});
