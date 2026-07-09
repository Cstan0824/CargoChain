// src/App.jsx — CargoChain
// Router setup. The Layout (Sidebar + main slot) lives outside
// <Routes> so it stays mounted across page changes.
//
// Note: only top-level destinations are surfaced in the sidebar (see
// Sidebar.jsx). /track and /create-request stay as routes so that
// list-page CTAs (MyShipments row click, Profile tx row, etc.) can
// still navigate to them.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Marketplace } from './pages/Marketplace.jsx';
import { Shipper } from './pages/Shipper.jsx';
import { Carrier } from './pages/Carrier.jsx';
import { Track } from './pages/Track.jsx';
import { MyShipments } from './pages/MyShipments.jsx';
import { Profile } from './pages/Profile.jsx';
import { ProposeMilestones } from './pages/ProposeMilestones.jsx';
import { RequestDetail } from './pages/RequestDetail.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Top-level destinations (in sidebar) */}
          <Route path="/" element={<Marketplace />} />
          <Route path="/my-shipments" element={<MyShipments />} />
          <Route path="/profile" element={<Profile />} />

          {/* Off-sidebar routes — reachable via list-page actions */}
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/shipments/:id/propose" element={<ProposeMilestones />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:id" element={<Track />} />

          {/* Role-specific dashboards — kept for future module handoff */}
          <Route path="/shipper" element={<Shipper />} />
          <Route path="/carrier" element={<Carrier />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
