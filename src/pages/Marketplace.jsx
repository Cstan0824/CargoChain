// src/pages/Marketplace.jsx — CargoChain
// Browse `Open` delivery requests (BusinessFlow §7). Row layout (left→right):
//   Milestones (inline progress line) · Route · Reward · Deadline · Action
// Every row opens the marketplace request preview. Shipment timelines remain
// under My Shipments.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineBars3,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import { useContracts } from '../hooks/useContracts.js';
import { useWallet } from '../hooks/useWallet.js';
import { useToast } from '../hooks/useToast.js';
import { Topbar } from '../components/Topbar.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { Button } from '../components/Button.jsx';
import { Table } from '../components/Table.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Card } from '../components/Card.jsx';
import { formatEth, formatDate, formatDaysLeft, formatRelative } from '../utils/format.js';
import { CreateRequestModal } from '../components/CreateRequestModal.jsx';
import { deliveryTruckCity } from '../assets';
import styles from './Marketplace.module.css';

export function Marketplace() {
  const navigate = useNavigate();
  const { contracts, deployError } = useContracts();
  const { account } = useWallet();
  const { show } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!contracts?.deliveryEscrow) {
      setRows([]);
      return;
    }
    let cancelled = false;

    setLoading(true);
    setError(null);

    loadOpenRequests(contracts.deliveryEscrow)
      .then((nextRows) => {
        if (!cancelled) setRows(nextRows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.shortMessage || e.message);
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, refreshKey]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to} ${r.itemsLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search]);

  const openDetails = (id) => navigate(`/requests/${id}`);

  return (
    <div className={styles.page}>
      <Topbar
        title="Marketplace"
        subtitle="Find open delivery jobs posted by shippers and propose a milestone plan."
        actions={<Button onClick={() => setIsCreateModalOpen(true)}>Create request</Button>}
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
          <div className={styles.viewToggle} aria-label="Marketplace view">
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${view === 'list' ? styles.viewToggleActive : ''}`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              title="List view"
            >
              <HiOutlineBars3 aria-hidden="true" />
              <span>List</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${view === 'cards' ? styles.viewToggleActive : ''}`}
              onClick={() => setView('cards')}
              aria-pressed={view === 'cards'}
              title="Card view"
            >
              <HiOutlineSquares2X2 aria-hidden="true" />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </Card>

      {loading && (
        <Card className={styles.notice}>
          <span className={styles.muted}>Loading open requests from DeliveryEscrow…</span>
        </Card>
      )}

      {deployError && (
        <Card className={styles.notice}>
          <strong>Contracts not deployed.</strong>{' '}
          <span className={styles.muted}>
            Run <code>npm run migrate</code> to populate the marketplace.
          </span>
        </Card>
      )}

      {error && !deployError && (
        <Card className={styles.notice}><span className={styles.muted}>Couldn't load on-chain data: {error}.</span></Card>
      )}

      <div className={styles.tableCard}>
        {loading ? null : filtered.length === 0 ? (
          <Card padded={false} className={styles.emptyCard}>
            <EmptyState
              illustration={deliveryTruckCity}
              title={emptyTitle({ deployError, error, rows, search })}
              description={
                deployError
                  ? 'Run npm run migrate to deploy contracts and populate the marketplace.'
                  : rows.length === 0
                    ? 'Published delivery requests will appear here after shipper wallets submit createRequest().'
                    : 'No open requests match your current filters. Try clearing the search or picking a different route.'
              }
              action={
                !deployError && rows.length === 0 ? (
                  <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)}>
                    Create request
                  </Button>
                ) : !deployError && (
                  <Button variant="secondary" onClick={() => setSearch('')}>
                    Clear filters
                  </Button>
                )
              }
            />
          </Card>
        ) : view === 'cards' ? (
          <div className={styles.cardGrid}>
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                className={styles.jobCard}
                onClick={() => openDetails(r.id)}
              >
                <div className={styles.cardTop}>
                  <span className={styles.cardId}>#{String(r.id).padStart(4, '0')}</span>
                  <span className={styles.cardTime}>{formatRelative(r.createdAt)}</span>
                </div>

                <div className={styles.cardRoute}>
                  <span className={styles.routeFrom} title={r.from}>{r.from}</span>
                  <span className={styles.routeArrow}>→</span>
                  <span className={styles.routeTo} title={r.to}>{r.to}</span>
                </div>

                {r.items && r.items.length > 0 && (
                  <div className={styles.cardCargo}>
                    <span className={styles.cargoIcon}>📦</span>
                    <span className={styles.cargoText} title={r.itemsLabel}>
                      {r.itemsLabel}
                    </span>
                  </div>
                )}

                {r.specialInstruction && (
                  <div className={styles.specialBadge} title={r.specialInstruction}>
                    <span className={styles.warningIcon}>⚠️</span>
                    <span className={styles.specialText}>{r.specialInstruction}</span>
                  </div>
                )}

                <div className={styles.cardDivider} />

                <div className={styles.cardFooter}>
                  <div className={styles.cardPaymentBox}>
                  <span className={styles.footerLabel}>PLANNED PAYMENT</span>
                  <strong className={styles.footerVal}>{formatEth(r.proposedAmountWei)}</strong>
                  </div>
                  <div className={styles.cardDeadlineBox}>
                    <span className={styles.footerLabel}>DEADLINE</span>
                    <strong className={styles.footerVal}>{formatDaysLeft(r.deadlineMs)}</strong>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Table
            onRowClick={(row) => openDetails(row.id)}
            columns={[
              {
                key: 'id',
                header: 'ID',
                width: '8%',
                render: (r) => (
                  <span className={styles.tableId}>#{String(r.id).padStart(4, '0')}</span>
                ),
              },
              {
                key: 'route',
                header: 'Route',
                width: '25%',
                render: (r) => (
                  <div className={styles.tableRouteRow}>
                    <span className={styles.tableRouteLabel} title={r.from}>{r.from}</span>
                    <span className={styles.tableRouteArrow}>→</span>
                    <span className={styles.tableRouteLabel} title={r.to}>{r.to}</span>
                  </div>
                ),
              },
              {
                key: 'cargo',
                header: 'Cargo',
                width: '20%',
                render: (r) => (
                  <span className={styles.tableCargoLabel} title={r.itemsLabel}>
                    {r.itemsLabel}
                  </span>
                ),
              },
              {
                key: 'payment',
                header: 'Planned payment',
                width: '18%',
                render: (r) => (
                  <div className={styles.rewardCell}>
                    <div className={styles.rewardMain}>{formatEth(r.proposedAmountWei)}</div>
                    <div className={styles.rewardSub}>Awaiting escrow</div>
                  </div>
                ),
              },
              {
                key: 'deadline',
                header: 'Deadline',
                width: '16%',
                render: (r) => (
                  <div className={styles.deadlineCell}>
                    <div className={styles.deadlineMain}>{formatDaysLeft(r.deadlineMs)}</div>
                    <div className={styles.deadlineSub}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            emptyMessage="No open requests match the current filters."
          />
        )}
      </div>

      <CreateRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => setRefreshKey((value) => value + 1)}
      />
    </div>
  );
}

