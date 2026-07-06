// src/pages/Track.jsx — CargoChain
// Route: /track and /track/:id
// Public timeline view. Works without a wallet (no .send() calls).
// If `:id` is missing, shows an input to enter one. Calls
// LifecycleManager.getRequestTimeline(id) and renders the events.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useContracts } from '../hooks/useContracts.js';
import { formatDate, shortAddress } from '../utils/format.js';

export function Track() {
  const { id: idParam } = useParams();
  const navigate        = useNavigate();
  const { contracts, deployError } = useContracts();

  const [events, setEvents]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const [draft,   setDraft]     = useState(idParam || '');

  const load = async (rawId) => {
    if (!contracts || rawId == null || rawId === '') return;
    setLoading(true);
    setError(null);
    try {
      const id = BigInt(rawId);
      // Ethers v6 returns an array of struct-like objects.
      const result = await contracts.lifecycleManager.getRequestTimeline(id);
      setEvents(result);
    } catch (e) {
      setError(e.shortMessage || e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount if :id is in the URL.
  // (Effect-style behaviour is fine here because we want it to run on
  // every idParam change, not just once.)
  if (idParam && events === null && !loading && !error) {
    load(idParam);
  }

  const onSubmit = (e) => {
    e.preventDefault();
    if (!draft) return;
    navigate(`/track/${draft}`);
  };

  return (
    <main>
      <h1>Public tracker</h1>
      <p className="muted">No wallet needed. Enter a request ID to see its timeline.</p>

      <form onSubmit={onSubmit}>
        <input
          type="number"
          min="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Request ID"
          style={{ maxWidth: 200, marginRight: 8 }}
        />
        <button type="submit" className="secondary">Track</button>
      </form>

      {deployError && <p className="error">{deployError}</p>}
      {loading      && <p>Loading timeline…</p>}
      {error        && <p className="error">{error}</p>}

      {events && events.length === 0 && <p>No events for this request yet.</p>}

      {events && events.length > 0 && (
        <ul className="timeline">
          {events.map((ev, i) => (
            <li key={i}>
              <span className="muted">{formatDate(ev.timestamp)}</span>
              {' — '}
              <strong>{ev.eventType}</strong>
              {ev.actor && ` by ${shortAddress(ev.actor)}`}
              {ev.details && <div className="muted">{ev.details}</div>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
