// src/pages/Track.jsx - Single shipment view backed by DeliveryEscrow.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineCheck,
  HiOutlineCheckBadge,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCreditCard,
  HiOutlineExclamationCircle,
  HiOutlineInformationCircle,
  HiOutlineLockClosed,
  HiOutlinePhoto,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Badge } from '../components/Badge.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { Button } from '../components/Button.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import {
  formatDate,
  formatEth,
  requestStatus,
  shortAddress,
} from '../utils/format.js';
import {
  loadPaymentHistory,
  paymentActionLabel,
  PAYMENT_ACTION_TONE,
  shortTransactionHash,
} from '../utils/paymentHistory.js';
import styles from './Track.module.css';
import {hashFile, uploadPhoto} from '../utils/upload.js';

const TAB_ITEMS = [
  { value: 'timeline', label: 'Timeline & Checkpoints' },
  { value: 'proof', label: 'Photo Proof' },
  { value: 'payments', label: 'Payments' },
];

const MILESTONE_STATUS = ['Proposed', 'PendingProof', 'Submitted', 'Verified', 'Rejected', 'Paid'];
const PROPOSAL_STATUS = ['Active', 'Revoked', 'Rejected', 'Accepted'];

export function Track() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { contracts, deployError } = useContracts();
  const { account, signer, provider } = useWallet();
  const { show } = useToast();
  const [tab, setTab] = useState('timeline');
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionStage, setActionStage] = useState('idle');
  const [refreshKey, setRefreshKey] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState(null);
  const [proofViewerMilestone, setProofViewerMilestone] = useState(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!idParam || !contracts?.deliveryEscrow) {
      setShipment(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadShipment(contracts.deliveryEscrow, idParam)
      .then((nextShipment) => {
        if (!cancelled) {
          setShipment(nextShipment);

          const actionableIndex = nextShipment.events.findIndex((event) => 
            ['pending', 'locked', 'rejected'].includes(event.status));
          setSelectedIndex(actionableIndex >= 0 ? actionableIndex : 0);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setShipment(null);
          setError(loadError.shortMessage || loadError.reason || loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, idParam, refreshKey]);

  useEffect(() => {
    if (
      !provider
      || !contracts?.deliveryEscrow
      || !shipment?.id
      || String(shipment.id) !== String(idParam)
    ) {
      setPaymentHistory([]);
      setPaymentHistoryLoading(false);
      setPaymentHistoryError(null);
      return;
    }

    let cancelled = false;
    setPaymentHistoryLoading(true);
    setPaymentHistoryError(null);

    loadPaymentHistory({
      contract: contracts.deliveryEscrow,
      provider,
      requestId: shipment.id,
    })
      .then((rows) => {
        if (!cancelled) setPaymentHistory(rows);
      })
      .catch((historyError) => {
        if (!cancelled) {
          setPaymentHistory([]);
          setPaymentHistoryError(formatHistoryError(historyError));
        }
      })
      .finally(() => {
        if (!cancelled) setPaymentHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, contracts, idParam, shipment?.id, refreshKey]);

  const isShipper = Boolean(
    account && shipment && account.toLowerCase() === shipment.shipper.toLowerCase(),
  );
  const isCarrier = Boolean(
    account && shipment && shipment.carrier
      && account.toLowerCase() === shipment.carrier.toLowerCase(),
  );
  const isParticipant = isShipper || isCarrier;
  const proposalPending = Boolean(
    shipment?.status === 'Open'
      && shipment.proposals?.some((proposal) => proposal.status === 'Active'),
  );
  const hasRecordedProposals = Boolean(
    shipment?.status === 'Open' && shipment.proposals?.length,
  );
  const milestonesApproved = !['Open', 'PendingApproval'].includes(shipment?.status);
  const deadlinePassed = Boolean(
    shipment?.deadline && nowSeconds > shipment.deadline,
  );
  const canCancelRequest = Boolean(
    isShipper
      && (
        ['Open', 'PendingApproval'].includes(shipment?.status)
        || (shipment?.status === 'Funded' && !deadlinePassed)
      ),
  );
  const canClaimRefund = Boolean(
    isShipper
      && shipment?.remaining > 0n
      && (
        ['Cancelled', 'Expired'].includes(shipment?.status)
        || (['Funded', 'InProgress'].includes(shipment?.status) && deadlinePassed)
      ),
  );
  const proofSubmissionOpen = Boolean(
    isCarrier && ['Funded', 'InProgress'].includes(shipment?.status),
  );
  const busy = actionStage !== 'idle';

  const acceptProposal = async (proposalId) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    setActionStage('accepting');

    try {
      const activeAddress = await signer.getAddress();
      const latest = await contracts.deliveryEscrow.getRequest(BigInt(shipment.id));
      const latestStatus = requestStatus(latest.status ?? latest[9]);
      const latestShipper = latest.shipper ?? latest[1];
      const proposedAmount = BigInt(latest.proposedAmount ?? latest[11] ?? 0n);

      if (activeAddress.toLowerCase() !== latestShipper.toLowerCase()) {
        throw new Error('Only the request shipper can accept this proposal.');
      }
      if (latestStatus !== 'Open') {
        throw new Error('This request is no longer open for proposal selection.');
      }

      const tx = await contracts.deliveryEscrow.connect(signer).approveAndFund(
        BigInt(shipment.id),
        BigInt(proposalId),
        { value: proposedAmount },
      );
      show(`Locking ${formatEth(proposedAmount)} in escrow...`, 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Approval was not confirmed.');

      show(`Proposal accepted in block ${receipt.blockNumber}.`, 'success');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const rejectProposal = async (proposalId) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    setActionStage('rejecting');

    try {
      const tx = await contracts.deliveryEscrow.connect(signer).rejectMilestoneProposal(
        BigInt(shipment.id),
        BigInt(proposalId),
      );
      show('Rejecting this carrier proposal...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Rejection was not confirmed.');

      show(`Proposal rejected in block ${receipt.blockNumber}. Other proposals remain available.`, 'success');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const cancelRequest = async () => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) {
      show('Connect the shipper wallet first.', 'error');
      return;
    }

    const hasEscrow = shipment.remaining > 0n;
    const confirmation = hasEscrow
      ? `Cancel this request and refund ${formatEth(shipment.remaining)} to the shipper wallet?`
      : 'Cancel this request? It has not funded escrow yet.';
    if (!window.confirm(confirmation)) return;

    setActionStage('cancelling');
    try {
      const latest = await getLatestRequestForShipper(contracts.deliveryEscrow, signer, shipment.id);
      const latestStatus = requestStatus(latest.status ?? latest[9]);
      if (!['Open', 'PendingApproval', 'Funded'].includes(latestStatus)) {
        throw new Error('This request can no longer be cancelled from its current status.');
      }

      const tx = await contracts.deliveryEscrow.connect(signer).cancelRequest(
        BigInt(shipment.id),
      );
      show(hasEscrow ? 'Cancelling request and refunding escrow...' : 'Cancelling request...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Cancellation was not confirmed.');

      show(
        hasEscrow
          ? `Request cancelled and ${formatEth(shipment.remaining)} refunded.`
          : 'Request cancelled.',
        'success',
      );
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const claimRefund = async () => {
    if (busy || !shipment || !signer || !provider || !contracts?.deliveryEscrow) {
      show('Connect the shipper wallet first.', 'error');
      return;
    }

    if (!window.confirm(`Claim ${formatEth(shipment.remaining)} remaining escrow for this request?`)) return;

    setActionStage('refunding');
    try {
      const latest = await getLatestRequestForShipper(contracts.deliveryEscrow, signer, shipment.id);
      const latestStatus = requestStatus(latest.status ?? latest[9]);
      const latestDeadline = Number(latest.deadline ?? latest[7] ?? 0n);
      const latestRemaining = getRequestRemaining(latest);
      const latestExpired = latestDeadline > 0 && await hasChainDeadlinePassed(provider, latestDeadline);
      const eligible = (
        ['Cancelled', 'Expired'].includes(latestStatus)
        || (['Funded', 'InProgress'].includes(latestStatus) && latestExpired)
      );

      if (!eligible || latestRemaining <= 0n) {
        throw new Error('This request is not currently eligible for a refund.');
      }

      const refundContract = contracts.deliveryEscrow.connect(signer);
      const tx = await refundContract.refundRemaining(BigInt(shipment.id));
      show('Claiming remaining escrow refund...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Refund was not confirmed.');

      show(`${formatEth(latestRemaining)} refunded to the shipper wallet.`, 'success');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const submitMilestoneProof = async (milestoneId, file) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) {
      show('Connect the carrier wallet first', 'error');
      return false;
    }

    if(!isCarrier){
      show('Only the assigned carrier can submit milestone proof.', 'error');
      return false;
    }

    if(!file){
      show('No file selected for upload.', 'error');
      return false;
    }

    const fileTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if(!fileTypes.includes(file.type)){
      show('Invalid file type. Please upload a JPEG, PNG, or WEBP image.', 'error');
      return false;
    }
    
    if(file.size > 2 * 1024 * 1024) {
      show('File size exceeds 2MB limit. Please upload a smaller image.', 'error');
      return false;
    }

    setActionStage('submitting-proof');

    try{
      const hash = await hashFile(file);
      const uploadResult = await uploadPhoto(file, hash, shipment.id, milestoneId);
      const proofReference = `${uploadResult.url}?sha256=${encodeURIComponent(hash)}`;
      const tx = await contracts.deliveryEscrow.connect(signer).submitProof(
        BigInt(shipment.id),
        BigInt(milestoneId),
        [proofReference],
        '',
      );
      show('Submitting milestone proof on-chain...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Proof submission was not confirmed.');
      
      show('Milestone proof submitted successfully.', 'success');
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
        return false;
    } finally {
        setActionStage('idle');
    }
  }



  const verifyMilestone = async (milestoneId, approve) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    setActionStage(approve ? 'verifying' : 'rejecting-proof');

    try {
      const tx = await contracts.deliveryEscrow.connect(signer).verifyMilestone(
        BigInt(shipment.id),
        BigInt(milestoneId),
        [proofReference],
        '',
      );
      show(approve ? 'Verifying proof and releasing payment...' : 'Rejecting milestone proof...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Verification was not confirmed.');

      show(approve ? 'Milestone verified and payment released.' : 'Milestone proof rejected.', 'success');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const copyTransactionHash = async (transactionHash) => {
    try {
      await navigator.clipboard.writeText(transactionHash);
      show('Tx hash copied to clipboard', 'success');
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Topbar title={`Shipment #${String(idParam || '').padStart(4, '0')}`} />
        <Card><div className={styles.tabEmpty}>Loading shipment from DeliveryEscrow...</div></Card>
      </div>
    );
  }

  if (deployError || error || !shipment) {
    return (
      <div className={styles.page}>
        <Topbar title={`Shipment #${String(idParam || '').padStart(4, '0')}`} />
        <Card>
          <div className={styles.tabEmpty}>
            {deployError || error || 'Shipment not found.'}
          </div>
        </Card>
      </div>
    );
  }

  const displayedValue = shipment.escrow > 0n ? shipment.escrow : shipment.proposedAmount;
  const displayedRemaining = shipment.escrow > 0n ? shipment.remaining : shipment.proposedAmount;
  const releasedPct = shipment.escrow > 0n
    ? Number((shipment.released * 100n) / shipment.escrow)
    : 0;

  return (
    <div className={styles.page}>
      <Topbar
        title={`Shipment #${String(shipment.id).padStart(4, '0')}`}
        subtitle="Proposal, delivery checkpoints, proofs, and payments in one timeline."
      />

      <Card className={styles.summary}>
        <div className={styles.statusPanel}>
          <div className={styles.statusMain}>
            <div className={styles.statusKicker}>Current status</div>
            <div className={styles.statusTitleRow}>
              <h2 className={styles.statusTitle}>{requestStatus(shipment.status)}</h2>
            </div>
            <div className={styles.statusRoute}>
              <span>{shipment.from}</span>
              <span className={styles.routeArrow}>-&gt;</span>
              <span>{shipment.to}</span>
            </div>
          </div>

          <div className={styles.statusProgress} aria-label={`${releasedPct}% escrow released`}>
            <div className={styles.progressHead}>
              <span>{shipment.escrow > 0n ? 'Escrow released' : 'Escrow awaiting approval'}</span>
              <strong>{releasedPct}%</strong>
            </div>
            <div className={styles.progressTrack}>
              <span className={styles.progressFill} style={{ width: `${releasedPct}%` }} />
            </div>
            <div className={styles.progressMeta}>
              <span>{formatEth(shipment.released)} paid</span>
              <span>{formatEth(displayedRemaining)} remaining</span>
            </div>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <SummaryField label="Created" value={formatDate(shipment.createdAt)} />
          <SummaryField label="Deadline" value={formatDate(shipment.deadline)} />
          <div className={styles.summaryField}>
            <div className={styles.summaryFieldLabel}>
              {shipment.escrow > 0n ? 'Escrow value' : 'Planned payment'}
            </div>
            <div className={styles.summaryFieldVal}>
              <strong>{formatEth(displayedValue)}</strong>
              <Badge tone={shipment.escrow > 0n ? 'success' : 'warning'} icon={HiOutlineCheckBadge}>
                {shipment.escrow > 0n ? 'Funded' : 'Awaiting funding'}
              </Badge>
            </div>
          </div>
          <div className={styles.summaryField}>
            <div className={styles.summaryFieldLabel}>Carrier address</div>
            <div className={styles.summaryFieldVal}>
              {shipment.carrier ? (
                <span className={styles.addressVal} title={shipment.carrier}>
                  {shortAddress(shipment.carrier)}
                </span>
              ) : (
                <span className={styles.muted}>Awaiting proposal</span>
              )}
            </div>
          </div>
        </div>

        {shipment.specialInstruction && (
          <div className={styles.specialNote}>
            <HiOutlineInformationCircle className={styles.specialNoteIcon} aria-hidden="true" />
            <div>
              <div className={styles.specialNoteTitle}>Special instructions</div>
              <div className={styles.specialNoteBody}>{shipment.specialInstruction}</div>
            </div>
          </div>
        )}
      </Card>

      {(canCancelRequest || canClaimRefund) && (
        <div className={styles.refundBlock} role="region" aria-label="Escrow recovery">
          <div className={styles.refundText}>
            <strong>
              {canClaimRefund ? 'Remaining escrow is refundable.' : 'Manage this request'}
            </strong>
            <div>
              {canClaimRefund
                ? `${formatEth(shipment.remaining)} can be returned to the shipper wallet.`
                : shipment.status === 'Funded'
                  ? `Cancel before work starts to return ${formatEth(shipment.remaining)}.`
                  : 'Cancel the request before escrow is funded.'}
            </div>
          </div>
          <div className={styles.refundActions}>
            {canCancelRequest && (
              <Button
                variant="danger"
                onClick={cancelRequest}
                disabled={busy}
              >
                {actionStage === 'cancelling'
                  ? 'Cancelling...'
                  : shipment.remaining > 0n
                    ? 'Cancel & refund'
                    : 'Cancel request'}
              </Button>
            )}
            {canClaimRefund && (
              <Button onClick={claimRefund} disabled={busy}>
                {actionStage === 'refunding' ? 'Refunding...' : 'Claim refund'}
              </Button>
            )}
          </div>
        </div>
      )}

      {shipment.status === 'Open' && (
        <Card className={styles.proposalCard}>
          <div className={styles.proposalHeader}>
            <div>
              <div className={styles.proposalKicker}>Open shipment</div>
              <h2>{proposalPending ? `${shipment.proposals.filter((proposal) => proposal.status === 'Active').length} carrier proposal${shipment.proposals.filter((proposal) => proposal.status === 'Active').length === 1 ? '' : 's'} ready to review` : 'No carrier proposal yet'}</h2>
              <p>
                {proposalPending
                  ? 'The request remains open while the shipper compares plans and selects one carrier.'
                  : 'A carrier must propose milestone names and payout percentages before escrow can be funded.'}
              </p>
            </div>
            {account && !isShipper && (
              <Button onClick={() => navigate(`/shipments/${shipment.id}/propose`)}>
                Propose milestones
              </Button>
            )}
          </div>
          <span className={styles.proposalHint}>
            {!account
              ? 'Connect a carrier wallet to propose milestones.'
              : isShipper
                ? 'Your request remains visible in the marketplace while waiting for a carrier.'
                : 'Each carrier can keep one active proposal until the shipper selects or rejects it.'}
          </span>
        </Card>
      )}

      {hasRecordedProposals && (
        <ProposalReview
          proposals={shipment.proposals}
          proposedAmount={shipment.proposedAmount}
          isShipper={isShipper}
          account={account}
          busy={busy}
          actionStage={actionStage}
          onAccept={acceptProposal}
          onReject={rejectProposal}
        />
      )}

      {milestonesApproved && (
        <Card padded={false} className={styles.tabsCard}>
          <div className={styles.tabsWrap}>
            <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
          </div>
          <div className={styles.tabBody}>
            {tab === 'timeline' && (
              <TimelinePanel
                events={shipment.events}
                milestones={shipment.milestones}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onViewProof={setProofViewerMilestone}
                canVerify={isShipper}
                canSubmitProof={proofSubmissionOpen}
                busy={busy}
                onVerify={verifyMilestone}
                onSubmitProof={submitMilestoneProof}
              />
            )}
            {tab === 'proof' && <ProofPanel milestones={shipment.milestones} />}
            {tab === 'payments' && (
              <PaymentsPanel
                shipment={shipment}
                history={paymentHistory}
                historyLoading={paymentHistoryLoading}
                historyError={paymentHistoryError}
                onCopyHash={copyTransactionHash}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
            )}
          </div>
        </Card>
      )}
      {proofViewerMilestone && (
        <ProofViewerModal
          milestone={proofViewerMilestone}
          onClose={() => setProofViewerMilestone(null)}
        />
      )}
    </div>
  );
}

function SummaryField({ label, value }) {
  return (
    <div className={styles.summaryField}>
      <div className={styles.summaryFieldLabel}>{label}</div>
      <div className={styles.summaryFieldVal}>{value}</div>
    </div>
  );
}

function ProposalReview({
  proposals,
  proposedAmount,
  isShipper,
  account,
  busy,
  actionStage,
  onAccept,
  onReject,
}) {
  const [dateSort, setDateSort] = useState('');
  const [milestoneSort, setMilestoneSort] = useState('');
  const [selectedProposal, setSelectedProposal] = useState(null);
  const activeProposals = proposals.filter((proposal) => proposal.status === 'Active');
  const historicalProposals = proposals.filter((proposal) => proposal.status !== 'Active');
  const sortProposals = (items) => [...items].sort((a, b) => {
    const compareDate = dateSort === 'oldest'
      ? a.createdAt - b.createdAt
      : dateSort === 'newest'
        ? b.createdAt - a.createdAt
        : 0;
    const compareMilestones = milestoneSort === 'most'
      ? b.milestones.length - a.milestones.length
      : milestoneSort === 'fewest'
        ? a.milestones.length - b.milestones.length
        : 0;
    return compareMilestones || compareDate;
  });
  const sortedProposals = sortProposals(activeProposals);
  const sortedHistoricalProposals = sortProposals(historicalProposals);

  return (
    <>
      <Card className={styles.proposalCard}>
        <div className={styles.proposalHeader}>
          <div>
            <div className={styles.proposalKicker}>Carrier proposals</div>
            <h2>Compare milestone payout plans</h2>
            <p>Selecting one plan locks {formatEth(proposedAmount)} in escrow and assigns that carrier.</p>
          </div>
          <Badge tone="warning">{activeProposals.length} active</Badge>
        </div>

        <div className={styles.proposalControls}>
          <span>{activeProposals.length > 3 ? 'Showing three proposals at a time. Scroll to compare the rest.' : 'Open a proposal to inspect its milestone breakdown.'}</span>
          <div className={styles.proposalSortControls}>
            <label className={styles.proposalSortLabel}>
              <span>Date</span>
              <select value={dateSort} onChange={(event) => setDateSort(event.target.value)}>
                <option value="">No date sort</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <label className={styles.proposalSortLabel}>
              <span>Milestones</span>
              <select value={milestoneSort} onChange={(event) => setMilestoneSort(event.target.value)}>
                <option value="">No milestone sort</option>
                <option value="most">Most first</option>
                <option value="fewest">Fewest first</option>
              </select>
            </label>
          </div>
        </div>

        {sortedProposals.length > 0 && (
          <div className={styles.proposalList}>
            {sortedProposals.map((proposal) => (
              <ProposalSummaryCard
                key={proposal.id}
                proposal={proposal}
                onOpen={() => setSelectedProposal(proposal)}
              />
            ))}
          </div>
        )}

        <div className={styles.proposalFooter}>
          <span className={styles.proposalHint}>
            {!account
              ? 'Connect the shipper wallet to select a proposal.'
              : isShipper
                ? 'Accept one plan to fund escrow, or reject individual plans without closing this request.'
                : 'Each carrier can have one active proposal while the shipper reviews the options.'}
          </span>
        </div>

        {historicalProposals.length > 0 && (
          <details className={styles.proposalHistory}>
            <summary>Proposal history ({historicalProposals.length})</summary>
            <ul>
                {sortedHistoricalProposals.map((proposal) => (
                  <li key={proposal.id}>
                    <button
                      type="button"
                      className={styles.proposalHistoryEntry}
                      onClick={() => setSelectedProposal(proposal)}
                    >
                      <span title={proposal.carrier}>{shortAddress(proposal.carrier)}</span>
                      <Badge tone={proposalStatusTone(proposal.status)}>{proposal.status}</Badge>
                      <span>View details</span>
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </Card>

      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          proposedAmount={proposedAmount}
          isShipper={isShipper}
          account={account}
          busy={busy}
          actionStage={actionStage}
          onAccept={onAccept}
          onReject={onReject}
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </>
  );
}

function ProposalSummaryCard({ proposal, status, onOpen }) {
  return (
    <button type="button" className={styles.proposalSummaryCard} onClick={onOpen}>
      <span className={styles.proposalSummaryIdentity}>
        <span className={styles.proposalCarrierLabel}>Carrier proposal #{proposal.id + 1}</span>
        <strong title={proposal.carrier}>{shortAddress(proposal.carrier)}</strong>
      </span>
      <span className={styles.proposalSummaryMeta}>
        <span>{formatDate(proposal.createdAt)}</span>
        <span className={styles.proposalSummaryBadges}>
          {status && <Badge tone={proposalStatusTone(status)}>{status}</Badge>}
          <Badge tone="warning">{proposal.milestones.length} milestones</Badge>
        </span>
      </span>
      <span className={styles.proposalSummaryAction}>View details</span>
    </button>
  );
}

function proposalStatusTone(status) {
  if (status === 'Rejected') return 'danger';
  if (status === 'Accepted') return 'success';
  return 'neutral';
}

function ProposalDetailModal({
  proposal,
  proposedAmount,
  isShipper,
  account,
  busy,
  actionStage,
  onAccept,
  onReject,
  onClose,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.proposalModalOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.proposalModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.proposalPlanHeader}>
          <div>
            <span className={styles.proposalCarrierLabel}>Carrier proposal #{proposal.id + 1}</span>
            <strong id="proposal-modal-title" title={proposal.carrier}>{shortAddress(proposal.carrier)}</strong>
            <span className={styles.proposalCreated}>Submitted {formatDate(proposal.createdAt)}</span>
          </div>
          <div className={styles.proposalModalHeaderActions}>
            {proposal.status !== 'Active' && (
              <Badge tone={proposalStatusTone(proposal.status)}>{proposal.status}</Badge>
            )}
            <button type="button" className={styles.proposalModalClose} onClick={onClose} aria-label="Close proposal details">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={styles.proposalModalBody}>
          <div className={styles.proposalModalIntro}>
            <span>{proposal.milestones.length} milestones</span>
            <span>Planned escrow: {formatEth(proposedAmount)}</span>
          </div>
          <ol className={styles.proposalSteps}>
            {proposal.milestones.map((milestone, index) => (
              <li key={`${milestone.name}-${index}`} className={styles.proposalStep}>
                <span className={styles.proposalIndex}>{index + 1}</span>
                <div className={styles.proposalStepBody}>
                  <div className={styles.proposalStepHeader}>
                    <strong>{milestone.name}</strong>
                    <Badge tone="warning">Proposed</Badge>
                  </div>
                  <div className={styles.proposalStepMeta}>
                    <span>{milestone.payoutPercentage}% of payment</span>
                    <strong>{formatEth(calculateProposedPayout(
                      proposedAmount,
                      milestone.payoutPercentage,
                      index,
                      proposal.milestones,
                    ))}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {isShipper && proposal.status === 'Active' && (
          <div className={styles.proposalActions}>
            <Button variant="danger" onClick={() => onReject(proposal.id)} disabled={busy}>
              {actionStage === 'rejecting' ? 'Rejecting...' : 'Reject proposal'}
            </Button>
            <Button onClick={() => onAccept(proposal.id)} disabled={busy}>
              {actionStage === 'accepting' ? 'Confirming...' : 'Accept & fund escrow'}
            </Button>
          </div>
        )}
        {!isShipper && account && account.toLowerCase() === proposal.carrier.toLowerCase() && (
          <span className={styles.proposalOwnerNote}>This is your active proposal.</span>
        )}
      </section>
    </div>
  );
}

function TimelinePanel({
  events,
  milestones,
  selectedIndex,
  onSelect,
  onViewProof,
  canVerify,
  busy,
  onVerify,
  canSubmitProof,
  onSubmitProof,
}) {
  if (!events.length) return <div className={styles.tabEmpty}>No timeline entries yet.</div>;
  const selectedEvent = events[selectedIndex] || events[0];
  const selectedMilestone = selectedEvent.milestoneId == null
    ? null
    : milestones[selectedEvent.milestoneId];
  const hasPhotoProof = selectedMilestone?.proofUris?.length > 0;

  return (
    <div className={styles.timelineWorkspace}>
      <div className={styles.timelineListContainer}>
        <div className={styles.timelineRoadmap}>
          <div className={styles.timelineTrackLine} />
          <ol className={styles.timeline}>
            {events.map((event, index) => {
              const active = index === selectedIndex;
              const dotClass = timelineDotClass(event.status);
              const dotIcon = event.status === 'verified' || event.status === 'paid'
                ? <HiOutlineCheck size={13} />
                : event.status === 'rejected'
                  ? <HiOutlineExclamationCircle size={13} />
                  : event.status === 'locked'
                    ? <HiOutlineLockClosed size={11} />
                    : index + 1;

              return (
                <li key={`${event.eventType}-${index}`} className={`${styles.tlItem} ${active ? styles.tlItemActive : ''}`}>
                  <div className={`${styles.tlDot} ${dotClass}`}>{dotIcon}</div>
                  <button type="button" className={styles.tlContent} onClick={() => onSelect(index)}>
                    <span className={styles.tlBrief}>
                      <span className={styles.tlBriefTime}>
                        {event.timestamp ? formatDate(event.timestamp) : event.statusLabel}
                      </span>
                      <strong className={styles.tlBriefTitle}>{event.label}</strong>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className={styles.timelineSidebar}>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarHeader}>
            <Badge tone={timelineTone(selectedEvent.status)}>{selectedEvent.statusLabel}</Badge>
            <h3 className={styles.sidebarTitle}>{selectedEvent.label}</h3>
          </div>
          <div className={styles.sidebarBody}>
            <div className={styles.sidebarField}>
              <span className={styles.sidebarLabel}>Checkpoint details</span>
              <p className={styles.sidebarDesc}>{selectedEvent.details}</p>
            </div>
            {selectedEvent.actor && (
              <div className={styles.sidebarField}>
                <span className={styles.sidebarLabel}>Actor</span>
                <span className={styles.sidebarValueAddress}>{selectedEvent.actor}</span>
              </div>
            )}
            {hasPhotoProof && (
              <div className={styles.sidebarProofBox}>
                <HiOutlinePhoto className={styles.proofIcon} aria-hidden="true" />
                <div className={styles.proofInfo}>
                  <span>Photo proof submitted</span>
                  <small>{selectedMilestone.proofUris.length} image{selectedMilestone.proofUris.length === 1 ? '' : 's'} available</small>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewProof(selectedMilestone)}
                >
                  View proof
                </Button>
              </div>
            )}
            {selectedEvent.milestoneId !== null && canSubmitProof && (
              selectedEvent.status === 'locked' || selectedEvent.status === 'rejected' ) && (
                <ProofSubmitBox
                  key={`${selectedEvent.milestoneId}-${selectedEvent.status}`}
                  milestoneId={selectedEvent.milestoneId}
                  rejected={selectedEvent.status === 'rejected'}
                  busy={busy}
                  onSubmit={onSubmitProof}
                />
              )}
            {selectedEvent.status === 'pending' && canVerify && (
              <div className={styles.sidebarVerifyPanel}>
                <span className={styles.sidebarLabel}>Shipper verification required</span>
                <div className={styles.actionRow}>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onVerify(selectedEvent.milestoneId, true)}
                  >
                    Verify & release
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => onVerify(selectedEvent.milestoneId, false)}
                  >
                    Reject proof
                  </Button>
                </div>
              </div>
            )}
            {(selectedEvent.status === 'verified' || selectedEvent.status === 'paid') && (
              <div className={styles.onchainStamp}>
                <HiOutlineCheckBadge className={styles.stampIcon} />
                <span>{selectedEvent.status === 'paid' ? 'Paid on-chain' : 'Recorded on-chain'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProofSubmitBox({ milestoneId, rejected, busy, onSubmit }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const handleSubmit = async () => {
    const success = await onSubmit(milestoneId, selectedFile);
    if (success) {
      setSelectedFile(null);
    }
  };
  return (
    <div className={styles.sidebarVerifyPanel}>
      <span className={styles.sidebarLabel}>
        {rejected 
        ? 'Resubmit proof for this milestone' 
        : 'Carrier checkpoint update'}
        </span>

        <input 
        type="file" 
        accept="image/jpeg,image/png,image/webp" 
        disabled={busy}
        onChange={(e) => setSelectedFile(e.target.files[0])} />

        {selectedFile && (
          <span> 
            Selected: {selectedFile.name}
          </span>
        )}

        <Button
        size="sm"
        disabled={busy || !selectedFile}
        onClick={handleSubmit}
        >
          {busy ? 'Submitting proof...' : rejected ? 'Resubmit Proof' : 'Submit Proof'}
        </Button>
    </div>
  );
}

function ProofPanel({ milestones }) {
  const withProof = milestones.filter((milestone) => milestone.proofUris.length > 0);
  if (!withProof.length) {
    return <div className={styles.tabEmpty}>No photo proof has been submitted.</div>;
  }

  return (
    <div className={styles.proofPanel}>
      <div className={styles.proofHeader}>
        <HiOutlinePhoto className={styles.proofHeaderIcon} aria-hidden="true" />
        <div>
          <div className={styles.proofHeaderTitle}>
            Milestone photo proof
          </div>

          <div className={styles.proofHeaderBody}>
            Review the photos submitted by the carrier.
          </div>
        </div>
      </div>

      <div className={styles.proofGrid}>
        {withProof.flatMap((milestone) =>
          milestone.proofUris.map((proofUri, proofIndex) => (
            <ProofImageCard
              key={`${milestone.index}-${proofIndex}`}
              milestone={milestone}
              proofUri={proofUri}
              proofIndex={proofIndex}
            />
          )),
        )}
      </div>
    </div>
  );
}

function ProofImageCard({
  milestone,
  proofUri,
  proofIndex,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const imageUrl = new URL(
    proofUri,
    window.location.origin,
  ).href;

  const parsedUrl = new URL(
    proofUri,
    window.location.origin,
  );

  const proofHash =
    parsedUrl.searchParams.get('sha256') || '';

  const copyHash = async () => {
    if (!proofHash) return;

    try {
      await navigator.clipboard.writeText(proofHash);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className={styles.proofCard}>
      <div className={styles.proofImageWrap}>
        {!imageFailed ? (
          <img
            src={imageUrl}
            alt={`Proof ${proofIndex + 1} for ${milestone.name}`}
            className={styles.proofImage}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.proofImageError}>
            <HiOutlineExclamationCircle aria-hidden="true" />
            <span>Photo could not be loaded</span>
          </div>
        )}

        <span className={styles.proofNumber}>
          Proof {proofIndex + 1}
        </span>
      </div>

      <div className={styles.proofCardBody}>
        <div className={styles.proofCardHeader}>
          <div>
            <span className={styles.proofCardLabel}>
              Milestone
            </span>

            <h3 className={styles.proofCardTitle}>
              {milestone.name}
            </h3>
          </div>

          <Badge tone={
            milestone.status === 'Rejected'
              ? 'danger'
              : milestone.status === 'Paid'
                ? 'success'
                : 'warning'
          }>
            {milestone.status}
          </Badge>
        </div>

        {milestone.remark && (
          <div className={styles.proofRemark}>
            <span className={styles.proofCardLabel}>
              Carrier remark
            </span>

            <p>{milestone.remark}</p>
          </div>
        )}

        {milestone.submittedAt > 0 && (
          <div className={styles.proofSubmittedTime}>
            Submitted {formatDate(milestone.submittedAt)}
          </div>
        )}

        <div className={styles.proofActions}>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.proofActionLink}
          >
            View full image
          </a>

          {proofHash && (
            <button
              type="button"
              className={styles.proofHashButton}
              onClick={copyHash}
            >
              {copied ? 'Hash copied' : 'Copy proof hash'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ProofViewerModal({ milestone, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const proofUris = milestone.proofUris || [];
  const hasMultipleProofs = proofUris.length > 1;
  const proofUri = proofUris[activeIndex];
  const imageUrl = new URL(proofUri, window.location.origin).href;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultipleProofs) {
        setImageFailed(false);
        setActiveIndex((index) => (index - 1 + proofUris.length) % proofUris.length);
      }
      if (event.key === 'ArrowRight' && hasMultipleProofs) {
        setImageFailed(false);
        setActiveIndex((index) => (index + 1) % proofUris.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasMultipleProofs, onClose, proofUris.length]);

  const move = (direction) => {
    setImageFailed(false);
    setActiveIndex((index) => (index + direction + proofUris.length) % proofUris.length);
  };

  return (
    <div className={styles.proofViewerScrim} onMouseDown={onClose}>
      <section
        className={styles.proofViewerDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proof-viewer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.proofViewerHeader}>
          <div>
            <span className={styles.proofCardLabel}>Photo proof</span>
            <h2 id="proof-viewer-title">{milestone.name}</h2>
          </div>
          <button type="button" className={styles.proofViewerClose} onClick={onClose} aria-label="Close proof viewer">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <div className={styles.proofViewerBody}>
          {!imageFailed ? (
            <img
              src={imageUrl}
              alt={`Proof ${activeIndex + 1} for ${milestone.name}`}
              className={styles.proofViewerImage}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className={styles.proofViewerError}>
              <HiOutlineExclamationCircle aria-hidden="true" />
              <span>Photo could not be loaded</span>
            </div>
          )}
          {hasMultipleProofs && (
            <>
              <button type="button" className={`${styles.proofViewerNav} ${styles.proofViewerPrev}`} onClick={() => move(-1)} aria-label="Previous proof">
                <HiOutlineChevronLeft aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.proofViewerNav} ${styles.proofViewerNext}`} onClick={() => move(1)} aria-label="Next proof">
                <HiOutlineChevronRight aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <footer className={styles.proofViewerFooter}>
          <span>Proof {activeIndex + 1} of {proofUris.length}</span>
          <a href={imageUrl} target="_blank" rel="noreferrer">Open full image</a>
        </footer>
      </section>
    </div>
  );
}

function PaymentsPanel({
  shipment,
  history,
  historyLoading,
  historyError,
  onCopyHash,
  onRetry,
}) {
  return (
    <div className={styles.paymentsPanel}>
      <div className={styles.paymentsHeader}>
        <HiOutlineCreditCard className={styles.paymentsHeaderIcon} aria-hidden="true" />
        <div>
          <div className={styles.paymentsHeaderTitle}>Payment status</div>
          <div className={styles.paymentsHeaderBody}>
            {shipment.escrow > 0n
              ? `${formatEth(shipment.escrow)} was locked after proposal approval.`
              : `${formatEth(shipment.proposedAmount)} is planned but not funded yet.`}
          </div>
        </div>
      </div>
      <PaymentRow label="Planned payment" value={formatEth(shipment.proposedAmount)} />
      <PaymentRow label="Locked in escrow" value={formatEth(shipment.escrow)} />
      <PaymentRow label="Released so far" value={formatEth(shipment.released)} />
      <PaymentRow label="Refunded" value={formatEth(shipment.refunded)} />
      <PaymentRow label="Remaining escrow" value={formatEth(shipment.remaining)} />
      <div className={styles.paymentNote}>
        Milestone payments are released by <code>verifyMilestone()</code> after the shipper approves submitted proof.
      </div>

      <section className={styles.paymentHistorySection} aria-labelledby="payment-history-title">
        <div className={styles.paymentHistoryHeader}>
          <div>
            <h3 id="payment-history-title">On-chain history</h3>
            <p>Funding, payouts, and refunds recorded by DeliveryEscrow.</p>
          </div>
          {!historyLoading && !historyError && (
            <Badge tone="neutral">{history.length} event{history.length === 1 ? '' : 's'}</Badge>
          )}
        </div>

        {historyLoading ? (
          <div className={styles.paymentHistoryState} role="status">Loading payment events…</div>
        ) : historyError ? (
          <div className={styles.paymentHistoryError}>
            <span>{historyError}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
          </div>
        ) : history.length === 0 ? (
          <div className={styles.paymentHistoryState}>No payment event has been emitted for this request yet.</div>
        ) : (
          <ol className={styles.paymentHistoryList}>
            {history.map((entry) => (
              <li key={entry.id} className={styles.paymentHistoryItem}>
                <div className={styles.paymentHistoryMain}>
                  <Badge tone={PAYMENT_ACTION_TONE[entry.action] || 'neutral'}>
                    {paymentActionLabel(entry.action, entry.milestoneId)}
                  </Badge>
                  <button
                    type="button"
                    className={styles.paymentHashButton}
                    onClick={() => onCopyHash(entry.transactionHash)}
                    title="Copy transaction hash"
                  >
                    <code>{shortTransactionHash(entry.transactionHash)}</code>
                  </button>
                </div>
                <div className={styles.paymentHistoryMeta}>
                  <strong>{formatEth(entry.amount)}</strong>
                  <span>{formatDate(entry.timestamp)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function PaymentRow({ label, value }) {
  return (
    <div className={styles.paymentRow}>
      <div className={styles.paymentLabel}>{label}</div>
      <div className={styles.paymentValue}>{value}</div>
    </div>
  );
}

async function loadShipment(deliveryEscrow, idParam) {
  const requestId = BigInt(idParam);
  const [request, milestoneResult, proposalResult] = await Promise.all([
    deliveryEscrow.getRequest(requestId),
    deliveryEscrow.getMilestones(requestId),
    deliveryEscrow.getProposals(requestId),
  ]);

  const shipper = request.shipper ?? request[1];
  const rawCarrier = request.carrier ?? request[2];
  const carrier = isZeroAddress(rawCarrier) ? null : rawCarrier;
  const status = requestStatus(request.status ?? request[9]);
  const proposedAmount = BigInt(request.proposedAmount ?? request[11] ?? 0n);
  const escrow = BigInt(request.totalAmount ?? request[5] ?? 0n);
  const released = BigInt(request.releasedAmount ?? request[6] ?? 0n);
  const refunded = BigInt(request.refundedAmount ?? request[12] ?? 0n);
  const createdAt = Number(request.createdAt ?? request[10] ?? 0n);
  const milestones = Array.from(milestoneResult || []).map((milestone, index) => ({
    index,
    name: milestone.name ?? milestone[0],
    payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
    payoutAmount: BigInt(milestone.payoutAmount ?? milestone[2] ?? 0n),
    proofUris: Array.from(milestone.proofUris ?? milestone[3] ?? []),
    remark: milestone.remark ?? milestone[4] ?? '',
    rejectionReason: milestone.rejectionReason ?? milestone[5] ?? '',
    status: MILESTONE_STATUS[Number(milestone.status ?? milestone[6])] || 'Unknown',
    submittedAt: Number(milestone.submittedAt ?? milestone[7] ?? 0n),
    verifiedAt: Number(milestone.verifiedAt ?? milestone[8] ?? 0n),
  }));
  const proposals = await Promise.all(Array.from(proposalResult || []).map(async (proposal, id) => {
    const proposalMilestoneResult = await deliveryEscrow.getProposalMilestones(requestId, id);
    return {
      id,
      carrier: proposal.carrier ?? proposal[0],
      status: PROPOSAL_STATUS[Number(proposal.status ?? proposal[1])] || 'Unknown',
      createdAt: Number(proposal.createdAt ?? proposal[2] ?? 0n),
      updatedAt: Number(proposal.updatedAt ?? proposal[3] ?? 0n),
      milestones: Array.from(proposalMilestoneResult || []).map((milestone) => ({
        name: milestone.name ?? milestone[0],
        payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
      })),
    };
  }));

  return {
    id: Number(request.requestId ?? request[0]),
    shipper,
    carrier,
    from: request.pickupLocation ?? request[3],
    to: request.deliveryLocation ?? request[4],
    status,
    specialInstruction: request.specialInstruction ?? request[8],
    deadline: Number(request.deadline ?? request[7] ?? 0n),
    createdAt,
    proposedAmount,
    escrow,
    released,
    refunded,
    remaining: escrow - released - refunded,
    milestones,
    proposals,
    events: buildTimelineEvents({ shipper, carrier, createdAt, proposedAmount, milestones }),
  };
}

function buildTimelineEvents({ shipper, carrier, createdAt, proposedAmount, milestones }) {
  const events = [{
    eventType: 'RequestCreated',
    label: 'Shipment request published',
    status: 'verified',
    statusLabel: 'Published',
    timestamp: createdAt,
    actor: shipper,
    details: `The shipper published this request with a planned payment of ${formatEth(proposedAmount)}.`,
    milestoneId: null,
  }];

  for (const milestone of milestones) {
    const payout = milestone.payoutAmount > 0n
      ? milestone.payoutAmount
      : (proposedAmount * BigInt(milestone.payoutPercentage)) / 100n;
    events.push({
      eventType: milestone.status,
      label: milestone.name,
      status: timelineStatus(milestone.status),
      statusLabel: milestone.status,
      timestamp: milestone.verifiedAt || milestone.submittedAt || null,
      actor: carrier,
      details: `${milestone.payoutPercentage}% payout (${formatEth(payout)}). ${milestone.remark || milestone.rejectionReason || milestoneDescription(milestone.status)}`,
      milestoneId: milestone.index,
    });
  }

  return events;
}

function calculateProposedPayout(total, percentage, index, milestones) {
  if (index === milestones.length - 1) {
    const allocated = milestones
      .slice(0, -1)
      .reduce((sum, milestone) => sum + ((total * BigInt(milestone.payoutPercentage)) / 100n), 0n);
    return total - allocated;
  }
  return (total * BigInt(percentage)) / 100n;
}

function timelineStatus(status) {
  if (status === 'Paid') return 'paid';
  if (status === 'Verified') return 'verified';
  if (status === 'Submitted') return 'pending';
  if (status === 'Rejected') return 'rejected';
  if (status === 'PendingProof') return 'locked';
  return 'proposed';
}

function timelineDotClass(status) {
  if (status === 'verified' || status === 'paid') return styles.dotVerified;
  if (status === 'pending') return styles.dotPending;
  if (status === 'rejected') return styles.dotRejected;
  if (status === 'locked') return styles.dotLocked;
  return styles.dotNeutral;
}

function timelineTone(status) {
  if (status === 'verified' || status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}

function milestoneDescription(status) {
  const descriptions = {
    Proposed: 'Waiting for the shipper to accept the carrier proposal.',
    PendingProof: 'Waiting for the carrier to submit proof.',
    Submitted: 'Waiting for shipper verification.',
    Verified: 'Proof verified.',
    Rejected: 'Proof rejected and awaiting resubmission.',
    Paid: 'Proof verified and milestone payment released.',
  };
  return descriptions[status] || '';
}

function formatActionError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Transaction cancelled in MetaMask.';
  }
  const message = error?.shortMessage || error?.reason || error?.message || '';
  if (
    message.includes('missing revert data')
    || (error?.code === 'CALL_EXCEPTION' && !error?.data)
  ) {
    return 'The deployed DeliveryEscrow contract is outdated. Run npm run compile and npm run migrate, then refresh this page.';
  }
  if (message.includes('insufficient funds')) return 'The shipper wallet does not have enough ETH.';
  if (message.includes('caller is not shipper')) return 'Only the request shipper can perform this action.';
  if (message.includes('proposal is not active')) return 'This proposal is no longer active. Refresh the request and choose another plan.';
  if (message.includes('request is not open')) return 'This request is no longer open for proposal review.';
  if (message.includes('request cannot be cancelled')) return 'This request can no longer be cancelled.';
  if (message.includes('request is not refundable')) return 'This request is not currently eligible for a refund.';
  if (message.includes('request deadline has not passed')) return 'The request deadline has not passed yet.';
  if (message.includes('no escrow remaining')) return 'There is no remaining escrow to refund.';
  if (message.includes('request already refunded')) return 'This request has already been refunded.';
  if (message.includes('request is not active')) return 'Proof submission is closed because this request is no longer active.';
  return message || 'The shipment transaction failed.';
}

function formatHistoryError(error) {
  const message = error?.shortMessage || error?.reason || error?.message || '';
  if (message.includes('could not coalesce error')) {
    return 'Ganache or MetaMask returned an RPC error. Confirm CargoChain is selected, then retry.';
  }
  return message || 'Could not read payment events from DeliveryEscrow.';
}

async function getLatestRequestForShipper(deliveryEscrow, signer, requestId) {
  const [request, activeAddress] = await Promise.all([
    deliveryEscrow.getRequest(BigInt(requestId)),
    signer.getAddress(),
  ]);
  const shipper = request.shipper ?? request[1];
  if (activeAddress.toLowerCase() !== shipper.toLowerCase()) {
    throw new Error('Only the request shipper can manage escrow recovery.');
  }
  return request;
}

function getRequestRemaining(request) {
  const total = BigInt(request.totalAmount ?? request[5] ?? 0n);
  const released = BigInt(request.releasedAmount ?? request[6] ?? 0n);
  const refunded = BigInt(request.refundedAmount ?? request[12] ?? 0n);
  const remaining = total - released - refunded;
  return remaining > 0n ? remaining : 0n;
}

async function hasChainDeadlinePassed(provider, deadline) {
  const localNow = Math.floor(Date.now() / 1000);
  try {
    const latestBlock = await provider?.getBlock('latest');
    // A local Ganache chain may not mine a block between the deadline and the
    // click. Use the local wall clock as a prompt, while the contract remains
    // the final authority when the refund transaction is estimated/mined.
    return Math.max(localNow, Number(latestBlock?.timestamp ?? 0)) > deadline;
  } catch {
    return localNow > deadline;
  }
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
