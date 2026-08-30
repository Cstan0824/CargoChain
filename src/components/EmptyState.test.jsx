import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState.jsx';

describe('EmptyState', () => {
  it('supports a compact state with one contextual action', () => {
    render(<EmptyState compact title="No shipments" description="Nothing is here yet." action={<button type="button">Create request</button>} />);

    expect(screen.getByRole('heading', { name: 'No shipments' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create request' })).toBeTruthy();
  });
});
