// src/pages/Marketplace.jsx — CargoChain
// Browse `Open` delivery requests (BusinessFlow §7). Row layout (left→right):
//   Milestones (inline progress line) · Route · Reward · Deadline · Action
// Every row opens the marketplace request preview. Shipment timelines remain
// under My Shipments.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowRight,
  HiOutlineBars3,
  HiOutlineChevronRight,
  HiOutlineExclamationTriangle,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import { useContracts } from '../hooks/useContracts.js';
import { useWallet } from '../hooks/useWallet.js';
import { Topbar } from '../components/Topbar.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { Button } from '../components/Button.jsx';
import { Table } from '../components/Table.jsx';
import { CargoPreview } from '../components/CargoPreview.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Card } from '../components/Card.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import {
  formatEth,
  formatDate,
  formatDaysLeft,
  formatRelative,
  hasRemarks,
} from '../utils/format.js';
import { CreateRequestModal } from '../components/CreateRequestModal.jsx';
import { marketplaceOperations } from '../assets';
import styles from './Marketplace.module.css';

export function Marketplace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contracts, deployError } = useContracts();
  const { account, connect } = useWallet();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const search = searchParams.get('q') || '';
  const view = searchParams.get('view') === 'cards' ? 'cards' : 'list';
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const readAccount = account;
  const canCreateRequest = Boolean(account);

  const openCreateRequest = () => {
    if (!canCreateRequest) {
      connect();
      return;
    }
    setIsCreateModalOpen(true);
  };

  const createRequestLabel = account ? 'Create request' : 'Connect wallet to create';

  useEffect(() => {
    if (!contracts?.deliveryEscrow) {
      setRows([]);
      return;
    }
    let cancelled = false;

    setLoading(true);
    setError(null);

    loadOpenRequests(contracts.deliveryEscrow, readAccount)
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
  }, [contracts, readAccount, refreshKey]);

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

  const openDetails = (row) => {
    if (row.hasOwnActiveProposal) {
      navigate(`/shipments/${row.id}/propose`);
      return;
    }
    navigate(`/requests/${row.id}`);
  };

  const updateQuery = (key, value, defaultValue = '') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  const marketplaceColumns = [
    {
      key: 'id',
      header: 'ID',
      width: '8%',
      skeleton: { width: '48%' },
      render: (r) => (
        <span className={styles.tableId}>#{String(r.id).padStart(4, '0')}</span>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      width: '25%',
      skeleton: { width: '82%' },
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
      header: 'Shipment contents',
      width: '20%',
      skeleton: { variant: 'block', width: '88%', height: 40 },
      render: (r) => <CargoPreview items={r.items} />,
    },
    {
      key: 'payment',
      header: 'Planned payment',
      width: '18%',
      skeleton: { width: '70%' },
      render: (r) => (
        <div className={styles.rewardCell}>
          <div className={styles.rewardMain}>{formatEth(r.proposedAmountWei)}</div>
          <div className={styles.rewardSub}>Not funded yet</div>
        </div>
      ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      width: '16%',
      skeleton: { width: '76%' },
      render: (r) => (
        <div className={styles.deadlineCell}>
          <div className={styles.deadlineMain}>{formatDaysLeft(r.deadlineMs)}</div>
          <div className={styles.deadlineSub}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
        </div>
      ),
    },
    {
      key: 'action',
      // The action column intentionally stays visually blank. Keep a semantic
      // name for screen-reader users so the icon-only cell has context.
      header: <span className="visually-hidden">Open request</span>,
      width: '10%',
      align: 'right',
      skeleton: { width: '56%' },
      render: (r) => (
        <button
          type="button"
          className={styles.rowAction}
          onClick={(event) => {
            event.stopPropagation();
            openDetails(r);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          title="Open request"
          aria-label={`Open request ${r.id}`}
        >
          <HiOutlineChevronRight aria-hidden="true" />
        </button>
      ),
    },
  ];
  const showInitialLoading = loading && rows.length === 0;

  return (
    <div className={styles.page}>
      <Topbar
        title="Marketplace"
        subtitle="Find open delivery jobs posted by shippers and propose a milestone plan."
        actions={<Button onClick={openCreateRequest}>{createRequestLabel}</Button>}
      />

      <Card
        className={styles.filterBar}
        padded={false}
        role="search"
        aria-label="Filter marketplace requests"
      >
        <div className={styles.filterRow}>
          <SearchInput
            value={search}
            onChange={(value) => updateQuery('q', value)}
            placeholder="Search routes or keyword…"
            shape="contained"
            className={styles.search}
          />
          <div className={styles.viewToggle} aria-label="Marketplace view">
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${view === 'list' ? styles.viewToggleActive : ''}`}
              onClick={() => updateQuery('view', 'list', 'list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
              title="List view"
            >
              <HiOutlineBars3 aria-hidden="true" />
              <span>List</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${view === 'cards' ? styles.viewToggleActive : ''}`}
              onClick={() => updateQuery('view', 'cards', 'list')}
              aria-pressed={view === 'cards'}
              aria-label="Card view"
              title="Card view"
            >
              <HiOutlineSquares2X2 aria-hidden="true" />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </Card>

      {deployError && (
        <Card className={styles.notice} role="alert">
          <strong>Local blockchain unavailable.</strong>{' '}
          <span className={styles.muted}>Start the CargoChain demo environment, then reload this page.</span>
        </Card>
      )}

      {error && !deployError && (
        <Card className={styles.notice} role="alert">
          <div>
            <strong>Open requests could not be loaded.</strong>{' '}
            <span className={styles.muted}>Check the local chain connection and try again.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            Retry
          </Button>
        </Card>
      )}

      <div className={styles.tableCard} aria-busy={loading || undefined}>
        {loading && rows.length > 0 && (
          <span className="visually-hidden" role="status">Refreshing open delivery requests…</span>
        )}
        {showInitialLoading ? (
          view === 'cards' ? <MarketplaceCardSkeletons /> : (
            <Table
              columns={marketplaceColumns}
              rows={[]}
              loading
              loadingRows={4}
              loadingLabel="Loading open delivery requests…"
            />
          )
        ) : filtered.length === 0 ? (
          <div className={styles.emptyCard}>
            <EmptyState
              compact
              illustration={marketplaceOperations}
              title={emptyTitle({ deployError, error, rows, search })}
              description={
                deployError
                  ? 'CargoChain cannot reach the local blockchain contracts.'
                  : rows.length === 0
                    ? 'No delivery requests are available yet. Connected shippers can publish the first request.'
                    : 'No open requests match your search. Try clearing the search or choosing a different route.'
              }
              action={
                error
                  ? <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Retry</Button>
                  : !deployError && rows.length === 0
                  ? <Button variant="secondary" onClick={openCreateRequest}>{createRequestLabel}</Button>
                  : !deployError && (
                    <Button variant="secondary" onClick={() => updateQuery('q', '')}>
                      Clear search
                    </Button>
                  )
              }
            />
          </div>
        ) : view === 'cards' ? (
          <div className={styles.cardGrid}>
            {filtered.map((r) => (
              <article
                key={r.id}
                className={styles.jobCard}
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
                    <CargoPreview items={r.items} />
                  </div>
                )}

                {hasRemarks(r.specialInstruction) && (
                  <div className={styles.specialBadge} title={`Remarks: ${String(r.specialInstruction).trim()}`}>
                    <HiOutlineExclamationTriangle className={styles.warningIcon} aria-hidden="true" />
                    <span className={styles.specialLabel}>Remarks</span>
                    <span className={styles.specialText}>{String(r.specialInstruction).trim()}</span>
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

                <button
                  type="button"
                  className={styles.cardOpenButton}
                  onClick={() => openDetails(r)}
                >
                  View request <HiOutlineArrowRight aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Table
            onRowClick={openDetails}
            columns={marketplaceColumns}
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

function MarketplaceCardSkeletons() {
  return (
    <div className={styles.cardGrid} aria-busy="true">
      <span className="visually-hidden" role="status">Loading open delivery requests…</span>
      {[1, 2, 3].map((key) => (
        <article key={key} className={`${styles.jobCard} ${styles.skeletonCard}`} aria-hidden="true">
          <div className={styles.cardTop}>
            <Skeleton width={52} height={20} />
            <Skeleton width={72} height={12} />
          </div>
          <div className={styles.cardRoute}>
            <Skeleton width="34%" height={16} />
            <Skeleton width={16} height={12} />
            <Skeleton width="34%" height={16} />
          </div>
          <div className={styles.cardCargo}><Skeleton variant="block" width="100%" height={40} /></div>
          <div className={styles.cardDivider} />
          <div className={styles.cardFooter}>
            <Skeleton width="34%" height={28} />
            <Skeleton width="28%" height={28} />
          </div>
          <Skeleton width={112} height={18} />
        </article>
      ))}
    </div>
  );
}

export async function loadOpenRequests(deliveryEscrow, account) {
  const ids = await deliveryEscrow.getOpenRequests(0n, 50n);
  const rows = await Promise.all(
    ids.map(async (idValue) => {
      const id = BigInt(idValue);
      const [request, items, milestones] = await Promise.all([
        deliveryEscrow.getRequest(id),
        deliveryEscrow.getItems(id),
        deliveryEscrow.getMilestones(id),
      ]);
      let proposals = [];
      if (account) {
        try {
          proposals = await deliveryEscrow.getProposals(id);
        } catch {
          // Proposal ownership is optional enrichment. A wallet-specific RPC
          // failure must not hide public open requests from this account.
          proposals = [];
        }
      }
      return mapMarketplaceRow(request, items, milestones, proposals, account);
    }),
  );

  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

function mapMarketplaceRow(request, items, milestones, proposals, account) {
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
    hasOwnActiveProposal: Boolean(
      account && Array.from(proposals || []).some((proposal) => (
        Number(proposal.status ?? proposal[1]) === 0
        && (proposal.carrier ?? proposal[0]).toLowerCase() === account.toLowerCase()
      )),
    ),
  };
}

function emptyTitle({ deployError, error, rows, search }) {
  if (deployError) return 'Contracts not deployed';
  if (error) return 'Open requests could not be loaded';
  if (rows.length === 0) return 'No open requests yet';
  if (search) return 'No requests match your search';
  return 'No open requests yet';
}
