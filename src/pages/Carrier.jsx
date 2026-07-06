// src/pages/Carrier.jsx — CargoChain
// Route: /carrier
// Carrier dashboard: browse available requests, accept one, submit
// milestone proof. Stub — Module b (GAN) and Module d (Melissa) owners
// will build the accept flow and the photo upload UI.

import { useEffect, useState } from 'react';
import { useContracts } from '../hooks/useContracts.js';
import { RequireWallet } from '../components/RequireWallet.jsx';

export function Carrier() {
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
        <h1>Carrier dashboard</h1>
        {deployError && <p className="error">{deployError}</p>}
        {error       && <p className="error">{error}</p>}

        <h2>Available to accept ({openIds.length})</h2>
        <p className="muted">
          Stub: Module b owner (GAN) builds the accept button here. It will
          call <code>acceptRequest(requestId)</code>.
        </p>
        <ul>
          {openIds.map((id) => <li key={id}>Request #{id}</li>)}
        </ul>

        <h2>My active jobs</h2>
        <p className="muted">
          Stub: requests where <code>carrier == account</code>. Module d owner
          (Melissa) builds the per-milestone photo upload UI here, calling
          <code>submitProof(requestId, milestoneId, proofHash)</code>.
        </p>
      </main>
    </RequireWallet>
  );
}
