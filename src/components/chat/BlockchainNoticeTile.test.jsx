import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlockchainNoticeTile } from './BlockchainNoticeTile';

describe('BlockchainNoticeTile', () => {
  it('renders concise blockchain activity as a neutral row with inline time', () => {
    const { container } = render(
      <BlockchainNoticeTile notice={{ text: 'Request created', tone: 'success', timestampMs: 1_700_000_000_000 }} />,
    );
    expect(screen.getByText('Request created')).toBeTruthy();
    expect(container.querySelector('time')).toBeTruthy();
    expect(container.querySelector('[class*="success"]')).toBeNull();
  });

  it('emphasizes structured event subjects while retaining accessible full copy', () => {
    const { container } = render(
      <BlockchainNoticeTile notice={{
        text: 'Proposal #1 submitted',
        subject: 'Proposal #1',
        action: 'submitted',
        tone: 'proposal',
      }} />,
    );
    expect(screen.getByText('Proposal #1')).toBeTruthy();
    expect(screen.getByText('submitted')).toBeTruthy();
    expect(container.querySelector('[aria-label="Proposal #1 submitted"]')).toBeTruthy();
  });
});
