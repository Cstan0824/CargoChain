// src/pages/MyShipments.jsx — CargoChain
// Shipments the connected carrier is handling. Per BusinessFlow §7 this
// is "requests where wallet is shipper or carrier" — the shipper view
// lives in the Shipper dashboard, so this page is the carrier slice
// only. Status filter tabs + a table with inline milestone progress
// and a per-row deadline cell.
//
// Refunded rows expose a "Reopen to marketplace" action — the shipper
// can republish the request (BusinessFlow §5 Scenario D). On this
// carrier-facing view, the action is a placeholder that will wire to
// the contract's republish flow once Module b lands.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { Table } from '../components/Table.jsx';
import { Badge } from '../components/Badge.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { clipboardRouteMap } from '../assets';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import {
  formatEth,
  formatDate,
  formatDaysLeft,
  requestStatus,
  REQUEST_TONE,
} from '../utils/format.js';
import styles from './MyShipments.module.css';

// Demo shipments — all are carrier-handled. `current` is the number of
// milestones already paid; `milestones` is the total. `deadlineMs` is
// used by the Deadline cell to render date + days-left.
const NOW = Date.now();
const DAY = 86400000;

const DEMO_ROWS = [
  { id: 1001, from: 'Kuala Lumpur', to: 'Penang',      milestones: 4, current: 2, rewardWei: 2500000000000000000n, deadlineMs: NOW + 3 * DAY,  status: 'InProgress' },
  { id: 1003, from: 'Shah Alam',    to: 'Kuala Lumpur', milestones: 3, current: 3, rewardWei: 1800000000000000000n, deadlineMs: NOW - 2 * DAY,  status: 'Completed' },
  { id: 1005, from: 'Kuala Lumpur', to: 'Ipoh',        milestones: 5, current: 3, rewardWei:  900000000000000000n, deadlineMs: NOW + 6 * DAY,  status: 'InProgress' },
  { id: 1008, from: 'Johor Bahru',  to: 'Melaka',      milestones: 2, current: 0, rewardWei:  450000000000000000n, deadlineMs: NOW + 5 * DAY,  status: 'Funded' },
  { id: 1002, from: 'Johor Bahru',  to: 'Singapore',   milestones: 3, current: 1, rewardWei:  350000000000000000n, deadlineMs: NOW - 8 * DAY,  status: 'Refunded' },
  { id: 1011, from: 'Penang',       to: 'Ipoh',        milestones: 3, current: 0, rewardWei:  720000000000000000n, deadlineMs: NOW - 3 * DAY,  status: 'Refunded' },
];

const STATUS_TABS = [
  { value: 'all',         label: 'All' },
  { value: 'Funded',      label: 'Funded' },
  { value: 'InProgress',  label: 'In progress' },
  { value: 'Completed',   label: 'Completed' },
  { value: 'Refunded',    label: 'Refunded' },
];

export function MyShipments() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { deployError } = useContracts();
  const { show } = useToast();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const rows = DEMO_ROWS;

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to} ${r.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tab, search]);

  const reopen = (id) => {
    show(
      `Reopen to marketplace — module b (GAN). Request #${id} would call republishRequest(${id}) and re-emit as a new Open request.`,
      'info',
    );
  };

  const openTimeline = (id) => navigate(`/track/${id}`);

  return (
    <div className={styles.page}>
      <Topbar
        title="My Shipments"
        subtitle="Every delivery you are handling as a carrier. Open the timeline to verify or submit proof."
        actions={
          <Button onClick={() => navigate('/create-request')}>+ Create request</Button>
        }
      />

      <Card padded={false} className={styles.filterBar}>
        <div className={styles.filterRow}>
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={() => {/* live filter */}}
            placeholder="Search by ID, route, or status…"
            actionLabel="Search"
          />
        </div>
        <div className={styles.tabsRow}>
          <Tabs
            value={tab}
            onChange={setTab}
            items={STATUS_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
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

      <Card padded={false} className={styles.tableCard}>
        {filtered.length === 0 ? (
          <EmptyState
            illustration={clipboardRouteMap}
            title="No shipments here yet"
            description={
              !account
                ? 'Connect your wallet to see every request you are handling.'
                : 'No requests match the current filters. Try clearing the search or switching tabs.'
            }
            action={!account
              ? undefined
              : <Button variant="secondary" onClick={() => { setSearch(''); setTab('all'); }}>Clear filters</Button>
            }
          />
        ) : (
          <Table
            columns={[
              {
                key: 'id', header: 'ID', width: '8%',
                render: (r) => (
                  <button type="button" className={styles.idLink} onClick={() => openTimeline(r.id)}>
                    #{String(r.id).padStart(4, '0')}
                  </button>
                ),
              },
              { key: 'route', header: 'Route', width: '18%', render: (r) => <span><strong>{r.from}</strong> <span className={styles.arrow}>→</span> <strong>{r.to}</strong></span> },
              {
                key: 'milestones', header: 'Milestones', width: '16%',
                render: (r) => (
                  <div className={styles.milestoneCell}>
                    <ProgressLine count={r.milestones} current={r.current} label={false} />
                    <span className={styles.milestoneLabel}>{r.current} / {r.milestones}</span>
                  </div>
                ),
              },
              { key: 'reward', header: 'Reward', width: '12%', render: (r) => <span className={styles.numCell}>{formatEth(r.rewardWei)}</span> },
              { key: 'status', header: 'Request status', width: '12%', render: (r) => <Badge tone={REQUEST_TONE[r.status] || 'neutral'}>{requestStatus(r.status)}</Badge> },
              {
                key: 'deadline', header: 'Deadline', width: '16%',
                render: (r) => (
                  <div className={styles.deadlineCell}>
                    <div className={styles.deadlineMain}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                    <div className={styles.deadlineSub}>{formatDaysLeft(r.deadlineMs)}</div>
                  </div>
                ),
              },
              {
                key: 'action', header: '', width: '18%', align: 'right',
                render: (r) => (
                  <div className={styles.actionCell}>
                    <Button variant="secondary" size="sm" onClick={() => openTimeline(r.id)}>
                      View
                    </Button>
                    {r.status === 'Refunded' && (
                      <Button size="sm" onClick={() => reopen(r.id)}>
                        Reopen
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={filtered}
          />
        )}
      </Card>
    </div>
  );
}
