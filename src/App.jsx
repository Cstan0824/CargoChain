// Router setup. Wallet connection is requested only for actions that need it.

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { Marketplace } from './pages/Marketplace.jsx';
import { Track } from './pages/Track.jsx';
import { MyShipments } from './pages/MyShipments.jsx';
import { Account } from './pages/Account.jsx';
import { Messages } from './pages/Messages.jsx';
import { ProposeMilestones } from './pages/ProposeMilestones.jsx';
import { RequestDetail } from './pages/RequestDetail.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Marketplace />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:id" element={<Track />} />
          <Route path="/my-shipments" element={<MyShipments />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:conversationId" element={<Messages />} />
          <Route path="/account" element={<Account />} />
          <Route path="/profile" element={<Navigate to="/account" replace />} />
          <Route path="/funds" element={<Navigate to="/account" replace />} />
          <Route path="/shipments/:id/propose" element={<ProposeMilestones />} />
          <Route path="/shipper" element={<Navigate to="/my-shipments" replace />} />
          <Route path="/carrier" element={<Navigate to="/my-shipments" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
