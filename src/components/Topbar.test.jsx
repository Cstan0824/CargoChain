import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => ({ account: null }),
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { Topbar } from './Topbar.jsx';

describe('Topbar', () => {
  it('renders page actions alongside utilities and routes the utility to Account', () => {
    render(
      <MemoryRouter>
        <Topbar title="Marketplace" subtitle="Open requests" actions={<button type="button">Create request</button>} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create request' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open wallet profile' }).getAttribute('href')).toBe('/account');
  });
});
