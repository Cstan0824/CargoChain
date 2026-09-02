// src/pages/MyShipments.jsx — CargoChain
// Requests where the connected wallet is the shipper or assigned carrier.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { ModalShell } from '../components/ModalShell.jsx';
import { ChatButton } from '../components/chat/ChatButton.jsx';
import { Badge } from '../components/Badge.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { CreateRequestModal } from '../components/CreateRequestModal.jsx';
import { shipmentRoute } from '../assets';
import { HiOutlineChevronRight, HiOutlineClock, HiOutlineEye, HiOutlinePencilSquare, HiOutlineXMark } from 'react-icons/hi2';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import {
  formatCargo,
  formatDate,
  formatDaysLeft,
  milestoneStatus,
  requestStatus,
  requestStatusLabel,
  REQUEST_TONE,
} from '../utils/format.js';
import { shipmentAttention } from '../utils/shipmentPresentation.js';
import styles from './MyShipments.module.css';

const STATUS_FILTERS = [
  { value: 'needs-action', label: 'Needs action' },
  { value: 'all',        label: 'All' },
  { value: 'Open',       label: 'Open' },
  { value: 'Funded',     label: 'Funded' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Completed',  label: 'Completed' },
  { value: 'Cancelled',  label: 'Cancelled' },
  { value: 'Refunded',   label: 'Refunded' },
];

export function MyShipments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { account, connect } = useWallet();
  const { contracts, deployError } = useContracts();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const requestedFilter = searchParams.get('status') || 'all';
  const filter = STATUS_FILTERS.some((entry) => entry.value === requestedFilter)
    ? requestedFilter
    : 'all';
  const search = searchParams.get('q') || '';
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyShipment, setHistoryShipment] = useState(null);
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
    if (!readAccount || !contracts?.deliveryEscrow) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadWalletShipments(contracts.deliveryEscrow, readAccount)
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
  }, [contracts, readAccount, refreshKey]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) {
      c[r.status] = (c[r.status] || 0) + 1;
      if (r.attention) c['needs-action'] = (c['needs-action'] || 0) + 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'needs-action' && !r.attention) return false;
      if (!['all', 'needs-action'].includes(filter) && r.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to} ${r.status} ${r.relationship} ${r.attention?.label || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const openShipment = (row) => navigate(`/track/${row.id}`);

  const openAttention = (row) => {
    if (!row.attention) return openShipment(row);
    if (row.attention.route === 'propose') {
      const suffix = row.attention.proposalId != null
        ? `?resubmit=${row.attention.proposalId}`
        : row.attention.key === 'awaiting-approval'
          ? '?edit=active'
          : '';
      navigate(`/shipments/${row.id}/propose${suffix}`);
      return;
    }
    openShipment(row);
  };

  const showInitialLoading = loading && rows.length === 0;

  const updateQuery = (key, value, defaultValue = '') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="My Shipments"
        subtitle="Requests you created, carry, or submitted a proposal for."
        actions={<Button onClick={openCreateRequest}>{createRequestLabel}</Button>}
      />

      {/* ── Toolbar: search + filter pills ── */}
      {readAccount && <Card
        className={styles.toolbar}
        padded={false}
        role="search"
        aria-label="Filter shipments"
      >
        <div className={styles.searchWrap}>
          <SearchInput
            value={search}
            onChange={(value) => updateQuery('q', value)}
            placeholder="Search by ID, route, or status…"
            shape="contained"
          />
        </div>
        <div className={styles.filterPills}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.pill} ${filter === f.value ? styles.pillActive : ''}`}
              onClick={() => updateQuery('status', f.value, 'all')}
              aria-pressed={filter === f.value}
            >
              {f.label}
              {typeof counts[f.value] === 'number' && (
                <span className={styles.pillCount}>{counts[f.value]}</span>
              )}
            </button>
          ))}
        </div>
      </Card>}

      {deployError && (
        <Card className={styles.notice} role="alert">
          <strong>Local blockchain unavailable.</strong>{' '}
          <span className={styles.muted}>Start the CargoChain demo environment, then reload this page.</span>
        </Card>
      )}

      {loadError && !deployError && (
        <Card className={styles.notice} role="alert">
          <span><strong>Could not load shipments.</strong>{' '}
          <span className={styles.muted}>Check the local chain connection and try again.</span></span>
          <Button variant="secondary" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            Retry
          </Button>
        </Card>
      )}

      {/* ── Table card ── */}
      <Card className={styles.tableCard} padded={false}>
        {loading && rows.length > 0 && (
          <span className="visually-hidden" role="status">Refreshing your shipments…</span>
        )}
        {showInitialLoading ? (
          <div className={styles.tableWrap} aria-busy="true">
            <span className="visually-hidden" role="status">Loading your shipments…</span>
            <table className={styles.table}>
              <ShipmentTableHeader />
              <tbody><ShipmentSkeletonRows /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            className={styles.emptyState}
            compact
            illustration={shipmentRoute}
            title="No shipments here yet"
            description={
              !readAccount
                ? 'Link a wallet to your CargoChain account to see the requests you are handling.'
                : rows.length === 0
                  ? 'Requests you create or carry will appear here after their transactions are confirmed.'
                  : 'No requests match the current filters. Try clearing the search or switching tabs.'
            }
            action={!readAccount
              ? <Button
                className={styles.disconnectedEmptyAction}
                variant="secondary"
                onClick={() => connect()}
              >Connect wallet</Button>
              : <Button variant="secondary" onClick={() => {
                setSearchParams({}, { replace: true });
              }}>Clear filters</Button>
            }
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <ShipmentTableHeader />
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={styles.row}
                    onClick={() => openShipment(r)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openShipment(r);
                      }
                    }}
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
                        {r.milestones > 0 && (
                          <ProgressLine count={r.milestones} current={r.current} label={false} />
                        )}
                        {r.milestones ? (
                          <span className={styles.milestoneLabel}>{r.current}/{r.milestones} complete</span>
                        ) : (
                          <span className={styles.milestoneEmpty}>No plan yet</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={styles.numCell}>
                        {formatCargo(r.rewardWei > 0n ? r.rewardWei : r.proposedAmountWei)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <Badge tone={shipmentStatus(r).tone}>{shipmentStatus(r).label}</Badge>
                      </div>
                    </td>
                    <td>
                      <div
                        className={styles.nextActionCell}
                        title={r.attention?.detail || undefined}
                      >
                        <strong className={styles.nextActionLabel}>{nextActionPresentation(r).label}</strong>
                        {nextActionPresentation(r).detail && (
                          <span className={styles.nextActionDetail}>{nextActionPresentation(r).detail}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.deadlineCell}>
                        <div className={styles.deadlineMain}>{formatDaysLeft(r.deadlineMs)}</div>
                        <div className={styles.deadlineSub}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionCell}>
                        {shouldShowShipmentChat(r) && (
                          <ChatButton
                            requestId={r.id}
                            carrierWallet={shipmentChatCarrier(r)}
                            label="Open shipment chat"
                            variant="secondary"
                            size="sm"
                            iconOnly
                            className={styles.shipmentChatButton}
                          />
                        )}
                        {r.attention?.actionLabel && (
                          r.attention.key === 'review-proposals' ? (
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => openAttention(r)}
                              title="View carrier proposals"
                              aria-label="View carrier proposals"
                            >
                              <HiOutlineEye aria-hidden="true" />
                            </button>
                          ) : r.attention.key === 'awaiting-approval' ? (
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.editBtn}`}
                              onClick={() => openAttention(r)}
                              title="Edit proposal"
                              aria-label="Edit proposal"
                            >
                              <HiOutlinePencilSquare aria-hidden="true" />
                            </button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openAttention(r)}
                            >
                              {r.attention.actionLabel}
                            </Button>
                          )
                        )}
                        {shouldShowProposalHistory(r) && (
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.historyBtn}`}
                            onClick={() => setHistoryShipment(r)}
                            title="View proposal history"
                            aria-label="View proposal history"
                          >
                            <HiOutlineClock aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.chevBtn}`}
                          onClick={() => navigate(`/track/${r.id}`)}
                          title="Open shipment timeline"
                          aria-label={`Open shipment timeline for shipment ${r.id}`}
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

      {historyShipment && (
        <CarrierProposalHistoryModal
          shipment={historyShipment}
          onResubmit={(proposal) => {
            setHistoryShipment(null);
            navigate(`/shipments/${historyShipment.id}/propose?resubmit=${proposal.id}`);
          }}
          onClose={() => setHistoryShipment(null)}
        />
      )}
    </div>
  );
}

