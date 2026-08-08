// src/App.jsx — CargoChain
// Router setup. The Layout (Sidebar + main slot) lives outside
// <Routes> so it stays mounted across page changes.
//
// Note: only top-level destinations are surfaced in the sidebar (see
// Sidebar.jsx). /track and /create-request stay as routes so that
// list-page CTAs (MyShipments row click, Profile tx row, etc.) can
// still navigate to them.

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { RouteLoading } from './components/RouteLoading.jsx';

function lazyPage(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const Marketplace = lazyPage(() => import('./pages/Marketplace.jsx'), 'Marketplace');
const Track = lazyPage(() => import('./pages/Track.jsx'), 'Track');
const MyShipments = lazyPage(() => import('./pages/MyShipments.jsx'), 'MyShipments');
const Profile = lazyPage(() => import('./pages/Profile.jsx'), 'Profile');
const Messages = lazyPage(() => import('./pages/Messages.jsx'), 'Messages');
const ProposeMilestones = lazyPage(() => import('./pages/ProposeMilestones.jsx'), 'ProposeMilestones');
const RequestDetail = lazyPage(() => import('./pages/RequestDetail.jsx'), 'RequestDetail');

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
          {/* Top-level destinations (in sidebar) */}
          <Route path="/" element={<Marketplace />} />
          <Route path="/my-shipments" element={<MyShipments />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:conversationId" element={<Messages />} />
          <Route path="/profile" element={<Profile />} />

          {/* Off-sidebar routes — reachable via list-page actions */}
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/shipments/:id/propose" element={<ProposeMilestones />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:id" element={<Track />} />

          {/* Retired legacy dashboards now lead to their live replacements. */}
          <Route path="/shipper" element={<Navigate to="/my-shipments" replace />} />
          <Route path="/carrier" element={<Navigate to="/my-shipments" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