async function loadOpenRequests(deliveryEscrow) {
  const ids = await deliveryEscrow.getOpenRequests(0n, 50n);
  const rows = await Promise.all(
    ids.map(async (idValue) => {
      const id = BigInt(idValue);
      const [request, items, milestones] = await Promise.all([
        deliveryEscrow.getRequest(id),
        deliveryEscrow.getItems(id),
        deliveryEscrow.getMilestones(id),
      ]);
      return mapMarketplaceRow(request, items, milestones);
    }),
  );

  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

function mapMarketplaceRow(request, items, milestones) {
  const id = Number(request.requestId ?? request[0]);
  const shipper = request.shipper ?? request[1];
  const from = request.pickupLocation ?? request[3];
  const to = request.deliveryLocation ?? request[4];
  const rewardWei = BigInt(request.totalAmount ?? request[5] ?? 0n);
  const proposedAmountWei = BigInt(request.proposedAmount ?? request[11] ?? 0n);
  const deadline = Number(request.deadline ?? request[7] ?? 0n);
  const specialInstruction = request.specialInstruction ?? request[8];
  const createdAt = Number(request.createdAt ?? request[10] ?? 0n);
  const milestoneCount = milestones.length;
  const paidCount = milestones.filter((m) => Number(m.status ?? m[6]) === 5).length;
  const itemRows = Array.from(items || []);
  const itemsLabel = itemRows.length
    ? itemRows.map((it) => `${it.itemName ?? it[0]} x ${Number(it.quantity ?? it[2])}`).join(', ')
    : 'No items listed';

  const itemsList = itemRows.map((it) => ({
    itemName: it.itemName ?? it[0],
    itemDescription: it.itemDescription ?? it[1],
    quantity: Number(it.quantity ?? it[2]),
  }));

  return {
    id,
    shipper,
    from,
    to,
    itemsLabel,
    items: itemsList,
    specialInstruction,
    milestones: milestoneCount,
    current: paidCount,
    rewardWei,
    proposedAmountWei,
    deadlineMs: deadline * 1000,
    createdAt,
  };
}

function emptyTitle({ deployError, error, rows, search }) {
  if (deployError) return 'Contracts not deployed';
  if (error) return 'Marketplace unavailable';
  if (rows.length === 0) return 'No open requests yet';
  if (search) return 'No matches';
  return 'No open requests yet';
}
