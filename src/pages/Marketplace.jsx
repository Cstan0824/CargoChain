// src/pages/Marketplace.jsx — CargoChain
// Browse `Open` delivery requests (BusinessFlow §7). Row layout (left→right):
//   Milestones (inline progress line) · Route · Reward · Deadline · Action
// Items live on the RequestDetail page (not in the row).
// "View" opens the RequestDetail page; "Accept Job" is the carrier's entry
// point into the request.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineMapPin,
  HiOutlineEye,
  HiOutlineLockClosed,
} from 'react-icons/hi2';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { Topbar } from '../components/Topbar.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { FilterPill } from '../components/FilterPill.jsx';
import { Button } from '../components/Button.jsx';
import { Table } from '../components/Table.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Card } from '../components/Card.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { formatEth, formatRelative, formatDate, formatDaysLeft } from '../utils/format.js';
import { deliveryTruckCity } from '../assets';
import styles from './Marketplace.module.css';

// Demo rows. `createdAt` is the request's creation timestamp; `deadlineMs`
// is the request's deadline. status is implicit `Open` for marketplace rows.
const DEMO_ROWS = [
  { id: 1001, from: 'Kuala Lumpur',  to: 'Penang',      milestones: 4, current: 0, rewardWei: 2500000000000000000n, deadlineMs: Date.now() + 5 * 86400000,  createdAt: Math.floor(Date.now() / 1000) - 7200 },
  { id: 1002, from: 'Johor Bahru',  to: 'Singapore',   milestones: 3, current: 0, rewardWei: 350000000000000000n,  deadlineMs: Date.now() + 8 * 3600000,   createdAt: Math.floor(Date.now() / 1000) - 3600 },
  { id: 1003, from: 'Shah Alam',    to: 'Kuala Lumpur', milestones: 3, current: 0, rewardWei: 1800000000000000000n, deadlineMs: Date.now() + 86400000,      createdAt: Math.floor(Date.now() / 1000) - 18000 },
  { id: 1004, from: 'Kuala Lumpur', to: 'Ipoh',        milestones: 5, current: 0, rewardWei: 3200000000000000000n, deadlineMs: Date.now() + 6 * 86400000,  createdAt: Math.floor(Date.now() / 1000) - 86400 },
  { id: 1005, from: 'Malacca',      to: 'Kuala Lumpur', milestones: 4, current: 0, rewardWei: 1250000000000000000n, deadlineMs: Date.now() + 5 * 86400000,  createdAt: Math.floor(Date.now() / 1000) - 259200 },
];

