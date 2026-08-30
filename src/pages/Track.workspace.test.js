import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Shipment detail workspace structure', () => {
  it('shows checkpoint allocation in the timeline and insets both workspace panes', () => {
    const page = source('./Track.jsx');
    const styles = source('./Track.module.css');

    expect(page).toContain('className={styles.tlEscrowAllocation}');
    expect(page).toContain('milestoneEscrowAllocation(eventMilestone)');
    expect(page).toContain('Escrow allocation');
    expect(styles).toContain('.checkpointsCard .timelineWorkspace { padding: var(--s-5); }');
    expect(styles).toContain('.tlEscrowAllocation {');
  });

  it('places standalone escrow activity after remarks and removes on-chain history', () => {
    const page = source('./Track.jsx');

    expect(page.indexOf('className={styles.remarksCard}'))
      .toBeLessThan(page.indexOf('className={styles.escrowActivityCard}'));
    expect(page).toContain('<EscrowActivityPanel');
    expect(page).not.toContain('On-chain history');
    expect(page).not.toContain('loadPaymentHistory');
    expect(page).not.toContain('paymentHistory');
  });

  it('centers the Messages gate without a conversation-column offset', () => {
    const styles = source('../components/chat/ChatAuthGate.module.css');

    expect(styles).toContain('left: 50%;');
    expect(styles).not.toContain('left: calc(50% + 170px);');
    expect(styles).toContain('width: min(400px, calc(100% - var(--s-10)));');
  });
});
