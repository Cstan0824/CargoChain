import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setSearchParams: vi.fn(),
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', connect: vi.fn() },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(), mocks.setSearchParams],
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('../hooks/useWallet.js', () => ({ useWallet: () => mocks.wallet }));
vi.mock('../hooks/useContracts.js', () => ({ useContracts: () => ({ contracts: null, deployError: null }) }));
vi.mock('../hooks/useToast.js', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('../components/CreateRequestModal.jsx', () => ({ CreateRequestModal: () => null }));

import { Marketplace } from './Marketplace.jsx';

describe('Marketplace layout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places the primary create action in the shared header', () => {
    render(<Marketplace />);

    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'Create request' })).toBeTruthy();
    expect(screen.getByRole('search', { name: 'Filter marketplace requests' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search routes or keyword…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'List view' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Card view' })).toBeTruthy();
    expect(screen.getByText('No open requests yet')).toBeTruthy();
    expect(screen.queryByText('Open requests could not be loaded.')).toBeNull();
  });
});
