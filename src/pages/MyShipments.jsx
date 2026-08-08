// src/pages/MyShipments.jsx — CargoChain
// Requests where the connected wallet is the shipper or assigned carrier.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { ChatButton } from '../components/chat/ChatButton.jsx';
import { Badge } from '../components/Badge.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { CreateRequestModal } from '../components/CreateRequestModal.jsx';
import { clipboardRouteMap } from '../assets';
import { HiOutlineXMark } from 'react-icons/hi2';
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

const STATUS_OPTIONS = [
  { value: 'all',        label: 'Any status' },
  { value: 'Open',       label: 'Open' },
  { value: 'Funded',     label: 'Funded' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Completed',  label: 'Completed' },
  { value: 'Refunded',   label: 'Refunded' },
];

const SHIPMENT_VIEWS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'all', label: 'All' },
  { value: 'shipper', label: 'As shipper' },
  { value: 'carrier', label: 'As carrier' },
];

export function MyShipments() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { contracts, deployError } = useContracts();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('attention');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyShipment, setHistoryShipment] = useState(null);

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!matchesShipmentView(r, view)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.id} ${r.from} ${r.to} ${r.status} ${r.relationship}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((left, right) => Number(Boolean(shipmentAttention(right))) - Number(Boolean(shipmentAttention(left))) || right.createdAt - left.createdAt);
  }, [rows, view, statusFilter, search]);

  const openShipment = (row) => {
    if (row.hasActiveProposal) {
      navigate(`/shipments/${row.id}/propose`);
      return;
    }

    if (row.isShipper || row.isCarrier) {
      navigate(`/track/${row.id}`);
      return;
    }

    if (row.ownHistoricalProposals.length > 0) {
      setHistoryShipment(row);
    }
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="My Shipments"
        subtitle="See work you are shipping or carrying, and take the next step when it matters."
      />

      {/* ── Toolbar: search + filter pills + create button ── */}
      <div className={styles.toolbar}>
        <div className={styles.viewTabs} aria-label="Shipment view">
          {SHIPMENT_VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.viewTab} ${view === item.value ? styles.viewTabActive : ''}`}
              onClick={() => setView(item.value)}
              aria-pressed={view === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.searchWrap}>
          <SearchInput
            value={search}
            onChange={setSearch}
            onSubmit={() => {/* live filter */}}
            placeholder="Search by ID, route, or status…"
            actionLabel="Search"
          />
        </div>
        <label className={styles.statusFilter}>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Button onClick={() => setIsCreateModalOpen(true)}>+ Create request</Button>
      </div>

      {deployError && (
        <Card className={styles.notice}>
          <strong>Contract connection unavailable.</strong>{' '}
          <span className={styles.muted}>{deployError}</span>
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
                  : 'No requests match this view. Try a different view, status, or search term.'
            }
            action={!account
              ? undefined
              : <Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter('all'); setView('all'); }}>Clear filters</Button>
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
                        <span className={styles.relationship}>{shipmentRelationshipLabel(r)}</span>
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
                      <Badge tone={shipmentStatus(r).tone}>{shipmentStatus(r).label}</Badge>
                    </td>
                    <td>
                      <div className={styles.deadlineCell}>
                        <div className={styles.deadlineMain}>{formatDate(Math.floor(r.deadlineMs / 1000))}</div>
                        <div className={styles.deadlineSub}>{formatDaysLeft(r.deadlineMs)}</div>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionCell}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className={styles.nextActionButton}
                          onClick={() => openShipment(r)}
                        >
                          {shipmentActionLabel(r)}
                        </Button>
                        {shouldShowShipmentChat(r) && (
                          <ChatButton
                            requestId={r.id}
                            carrierWallet={shipmentChatCarrier(r)}
                            label="Chat"
                            variant="secondary"
                            size="sm"
                          />
                        )}
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
      const milestoneStatuses = milestoneRows.map((milestone) => Number(milestone.status ?? milestone[6]));

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
        relationship: isShipper ? 'Shipper' : isCarrier ? 'Carrier' : hasActiveProposal ? 'Carrier proposal' : 'Proposal history',
        isShipper,
        isCarrier,
        carrier: assignedCarrier,
        activeProposalCarriers,
        hasActiveProposal,
        hasAnyActiveProposal,
        ownHistoricalProposals,
        hasSubmittedProof: milestoneStatuses.includes(2),
        hasCarrierCheckpointAction: milestoneStatuses.includes(1) || milestoneStatuses.includes(4),
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

function shipmentActionLabel(row) {
  const attention = shipmentAttention(row);
  if (attention) return attention.label;
  if (row.hasActiveProposal) return 'Open active proposal';
  if (row.isShipper || row.isCarrier) return 'Open shipment timeline';
  return 'View proposal history';
}

function shipmentRelationshipLabel(row) {
  if (row.isShipper && row.isCarrier) return 'You are the shipper and carrier';
  if (row.isShipper) return 'You are the shipper';
  if (row.isCarrier) return 'You are the carrier';
  if (row.hasActiveProposal) return 'You proposed this delivery';
  return 'Your proposal history';
}

function matchesShipmentView(row, view) {
  if (view === 'attention') return Boolean(shipmentAttention(row));
  if (view === 'shipper') return row.isShipper;
  if (view === 'carrier') return row.isCarrier || row.hasActiveProposal || row.ownHistoricalProposals.length > 0;
  return true;
}

function shipmentAttention(row) {
  if (row.isShipper && row.status === 'Open' && row.hasAnyActiveProposal) {
    return { label: 'Review proposals' };
  }
  if (row.isShipper && row.hasSubmittedProof) {
    return { label: 'Review proof' };
  }
  if (row.isShipper && ['Funded', 'InProgress'].includes(row.status) && row.deadlineMs < Date.now()) {
    return { label: 'Review refund' };
  }
  if (row.isCarrier && ['Funded', 'InProgress'].includes(row.status) && row.hasCarrierCheckpointAction) {
    return { label: 'Submit proof' };
  }
  return null;
}

function shipmentStatus(row) {
  if (row.isShipper && row.status === 'Open' && row.hasAnyActiveProposal) {
    return { label: 'Review pending', tone: 'warning' };
  }

  if (!row.isShipper && row.hasActiveProposal) {
    return { label: 'Awaiting review', tone: 'warning' };
  }

  if (!row.isShipper && !row.isCarrier && row.ownHistoricalProposals.length > 0) {
    const hasRejectedProposal = row.ownHistoricalProposals.some((proposal) => proposal.status === 'Rejected');
    return hasRejectedProposal
      ? { label: 'Rejected', tone: 'danger' }
      : { label: 'Proposal archived', tone: 'neutral' };
  }

  return {
    label: requestStatus(row.status),
    tone: REQUEST_TONE[row.status] || 'neutral',
  };
}

function CarrierProposalHistoryModal({ shipment, onResubmit, onClose }) {
  const proposals = [...shipment.ownHistoricalProposals]
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className={styles.historyOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.historyModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrier-proposal-history-title"
        onMouseDown={(event) => event.stopPropagation()}
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
      </section>
    </div>
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
