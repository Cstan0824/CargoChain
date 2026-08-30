import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', chainId: 1337 },
}));

vi.mock('../hooks/useWallet.js', () => ({ useWallet: () => mocks.wallet }));
vi.mock('./ConnectButton.jsx', () => ({ ConnectButton: () => <button type="button">Wallet connected</button> }));
vi.mock('./CargoChainLogo.jsx', () => ({ CargoChainLogo: () => <span>CargoChain</span> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

import { Sidebar } from './Sidebar.jsx';

describe('Sidebar', () => {
  it('exposes the compact four-item navigation and sends wallet details to Account', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Marketplace' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'My Shipments' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Account' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Funds' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Account wallet details' }));
    expect(screen.getByTestId('location').textContent).toBe('/account');
  });
});
