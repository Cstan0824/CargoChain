// src/components/Navbar.jsx — CargoChain
// Top navigation. Stays mounted across page transitions (lives in App.jsx
// outside <Routes>). Shows the four page links and the wallet button.

import { NavLink } from 'react-router-dom';
import { ConnectButton } from './ConnectButton.jsx';

export function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand">CargoChain</NavLink>
        <nav>
          <NavLink to="/"        end className={({ isActive }) => isActive ? 'active' : ''}>
            Marketplace
          </NavLink>
          <NavLink to="/shipper"     className={({ isActive }) => isActive ? 'active' : ''}>
            Shipper
          </NavLink>
          <NavLink to="/carrier"     className={({ isActive }) => isActive ? 'active' : ''}>
            Carrier
          </NavLink>
          <NavLink to="/track"       className={({ isActive }) => isActive ? 'active' : ''}>
            Track
          </NavLink>
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}