function ShipmentTableHeader() {
  return (
    <thead>
      <tr>
        <th scope="col">ID</th>
        <th scope="col">Route</th>
        <th scope="col">Milestones</th>
        <th scope="col">Payment</th>
        <th scope="col">Status</th>
        <th scope="col">Next action</th>
        <th scope="col">Deadline</th>
        <th scope="col" aria-label="Actions" />
      </tr>
    </thead>
  );
}

function ShipmentSkeletonRows() {
  return [1, 2, 3, 4].map((key) => (
    <tr key={key} className={styles.skeletonRow} aria-hidden="true">
      <td><Skeleton width={48} /></td>
      <td>
        <div className={styles.skeletonRoute}>
          <Skeleton width="38%" />
          <Skeleton width={14} />
          <Skeleton width="38%" />
          <Skeleton width={68} height={11} />
        </div>
      </td>
      <td><Skeleton width="72%" /></td>
      <td><Skeleton width="62%" /></td>
      <td><Skeleton variant="block" width={64} height={24} /></td>
      <td>
        <div className={styles.skeletonNextAction}>
          <Skeleton width="82%" />
          <Skeleton width="64%" height={11} />
        </div>
      </td>
      <td>
        <div className={styles.skeletonDeadline}>
          <Skeleton width="76%" />
          <Skeleton width="88%" height={11} />
        </div>
      </td>
      <td><Skeleton width={32} height={32} /></td>
    </tr>
  ));
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
      const assignedCarrier = isZeroAddress(carrier) ? null : carrier;
      const isShipper = shipper.toLowerCase() === normalizedAccount;
      const isCarrier = Boolean(assignedCarrier) && assignedCarrier.toLowerCase() === normalizedAccount;
      const proposals = await deliveryEscrow.getProposals(id);
      const activeProposalCarriers = Array.from(proposals || [])
        .filter((proposal) => Number(proposal.status ?? proposal[1]) === 0)
        .map((proposal) => proposal.carrier ?? proposal[0]);
      const ownProposals = Array.from(proposals || []).reduce((result, proposal, proposalId) => {
        const proposalCarrier = proposal.carrier ?? proposal[0];
        if (proposalCarrier.toLowerCase() === normalizedAccount) {
          result.push({
            id: proposalId,
            status: PROPOSAL_STATUS[Number(proposal.status ?? proposal[1])] || 'Unknown',
            createdAt: Number(proposal.createdAt ?? proposal[2] ?? 0n),
            rejectionNote: proposal.rejectionNote ?? proposal[4] ?? '',
          });
        }
        return result;
      }, []);
      const hasActiveProposal = ownProposals.some((proposal) => proposal.status === 'Active');
      const hasAnyActiveProposal = Array.from(proposals || []).some(
        (proposal) => Number(proposal.status ?? proposal[1]) === 0,
      );
      const ownHistoricalProposals = await Promise.all(
        ownProposals
          .filter((proposal) => proposal.status !== 'Active')
          .map(async (proposal) => {
            const proposalMilestones = await deliveryEscrow.getProposalMilestones(id, proposal.id);
            return {
              ...proposal,
              milestones: Array.from(proposalMilestones || []).map((milestone) => ({
                name: milestone.name ?? milestone[0],
                payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
              })),
            };
          }),
      );
      if (!isShipper && !isCarrier && !hasActiveProposal && !ownHistoricalProposals.length) return null;

      const milestones = await deliveryEscrow.getMilestones(id);
      const milestoneRows = Array.from(milestones || []);
      const relationship = isShipper
          ? 'Shipper'
          : isCarrier
            ? 'Carrier'
            : hasActiveProposal || ownHistoricalProposals.length
              ? 'Carrier proposal'
              : 'Proposal history';
      const milestoneStatuses = milestoneRows.map((milestone) => (
        milestoneStatus(milestone.status ?? milestone[6])
      ));
      const pendingProofAmountWei = milestoneRows
        .filter((milestone) => milestoneStatus(milestone.status ?? milestone[6]) === 'Submitted')
        .reduce((total, milestone) => (
          total
          + BigInt(milestone.payoutAmount ?? milestone[2] ?? 0n)
          + BigInt(milestone.additionalPayoutAmount ?? milestone[9] ?? 0n)
        ), 0n);
      const attention = shipmentAttention({
        status: requestStatus(request.status ?? request[9]),
        relationship,
        activeProposalCount: activeProposalCarriers.length,
        hasActiveProposal,
        ownHistoricalProposals,
        milestoneStatuses,
        pendingProofLabel: pendingProofAmountWei > 0n ? formatCargo(pendingProofAmountWei) : '',
      });

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
        relationship,
        isShipper,
        isCarrier,
        carrier: assignedCarrier,
        activeProposalCarriers,
        hasActiveProposal,
        activeProposalCount: activeProposalCarriers.length,
        hasAnyActiveProposal,
        ownHistoricalProposals,
        milestoneStatuses,
        attention,
      };
    }),
  );

  return requests
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

