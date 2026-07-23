// src/pages/ProposeMilestones.jsx — CargoChain
// Full-page carrier form for proposing milestones.

import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineCheckBadge,
  HiOutlineCheckCircle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineInformationCircle,
  HiOutlineMapPin,
  HiOutlineCurrencyDollar,
  HiOutlineCalendarDays,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import {
  formatEth,
  formatDate,
  formatDaysLeft,
  requestStatus,
} from '../utils/format.js';
import styles from './ProposeMilestones.module.css';

let nextMilestoneKey = 1;
const createMilestone = (name = '', payoutPercentage = '') => ({
  id: `milestone-${nextMilestoneKey++}`,
  name,
  payoutPercentage,
});

const DEFAULT_MILESTONES = [
  createMilestone('Package Pickup', '30'),
  createMilestone('In Transit Hub', '40'),
  createMilestone('Final Delivery', '30'),
];

export function ProposeMilestones() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const { account, signer, provider, connect, busy: walletBusy } = useWallet();
  const { contracts, deployError } = useContracts();

  const [request, setRequest] = useState(null);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
  const [submissionStage, setSubmissionStage] = useState('idle');
  const [submissionResult, setSubmissionResult] = useState(null);
  const [ownProposal, setOwnProposal] = useState(null);
  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [draggedMilestoneIndex, setDraggedMilestoneIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Load request details to display context
  useEffect(() => {
    if (!idParam || !contracts?.deliveryEscrow) return;

    let cancelled = false;
    setLoadingRequest(true);
    setRequestError(null);

    contracts.deliveryEscrow.getRequest(BigInt(idParam))
      .then((req) => {
        if (cancelled) return;
        const rewardWei = BigInt(req.totalAmount ?? req[5] ?? 0n);
        const proposedAmountWei = BigInt(req.proposedAmount ?? req[11] ?? 0n);
        const deadline = Number(req.deadline ?? req[7] ?? 0n);
        setRequest({
          id: Number(req.requestId ?? req[0]),
          from: req.pickupLocation ?? req[3],
          to: req.deliveryLocation ?? req[4],
          rewardWei,
          proposedAmountWei,
          shipper: req.shipper ?? req[1],
          deadlineMs: deadline * 1000,
          status: requestStatus(req.status ?? req[9]),
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setRequest(null);
          setRequestError(e.shortMessage || e.reason || e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRequest(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, idParam, proposalRefreshKey]);

  useEffect(() => {
    if (!account || !request || request.status !== 'Open' || !contracts?.deliveryEscrow) {
      setOwnProposal(null);
      return;
    }

    let cancelled = false;
    contracts.deliveryEscrow.getProposals(BigInt(idParam))
      .then(async (proposals) => {
        const proposalId = Array.from(proposals).findIndex((proposal) => (
          Number(proposal.status ?? proposal[1]) === 0
          && (proposal.carrier ?? proposal[0]).toLowerCase() === account.toLowerCase()
        ));
        if (proposalId < 0 || cancelled) {
          if (!cancelled) setOwnProposal(null);
          return;
        }

        const plan = await contracts.deliveryEscrow.getProposalMilestones(BigInt(idParam), proposalId);
        if (!cancelled) {
          setOwnProposal({
            id: proposalId,
            milestones: Array.from(plan).map((milestone) => ({
              name: milestone.name ?? milestone[0],
              payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
            })),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setOwnProposal(null);
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts, idParam, request, proposalRefreshKey]);

  const addMilestone = () => setMilestones((arr) => [...arr, createMilestone()]);
  const updateMilestone = (i, k, v) => setMilestones((arr) => arr.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));
  const removeMilestone = (i) => setMilestones((arr) => arr.filter((_, idx) => idx !== i));
  const reorderMilestone = (fromIndex, targetIndex, placement) => {
    if (fromIndex === targetIndex || targetIndex < 0 || targetIndex >= milestones.length) return;
    setMilestones((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      let insertionIndex = targetIndex + (placement === 'after' ? 1 : 0);
      if (fromIndex < insertionIndex) insertionIndex -= 1;
      next.splice(insertionIndex, 0, moved);
      return next;
    });
  };
  const startMilestoneDrag = (event, index) => {
    if (ownProposal) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDraggedMilestoneIndex(index);
  };
  const dragOverMilestone = (event, index) => {
    if (ownProposal || draggedMilestoneIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggedMilestoneIndex === index) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + (bounds.height / 2) ? 'before' : 'after';
    setDropTarget({ index, placement });
  };
  const dropMilestone = (event, index) => {
    event.preventDefault();
    const sourceIndex = draggedMilestoneIndex;
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + (bounds.height / 2) ? 'before' : 'after';
    if (Number.isInteger(sourceIndex)) reorderMilestone(sourceIndex, index, placement);
    setDraggedMilestoneIndex(null);
    setDropTarget(null);
  };

  const totalPercentage = useMemo(() => {
    return milestones.reduce((sum, m) => sum + (Number(m.payoutPercentage) || 0), 0);
  }, [milestones]);

  const isValid = useMemo(() => {
    return (
      milestones.length > 0 &&
      milestones.every((m) => {
        const percentage = Number(m.payoutPercentage);
        return m.name.trim() && Number.isInteger(percentage) && percentage > 0 && percentage <= 100;
      }) &&
      totalPercentage === 100
    );
  }, [milestones, totalPercentage]);

  const submitting = submissionStage !== 'idle';
  const isOwnRequest = Boolean(
    account && request && account.toLowerCase() === request.shipper.toLowerCase(),
  );
  const canSubmit = Boolean(
    request &&
    request.status === 'Open' &&
    !isOwnRequest &&
    isValid &&
    !loadingRequest &&
    !ownProposal &&
    !submissionResult &&
    !submitting &&
    !walletBusy,
  );

  const submit = async () => {
    if (submitting || walletBusy) return;

    if (!provider) {
      show('MetaMask is required to submit a proposal.', 'error');
      return;
    }
    if (!contracts?.deliveryEscrow) {
      show(deployError || 'DeliveryEscrow contract is not available.', 'error');
      return;
    }
    if (!request || loadingRequest) {
      show('Wait for the request details to finish loading.', 'error');
      return;
    }
    if (!isValid) {
      show('Use whole-number percentages from 1 to 100 that total exactly 100%.', 'error');
      return;
    }
    if (request.status !== 'Open') {
      show('This request is no longer open for proposals.', 'error');
      return;
    }

    setSubmissionStage(account ? 'signing' : 'connecting');
    try {
      if (!account) {
        await connect();
      }
      const activeSigner = signer || await provider.getSigner();
      const activeAccount = await activeSigner.getAddress();
      const latestRequest = await contracts.deliveryEscrow.getRequest(BigInt(idParam));
      const latestStatus = requestStatus(latestRequest.status ?? latestRequest[9]);
      const latestShipper = latestRequest.shipper ?? latestRequest[1];

      if (latestStatus !== 'Open') {
        throw new Error('This request already has a carrier proposal.');
      }
      if (activeAccount.toLowerCase() === latestShipper.toLowerCase()) {
        show('The shipper cannot propose milestones for their own request.', 'error');
        return;
      }

      const contractMilestones = milestones.map((m) => [
        m.name.trim(),
        BigInt(m.payoutPercentage),
      ]);

      const tx = await contracts.deliveryEscrow.connect(activeSigner).proposeMilestones(
        BigInt(idParam),
        contractMilestones,
      );

      setSubmissionStage('confirming');
      show('Proposal sent. Waiting for blockchain confirmation...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('The proposal transaction was not confirmed.');
      }

      show(`Proposal confirmed in block ${receipt.blockNumber}.`, 'success');
      setSubmissionResult({
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.hash,
      });
      setProposalRefreshKey((value) => value + 1);
    } catch (e) {
      show(formatProposalError(e), 'error');
    } finally {
      setSubmissionStage('idle');
    }
  };

  const goBack = () => navigate(`/requests/${idParam}`);

  const revokeProposal = async () => {
    if (revoking || !ownProposal || !provider || !contracts?.deliveryEscrow) return;

    if (!window.confirm('Revoke your current proposal? You can submit a revised plan after it is confirmed.')) {
      return;
    }

    setRevoking(true);
    try {
      const activeSigner = signer || await provider.getSigner();
      const tx = await contracts.deliveryEscrow.connect(activeSigner).revokeMilestoneProposal(
        BigInt(idParam),
      );
      show('Revoking proposal on-chain...', 'info');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Proposal revocation was not confirmed.');

      setOwnProposal(null);
      setSubmissionResult(null);
      setProposalRefreshKey((value) => value + 1);
      show(`Proposal revoked in block ${receipt.blockNumber}. You can now submit a new plan.`, 'success');
    } catch (e) {
      show(formatProposalError(e), 'error');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Propose Milestones"
        subtitle={`Request #${String(idParam || '').padStart(4, '0')}`}
      />

      {(deployError || requestError) && (
        <div className={styles.requestError} role="alert">
          {deployError || `Could not load this request: ${requestError}`}
        </div>
      )}

      {submissionResult && !ownProposal && (
        <Card className={styles.successPanel}>
          <span className={styles.successIcon}>
            <HiOutlineCheckCircle aria-hidden="true" />
          </span>
          <div className={styles.successContent}>
            <span className={styles.successKicker}>Proposal confirmed</span>
            <h2>Milestones submitted for shipper review</h2>
            <p>
              The proposal was recorded in block {submissionResult.blockNumber}.
              The shipper can now accept and fund the milestone plan.
            </p>
            <span className={styles.successHash} title={submissionResult.transactionHash}>
              {submissionResult.transactionHash}
            </span>
          </div>
          <div className={styles.successActions}>
            <Button variant="secondary" onClick={() => navigate('/')}>Marketplace</Button>
            <Button onClick={() => navigate(`/track/${idParam}`)}>View shipment status</Button>
          </div>
        </Card>
      )}

      <div className={styles.grid}>
        {/* Left Column: Form */}
        <div className={styles.leftCol}>
          <Card className={styles.formCard} padded={false}>
            <div className={styles.formHeader}>
              <HiOutlineCheckBadge className={styles.headerIcon} />
              <div>
                <h3>Propose Milestone Splits</h3>
                <p>Define intermediate milestones between the pickup and destination points.</p>
              </div>
            </div>

            <div className={styles.formBody}>
              <div className={styles.timelineContainer}>
                
                {/* Start Node: Pickup */}
                <div className={styles.timelineNodeStatic}>
                  <div className={styles.staticMarkerStart}>A</div>
                  <div className={styles.staticInfo}>
                    <span className={styles.staticLabel}>STARTING PICKUP POINT</span>
                    <strong className={styles.staticValue}>{request ? request.from : 'Loading location...'}</strong>
                  </div>
                </div>

                <div className={styles.timelineConnectorLine} />

                {/* Milestone Intermediate Inputs */}
                <div className={styles.timelineMilestones}>
                  {milestones.map((m, i) => {
                    const percentage = Number(m.payoutPercentage);
                    const payoutWei = request && Number.isInteger(percentage) && percentage > 0
                      ? (request.proposedAmountWei * BigInt(percentage)) / 100n
                      : 0n;
                    return (
                      <div
                        key={m.id}
                        className={styles.timelineRow}
                      >
                        
                        {/* Timeline Marker (Intermediate node) */}
                        <div className={styles.intermediateNode}>
                          <div className={styles.intermediateMarker}>{i + 1}</div>
                        </div>

                        {/* Input Fields block */}
                        <div
                          className={`${styles.inputCard} ${draggedMilestoneIndex === i ? styles.inputCardDragging : ''} ${dropTarget?.index === i && dropTarget.placement === 'before' ? styles.inputCardDropBefore : ''} ${dropTarget?.index === i && dropTarget.placement === 'after' ? styles.inputCardDropAfter : ''}`}
                          draggable={!ownProposal}
                          onDragStart={(event) => startMilestoneDrag(event, i)}
                          onDragOver={(event) => dragOverMilestone(event, i)}
                          onDrop={(event) => dropMilestone(event, i)}
                          onDragEnd={() => {
                            setDraggedMilestoneIndex(null);
                            setDropTarget(null);
                          }}
                        >
                          <div className={styles.fieldsGrid}>
                            {/* Column 1: Milestone Name */}
                            <div className={styles.field} style={{ flex: 3 }}>
                              <label className={styles.label}>Milestone Name</label>
                              <input
                                type="text"
                                className={styles.input}
                                value={m.name}
                                onChange={(e) => updateMilestone(i, 'name', e.target.value)}
                                disabled={Boolean(ownProposal)}
                                placeholder="e.g. Customs check / Delivery to Hub"
                              />
                            </div>

                            {/* Column 2: Payout Percentage & calculated ETH */}
                            <div className={styles.field} style={{ flex: 1.5, minWidth: '110px' }}>
                              <label className={styles.label}>Payout Split</label>
                              <div className={styles.percentWrap}>
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  step="1"
                                  inputMode="numeric"
                                  className={styles.input}
                                  value={m.payoutPercentage}
                                  onChange={(e) => updateMilestone(i, 'payoutPercentage', e.target.value)}
                                  disabled={Boolean(ownProposal)}
                                  placeholder="0"
                                />
                                <span className={styles.percentUnit}>%</span>
                              </div>
                              <span className={styles.calculatedEth}>
                                {payoutWei > 0n ? formatEth(payoutWei) : '0.00 ETH'}
                              </span>
                            </div>

                            {/* Delete button */}
                            <div className={styles.removeBtnCol}>
                              <button
                                type="button"
                                className={styles.removeBtn}
                                onClick={() => removeMilestone(i)}
                                disabled={milestones.length === 1 || Boolean(ownProposal)}
                                title="Remove milestone step"
                              >
                                <HiOutlineTrash className={styles.trashIcon} />
                              </button>
                            </div>

                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>

                <div className={styles.timelineConnectorLine} />

                {/* End Node: Destination */}
                <div className={styles.timelineNodeStatic}>
                  <div className={styles.staticMarkerEnd}>B</div>
                  <div className={styles.staticInfo}>
                    <span className={styles.staticLabel}>FINAL DESTINATION POINT</span>
                    <strong className={styles.staticValue}>{request ? request.to : 'Loading location...'}</strong>
                  </div>
                </div>

              </div>

              {/* Add Milestone button */}
              <button type="button" className={styles.addBtn} onClick={addMilestone} disabled={Boolean(ownProposal)}>
                <HiOutlinePlus className={styles.addIcon} /> Add Intermediate Milestone
              </button>
            </div>
          </Card>
        </div>

        {/* Right Column: Request Info & Status Summary */}
        <div className={styles.rightCol}>
          {request && (
            <Card className={styles.infoCard}>
              <h3>Job Overview</h3>
              <div className={styles.infoRow}>
                <HiOutlineMapPin className={styles.infoIcon} />
                <div>
                  <div className={styles.infoLabel}>Route</div>
                  <strong className={styles.infoVal}>{request.from} → {request.to}</strong>
                </div>
              </div>
              <div className={styles.infoDivider} />
              <div className={styles.infoRow}>
                <HiOutlineCurrencyDollar className={styles.infoIcon} />
                <div>
                  <div className={styles.infoLabel}>Total Budget</div>
                  <strong className={styles.infoVal}>{formatEth(request.proposedAmountWei)}</strong>
                  <span className={styles.infoSub}>Funded after shipper approval</span>
                </div>
              </div>
              <div className={styles.infoDivider} />
              <div className={styles.infoRow}>
                <HiOutlineCalendarDays className={styles.infoIcon} />
                <div>
                  <div className={styles.infoLabel}>Deadline</div>
                  <strong className={styles.infoVal}>{formatDate(Math.floor(request.deadlineMs / 1000))}</strong>
                  <span className={styles.infoSub}>{formatDaysLeft(request.deadlineMs)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Allocation Checker Status */}
          <div className={`${styles.statusBox} ${isValid ? styles.statusSuccess : styles.statusError}`}>
            <HiOutlineInformationCircle className={styles.statusIcon} />
            <div className={styles.statusContent}>
              <h4>Total Split: {totalPercentage}%</h4>
              <p>
                {isValid
                  ? 'All payouts are allocated. The proposal is ready to submit.'
                  : 'Every milestone needs a name and a whole-number payout, with a total of exactly 100%.'}
              </p>
            </div>
          </div>

          {isOwnRequest && (
            <div className={styles.requestError} role="status">
              Switch to a carrier wallet to submit a proposal. A shipper cannot carry their own request.
            </div>
          )}

          {ownProposal && (
            <Card className={styles.activeProposalCard}>
              <span className={styles.activeProposalKicker}>Your active proposal</span>
              <h3>Awaiting shipper review</h3>
              <p>
                You have one active proposal on this request. Revoke it to submit a revised milestone plan.
              </p>
              <ol className={styles.activeProposalList}>
                {ownProposal.milestones.map((milestone, index) => (
                  <li key={`${milestone.name}-${index}`}>
                    <span>{milestone.name}</span>
                    <strong>{milestone.payoutPercentage}%</strong>
                  </li>
                ))}
              </ol>
              <Button variant="danger" onClick={revokeProposal} disabled={revoking || submitting}>
                {revoking ? 'Revoking proposal...' : 'Revoke proposal'}
              </Button>
            </Card>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={goBack} disabled={submitting} className={styles.actionBtn}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit} className={styles.actionBtn}>
              {submissionLabel(submissionStage)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function submissionLabel(stage) {
  if (stage === 'connecting') return 'Connecting wallet...';
  if (stage === 'signing') return 'Confirm in MetaMask...';
  if (stage === 'confirming') return 'Waiting for confirmation...';
  return 'Submit proposal';
}

function formatProposalError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Proposal cancelled in MetaMask.';
  }

  const message = error?.shortMessage || error?.reason || error?.message || '';
  if (message.includes('carrier already has active proposal')) {
    return 'You already have an active proposal. Revoke it before submitting a revised plan.';
  }
  if (message.includes('request is not open')) {
    return 'This request is no longer accepting proposals.';
  }
  if (message.includes('shipper cannot be carrier')) {
    return 'The shipper cannot propose milestones for their own request.';
  }
  if (message.includes('payout percentages must equal 100')) {
    return 'Milestone payout percentages must total exactly 100%.';
  }
  return message || 'Failed to submit the milestone proposal.';
}
