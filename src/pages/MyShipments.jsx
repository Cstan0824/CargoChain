// src/pages/MyShipments.jsx — CargoChain
// Requests where the connected wallet is the shipper or assigned carrier.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { CreateRequestModal } from '../components/CreateRequestModal.jsx';
import { clipboardRouteMap } from '../assets';
import { HiOutlineChevronRight } from 'react-icons/hi2';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import {
  formatEth,
  formatDate,
  formatDaysLeft,
  requestStatus,
  REQUEST_TONE,
} from '../utils/format.js';
import styles from './MyShipments.module.css';

const STATUS_FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'Open',       label: 'Open' },
  { value: 'Funded',     label: 'Funded' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Completed',  label: 'Completed' },
  { value: 'Refunded',   label: 'Refunded' },
];

export function MyShipments() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { contracts, deployError } = useContracts();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!account || !contracts?.deliveryEscrow) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadWalletShipments(contracts.deliveryEscrow, account)
      .then((nextRows) => {
        if (!cancelled) setRows(nextRows);
      })
      .catch((error) => {
        if (!cancelled) {
          setRows([]);
          setLoadError(error.shortMessage || error.reason || error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts, refreshKey]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to} ${r.status} ${r.relationship}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const openShipment = (row) => navigate(`/track/${row.id}`);

  return (
    <div className={styles.page}>
      <Topbar
        title="My Shipments"
        subtitle="Requests you created or carry, loaded directly from DeliveryEscrow."
      />

      {/* ── Toolbar: search + filter pills + create button ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={() => {/* live filter */}}
            placeholder="Search by ID, route, or status…"
            actionLabel="Search"
          />
        </div>
        <div className={styles.filterPills}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.pill} ${filter === f.value ? styles.pillActive : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {typeof counts[f.value] === 'number' && (
                <span className={styles.pillCount}>{counts[f.value]}</span>
              )}
            </button>
          ))}
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>+ Create request</Button>
      </div>

      {deployError && (
        <Card className={styles.notice}>
          <strong>Contracts not deployed.</strong>{' '}
          <span className={styles.muted}>
            Run <code>npm run migrate</code> to load your on-chain shipments.
          </span>
        </Card>
      )}

      {loadError && !deployError && (
        <Card className={styles.notice}>
          <strong>Could not load shipments.</strong>{' '}
          <span className={styles.muted}>{loadError}</span>
        </Card>
      )}

      {/* ── Table card ── */}
      <Card className={styles.tableCard} padded={false}>
        {loading ? (
          <div className={styles.loadingState}>Loading your shipments from the blockchain...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            illustration={clipboardRouteMap}
            title="No shipments here yet"
            description={
              !account
                ? 'Connect your wallet to see every request you are handling.'
                : rows.length === 0
                  ? 'Requests you create or carry will appear here after their transactions are confirmed.'
                  : 'No requests match the current filters. Try clearing the search or switching tabs.'
            }
            action={!account
              ? undefined
              : <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</Button>
            }
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Route</th>
                  <th>Milestones</th>
                  <th>Pay</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={styles.row}
                    onClick={() => openShipment(r)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openShipment(r)}
                  >
                    <td>
                      <span className={styles.idCell}>#{String(r.id).padStart(4, '0')}</span>
                    </td>
                    <td>
                      <span className={styles.routeCell}>
                        <span>
                          <strong>{r.from}</strong>
                          <span className={styles.routeArrow}>→</span>
                          <strong>{r.to}</strong>
                        </span>
                        <span className={styles.relationship}>{r.relationship}</span>
                      </span>
                    </td>
                    <td>
                      <div className={styles.milestoneCell}>
                        <ProgressLine count={r.milestones} current={r.current} label={false} />
                        <span className={styles.milestoneLabel}>{r.current}/{r.milestones}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.numCell}>
                        {formatEth(r.rewardWei > 0n ? r.rewardWei : r.proposedAmountWei)}
                      </span>
                    </td>
                    <td>
                      <Badge tone={REQUEST_TONE[r.status] || 'neutral'}>{requestStatus(r.status)}</Badge>
                    </td>
                    <td>
                      <div className={styles.deadlineCell}>
                        <div className={styles.deadlineMain}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                        <div className={styles.deadlineSub}>{formatDaysLeft(r.deadlineMs)}</div>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionCell}>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.chevBtn}`}
                          onClick={() => openShipment(r)}
                          title="Open shipment timeline"
                          aria-label={`Open timeline for shipment ${r.id}`}
                        >
                          <HiOutlineChevronRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => setRefreshKey((value) => value + 1)}
      />
    </div>
  );
}

async function loadWalletShipments(deliveryEscrow, account) {
  const requestCount = await deliveryEscrow.getRequestCount();
  if (requestCount === 0n) return [];

  const ids = await deliveryEscrow.getRequestIds(0n, requestCount);
  const normalizedAccount = account.toLowerCase();
  const requests = await Promise.all(
    ids.map(async (idValue) => {
      const id = BigInt(idValue);
      const request = await deliveryEscrow.getRequest(id);
      const shipper = request.shipper ?? request[1];
      const carrier = request.carrier ?? request[2];
      const isShipper = shipper.toLowerCase() === normalizedAccount;
      const isCarrier = !isZeroAddress(carrier) && carrier.toLowerCase() === normalizedAccount;
      const proposals = await deliveryEscrow.getProposals(id);
      const hasActiveProposal = Array.from(proposals || []).some((proposal) => (
        Number(proposal.status ?? proposal[1]) === 0
        && (proposal.carrier ?? proposal[0]).toLowerCase() === normalizedAccount
      ));
      if (!isShipper && !isCarrier && !hasActiveProposal) return null;

      const milestones = await deliveryEscrow.getMilestones(id);
      const milestoneRows = Array.from(milestones || []);

      return {
        id: Number(request.requestId ?? request[0]),
        from: request.pickupLocation ?? request[3],
        to: request.deliveryLocation ?? request[4],
        rewardWei: BigInt(request.totalAmount ?? request[5] ?? 0n),
        proposedAmountWei: BigInt(request.proposedAmount ?? request[11] ?? 0n),
        deadlineMs: Number(request.deadline ?? request[7] ?? 0n) * 1000,
        createdAt: Number(request.createdAt ?? request[10] ?? 0n),
        status: requestStatus(request.status ?? request[9]),
        milestones: milestoneRows.length,
        current: milestoneRows.filter((milestone) => Number(milestone.status ?? milestone[6]) === 5).length,
        relationship: isShipper ? 'Shipper' : isCarrier ? 'Carrier' : 'Carrier proposal',
        isShipper,
      };
    }),
  );

  return requests
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