const PROPOSAL_STATUS = ['Active', 'Revoked', 'Rejected', 'Accepted'];

function shipmentChatCarrier(row) {
  if (!row.isShipper) return undefined;
  if (row.carrier) return row.carrier;
  return row.activeProposalCarriers.length === 1 ? row.activeProposalCarriers[0] : undefined;
}

function shouldShowShipmentChat(row) {
  if (row.isShipper) return Boolean(shipmentChatCarrier(row));
  return row.hasActiveProposal || row.isCarrier;
}

export function shouldShowProposalHistory(row) {
  const isProofSubmissionStage = ['submit-proof', 'resubmit-proof'].includes(row.attention?.key);
  return row.ownHistoricalProposals.length > 0 && !isProofSubmissionStage;
}

function shipmentStatus(row) {
  return {
    label: requestStatusLabel(row.status),
    tone: REQUEST_TONE[row.status] || 'neutral',
  };
}

function nextActionPresentation(row) {
  if (!row?.attention) return { label: 'No action needed', detail: '' };

  const count = Number(row.activeProposalCount || 0);
  switch (row.attention.key) {
    case 'awaiting-proposal':
      return { label: 'Wait for proposals', detail: 'Visible to carriers' };
    case 'review-proposals':
      return {
        label: `Review ${count} proposal${count === 1 ? '' : 's'}`,
        detail: 'Choose a delivery plan to fund',
      };
    case 'submit-proposal':
      return { label: 'Submit proposal', detail: 'Send a milestone plan' };
    case 'awaiting-approval':
      return { label: 'Await shipper review', detail: 'Proposal submitted' };
    case 'resubmit-proposal':
      return { label: 'Revise proposal', detail: 'Address the shipper note before resubmitting' };
    case 'submit-proof':
      return { label: 'Submit proof', detail: 'Upload the next checkpoint photo' };
    case 'review-proof':
      return {
        label: 'Review proof',
        detail: row.attention.detail?.replace(/^Release or reject /, '') || 'Review checkpoint proof',
      };
    case 'resubmit-proof':
      return { label: 'Resubmit proof', detail: 'Review feedback and upload a replacement' };
    case 'awaiting-proof':
      return { label: 'Await carrier proof', detail: 'The next checkpoint is ready for a photo update' };
    default:
      return { label: row.attention.label, detail: row.attention.detail || '' };
  }
}

