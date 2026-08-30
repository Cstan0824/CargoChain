import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Phase 8 interface structure', () => {
  it('centers milestone connectors between route checkpoints', () => {
    const milestones = source('./ProposeMilestones.module.css');
    const connector = milestones.match(/\.timelineConnectorLine \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(connector).toContain('align-self: center;');
    expect(connector).not.toContain('margin-left:');
  });

  it('shows sender labels only for incoming chat bubbles', () => {
    const timeline = source('../components/chat/MessageTimeline.jsx');

    expect(timeline).toContain('{!isSender && <p className={styles.meta}>{senderName}</p>}');
    expect(timeline).toContain('<time className={styles.bubbleTime}');
  });

  it('keeps removed shipment-detail guidance out of the open proposal surface', () => {
    const track = source('./Track.jsx');

    expect(track).not.toContain('Your request is open while carriers prepare their proposals.');
    expect(track).not.toContain('Your request remains visible in the marketplace while waiting for a carrier.');
    expect(track).not.toContain('Each carrier can have one active proposal while the shipper reviews the options.');
    expect(track).not.toContain('This is your active proposal.');
  });
});
