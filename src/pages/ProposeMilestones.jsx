// src/pages/ProposeMilestones.jsx — CargoChain
// Full-page carrier form for proposing milestones.

import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  HiOutlineFlag,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineInformationCircle,
  HiOutlineMapPin,
  HiOutlineCurrencyDollar,
  HiOutlineCalendarDays,
  HiOutlineUser,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { ChatButton } from '../components/chat/ChatButton.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import {
  formatWalletTransactionError,
  resolveWalletSigner,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { useWalletIdentities, walletIdentityLabel } from '../hooks/useWalletIdentities.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import {
  allocationSummary,
  proposalPresentationMode,
  proposalValidationMessage,
} from '../utils/proposalPresentation.js';
import {
  formatCargo,
  formatDate,
  formatDaysLeft,
  requestStatus,
} from '../utils/format.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
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
  const [searchParams] = useSearchParams();
  const resubmitProposalId = searchParams.get('resubmit');
  const editActiveIntent = searchParams.get('edit') === 'active';
  const { show } = useToast();
  const { account, signer, provider, connect, busy: walletBusy } = useWallet();
  const { contracts, deployError } = useContracts();
  const { requireRegistration } = useUserProfile();

  const [request, setRequest] = useState(null);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
  const [isDirty, setIsDirty] = useState(false);
  const [submissionStage, setSubmissionStage] = useState('idle');
  const [ownProposal, setOwnProposal] = useState(null);
  const [loadingOwnProposal, setLoadingOwnProposal] = useState(false);
  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [activeProposalRevoked, setActiveProposalRevoked] = useState(false);
  const [replacementCompleted, setReplacementCompleted] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [draggedMilestoneIndex, setDraggedMilestoneIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [resubmissionSource, setResubmissionSource] = useState(null);
  const { confirm: confirmAction, confirmation } = useConfirmDialog();
  const milestoneFieldRefs = useRef({});
  const milestoneCardRefs = useRef({});
  const keyboardDragSnapshotRef = useRef(null);
  const dragModeRef = useRef('pointer');
  const pendingFocusMilestoneIdRef = useRef(null);
  const [dragAnnouncement, setDragAnnouncement] = useState('');
  const walletIdentities = useWalletIdentities([request?.shipper], contracts?.userRegistry);
  const presentationMode = proposalPresentationMode({
    editActive: editActiveIntent,
    resubmitProposalId,
    ownProposal,
    replacementCompleted,
  });
  const isEditingActive = presentationMode === 'edit-active';
  const isEditableMode = ['create', 'edit-active', 'resubmit-rejected'].includes(presentationMode);
  const isSubmittedMode = presentationMode === 'submitted';

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
          carrier: req.carrier ?? req[2],
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
    if (!account || !request || request.status === 'Open') return;

    if (!isZeroAddress(request.carrier) && request.carrier.toLowerCase() === account.toLowerCase()) {
      navigate(`/track/${request.id}`, { replace: true });
      return;
    }

    navigate('/my-shipments', { replace: true });
  }, [account, navigate, request]);

  useEffect(() => {
    if (!account || !request || request.status !== 'Open' || !contracts?.deliveryEscrow) {
      setOwnProposal(null);
      setLoadingOwnProposal(false);
      return;
    }

    let cancelled = false;
    setLoadingOwnProposal(true);
    contracts.deliveryEscrow.getProposals(BigInt(idParam))
      .then(async (proposals) => {
        const proposalId = Array.from(proposals).findIndex((proposal) => (
          Number(proposal.status ?? proposal[1]) === 0
          && (proposal.carrier ?? proposal[0]).toLowerCase() === account.toLowerCase()
        ));
        if (proposalId < 0 || cancelled) {
          if (!cancelled) {
            setOwnProposal(null);
            setActiveProposalRevoked(false);
          }
          return;
        }

        const plan = await contracts.deliveryEscrow.getProposalMilestones(BigInt(idParam), proposalId);
        if (!cancelled) {
          const proposalMilestones = Array.from(plan).map((milestone) => ({
            name: milestone.name ?? milestone[0],
            payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
          }));
          setOwnProposal({
            id: proposalId,
            milestones: proposalMilestones,
          });
          setIsDirty(false);
          setMilestones(proposalMilestones.map((milestone) => createMilestone(
            milestone.name,
            String(milestone.payoutPercentage),
          )));
        }
      })
      .catch(() => {
        if (!cancelled) setOwnProposal(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingOwnProposal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts, idParam, request, proposalRefreshKey]);

  useEffect(() => {
    if (!resubmitProposalId || !account || !request || request.status !== 'Open' || !contracts?.deliveryEscrow) {
      return;
    }

    const proposalId = Number(resubmitProposalId);
    const sourceKey = `${idParam}:${proposalId}`;
    if (!Number.isInteger(proposalId) || proposalId < 0 || resubmissionSource?.key === sourceKey) return;

    let cancelled = false;
    contracts.deliveryEscrow.getProposals(BigInt(idParam))
      .then(async (proposals) => {
        const proposal = Array.from(proposals || [])[proposalId];
        const carrier = proposal?.carrier ?? proposal?.[0];
        const status = Number(proposal?.status ?? proposal?.[1]);
        if (!proposal || !carrier || carrier.toLowerCase() !== account.toLowerCase() || status !== 2) return;

        const plan = await contracts.deliveryEscrow.getProposalMilestones(BigInt(idParam), proposalId);
        if (cancelled) return;
        setMilestones(Array.from(plan || []).map((milestone) => createMilestone(
          milestone.name ?? milestone[0],
          String(Number(milestone.payoutPercentage ?? milestone[1])),
        )));
        setResubmissionSource({ key: sourceKey, id: proposalId });
      })
      .catch(() => {
        // A bad or stale resubmission link should leave the normal proposal form available.
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts, idParam, request, resubmitProposalId, resubmissionSource]);

  const insertMilestone = (index) => {
    if (!isEditableMode) return;
    const blankMilestone = createMilestone();
    setIsDirty(true);
    pendingFocusMilestoneIdRef.current = blankMilestone.id;
    setMilestones((arr) => {
      const insertionIndex = Math.max(0, Math.min(index, arr.length));
      return [
        ...arr.slice(0, insertionIndex),
        blankMilestone,
        ...arr.slice(insertionIndex),
      ];
    });
  };
  const updateMilestone = (i, k, v) => {
    setIsDirty(true);
    setMilestones((arr) => arr.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));
  };
  const removeMilestone = (i) => {
    setIsDirty(true);
    setMilestones((arr) => arr.filter((_, idx) => idx !== i));
  };
  const reorderMilestone = (fromIndex, targetIndex, placement) => {
    if (fromIndex === targetIndex || targetIndex < 0 || targetIndex >= milestones.length) return;
    setIsDirty(true);
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
    if (!isEditableMode) return;
    dragModeRef.current = 'pointer';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    const card = milestoneCardRefs.current[index];
    if (card && typeof event.dataTransfer.setDragImage === 'function') {
      event.dataTransfer.setDragImage(card, Math.min(32, card.offsetWidth / 2), 24);
    }
    setDraggedMilestoneIndex(index);
    setDragAnnouncement(`Grabbed milestone ${index + 1}. Drag before or after another checkpoint.`);
  };
  const dragOverMilestone = (event, index) => {
    if (!isEditableMode || dragModeRef.current !== 'pointer' || draggedMilestoneIndex === null) return;
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
    if (!isEditableMode) return;
    event.preventDefault();
    const sourceIndex = draggedMilestoneIndex;
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + (bounds.height / 2) ? 'before' : 'after';
    if (Number.isInteger(sourceIndex)) {
      reorderMilestone(sourceIndex, index, placement);
      const targetLabel = placement === 'before' ? `before milestone ${index + 1}` : `after milestone ${index + 1}`;
      setDragAnnouncement(`Milestone moved ${targetLabel}.`);
    }
    setDraggedMilestoneIndex(null);
    setDropTarget(null);
  };
  const handleMilestoneKeyDown = (event, index) => {
    if (!isEditableMode) return;
    const isGrabKey = event.key === 'Enter' || event.key === ' ';
    if (isGrabKey) {
      event.preventDefault();
      if (draggedMilestoneIndex === null) {
        dragModeRef.current = 'keyboard';
        keyboardDragSnapshotRef.current = { milestones: [...milestones], isDirty };
        setDraggedMilestoneIndex(index);
        setDragAnnouncement(`Grabbed milestone ${index + 1}. Use Arrow Up or Arrow Down to move it, then press Space to drop.`);
      } else if (dragModeRef.current === 'keyboard') {
        setDragAnnouncement(`Dropped milestone ${index + 1}.`);
        setDraggedMilestoneIndex(null);
        keyboardDragSnapshotRef.current = null;
      }
      return;
    }
    if (draggedMilestoneIndex === null || dragModeRef.current !== 'keyboard') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const snapshot = keyboardDragSnapshotRef.current;
      if (snapshot) {
        setMilestones(snapshot.milestones);
        setIsDirty(snapshot.isDirty);
      }
      setDraggedMilestoneIndex(null);
      keyboardDragSnapshotRef.current = null;
      setDragAnnouncement('Reordering cancelled. The checkpoint order was restored.');
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= milestones.length) {
        setDragAnnouncement(direction < 0 ? 'Already at the first checkpoint.' : 'Already at the last checkpoint.');
        return;
      }
      reorderMilestone(index, targetIndex, direction < 0 ? 'before' : 'after');
      setDraggedMilestoneIndex(targetIndex);
      setDragAnnouncement(`Moved milestone ${targetIndex + 1}. Press Space to drop or keep using the arrow keys.`);
      window.requestAnimationFrame?.(() => {
        milestoneCardRefs.current[targetIndex]?.querySelector('button')?.focus();
      });
    }
  };

  useEffect(() => {
    const pendingMilestoneId = pendingFocusMilestoneIdRef.current;
    if (!pendingMilestoneId) return;

    const nameField = document.getElementById(`${pendingMilestoneId}-name`);
    if (!nameField) return;

    nameField.focus();
    pendingFocusMilestoneIdRef.current = null;
  }, [milestones]);

  const totalPercentage = useMemo(() => {
    return milestones.reduce((sum, m) => sum + (Number(m.payoutPercentage) || 0), 0);
  }, [milestones]);

  const allocation = useMemo(
    () => allocationSummary(totalPercentage, milestones),
    [milestones, totalPercentage],
  );
  const isValid = milestones.length > 0 && allocation.isValid;

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
    (presentationMode === 'edit-active'
      || presentationMode === 'resubmit-rejected'
      || (presentationMode === 'create' && !ownProposal)) &&
    !loadingOwnProposal &&
    (!editActiveIntent || Boolean(ownProposal)) &&
    !submitting &&
    !walletBusy &&
    Boolean(account),
  );

  const submit = async () => {
    if (submitting || walletBusy) return;

    if (!account) {
      show('Connect MetaMask before submitting a proposal.', 'warning');
      return;
    }

    if (!provider) {
      show('MetaMask is required to submit a proposal.', 'error');
      return;
    }
    if (!contracts?.deliveryEscrow) {
      show(deployError || 'CargoChain is unavailable on the current network.', 'error');
      return;
    }
    if (!request || loadingRequest) {
      show('Wait for the request details to finish loading.', 'error');
      return;
    }
    if (!isValid) {
      show(
        proposalValidationMessage(allocation) || 'Allocate whole-number percentages that total exactly 100%.',
        'error',
      );
      if (allocation.firstInvalidIndex >= 0 && allocation.firstInvalidField) {
        milestoneFieldRefs.current[
          `${allocation.firstInvalidIndex}-${allocation.firstInvalidField}`
        ]?.focus();
      }
      return;
    }
    if (request.status !== 'Open') {
      show('This request is no longer open for proposals.', 'error');
      return;
    }

    const replacingActiveProposal = presentationMode === 'edit-active';
    setSubmissionStage(replacingActiveProposal && !activeProposalRevoked ? 'revoking' : 'signing');
    let transactionToast;
    let revocationConfirmed = activeProposalRevoked;
    try {
      const activeSigner = await resolveWalletSigner(signer, connect);
      const activeAccount = await activeSigner.getAddress();
      const latestRequest = await contracts.deliveryEscrow.getRequest(BigInt(idParam));
      const latestStatus = requestStatus(latestRequest.status ?? latestRequest[9]);
      const latestShipper = latestRequest.shipper ?? latestRequest[1];

      if (latestStatus !== 'Open') {
        throw new Error('This request is no longer open for proposals.');
      }
      if (activeAccount.toLowerCase() === latestShipper.toLowerCase()) {
        show('The shipper cannot propose milestones for their own request.', 'error');
        return;
      }

      const contractMilestones = milestones.map((m) => [
        m.name.trim(),
        BigInt(m.payoutPercentage),
      ]);

      if (!await requireRegistration(
        'Register your CargoChain profile to submit a milestone proposal.',
        activeAccount,
      )) return;

      if (replacingActiveProposal && !revocationConfirmed) {
        transactionToast = startTransactionToast({
          wallet: 'Confirm 1 of 2: revoke the current proposal in MetaMask…',
          submitted: 'Revoking the current proposal…',
          success: 'Current proposal revoked. Awaiting revised proposal confirmation…',
        });
        const revokeTx = await sendWalletContractTransaction({
          contract: contracts.deliveryEscrow,
          method: 'revokeMilestoneProposal',
          args: [BigInt(idParam)],
          signer: activeSigner,
          provider,
        });
        transactionToast.submitted();
        const revokeReceipt = await revokeTx.wait();
        if (!revokeReceipt || revokeReceipt.status !== 1) {
          throw new Error('The current proposal revocation was not confirmed.');
        }
        revocationConfirmed = true;
        setActiveProposalRevoked(true);
        transactionToast.wallet('Confirm 2 of 2: submit the revised proposal in MetaMask…');
      } else {
        transactionToast = startTransactionToast({
          wallet: replacingActiveProposal
            ? 'Confirm 2 of 2: submit the revised proposal in MetaMask…'
            : 'Confirm the milestone proposal in MetaMask…',
          submitted: replacingActiveProposal ? 'Submitting revised milestone proposal…' : 'Submitting milestone proposal…',
          success: replacingActiveProposal ? 'Revised milestone proposal submitted.' : 'Milestone proposal submitted.',
        });
      }

      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'proposeMilestones',
        args: [BigInt(idParam), contractMilestones],
        signer: activeSigner,
        provider,
      });

      setSubmissionStage(replacingActiveProposal ? 'submitting-replacement' : 'confirming');
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('The proposal transaction was not confirmed.');
      }

      transactionToast.success();
      setReplacementError('');
      setActiveProposalRevoked(false);
      if (replacingActiveProposal) {
        setReplacementCompleted(true);
        setIsDirty(false);
        navigate(`/shipments/${idParam}/propose`, { replace: true });
      }
      setProposalRefreshKey((value) => value + 1);
    } catch (e) {
      const message = formatProposalError(e);
      if (replacingActiveProposal) {
        setActiveProposalRevoked(revocationConfirmed);
        setReplacementError(revocationConfirmed
          ? 'The current proposal was revoked, but the revised proposal was not submitted. Your edited draft is preserved; retry the second confirmation when ready.'
          : 'The current proposal was not revoked. Your edited draft is preserved; retry when ready.');
      }
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setSubmissionStage('idle');
    }
  };

  const goBack = async () => {
    if (isDirty && isEditableMode) {
      const discard = await confirmAction({
        title: isEditingActive ? 'Cancel proposal edit?' : 'Discard proposal changes?',
        message: isEditingActive
          ? 'Your current on-chain proposal will stay active. Only this local draft will be discarded.'
          : 'Your milestone names and payout changes will be lost.',
        confirmLabel: isEditingActive ? 'Cancel editing' : 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!discard) return;
    }
    navigate('/my-shipments');
  };

  const revokeProposal = async () => {
    if (revoking || !ownProposal || !isSubmittedMode || !provider || !contracts?.deliveryEscrow) return;

    if (!account) {
      show('Connect MetaMask before revoking a proposal.', 'warning');
      return;
    }

    if (!await confirmAction({
      title: 'Revoke this proposal?',
      message: 'The submitted proposal will remain in the on-chain history as revoked. You can submit a revised plan after the transaction is confirmed.',
      confirmLabel: 'Revoke proposal',
      tone: 'danger',
    })) {
      return;
    }

    setRevoking(true);
    let transactionToast;
    try {
      const activeSigner = await resolveWalletSigner(signer, connect);
      const activeSignerAddress = await activeSigner.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to revoke a milestone proposal.',
        activeSignerAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: 'Confirm proposal revocation in MetaMask…',
        submitted: 'Revoking milestone proposal…',
        success: 'Milestone proposal revoked.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'revokeMilestoneProposal',
        args: [BigInt(idParam)],
        signer: activeSigner,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Proposal revocation was not confirmed.');

      setOwnProposal(null);
      setProposalRefreshKey((value) => value + 1);
      transactionToast.success();
    } catch (e) {
      const message = formatProposalError(e);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Propose milestone plan"
        subtitle={`Request #${String(idParam || '').padStart(4, '0')}`}
      />

      {(deployError || requestError) && (
        <div className={styles.requestError} role="alert">
          {deployError || `Could not load this request: ${requestError}`}
        </div>
      )}

      {resubmissionSource && (
        <Card className={styles.resubmitPanel}>
          <HiOutlineInformationCircle className={styles.resubmitIcon} aria-hidden="true" />
          <div>
            <strong>Resubmitting rejected proposal #{resubmissionSource.id + 1}</strong>
            <p>Your original plan stays recorded on-chain. Update this copied plan, then submit it as a new proposal.</p>
          </div>
        </Card>
      )}

      {isEditingActive && (
        <Card className={styles.editingPanel} role="status" aria-live="polite">
          <div className={styles.editingPanelCopy}>
            <div className={styles.activeProposalTitleRow}>
              <strong>Editing submitted proposal</strong>
              <span className={styles.editingStatus}>Two confirmations required</span>
            </div>
            <p>
              Save a revised plan to revoke the active proposal first, then submit the edited checkpoints as a new proposal.
            </p>
            {replacementError && (
              <p className={styles.replacementError}>{replacementError}</p>
            )}
          </div>
          <div className={styles.editingPanelActions}>
            <Button variant="softNeutral" size="sm" onClick={goBack} disabled={submitting}>
              Cancel editing
            </Button>
            {replacementError && (
              <Button variant="softPrimary" size="sm" onClick={submit} disabled={!canSubmit}>
                Retry submission
              </Button>
            )}
          </div>
        </Card>
      )}

      {isSubmittedMode && ownProposal && (
        <Card className={styles.activeProposalHeader}>
          <div className={styles.activeProposalCopy}>
            <div className={styles.activeProposalTitleRow}>
              <h2>Proposal submitted</h2>
              <span className={styles.activeProposalStatus}>Awaiting shipper review</span>
            </div>
          </div>
          <div className={styles.activeProposalActions}>
            <Button variant="softNeutral" onClick={() => navigate('/')} className={styles.touchAction}>
              Marketplace
            </Button>
            <ChatButton
              requestId={idParam}
              label="Chat with Shipper"
              variant="primary"
              size="sm"
            />
            <Button
              variant="softDanger"
              size="sm"
              onClick={revokeProposal}
              disabled={revoking || submitting}
              className={styles.revokeAction}
            >
              {revoking ? 'Revoking…' : 'Revoke proposal'}
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.grid}>
        {/* Left Column: Form */}
        <div className={styles.leftCol}>
          <Card className={styles.formCard} padded={false}>
            <div className={styles.formHeader}>
              <HiOutlineFlag className={styles.headerIcon} aria-hidden="true" />
              <div className={styles.formHeaderContent}>
                <h3>Milestone payout plan</h3>
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

                <TimelineConnector
                  editable={isEditableMode}
                  label={milestones.length > 0 ? 'Add checkpoint before milestone 1' : 'Add checkpoint'}
                  onAdd={() => insertMilestone(0)}
                  disabled={milestones.length >= 10}
                />

                {/* Milestone Intermediate Inputs */}
                <div className={styles.timelineMilestones}>
                  {milestones.map((m, i) => {
                    const percentage = Number(m.payoutPercentage);
                    const payoutWei = request && Number.isInteger(percentage) && percentage > 0
                      ? (request.proposedAmountWei * BigInt(percentage)) / 100n
                      : 0n;
                    return (
                      <Fragment key={m.id}>
                        <div className={styles.timelineRow}>
                        
                        {/* Input Fields block */}
                        <div
                          ref={(node) => {
                            milestoneCardRefs.current[i] = node;
                          }}
                          className={`${styles.inputCard} ${draggedMilestoneIndex === i ? styles.inputCardDragging : ''} ${dropTarget?.index === i && dropTarget.placement === 'before' ? styles.inputCardDropBefore : ''} ${dropTarget?.index === i && dropTarget.placement === 'after' ? styles.inputCardDropAfter : ''}`}
                          onDragOver={(event) => dragOverMilestone(event, i)}
                          onDrop={(event) => dropMilestone(event, i)}
                          onDragEnd={() => {
                            setDraggedMilestoneIndex(null);
                            setDropTarget(null);
                          }}
                        >
                          <div className={styles.fieldsGrid}>
                            <button
                              className={styles.dragHandle}
                              type="button"
                              draggable={isEditableMode}
                              onDragStart={(event) => startMilestoneDrag(event, i)}
                              onKeyDown={(event) => handleMilestoneKeyDown(event, i)}
                              title={isEditableMode ? 'Drag to reorder milestone' : undefined}
                              aria-label={isEditableMode ? `Reorder milestone ${i + 1}` : undefined}
                              aria-grabbed={isEditableMode && draggedMilestoneIndex === i ? 'true' : undefined}
                              disabled={!isEditableMode}
                            >
                              <span aria-hidden="true">⋮⋮</span>
                            </button>
                            {/* Column 1: Milestone Name */}
                            <div className={styles.field}>
                              <label className={styles.label} htmlFor={`${m.id}-name`}>Milestone Name</label>
                              <input
                                type="text"
                                className={styles.input}
                                id={`${m.id}-name`}
                                value={m.name}
                                onChange={(e) => updateMilestone(i, 'name', e.target.value)}
                                ref={(node) => {
                                  milestoneFieldRefs.current[`${i}-name`] = node;
                                }}
                                disabled={!isEditableMode}
                                aria-invalid={allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'name'}
                                aria-describedby={allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'name' ? `${m.id}-name-error` : undefined}
                                placeholder="e.g. Customs check / Delivery to Hub"
                              />
                              {allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'name' && (
                                <span id={`${m.id}-name-error`} className={styles.fieldError} role="alert">{proposalValidationMessage(allocation)}</span>
                              )}
                            </div>

                            {/* Column 2: Payout Percentage and calculated CARGO */}
                            <div className={styles.field}>
                              <label className={styles.label} htmlFor={`${m.id}-payoutPercentage`}>Payout</label>
                              <div className={styles.percentWrap}>
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  step="1"
                                  inputMode="numeric"
                                  className={styles.input}
                                  id={`${m.id}-payoutPercentage`}
                                  value={m.payoutPercentage}
                                  onChange={(e) => updateMilestone(i, 'payoutPercentage', e.target.value)}
                                  ref={(node) => {
                                    milestoneFieldRefs.current[`${i}-payoutPercentage`] = node;
                                  }}
                                  disabled={!isEditableMode}
                                  aria-invalid={allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'payoutPercentage'}
                                  aria-describedby={allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'payoutPercentage' ? `${m.id}-payout-error` : undefined}
                                  placeholder="0"
                                />
                                <span className={styles.percentUnit}>%</span>
                              </div>
                              <span className={styles.calculatedEth}>
                                {payoutWei > 0n ? formatCargo(payoutWei) : '0.00 C.'}
                              </span>
                              {allocation.firstInvalidIndex === i && allocation.firstInvalidField === 'payoutPercentage' && (
                                <span id={`${m.id}-payout-error`} className={styles.fieldError} role="alert">{proposalValidationMessage(allocation)}</span>
                              )}
                            </div>

                            {/* Delete button */}
                            <div className={styles.removeBtnCol}>
                              <button
                                type="button"
                                className={styles.removeBtn}
                                onClick={() => removeMilestone(i)}
                                disabled={milestones.length === 1 || !isEditableMode}
                                title="Remove milestone step"
                                aria-label={`Remove milestone ${i + 1}`}
                              >
                                <HiOutlineTrash className={styles.trashIcon} />
                              </button>
                            </div>

                          </div>
                        </div>

                        </div>
                        {i < milestones.length - 1 && (
                          <TimelineConnector editable={isEditableMode} label={`Add checkpoint after milestone ${i + 1}`} onAdd={() => insertMilestone(i + 1)} disabled={milestones.length >= 10} />
                        )}
                      </Fragment>
                    );
                  })}
                </div>

                <TimelineConnector
                  editable={isEditableMode}
                  label={milestones.length > 0 ? `Add checkpoint after milestone ${milestones.length}` : 'Add checkpoint'}
                  onAdd={() => insertMilestone(milestones.length)}
                  disabled={milestones.length >= 10}
                />

                {/* End Node: Destination */}
                <div className={styles.timelineNodeStatic}>
                  <div className={styles.staticMarkerEnd}>B</div>
                  <div className={styles.staticInfo}>
                    <span className={styles.staticLabel}>FINAL DESTINATION POINT</span>
                    <strong className={styles.staticValue}>{request ? request.to : 'Loading location...'}</strong>
                  </div>
                </div>

              </div>

              <div className={styles.checkpointListFooter}>
                <span className={styles.checkpointLimit}>{milestones.length} / 10 checkpoints{milestones.length >= 10 ? ' · Maximum reached' : ''}</span>
                <div
                  className={`${styles.allocationSummary} ${styles[`allocation_${allocation.tone}`]}`}
                  aria-live="polite"
                >
                  {allocation.label}
                </div>
              </div>
              <span className="visually-hidden" role="status" aria-live="polite">{dragAnnouncement}</span>
            </div>
          </Card>
        </div>

        {/* Right Column: Request Info & Status Summary */}
        <div className={styles.rightCol}>
          {request && (
            <Card className={styles.infoCard}>
              <h3>Job Overview</h3>
              <div className={styles.infoRow}>
                <HiOutlineUser className={styles.infoIcon} />
                <div>
                  <div className={styles.infoLabel}>Shipper</div>
                  <strong className={styles.infoVal} title={request.shipper}>
                    {walletIdentityLabel(request.shipper, walletIdentities)}
                  </strong>
                </div>
              </div>
              <div className={styles.infoDivider} />
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
                  <div className={styles.infoLabel}>Planned budget</div>
                  <strong className={styles.infoVal}>{formatCargo(request.proposedAmountWei)}</strong>
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

          {isOwnRequest && (
            <div className={styles.requestError} role="status">
              Switch to a carrier wallet to submit a proposal. A shipper cannot carry their own request.
            </div>
          )}

          {!isOwnRequest && !ownProposal && !account && (
            <div className={styles.requestError} role="status">
              Connect MetaMask on {CARGO_NETWORK_CONFIG.chainName} before submitting.
            </div>
          )}

          {isEditableMode && (
            <div className={styles.actions}>
              <Button variant="softNeutral" onClick={goBack} disabled={submitting} className={styles.actionBtn}>
                {isEditingActive ? 'Cancel editing' : 'Cancel'}
              </Button>
              <Button variant="softPrimary" onClick={submit} disabled={!canSubmit} className={styles.actionBtn}>
                {submissionLabel(submissionStage, account, isEditingActive, Boolean(replacementError))}
              </Button>
            </div>
          )}
        </div>
      </div>
      {confirmation && <ConfirmDialog {...confirmation} />}
    </div>
  );
}

function TimelineConnector({ editable, label, onAdd, disabled = false }) {
  return (
    <div className={`${styles.timelineConnector} ${editable ? styles.timelineConnectorEditable : ''}`}>
      {editable ? (
        <>
          <span className={`${styles.timelineConnectorLine} ${styles.timelineConnectorLineBefore}`} aria-hidden="true" />
          <button type="button" className={styles.timelineConnectorAdd} aria-label={label} title={disabled ? 'Maximum 10 checkpoints per proposal' : label} onClick={(event) => { event.stopPropagation(); onAdd(); }} disabled={disabled}>
            <span className={styles.timelineConnectorVisual} aria-hidden="true"><HiOutlinePlus /></span>
            <span className={styles.timelineConnectorLabel} aria-hidden="true">{disabled ? 'Maximum reached' : 'Add checkpoint'}</span>
          </button>
          <span className={`${styles.timelineConnectorLine} ${styles.timelineConnectorLineAfter}`} aria-hidden="true" />
        </>
      ) : <span className={styles.timelineConnectorLine} aria-hidden="true" />}
    </div>
  );
}

function submissionLabel(stage, account, isEditingActive = false, hasReplacementError = false) {
  if (stage === 'connecting') return 'Connecting wallet...';
  if (stage === 'revoking') return 'Confirm 1 of 2…';
  if (stage === 'signing') return 'Confirm in MetaMask...';
  if (stage === 'submitting-replacement') return 'Confirm 2 of 2…';
  if (stage === 'confirming') return 'Waiting for confirmation...';
  if (isEditingActive) return hasReplacementError ? 'Retry submission' : 'Save revised proposal';
  return account ? 'Submit proposal' : 'Connect and submit';
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
  return formatWalletTransactionError(error, message || 'Failed to submit the milestone proposal.');
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