function CarrierProposalHistoryModal({ shipment, onResubmit, onClose }) {
  const proposals = [...shipment.ownHistoricalProposals]
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <ModalShell
      size="lg"
      onClose={onClose}
      labelledBy="carrier-proposal-history-title"
      className={styles.historyModal}
    >
        <div className={styles.historyModalHeader}>
          <div>
            <span className={styles.historyKicker}>Carrier proposal history</span>
            <h2 id="carrier-proposal-history-title">Shipment #{String(shipment.id).padStart(4, '0')}</h2>
            <p>{shipment.from} → {shipment.to}</p>
          </div>
          <button type="button" className={styles.historyClose} onClick={onClose} aria-label="Close proposal history">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </div>

        <div className={styles.historyModalBody}>
          <p className={styles.historyIntro}>
            These submitted plans remain recorded on-chain, even after a shipper decision.
          </p>
          <div className={styles.historyProposalList}>
            {proposals.map((proposal) => (
              <article key={proposal.id} className={styles.historyProposalCard}>
                <div className={styles.historyProposalHead}>
                  <div>
                    <span>Proposal #{proposal.id + 1}</span>
                    <strong>Submitted {formatDate(proposal.createdAt)}</strong>
                  </div>
                  <Badge tone={proposalStatusTone(proposal.status)}>{proposal.status}</Badge>
                </div>
                <ol className={styles.historyMilestoneList}>
                  {proposal.milestones.map((milestone, index) => (
                    <li key={`${proposal.id}-${milestone.name}-${index}`}>
                      <span className={styles.historyMilestoneIndex}>{index + 1}</span>
                      <span>{milestone.name}</span>
                      <strong>{milestone.payoutPercentage}%</strong>
                    </li>
                  ))}
                </ol>
                {proposal.status === 'Rejected' && proposal.rejectionNote && (
                  <div className={styles.historyRejectionNote}>
                    <span>Rejection note</span>
                    <p>{proposal.rejectionNote}</p>
                  </div>
                )}
                {shipment.status === 'Open' && !shipment.hasActiveProposal && proposal.status === 'Rejected' && (
                  <div className={styles.historyProposalActions}>
                    <Button size="sm" onClick={() => onResubmit(proposal)}>
                      Resubmit this plan
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
    </ModalShell>
  );
}

function proposalStatusTone(status) {
  if (status === 'Rejected') return 'danger';
  if (status === 'Revoked') return 'neutral';
  if (status === 'Accepted') return 'success';
  return 'warning';
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
