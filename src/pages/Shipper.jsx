// src/pages/Shipper.jsx — CargoChain
// Route: /shipper
// Shipper dashboard: create a delivery request, view own requests, verify
// milestones. Stub — Module b (GAN) and Module c (Jeremy) owners will
// build the create form and the verification panel.

import { useEffect, useState } from 'react';
import { useContracts } from '../hooks/useContracts.js';
import { RequireWallet } from '../components/RequireWallet.jsx';

export function Shipper() {
  const { contracts, deployError } = useContracts();
  const [openIds, setOpenIds] = useState([]);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!contracts) return;
    contracts.deliveryEscrow.getOpenRequests(0n, 50n)
      .then((result) => setOpenIds(result.map((x) => Number(x))))
      .catch((e) => setError(e.shortMessage || e.message));
  }, [contracts]);

  return (
    <RequireWallet>
      <main>
        <h1>Shipper dashboard</h1>
        {deployError && <p className="error">{deployError}</p>}
        {error       && <p className="error">{error}</p>}

        <h2>Create request</h2>
        <p className="muted">
          Stub: Module b owner (GAN) builds the create form here. It will
          call <code>createRequest(goodsInfo, milestones, acceptDeadline)</code>
          {' '}with ETH attached.
        </p>

        <h2>Open marketplace requests ({openIds.length})</h2>
        <p className="muted">
          The full shipper view filters these by <code>shipper == account</code>.
          Stub for now — visible to confirm the read pipeline works.
        </p>
        <ul>
          {openIds.map((id) => <li key={id}>Request #{id}</li>)}
        </ul>

        <h2>My requests</h2>
        <p className="muted">Stub: list requests created by this wallet. Module b owner.</p>

        <h2>Awaiting my verification</h2>
        <p className="muted">Stub: milestones with status <code>AwaitingVerification</code>. Module c owner (Jeremy).</p>
      </main>
    </RequireWallet>
  );
}
