// src/App.jsx — CargoChain
// Router setup. The Navbar lives outside <Routes> so it stays mounted
// across page changes. Each <Route> renders one page component from
// src/pages/. The four pages correspond 1:1 to the four pages described
// in AGENTS.md § Repository Structure.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { Marketplace } from './pages/Marketplace.jsx';
import { Shipper } from './pages/Shipper.jsx';
import { Carrier } from './pages/Carrier.jsx';
import { Track } from './pages/Track.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/shipper" element={<Shipper />} />
        <Route path="/carrier" element={<Carrier />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:id" element={<Track />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