export function Marketplace() {
  const navigate = useNavigate();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState('All Routes');

  useEffect(() => {
    if (!contracts?.deliveryEscrow) {
      setRows(DEMO_ROWS);
      return;
    }
    setLoading(true);
    setError(null);
    contracts.deliveryEscrow.getOpenRequests(0n, 50n)
      .then(() => {
        // Until module b wires the per-id fetch, fall back to demo rows.
        setRows(DEMO_ROWS);
      })
      .catch((e) => {
        setError(e.shortMessage || e.message);
        setRows(DEMO_ROWS);
      })
      .finally(() => setLoading(false));
  }, [contracts]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (route !== 'All Routes') {
        if (!`${r.from} → ${r.to}`.toLowerCase().includes(route.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, route]);

  const openDetails = (id) => navigate(`/requests/${id}`);
  const acceptJob = (id) => {
    show(
      `Accept Job — module d (Melissa). Request #${id} would transition Open → PendingApproval.`,
      'info',
    );
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Marketplace"
        subtitle="Find open delivery jobs posted by shippers. Accept and start earning."
      />

      <Card className={styles.filterBar} padded={false}>
        <div className={styles.filterRow}>
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={() => {/* live filter only */}}
            placeholder="Search routes or keyword…"
            actionLabel="Search"
          />
          <FilterPill
            label="Route"
            value={route}
            options={['All Routes', 'Kuala Lumpur', 'Penang', 'Johor Bahru', 'Singapore', 'Shah Alam', 'Ipoh', 'Malacca']}
            onChange={setRoute}
          />
        </div>
      </Card>

      {deployError && (
        <Card className={styles.notice}>
          <strong>Contracts not deployed.</strong>{' '}
          <span className={styles.muted}>
            Showing demo data. Run <code>npm run migrate</code> to populate the table.
          </span>
        </Card>
      )}

      {error && !deployError && (
        <Card className={styles.notice}><span className={styles.muted}>Couldn't load on-chain data: {error}. Showing demo data.</span></Card>
      )}

      <div className={styles.tableCard}>
        {filtered.length === 0 ? (
          <Card padded={false} className={styles.emptyCard}>
            <EmptyState
              illustration={deliveryTruckCity}
              title={deployError ? 'No requests yet' : 'No matches'}
              description={
                deployError
                  ? 'Run npm run migrate to deploy contracts and populate the marketplace.'
                  : 'No open requests match your current filters. Try clearing the search or picking a different route.'
              }
              action={
                !deployError && (
                  <Button variant="secondary" onClick={() => { setSearch(''); setRoute('All Routes'); }}>
                    Clear filters
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <Table
            columns={[
              {
                key: 'route',
                header: 'Route',
                width: '20%',
                render: (r) => (
                  <button type="button" className={styles.routeCell} onClick={() => openDetails(r.id)}>
                    <span className={styles.pin} aria-hidden="true">
                      <HiOutlineMapPin size={14} />
                    </span>
                    <div className={styles.routeText}>
                      <div className={styles.routeFrom} title={r.from}>{r.from}</div>
                      <div className={styles.routeTo}>→ {r.to}</div>
                    </div>
                  </button>
                ),
              },
              {
                key: 'milestones',
                header: 'Milestones',
                width: '14%',
                render: (r) => (
                  <div className={styles.milestoneCell}>
                    <ProgressLine count={r.milestones} current={r.current} label={false} />
                    <span className={styles.milestoneLabel}>{r.current} / {r.milestones}</span>
                  </div>
                ),
              },
              {
                key: 'reward',
                header: 'Reward',
                width: '12%',
                render: (r) => (
                  <div className={styles.rewardCell}>
                    <div className={styles.rewardMain}>{formatEth(r.rewardWei)}</div>
                  </div>
                ),
              },
              {
                key: 'deadline',
                header: 'Deadline',
                width: '16%',
                render: (r) => (
                  <div className={styles.deadlineCell}>
                    <div className={styles.deadlineMain}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                    <div className={styles.deadlineSub}>{formatDaysLeft(r.deadlineMs)}</div>
                  </div>
                ),
              },
              {
                key: 'publishDate',
                header: 'Publish date',
                width: '14%',
                render: (r) => (
                  <div className={styles.publishCell}>
                    <div className={styles.publishMain}>{formatDate(r.createdAt)}</div>
                    <div className={styles.publishSub}>{formatRelative(r.createdAt)}</div>
                  </div>
                ),
              },
              {
                key: 'action',
                header: '',
                width: '24%',
                align: 'right',
                render: (r) => (
                  <div className={styles.actionCell}>
                    <button
                      type="button"
                      className={styles.viewBtn}
                      onClick={() => openDetails(r.id)}
                      title="View request details"
                    >
                      <HiOutlineEye className={styles.viewIcon} aria-hidden="true" /> View
                    </button>
                    <Button size="sm" onClick={() => acceptJob(r.id)}>
                      Accept Job
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            emptyMessage="No open requests match the current filters."
          />
        )}
      </div>

      <Card className={styles.privacy}>
        <span className={styles.privacyIcon} aria-hidden="true">
          <HiOutlineLockClosed size={18} />
        </span>
        <span>
          <strong>For your privacy and safety,</strong> shipper and carrier addresses are only visible after a job is accepted.{' '}
          <a href="#">Learn more</a>
        </span>
      </Card>
    </div>
  );
}
