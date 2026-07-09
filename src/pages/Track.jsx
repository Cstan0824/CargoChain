// src/pages/Track.jsx - Single shipment view backed by DeliveryEscrow.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineCheck,
  HiOutlineCheckBadge,
  HiOutlineCreditCard,
  HiOutlineExclamationCircle,
  HiOutlineInformationCircle,
  HiOutlineLockClosed,
  HiOutlinePhoto,
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
import styles from './Track.module.css';

const TAB_ITEMS = [
  { value: 'timeline', label: 'Timeline & Checkpoints' },
  { value: 'proof', label: 'Photo Proof' },
  { value: 'payments', label: 'Payments' },
];

const MILESTONE_STATUS = ['Proposed', 'PendingProof', 'Submitted', 'Verified', 'Rejected', 'Paid'];

export function Track() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { contracts, deployError } = useContracts();
  const { account, signer } = useWallet();
  const { show } = useToast();
  const [tab, setTab] = useState('timeline');
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionStage, setActionStage] = useState('idle');
  const [refreshKey, setRefreshKey] = useState(0);

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
          setSelectedIndex(0);
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

  const isShipper = Boolean(
    account && shipment && account.toLowerCase() === shipment.shipper.toLowerCase(),
  );
  const proposalPending = shipment?.status === 'PendingApproval';
  const milestonesApproved = !['Open', 'PendingApproval'].includes(shipment?.status);
  const busy = actionStage !== 'idle';

  const acceptProposal = async () => {
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
      if (latestStatus !== 'PendingApproval') {
        throw new Error('This proposal is no longer awaiting approval.');
      }

      const tx = await contracts.deliveryEscrow.connect(signer).approveAndFund(
        BigInt(shipment.id),
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

  const rejectProposal = async () => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    setActionStage('rejecting');

    try {
      const tx = await contracts.deliveryEscrow.connect(signer).rejectMilestoneProposal(
        BigInt(shipment.id),
      );
      show('Rejecting proposal and reopening the request...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Rejection was not confirmed.');

      show(`Proposal rejected in block ${receipt.blockNumber}.`, 'success');
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      show(formatActionError(actionError), 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const verifyMilestone = async (milestoneId, approve) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    setActionStage(approve ? 'verifying' : 'rejecting-proof');

    try {
      const tx = await contracts.deliveryEscrow.connect(signer).verifyMilestone(
        BigInt(shipment.id),
        BigInt(milestoneId),
        approve,
        approve ? '' : 'Proof rejected by shipper',
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

      {shipment.status === 'Open' && (
        <Card className={styles.proposalCard}>
          <div className={styles.proposalHeader}>
            <div>
              <div className={styles.proposalKicker}>Open shipment</div>
              <h2>No carrier proposal yet</h2>
              <p>A carrier must propose milestone names and payout percentages before escrow can be funded.</p>
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
                : 'Submitting a proposal assigns this shipment to your carrier wallet for shipper review.'}
          </span>
        </Card>
      )}

      {proposalPending && (
        <ProposalReview
          milestones={shipment.milestones}
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
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                canVerify={isShipper}
                busy={busy}
                onVerify={verifyMilestone}
              />
            )}
            {tab === 'proof' && <ProofPanel milestones={shipment.milestones} />}
            {tab === 'payments' && <PaymentsPanel shipment={shipment} />}
          </div>
        </Card>
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
  milestones,
  proposedAmount,
  isShipper,
  account,
  busy,
  actionStage,
  onAccept,
  onReject,
}) {
  return (
    <Card className={styles.proposalCard}>
      <div className={styles.proposalHeader}>
        <div>
          <div className={styles.proposalKicker}>Carrier proposal</div>
          <h2>Review milestone payout plan</h2>
          <p>Accepting this plan locks {formatEth(proposedAmount)} in escrow.</p>
        </div>
        <Badge tone="warning">{milestones.length} milestones</Badge>
      </div>

      <div className={styles.proposalTimeline}>
        <div className={styles.proposalTrackLine} aria-hidden="true" />
        <ol className={styles.proposalSteps}>
          {milestones.map((milestone, index) => (
            <li key={`${milestone.name}-${index}`} className={styles.proposalStep}>
              <span className={styles.proposalIndex}>{index + 1}</span>
              <div className={styles.proposalStepBody}>
                <div className={styles.proposalStepHeader}>
                  <strong>{milestone.name}</strong>
                  <Badge tone="warning">Proposed</Badge>
                </div>
                <div className={styles.proposalStepMeta}>
                  <span>{milestone.payoutPercentage}% of payment</span>
                  <strong>
                    {formatEth(calculateProposedPayout(
                      proposedAmount,
                      milestone.payoutPercentage,
                      index,
                      milestones,
                    ))}
                  </strong>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.proposalFooter}>
        <span className={styles.proposalHint}>
          {!account
            ? 'Connect the shipper wallet to respond.'
            : isShipper
              ? 'Accepting activates this carrier plan and funds its milestone payouts.'
              : 'Waiting for the shipper to accept or reject this proposal.'}
        </span>
        {isShipper && (
          <div className={styles.proposalActions}>
            <Button variant="danger" onClick={onReject} disabled={busy}>
              {actionStage === 'rejecting' ? 'Rejecting...' : 'Reject proposal'}
            </Button>
            <Button onClick={onAccept} disabled={busy}>
              {actionStage === 'accepting' ? 'Confirming...' : 'Accept & fund escrow'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function TimelinePanel({ events, selectedIndex, onSelect, canVerify, busy, onVerify }) {
  if (!events.length) return <div className={styles.tabEmpty}>No timeline entries yet.</div>;
  const selectedEvent = events[selectedIndex] || events[0];

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
          <div className={styles.proofHeaderTitle}>Submitted proof references</div>
          <div className={styles.proofHeaderBody}>Proof references are loaded from the shipment milestones.</div>
        </div>
      </div>
      <div className={styles.proofList}>
        {withProof.map((milestone) => (
          <div key={milestone.index} className={styles.proofPlaceholder}>
            <strong>{milestone.name}</strong>
            <span className={styles.proofPlaceholderHint}>{milestone.proofUris.length} file reference(s)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsPanel({ shipment }) {
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
      <PaymentRow label="Remaining escrow" value={formatEth(shipment.remaining)} />
      <div className={styles.paymentNote}>
        Milestone payments are released by <code>verifyMilestone()</code> after the shipper approves submitted proof.
      </div>
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
  const [request, milestoneResult] = await Promise.all([
    deliveryEscrow.getRequest(requestId),
    deliveryEscrow.getMilestones(requestId),
  ]);

  const shipper = request.shipper ?? request[1];
  const rawCarrier = request.carrier ?? request[2];
  const carrier = isZeroAddress(rawCarrier) ? null : rawCarrier;
  const status = requestStatus(request.status ?? request[9]);
  const proposedAmount = BigInt(request.proposedAmount ?? request[11] ?? 0n);
  const escrow = BigInt(request.totalAmount ?? request[5] ?? 0n);
  const released = BigInt(request.releasedAmount ?? request[6] ?? 0n);
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
    remaining: escrow - released,
    milestones,
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
  if (message.includes('insufficient funds')) return 'The shipper wallet does not have enough ETH.';
  if (message.includes('caller is not shipper')) return 'Only the request shipper can perform this action.';
  if (message.includes('not awaiting approval')) return 'This proposal is no longer awaiting approval.';
  return message || 'The shipment transaction failed.';
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
