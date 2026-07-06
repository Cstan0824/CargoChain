// src/pages/Marketplace.jsx — CargoChain
// Route: /
// Lists open delivery requests. Stub — the team (Module b owner: GAN)
// will build the full UI: filters, accept button, request detail panel.

import { useEffect, useState } from 'react';
import { useContracts } from '../hooks/useContracts.js';

export function Marketplace() {
  const { contracts, deployError } = useContracts();
  const [ids, setIds]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contracts) return;
    setLoading(true);
    setError(null);
    contracts.deliveryEscrow.getOpenRequests(0n, 20n)
      .then((result) => setIds(result.map((x) => Number(x))))
      .catch((e) => setError(e.shortMessage || e.message))
      .finally(() => setLoading(false));
  }, [contracts]);

  if (deployError) {
    return (
      <main>
        <h1>Marketplace</h1>
        <p className="error">{deployError}</p>
        <p className="muted">
          Once the contracts are written, run <code>npm run compile &amp;&amp; npm run migrate</code> to deploy them to Ganache.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Marketplace</h1>
      <p className="muted">
        Open delivery requests, available for any carrier to accept (FCFS).
      </p>

      {loading && <p>Loading…</p>}
      {error   && <p className="error">{error}</p>}

      {!loading && !error && ids.length === 0 && (
        <p>No open requests yet. The shipper can create one from the Shipper page.</p>
      )}

      {ids.length > 0 && (
        <ul>
          {ids.map((id) => (
            <li key={id}>
              Request #{id}{' '}
              <span className="muted">(stub: accept button goes here — Module b owner)</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
