// src/pages/Track.jsx - Single shipment view backed by DeliveryEscrow.

import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatEther, parseEther } from 'ethers';
import { quoteCargoFunding, sendCargoFundingTransaction } from '../utils/cargoFunding.js';
import {
  HiOutlineArrowRight,
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineCheckBadge,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCreditCard,
  HiOutlineCube,
  HiOutlineExclamationCircle,
  HiOutlineEye,
  HiOutlineGift,
  HiOutlineLockClosed,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Badge } from '../components/Badge.jsx';
import { Button } from '../components/Button.jsx';
import { ChatButton } from '../components/chat/ChatButton.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { BrandedModal } from '../components/BrandedModal.jsx';
import { CarrierRatingPanel } from '../components/CarrierRatingPanel.jsx';
import { CarrierReputationSummary } from '../components/CarrierReputationSummary.jsx';
import { CarrierReputationModal } from '../components/CarrierReputationModal.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { useWalletIdentities, walletIdentityLabel } from '../hooks/useWalletIdentities.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import { useChatAuth } from '../context/ChatAuthContext.jsx';
import {
  formatDate,
  formatCargo,
  formatEth,
  formatRemarks,
  hasRemarks,
  milestoneStatusLabel,
  requestStatus,
} from '../utils/format.js';
import styles from './Track.module.css';
import { pinEncryptedProof, validateProofFile } from '../utils/upload.js';
import { loadEncryptedProof } from '../lib/proofApiClient.js';
import { getConfiguredGatewayBases, parseProofUri } from '../utils/proofUri.js';
import {
  formatWalletTransactionError,
  ensureTokenAllowance,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import { countWords, exceedsTextLimit } from '../utils/textLimits.js';
import { shipmentPresentation } from '../utils/shipmentPresentation.js';

const MILESTONE_STATUS = ['Proposed', 'PendingProof', 'Submitted', 'Verified', 'Rejected', 'Paid'];
const PROPOSAL_STATUS = ['Active', 'Revoked', 'Rejected', 'Accepted'];
const CANCELLATION_STATUS = ['Pending', 'Accepted', 'Rejected', 'Withdrawn', 'Expired'];
const AMENDMENT_STATUS = ['Pending', 'Accepted', 'Rejected', 'Withdrawn', 'Expired'];
const MAX_PROPOSAL_REJECTION_NOTE_BYTES = 500;
const MAX_CANCELLATION_NOTE_BYTES = 500;
const MAX_AMENDMENT_NOTE_BYTES = 500;
const MAX_PROPOSAL_REJECTION_NOTE_WORDS = 80;
const MAX_CANCELLATION_NOTE_WORDS = 80;
const MAX_AMENDMENT_NOTE_WORDS = 80;
const MIN_ADDITIONAL_FUNDING_WEI = parseEther('0.01');
const MIN_CANCELLATION_LEAD_SECONDS = 60 * 60;
const MIN_AMENDMENT_LEAD_SECONDS = 60 * 60;
const MIN_DEADLINE_CHANGE_SECONDS = 15 * 60;
const APPEND_MILESTONE_ID = (1n << 256n) - 1n;
const PROOF_PROGRESS_STAGES = new Set([
  'authorizing-proof',
  'uploading-proof',
  'confirming-proof',
  'waiting-proof-confirmation',
]);

export function Track() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { contracts, deployError } = useContracts();
  const { account, signer, provider, connect, walletChainId } = useWallet();
  const { show } = useToast();
  const { requireRegistration } = useUserProfile();
  const { authenticateChat, getChatAccessToken } = useChatAuth();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionStage, setActionStage] = useState('idle');
  const [refreshKey, setRefreshKey] = useState(0);
  const [proofViewerMilestone, setProofViewerMilestone] = useState(null);
  const [proofViewerLoadingMilestoneId, setProofViewerLoadingMilestoneId] = useState(null);
  const [focusedAgreement, setFocusedAgreement] = useState(null);
  const [reputationCarrier, setReputationCarrier] = useState(null);
  const [hasCarrierRating, setHasCarrierRating] = useState(false);
  const [cargoBalance, setCargoBalance] = useState(null);
  const [ethBalance, setEthBalance] = useState(null);
  const [cargoTopUp, setCargoTopUp] = useState(null);
  const [fundingReview, setFundingReview] = useState(null);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const { confirm: confirmAction, confirmation } = useConfirmDialog();
  const amendmentSectionRef = useRef(null);
  const cancellationSectionRef = useRef(null);
  const walletIdentities = useWalletIdentities([
    shipment?.shipper,
    shipment?.carrier,
    ...(shipment?.proposals || []).map((proposal) => proposal.carrier),
  ], contracts?.userRegistry);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const focusTarget = new URLSearchParams(location.search).get('focus');
    if (!shipment || !['amendment', 'cancellation'].includes(focusTarget)) return undefined;

    const section = focusTarget === 'amendment'
      ? amendmentSectionRef.current
      : cancellationSectionRef.current;
    if (!section) return undefined;

    const frame = window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setFocusedAgreement(focusTarget);
    });
    const clearFocus = window.setTimeout(() => setFocusedAgreement(null), 1_800);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clearFocus);
    };
  }, [location.search, shipment]);

  useEffect(() => {
    if (!idParam) {
      setShipment(null);
      setLoading(false);
      return;
    }

    if (!contracts?.deliveryEscrow || !contracts?.lifecycleManager) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const hasCurrentShipment = Boolean(
      shipment && String(shipment.id) === String(idParam),
    );
    setLoading(true);
    setError(null);

    loadShipment(contracts.deliveryEscrow, contracts.lifecycleManager, idParam)
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
          const message = loadError.shortMessage || loadError.reason || loadError.message;
          if (hasCurrentShipment) {
            setError(null);
            show(`Could not refresh the latest shipment status. ${message}`, 'error');
          } else {
            setShipment(null);
            setError(message);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, idParam, refreshKey]);

  const walletIsShipper = Boolean(
    account && shipment && account.toLowerCase() === shipment.shipper.toLowerCase(),
  );
  const walletIsCarrier = Boolean(
    account && shipment && shipment.carrier
      && account.toLowerCase() === shipment.carrier.toLowerCase(),
  );
  const isShipper = walletIsShipper;
  const isCarrier = walletIsCarrier;
  const hasOwnActiveProposal = Boolean(
    account
      && shipment?.proposals?.some((proposal) => (
        proposal.status === 'Active'
        && proposal.carrier?.toLowerCase() === account.toLowerCase()
      )),
  );
  const canProposeAsCarrier = Boolean(
    shipment?.status === 'Open' && !walletIsShipper,
  );
  const openProposal = () => {
    if (!account) {
      connect();
      return;
    }
    navigate(`/shipments/${shipment.id}/propose${hasOwnActiveProposal ? '?edit=active' : ''}`);
  };
  const milestonesApproved = !['Open', 'PendingApproval'].includes(shipment?.status);
  const canTipCarrier = Boolean(
    isShipper
      && shipment?.status === 'Completed'
      && shipment?.tipAmount === 0n,
  );

  useEffect(() => {
    let cancelled = false;

    if (!isShipper || shipment?.status !== 'Completed' || !contracts?.reputationRegistry) {
      setHasCarrierRating(false);
      return undefined;
    }

    contracts.reputationRegistry.hasRated(BigInt(shipment.id))
      .then((rated) => {
        if (!cancelled) setHasCarrierRating(Boolean(rated));
      })
      .catch(() => {
        if (!cancelled) setHasCarrierRating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts?.reputationRegistry, isShipper, refreshKey, shipment?.id, shipment?.status]);

  useEffect(() => {
    let cancelled = false;
    if (!account || !contracts?.cargoToken) {
      setCargoBalance(null);
      return undefined;
    }

    contracts.cargoToken.balanceOf(account)
      .then((balance) => {
        if (!cancelled) setCargoBalance(BigInt(balance));
      })
      .catch(() => {
        if (!cancelled) setCargoBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts?.cargoToken, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    if (!account || !provider) {
      setEthBalance(null);
      return undefined;
    }

    provider.getBalance(account)
      .then((balance) => {
        if (!cancelled) setEthBalance(BigInt(balance));
      })
      .catch(() => {
        if (!cancelled) setEthBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [account, provider, refreshKey]);

  const openCargoTopUp = (requiredAmount = 0n) => {
    const required = BigInt(requiredAmount || 0n);
    const shortfall = cargoBalance != null && required > cargoBalance
      ? required - cargoBalance
      : 0n;
    setCargoTopUp({ suggestedCargo: shortfall });
  };

  const completeCargoTopUp = async ({ ethWei }) => {
    if (!contracts?.cargoToken || !signer || !provider || !account) return false;
    if (ethBalance != null && ethWei >= ethBalance) {
      show('Keep enough ETH available to pay the transaction gas.', 'warning');
      return false;
    }

    setActionStage('topping-up-cargo');
    let transactionToast;
    try {
      transactionToast = startTransactionToast({
        wallet: 'Confirm the ETH top-up in MetaMask…',
        submitted: 'Converting ETH to C.…',
        success: 'C. wallet balance updated.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.cargoToken,
        method: 'deposit',
        args: [],
        overrides: { value: ethWei },
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('The C. top-up was not confirmed.');
      transactionToast.success();
      setCargoTopUp(null);
      setRefreshKey((current) => current + 1);
      return true;
    } catch (error) {
      const message = formatWalletTransactionError(error, 'C. top-up could not be completed.');
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const focusCarrierTip = () => {
    const tipInput = document.getElementById('carrier-tip-amount');
    if (!tipInput) return;
    tipInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => tipInput.focus(), 350);
  };
  const proposalHistory = (shipment?.proposals || []).filter(
    (proposal) => proposal.status !== 'Active',
  );
  const deadlinePassed = Boolean(
    shipment?.deadline && nowSeconds > shipment.deadline,
  );
  const canCancelRequest = Boolean(
    isShipper
      && ['Open', 'PendingApproval'].includes(shipment?.status),
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

  const getProofAuthToken = async () => {
    const existingToken = getChatAccessToken();
    if (existingToken) return existingToken;
    const authenticated = await authenticateChat();
    const token = authenticated?.token || getChatAccessToken();
    if (!token) throw new Error('Wallet sign-in did not return a CargoChain session.');
    return token;
  };

  const openProofViewer = async (milestone) => {
    const hasEncryptedProof = (milestone?.proofUris || []).some(
      (proofUri) => typeof proofUri === 'string' && proofUri.startsWith('ipfs://'),
    );
    if (!hasEncryptedProof) {
      setProofViewerMilestone({
        ...milestone,
        requestId: shipment?.id,
        viewerAccount: account?.toLowerCase() || null,
        accessToken: null,
      });
      return;
    }
    if (!account || (!isShipper && !isCarrier)) {
      show('Only the request shipper or assigned carrier can view encrypted proof.', 'error');
      return;
    }
    setProofViewerLoadingMilestoneId(milestone.milestoneId);
    try {
      const accessToken = await getProofAuthToken();
      setProofViewerMilestone({
        ...milestone,
        requestId: shipment?.id,
        viewerAccount: account.toLowerCase(),
        accessToken,
      });
    } catch (authError) {
      show(authError?.message || 'Wallet sign-in is required to view encrypted proof.', 'error');
    } finally {
      setProofViewerLoadingMilestoneId(null);
    }
  };

  useEffect(() => {
    if (!proofViewerMilestone?.viewerAccount) return;
    if (!account || proofViewerMilestone.viewerAccount !== account.toLowerCase()) {
      setProofViewerMilestone(null);
    }
  }, [account, walletChainId]);

  const acceptProposal = async (proposalId) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return;
    try {
      const sender = await signer.getAddress();
      const quote = await quoteCargoFunding({ contracts, method: 'approveAndFund', args: [BigInt(shipment.id), BigInt(proposalId)], sender });
      const eligibleProofCount = shipment.proposals?.[proposalId]?.milestones?.length || 0;
      setFundingReview({ proposalId, quote, eligibleProofCount, extraText: '' });
    } catch (actionError) { show(formatActionError(actionError), 'error'); }
  };

  const confirmProposalFunding = async () => {
    if (!fundingReview) return;
    let extra = 0n;
    try { extra = fundingReview.extraText.trim() ? parseEther(fundingReview.extraText.trim()) : 0n; } catch { show('Enter a valid extra reserve amount.', 'error'); return; }
    if (extra < 0n) { show('Extra reserve cannot be negative.', 'error'); return; }
    const proposalId = fundingReview.proposalId;
    const selectedAllowance = fundingReview.quote.operational + extra;
    setFundingReview(null);
    setActionStage('accepting');
    let transactionToast;

    try {
      const activeAddress = await signer.getAddress();
      const latest = await contracts.deliveryEscrow.getRequest(BigInt(shipment.id));
      const latestStatus = requestStatus(latest.status ?? latest[9]);
      const latestShipper = latest.shipper ?? latest[1];

      if (activeAddress.toLowerCase() !== latestShipper.toLowerCase()) {
        throw new Error('Only the request shipper can accept this proposal.');
      }
      if (latestStatus !== 'Open') {
        throw new Error('This request is no longer open for proposal selection.');
      }

      if (!await requireRegistration(
        'Register your CargoChain profile to approve a proposal and fund escrow.',
        activeAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: 'Confirm CARGO allowance and escrow funding in MetaMask…',
        submitted: 'Funding shipment…',
        success: 'Proposal accepted and escrow funded.',
      });
      const tx = await sendCargoFundingTransaction({
        contracts,
        method: 'approveAndFundWithAllowance',
        args: [BigInt(shipment.id), BigInt(proposalId), selectedAllowance],
        signer,
        provider,
      });
      if (!tx) { transactionToast.dismiss(); return; }
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Approval was not confirmed.');

      transactionToast.success();
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const rejectProposal = async (proposalId, rejectionNote = '') => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return false;
    setActionStage('rejecting');
    let transactionToast;

    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to reject a milestone proposal.',
        activeSignerAddress,
      )) return false;

      transactionToast = startTransactionToast({
        wallet: 'Confirm proposal rejection in MetaMask…',
        submitted: 'Rejecting carrier proposal…',
        success: 'Proposal rejected.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'rejectMilestoneProposal',
        args: [BigInt(shipment.id), BigInt(proposalId), rejectionNote.trim()],
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Rejection was not confirmed.');

      transactionToast.success();
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const sendCarrierTip = async (tipAmountEth) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) return false;

    let tipValue;
    try {
      tipValue = parseEther(tipAmountEth.trim());
    } catch {
      show('Enter a valid tip amount in CARGO.', 'error');
      return false;
    }
    if (tipValue <= 0n) {
      show('Tip amount must be greater than zero.', 'error');
      return false;
    }

    setActionStage('tipping');
    let transactionToast;
    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to tip the carrier.',
        activeSignerAddress,
      )) return false;

      const latest = await contracts.deliveryEscrow.getRequest(BigInt(shipment.id));
      if ((latest.shipper ?? latest[1]).toLowerCase() !== activeSignerAddress.toLowerCase()) {
        throw new Error('Only the request shipper can tip the carrier.');
      }
      if (requestStatus(latest.status ?? latest[9]) !== 'Completed') {
        throw new Error('The delivery must be completed before sending a tip.');
      }
      if (BigInt(await contracts.deliveryEscrow.tipAmounts(BigInt(shipment.id))) > 0n) {
        throw new Error('A tip has already been sent for this delivery.');
      }

      transactionToast = startTransactionToast({
        wallet: 'Confirm the CARGO allowance and completion tip in MetaMask…',
        submitted: 'Sending completion tip…',
        success: 'Completion tip sent.',
      });
      await ensureTokenAllowance({
        token: contracts.cargoToken,
        spender: contracts.deliveryEscrow.target,
        amount: tipValue,
        signer,
        provider,
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'tipCarrier',
        args: [BigInt(shipment.id), tipValue],
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Tip transaction was not confirmed.');

      transactionToast.success();
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const topUpOperationalAllowance = async (amountText) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow || !isShipper) return false;
    let amount;
    try {
      amount = parseEther(String(amountText).trim());
    } catch {
      show('Enter a valid CARGO reserve amount.', 'error');
      return false;
    }
    if (amount <= 0n) {
      show('Reserve amount must be greater than zero.', 'error');
      return false;
    }
    setActionStage('topping-up-allowance');
    let transactionToast;
    try {
      transactionToast = startTransactionToast({
        wallet: 'Confirm the CARGO reserve allowance in MetaMask…',
        submitted: 'Adding CARGO operational reserve…',
        success: 'Operational reserve updated.',
      });
      await ensureTokenAllowance({
        token: contracts.cargoToken,
        spender: contracts.deliveryEscrow.target,
        amount,
        signer,
        provider,
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'topUpOperationalAllowance',
        args: [BigInt(shipment.id), amount],
        signer,
        provider,
      });
      transactionToast.submitted();
      await tx.wait();
      transactionToast.success();
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const cancelRequest = async () => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) {
      show('Connect the shipper wallet first.', 'error');
      return;
    }

    if (!await confirmAction({
      title: 'Cancel this request?',
      message: 'This request has not been funded yet. Cancelling it will close the request and stop carriers from submitting proposals.',
      confirmLabel: 'Cancel request',
      tone: 'danger',
    })) return;

    setActionStage('cancelling');
    let transactionToast;
    try {
      const latest = await getLatestRequestForShipper(contracts.deliveryEscrow, signer, shipment.id);
      const latestStatus = requestStatus(latest.status ?? latest[9]);
      if (!['Open', 'PendingApproval'].includes(latestStatus)) {
        throw new Error('This request can no longer be cancelled from its current status.');
      }

      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to cancel a delivery request.',
        activeSignerAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: 'Confirm request cancellation in MetaMask…',
        submitted: 'Cancelling shipment request…',
        success: 'Request cancelled.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'cancelRequest',
        args: [BigInt(shipment.id)],
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Cancellation was not confirmed.');

      transactionToast.success();
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const sendCancellationTransaction = async ({
    stage,
    method,
    args,
    progressMessage,
    successMessage,
  }) => {
    if (busy || !shipment || !signer || !contracts?.lifecycleManager) {
      show('Connect a shipment participant wallet first.', 'error');
      return false;
    }

    setActionStage(stage);
    let transactionToast;
    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to manage a cancellation agreement.',
        activeSignerAddress,
      )) return false;

      const isParticipant = [shipment.shipper, shipment.carrier]
        .filter(Boolean)
        .some((wallet) => wallet.toLowerCase() === activeSignerAddress.toLowerCase());
      if (!isParticipant && method !== 'expireCancellation') {
        throw new Error('Only the shipment participants can manage this cancellation.');
      }

      transactionToast = startTransactionToast({
        wallet: `Confirm ${cancellationWalletCopy(method)} in MetaMask…`,
        submitted: progressMessage.replace(/\.\.\.$/, '…'),
        success: successMessage,
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.lifecycleManager,
        method,
        args,
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('The cancellation transaction was not confirmed.');
      }

      transactionToast.success();
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const requestMutualCancellation = async (note, responseDeadline) => {
    const trimmedNote = note.trim();
    const deadline = Math.floor(new Date(responseDeadline).getTime() / 1000);
    if (!trimmedNote) {
      show('Explain why you want to cancel the shipment.', 'error');
      return false;
    }
    if (exceedsTextLimit(
      trimmedNote,
      MAX_CANCELLATION_NOTE_WORDS,
      MAX_CANCELLATION_NOTE_BYTES,
    )) {
      show(`Cancellation note must be ${MAX_CANCELLATION_NOTE_WORDS} words or fewer.`, 'error');
      return false;
    }
    if (shipment.deadline - nowSeconds <= MIN_CANCELLATION_LEAD_SECONDS) {
      show('Cancellation requests close one hour before the shipment deadline.', 'error');
      return false;
    }
    if (!Number.isFinite(deadline) || deadline <= nowSeconds) {
      show('Choose a response deadline in the future.', 'error');
      return false;
    }
    if (deadline > shipment.deadline) {
      show('The response deadline cannot exceed the shipment deadline.', 'error');
      return false;
    }

    return sendCancellationTransaction({
      stage: 'requesting-cancellation',
      method: 'requestCancellation',
      args: [BigInt(shipment.id), trimmedNote, BigInt(deadline)],
      progressMessage: 'Recording the cancellation request on-chain...',
      successMessage: 'Cancellation request sent.',
    });
  };

  const acceptMutualCancellation = async (cancellationId) => {
    if (!await confirmAction({
      title: 'Accept shipment cancellation?',
      message: `${formatCargo(shipment.released)} already released remains with the carrier. ${formatCargo(shipment.remaining)} remaining escrow will return to the shipper.`,
      confirmLabel: 'Accept cancellation',
      tone: 'danger',
    })) return false;
    return sendCancellationTransaction({
      stage: 'accepting-cancellation',
      method: 'acceptCancellation',
      args: [BigInt(shipment.id), BigInt(cancellationId)],
      progressMessage: 'Finalizing the cancellation and remaining escrow refund...',
      successMessage: 'Cancellation accepted and remaining escrow settled.',
    });
  };

  const rejectMutualCancellation = (cancellationId, note) => {
    const trimmedNote = note.trim();
    if (exceedsTextLimit(
      trimmedNote,
      MAX_CANCELLATION_NOTE_WORDS,
      MAX_CANCELLATION_NOTE_BYTES,
    )) {
      show(`Rejection note must be ${MAX_CANCELLATION_NOTE_WORDS} words or fewer.`, 'error');
      return Promise.resolve(false);
    }
    return sendCancellationTransaction({
      stage: 'rejecting-cancellation',
      method: 'rejectCancellation',
      args: [BigInt(shipment.id), BigInt(cancellationId), trimmedNote],
      progressMessage: 'Recording the cancellation rejection...',
      successMessage: 'Cancellation rejected; the shipment continues.',
    });
  };

  const withdrawMutualCancellation = (cancellationId) => sendCancellationTransaction({
    stage: 'withdrawing-cancellation',
    method: 'withdrawCancellation',
    args: [BigInt(shipment.id), BigInt(cancellationId)],
    progressMessage: 'Withdrawing the cancellation request...',
    successMessage: 'Cancellation request withdrawn.',
  });

  const expireMutualCancellation = (cancellationId) => sendCancellationTransaction({
    stage: 'expiring-cancellation',
    method: 'expireCancellation',
    args: [BigInt(shipment.id), BigInt(cancellationId)],
    progressMessage: 'Closing the expired cancellation request...',
    successMessage: 'Cancellation request marked as expired.',
  });

  const confirmFundingQuote = (quote) => quote.total === 0n || confirmAction({
    title: 'Confirm CARGO funding',
    message: `Delivery compensation: ${formatCargo(quote.compensation)}. Operational reserve: ${formatCargo(quote.operational)}. Response allowance: ${formatCargo(quote.response)}. Total approval: ${formatCargo(quote.total)}. Unused reserves are refundable.`,
    confirmLabel: `Approve ${formatCargo(quote.total)}`,
  });

  const sendAmendmentTransaction = async ({
    stage,
    method,
    args,
    progressMessage,
    successMessage,
  }) => {
    if (busy || !shipment || !signer || !contracts?.lifecycleManager) {
      show('Connect a shipment participant wallet first.', 'error');
      return false;
    }

    setActionStage(stage);
    let transactionToast;
    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to manage shipment amendments.',
        activeSignerAddress,
      )) return false;

      const isParticipant = [shipment.shipper, shipment.carrier]
        .filter(Boolean)
        .some((wallet) => wallet.toLowerCase() === activeSignerAddress.toLowerCase());
      if (!isParticipant && method !== 'expireAmendment') {
        throw new Error('Only the shipment participants can manage this amendment.');
      }

      transactionToast = startTransactionToast({
        wallet: `Confirm ${amendmentWalletCopy(method)} in MetaMask…`,
        submitted: progressMessage.replace(/\.\.\.$/, '…'),
        success: successMessage,
      });
      const needsFundingQuote = ['requestAmendment', 'requestAmendmentWithGasPolicy', 'acceptAmendment'].includes(method);
      const tx = needsFundingQuote ? await sendCargoFundingTransaction({
        contracts, method, args, signer, provider, confirmQuote: confirmFundingQuote,
      }) : await sendWalletContractTransaction({
        contract: contracts.lifecycleManager,
        method,
        args,
        signer,
        provider,
      });
      if (!tx) { transactionToast.dismiss(); return false; }
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('The amendment transaction was not confirmed.');
      }

      const responseReimbursement = receiptEventAmount(receipt, contracts.lifecycleManager, 'AmendmentResponseReimbursed');
      const responseRefund = receiptEventAmount(receipt, contracts.lifecycleManager, 'AmendmentResponseAllowanceRefunded');
      transactionToast.success(`${successMessage}${responseReimbursement > 0n ? ` ${formatCargo(responseReimbursement)} response gas reimbursement paid.` : ''}${responseRefund > 0n ? ` ${formatCargo(responseRefund)} unused response allowance returned.` : ''}`);
      setRefreshKey((current) => current + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const submitAmendment = ({
    proposedDeadline,
    responseDeadline,
    note,
    existingFunding,
    newMilestones,
    additionalFunding,
    gasPolicy = 0,
    responseAllowance = 0n,
    directExtension,
  }) => {
    if (directExtension) {
      return sendAmendmentTransaction({
        stage: 'extending-deadline',
        method: 'extendShipmentDeadline',
        args: [BigInt(shipment.id), BigInt(proposedDeadline), note],
        progressMessage: 'Extending the shipment deadline on-chain...',
        successMessage: 'Shipment deadline extended.',
      });
    }

    return sendAmendmentTransaction({
      stage: 'requesting-amendment',
      method: gasPolicy === 1 ? 'requestAmendmentWithGasPolicy' : 'requestAmendment',
      args: [
        BigInt(shipment.id),
        BigInt(proposedDeadline),
        BigInt(responseDeadline),
        note,
        existingFunding,
        newMilestones,
        ...(gasPolicy === 1 ? [gasPolicy, responseAllowance] : []),
      ],
      progressMessage: isShipper && additionalFunding > 0n
        ? `Staging ${formatCargo(additionalFunding)} with the amendment request...`
        : 'Recording the amendment request on-chain...',
      successMessage: 'Amendment request sent.',
    });
  };

  const acceptAmendment = async (amendment) => {
    const shipperMustFund = amendment.requester.toLowerCase() !== shipment.shipper.toLowerCase();
    if (!await confirmAction({
      title: 'Accept this agreement change?',
      message: shipperMustFund && amendment.additionalFunding > 0n
        ? `${formatCargo(amendment.additionalFunding)} will be added to escrow and the proposed agreement will take effect.`
        : 'The proposed deadline and milestone funding plan will replace the current agreement terms.',
      confirmLabel: shipperMustFund && amendment.additionalFunding > 0n
        ? `Add ${formatCargo(amendment.additionalFunding)} and accept`
        : 'Accept agreement change',
    })) return false;
    return sendAmendmentTransaction({
      stage: 'accepting-amendment',
      method: 'acceptAmendment',
      args: [BigInt(shipment.id), BigInt(amendment.id)],
      progressMessage: 'Applying the agreed shipment amendment...',
      successMessage: 'Amendment accepted and applied.',
    });
  };

  const rejectAmendment = (amendmentId, note) => sendAmendmentTransaction({
    stage: 'rejecting-amendment',
    method: 'rejectAmendment',
    args: [BigInt(shipment.id), BigInt(amendmentId), note.trim()],
    progressMessage: 'Recording the amendment rejection...',
    successMessage: 'Amendment rejected; the existing agreement continues.',
  });

  const withdrawAmendment = (amendmentId) => sendAmendmentTransaction({
    stage: 'withdrawing-amendment',
    method: 'withdrawAmendment',
    args: [BigInt(shipment.id), BigInt(amendmentId)],
    progressMessage: 'Withdrawing the amendment request...',
    successMessage: 'Amendment request withdrawn.',
  });

  const expireAmendment = (amendmentId) => sendAmendmentTransaction({
    stage: 'expiring-amendment',
    method: 'expireAmendment',
    args: [BigInt(shipment.id), BigInt(amendmentId)],
    progressMessage: 'Closing the expired amendment request...',
    successMessage: 'Amendment request marked as expired.',
  });

  const claimRefund = async () => {
    if (busy || !shipment || !signer || !provider || !contracts?.deliveryEscrow) {
      show('Connect the shipper wallet first.', 'error');
      return;
    }

    if (!await confirmAction({
      title: 'Claim remaining escrow?',
      message: `${formatCargo(shipment.remaining)} will be returned to the shipper wallet. This refund cannot be reversed.`,
      confirmLabel: 'Claim refund',
      tone: 'danger',
    })) return;

    setActionStage('refunding');
    let transactionToast;
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

      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to claim the remaining escrow refund.',
        activeSignerAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: 'Confirm the escrow refund in MetaMask…',
        submitted: 'Refunding remaining escrow…',
        success: `${formatCargo(latestRemaining)} refunded to the shipper wallet.`,
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'refundRemaining',
        args: [BigInt(shipment.id)],
        signer,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Refund was not confirmed.');
      const escrowRefund = receiptEventAmount(receipt, contracts.deliveryEscrow, 'RefundIssued');
      const reserveRefund = receiptEventAmount(receipt, contracts.deliveryEscrow, 'OperationalAllowanceRefunded');
      transactionToast.success(`${formatCargo(escrowRefund || latestRemaining)} escrow refunded.${reserveRefund > 0n ? ` ${formatCargo(reserveRefund)} unused gas reserve returned.` : ''}`);
      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const submitMilestoneProof = async (milestoneId, file, remark = '') => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) {
      show('Connect the carrier wallet first', 'error');
      return false;
    }

    if (!isCarrier) {
      show('Only the assigned carrier can submit milestone proof.', 'error');
      return false;
    }

    if (!file) {
      show('No file selected for upload.', 'error');
      return false;
    }

    const fileError = proofFileError(file);
    if (fileError) {
      show(fileError, 'error');
      return false;
    }

    let transactionToast;

    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        'Register your CargoChain profile to submit milestone proof.',
        activeSignerAddress,
      )) return false;

      setActionStage('authorizing-proof');
      const accessToken = await getProofAuthToken();
      setActionStage('uploading-proof');
      const uploadResult = await pinEncryptedProof(file, {
        requestId: shipment.id,
        milestoneId,
        token: accessToken,
        onStage: (stage) => {
          if (stage === 'encrypting' || stage === 'uploading' || stage === 'finalizing') {
            setActionStage('uploading-proof');
          }
        },
      });
      const proofReference = uploadResult.proofUri;
      setActionStage('confirming-proof');
      transactionToast = startTransactionToast({
        wallet: 'Confirm proof submission in MetaMask…',
        submitted: 'Submitting photo proof…',
        success: 'Photo proof submitted.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'submitProof',
        args: [BigInt(shipment.id), BigInt(milestoneId), [proofReference], remark.trim()],
        signer,
        provider,
      });
      transactionToast.submitted();
      setActionStage('waiting-proof-confirmation');
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Proof submission was not confirmed.');
      const reimbursement = receiptEventAmount(receipt, contracts.deliveryEscrow, 'OperationalAllowanceReimbursed');
      transactionToast.success(reimbursement > 0n
        ? `Photo proof submitted. You received ${formatCargo(reimbursement)} gas reimbursement.`
        : 'Photo proof submitted. No gas reimbursement was paid for this submission.');
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };



  const verifyMilestone = async (milestoneId, approve, rejectionReason = '') => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow) {
        return;
    }

    if (!approve && !rejectionReason.trim()) {
      show('Add a reason so the carrier knows what to correct.', 'error');
      return;
    }

    const milestone = shipment.milestones.find((entry) => entry.milestoneId === milestoneId);
    const payout = milestone
      ? milestone.payoutAmount + milestone.additionalPayoutAmount
      : 0n;
    if (approve && !await confirmAction({
      title: 'Release checkpoint payment?',
      message: `Approving “${milestone?.name || 'this checkpoint'}” releases ${formatCargo(payout)} to ${walletIdentityLabel(shipment.carrier, walletIdentities)}.`,
      confirmLabel: `Approve & release ${formatCargo(payout)}`,
    })) return;

    setActionStage(
      approve ? 'verifying' : 'rejecting-proof',
    );
    let transactionToast;

    try {
      const activeSignerAddress = await signer.getAddress();
      if (!await requireRegistration(
        approve
          ? 'Register your CargoChain profile to approve milestone proof.'
          : 'Register your CargoChain profile to reject milestone proof.',
        activeSignerAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: approve
          ? 'Confirm proof approval in MetaMask…'
          : 'Confirm proof rejection in MetaMask…',
        submitted: approve ? 'Releasing checkpoint payment…' : 'Rejecting proof…',
        success: approve ? 'Proof approved and payment released.' : 'Proof rejected.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'verifyMilestone',
        args: [
          BigInt(shipment.id),
          BigInt(milestoneId),
          approve,
          approve
            ? ''
            : rejectionReason.trim(),
          BigInt(milestone.proofSubmissionNumber),
        ],
        signer,
        provider,
      });

      transactionToast.submitted();

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(
          'Verification was not confirmed.',
        );
      }

      transactionToast.success();

      setRefreshKey((value) => value + 1);
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setActionStage('idle');
    }
  };

  const withdrawMilestoneProof = async (milestoneId) => {
    if (busy || !shipment || !signer || !contracts?.deliveryEscrow || !isCarrier) return false;
    setActionStage('withdrawing-proof');
    let transactionToast;
    try {
      transactionToast = startTransactionToast({
        wallet: 'Confirm proof withdrawal in MetaMask…',
        submitted: 'Withdrawing photo proof…',
        success: 'Photo proof withdrawn.',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'withdrawProof',
        args: [BigInt(shipment.id), BigInt(milestoneId)],
        signer,
        provider,
      });
      transactionToast.submitted();
      await tx.wait();
      transactionToast.success();
      setRefreshKey((value) => value + 1);
      return true;
    } catch (actionError) {
      const message = formatActionError(actionError);
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
      return false;
    } finally {
      setActionStage('idle');
    }
  };

  const loadView = shipmentLoadView({ loading, shipment, error, deployError });

  if (loadView === 'loading') {
    return (
      <div className={styles.page}>
        <Topbar title={`Shipment #${String(idParam || '').padStart(4, '0')}`} />
        <Card><div className={styles.tabEmpty}>Loading shipment timeline…</div></Card>
      </div>
    );
  }

  if (loadView !== 'ready') {
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
  const detailPresentation = shipmentPresentation({
    request: shipment,
    proposals: shipment.proposals,
    milestones: shipment.milestones,
    escrow: shipment.escrow,
    released: shipment.released,
    refunded: shipment.refunded,
    remaining: shipment.remaining,
    tipAmount: shipment.tipAmount,
    account,
  });
  const visibleOpenProposals = visibleOpenProposalsFor(
    shipment.proposals,
    account,
    shipment.shipper,
  );
  const isCompletedPresentation = detailPresentation.currentStage === 'completed';
  const hasCompletionTip = (shipment.tipAmount ?? 0n) > 0n;
  const hasFinishedCompletionFollowUp = hasCarrierRating && hasCompletionTip;
  const showNextActionCard = !isCompletedPresentation
    || (isShipper && !hasFinishedCompletionFollowUp);
  let nextActionText = detailPresentation.requiredAction || detailPresentation.nextStep;
  if (isCompletedPresentation && isShipper) {
    if (hasCarrierRating) {
      nextActionText = 'You rated the carrier. Send an optional tip to thank the carrier.';
    } else if (hasCompletionTip) {
      nextActionText = 'You sent the carrier a tip. Share your experience with a rating.';
    } else {
      nextActionText = 'Share your experience with a rating, or send an optional tip to thank the carrier.';
    }
  }

  return (
    <div className={styles.page}>
      <Topbar
        title={`Shipment #${String(shipment.id).padStart(4, '0')}`}
        subtitle="Shipment detail"
      />

      <Card className={styles.detailCard}>
        <div className={styles.detailHeader}>
          <div className={styles.detailIntro}>
            <span className={styles.statusKicker}>Current state</span>
            <h2>{detailPresentation.currentStateTitle}</h2>
            <p className={styles.detailRoute}>{shipment.from} <span aria-hidden="true">→</span> {shipment.to}</p>
          </div>
          {shipment.carrier && (isShipper || isCarrier) && (
            <ChatButton
              requestId={shipment.id}
              carrierWallet={isShipper ? shipment.carrier : undefined}
              label={isShipper ? 'Chat with carrier' : 'Chat with shipper'}
              variant="secondary"
              size="sm"
            />
          )}
        </div>

        {showNextActionCard && (
          <div className={styles.nextActionCard} role="status">
            <span className={styles.nextActionIcon} aria-hidden="true"><HiOutlineArrowRight /></span>
            <div>
              <span className={styles.nextActionKicker}>Next action</span>
              <strong>{nextActionText}</strong>
            </div>
          </div>
        )}

        <ol className={styles.lifecycle} aria-label="Shipment lifecycle">
          {detailPresentation.lifecycle.map((stage, index) => (
            <li key={stage.id} className={`${styles.lifecycleStep} ${lifecycleStateClass(stage.state)}`}>
              <span aria-hidden="true">{stage.state === 'complete' ? <HiOutlineCheck /> : index + 1}</span>
              <strong>{stage.label}</strong>
            </li>
          ))}
        </ol>

        <dl className={styles.detailFacts}>
          <DetailFact label="Created" value={formatDate(shipment.createdAt)} />
          <DetailFact label="Deadline" value={formatDate(shipment.deadline)} />
          <DetailFact label={shipment.escrow > 0n ? 'Escrow' : 'Planned payment'} value={formatCargo(displayedValue)} />
          <DetailFact label="Shipper" value={walletIdentityLabel(shipment.shipper, walletIdentities)} title={shipment.shipper} />
          <DetailFact
            label="Carrier"
            value={shipment.carrier ? walletIdentityLabel(shipment.carrier, walletIdentities) : 'Awaiting proposal'}
            title={shipment.carrier || undefined}
          />
        </dl>

      </Card>

      {shipment.status === 'Open' ? (
        <>
          <ProposalReview
            requestId={idParam}
            proposals={visibleOpenProposals}
            proposedAmount={shipment.proposedAmount}
            isShipper={isShipper}
            account={account}
            busy={busy}
            actionStage={actionStage}
            onAccept={acceptProposal}
            onReject={rejectProposal}
            walletIdentities={walletIdentities}
            onOpenCarrierReputation={setReputationCarrier}
            canPropose={canProposeAsCarrier}
            onPropose={openProposal}
            presentation={detailPresentation}
            showHistory={false}
          />
          <Card className={styles.manifestCard}>
            {shipment.items.length > 0 ? (
              <ShipmentContents items={shipment.items} />
            ) : (
              <p className={styles.manifestEmpty}>No item manifest was recorded.</p>
            )}
          </Card>
        </>
      ) : (
        <>
          {milestonesApproved && (
            <Card padded={false} className={styles.checkpointsCard}>
              <div className={styles.checkpointsHeader}>
                <div>
                  <span className={styles.statusKicker}>Delivery workspace</span>
                  <h2>Checkpoints</h2>
                </div>
                <div className={styles.checkpointPaymentSummary} aria-label="Escrow summary">
                  <PaymentMetric label="Escrow" value={formatCargo(shipment.escrow)} />
                  <PaymentMetric label="Released" value={formatCargo(shipment.released)} />
                  <PaymentMetric label="Remaining" value={formatCargo(shipment.remaining)} />
                </div>
              </div>

              <TimelinePanel
                events={shipment.events}
                milestones={shipment.milestones}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                walletIdentities={walletIdentities}
                onViewProof={openProofViewer}
                proofViewerLoadingMilestoneId={proofViewerLoadingMilestoneId}
                canVerify={isShipper}
                canSubmitProof={proofSubmissionOpen}
                busy={busy}
                actionStage={actionStage}
                onVerify={verifyMilestone}
                onSubmitProof={submitMilestoneProof}
                onWithdrawProof={withdrawMilestoneProof}
                ratingRequestId={shipment.id}
                ratingCarrier={shipment.carrier}
                ratingIsShipper={isShipper}
                ratingStatus={shipment.status}
                onRatingPublished={() => setHasCarrierRating(true)}
                canTipCarrier={canTipCarrier}
                onFocusTip={focusCarrierTip}
              />
            </Card>
          )}

          <Card className={styles.manifestCard}>
            {shipment.items.length > 0 ? (
              <ShipmentContents items={shipment.items} />
            ) : (
              <p className={styles.manifestEmpty}>No item manifest was recorded.</p>
            )}
          </Card>
        </>
      )}

      <Card className={styles.remarksCard}>
        <section className={styles.remarks} aria-labelledby="shipment-remarks-title">
          <h3 id="shipment-remarks-title">Remarks</h3>
          <p>{formatRemarks(shipment.specialInstruction)}</p>
        </section>
      </Card>

      {milestonesApproved && (
        <Card className={styles.escrowActivityCard}>
          <EscrowActivityPanel
            shipment={shipment}
            isShipper={isShipper}
            busy={busy}
            actionStage={actionStage}
            onTip={sendCarrierTip}
            onTopUp={topUpOperationalAllowance}
            account={account}
            cargoToken={contracts?.cargoToken}
            cargoBalance={cargoBalance}
            onTopUpCargo={openCargoTopUp}
          />
        </Card>
      )}

      {isShipper && proposalHistory.length > 0 && (
        <Card className={styles.proposalHistoryCard}>
          <ProposalHistoryPanel
            requestId={idParam}
            proposals={proposalHistory}
            proposedAmount={shipment.proposedAmount}
            walletIdentities={walletIdentities}
            collapsedByDefault={shipment.status === 'Open'}
            onOpenCarrierReputation={setReputationCarrier}
          />
        </Card>
      )}

      {(shipment.amendments.length > 0 || (
        (isShipper || isCarrier)
        && ['Funded', 'InProgress'].includes(shipment.status)
        && !deadlinePassed
      )) && (
        <div
          ref={amendmentSectionRef}
          className={`${styles.agreementFocusTarget} ${
            focusedAgreement === 'amendment' ? styles.agreementFocusTargetActive : ''
          }`}
        >
          <AmendmentPanel
            amendments={shipment.amendments}
            shipment={shipment}
            account={account}
            isShipper={isShipper}
            cargoBalance={cargoBalance}
            onTopUpCargo={openCargoTopUp}
            isParticipant={isShipper || isCarrier}
            busy={busy}
            actionStage={actionStage}
            nowSeconds={nowSeconds}
            walletIdentities={walletIdentities}
            onRequest={submitAmendment}
            onAccept={acceptAmendment}
            onReject={rejectAmendment}
            onWithdraw={withdrawAmendment}
            onExpire={expireAmendment}
          />
        </div>
      )}

      {(shipment.cancellations.length > 0 || (
        (isShipper || isCarrier)
        && ['Funded', 'InProgress'].includes(shipment.status)
        && !deadlinePassed
      )) && (
        <div
          ref={cancellationSectionRef}
          className={`${styles.agreementFocusTarget} ${
            focusedAgreement === 'cancellation' ? styles.agreementFocusTargetActive : ''
          }`}
        >
          <CancellationPanel
            cancellations={shipment.cancellations}
            shipment={shipment}
            account={account}
            isParticipant={isShipper || isCarrier}
            busy={busy}
            actionStage={actionStage}
            nowSeconds={nowSeconds}
            walletIdentities={walletIdentities}
            onRequest={requestMutualCancellation}
            onAccept={acceptMutualCancellation}
            onReject={rejectMutualCancellation}
            onWithdraw={withdrawMutualCancellation}
            onExpire={expireMutualCancellation}
          />
        </div>
      )}

      {(canCancelRequest || canClaimRefund) && (
        <section className={styles.secondaryManagement} aria-labelledby="secondary-management-title">
          <div>
            <span className={styles.statusKicker}>Secondary management</span>
            <h2 id="secondary-management-title">
              {canClaimRefund ? 'Escrow recovery' : 'Request management'}
            </h2>
            <p>
              {canClaimRefund
                ? `${formatCargo(shipment.remaining)} remains available to refund.`
                : 'Cancellation is available until a proposal is approved and funded.'}
            </p>
          </div>
          <div className={styles.refundActions}>
            {canCancelRequest && (
              <Button variant="danger" onClick={cancelRequest} disabled={busy}>
                {actionStage === 'cancelling' ? 'Cancelling…' : 'Cancel request'}
              </Button>
            )}
            {canClaimRefund && (
              <Button onClick={claimRefund} disabled={busy}>
                {actionStage === 'refunding' ? 'Refunding…' : 'Claim refund'}
              </Button>
            )}
          </div>
        </section>
      )}

      {proofViewerMilestone && (
        <ProofViewerModal
          milestone={proofViewerMilestone}
          onClose={() => setProofViewerMilestone(null)}
          requestId={proofViewerMilestone.requestId}
          accessToken={proofViewerMilestone.accessToken}
          gatewayBases={getConfiguredGatewayBases()}
        />
      )}
      {reputationCarrier && (
        <CarrierReputationModal
          carrier={reputationCarrier}
          onClose={() => setReputationCarrier(null)}
        />
      )}
      {fundingReview && (
        <BrandedModal title="Fund shipment" description="Review delivery compensation and the refundable carrier gas reserve." Icon={HiOutlineCreditCard} onClose={() => setFundingReview(null)} busy={busy} footer={<><Button variant="secondary" onClick={() => setFundingReview(null)} disabled={busy}>Cancel</Button><Button onClick={confirmProposalFunding} disabled={busy}>{busy ? 'Funding…' : `Fund ${formatCargo(fundingReview.quote.total + parseOptionalCargo(fundingReview.extraText))}`}</Button></>}>
          <div className={styles.fundingBreakdown}>
            <PaymentRow label="Delivery compensation" value={formatCargo(fundingReview.quote.compensation)} />
            <div className={styles.fundingReserveCalculation}>
              <span>Operational gas reserve</span>
              <strong>
                {fundingReview.eligibleProofCount > 0
                  ? `${fundingReview.eligibleProofCount} eligible proof submission${fundingReview.eligibleProofCount === 1 ? '' : 's'} × ${formatCargo(fundingReview.quote.operational / BigInt(fundingReview.eligibleProofCount))} minimum each = ${formatCargo(fundingReview.quote.operational)}`
                  : formatCargo(fundingReview.quote.operational)}
              </strong>
            </div>
            <label className={styles.reserveInputLabel} htmlFor="extra-initial-reserve">Extra reserve <span>Optional</span></label>
            <div className={styles.tipInputWrap}><input id="extra-initial-reserve" inputMode="decimal" value={fundingReview.extraText} onChange={(event) => setFundingReview((current) => ({ ...current, extraText: event.target.value }))} placeholder="0.00" /><span>C.</span></div>
            <AvailableCargoBalance
              balance={cargoBalance}
              requiredAmount={fundingReview.quote.total + parseOptionalCargo(fundingReview.extraText)}
              onTopUp={openCargoTopUp}
            />
            <PaymentRow label="Total to fund" value={formatCargo(fundingReview.quote.total + parseOptionalCargo(fundingReview.extraText))} />
          </div>
          <p className={styles.fundingExplanation}>The reserve is separate from milestone compensation and covers eligible carrier proof-submission gas. Unused reserve returns to you when the shipment settles.</p>
          <p className={styles.fundingExplanation}>MetaMask may request token approval first. Approval grants permission; the following funding transaction transfers the tokens.</p>
        </BrandedModal>
      )}
      {PROOF_PROGRESS_STAGES.has(actionStage) && <ProofUploadProgressModal stage={actionStage} />}
      {cargoTopUp && (
        <CargoTopUpModal
          suggestedCargo={cargoTopUp.suggestedCargo}
          cargoBalance={cargoBalance}
          ethBalance={ethBalance}
          busy={busy}
          onClose={() => !busy && setCargoTopUp(null)}
          onConfirm={completeCargoTopUp}
        />
      )}
      {confirmation && <ConfirmDialog {...confirmation} />}
    </div>
  );
}

function AmendmentPanel({
  amendments,
  shipment,
  account,
  isShipper,
  cargoBalance,
  onTopUpCargo,
  isParticipant,
  busy,
  actionStage,
  nowSeconds,
  walletIdentities,
  onRequest,
  onAccept,
  onReject,
  onWithdraw,
  onExpire,
}) {
  const pending = amendments.find((entry) => entry.status === 'Pending');
  const history = [...amendments].filter((entry) => entry.status !== 'Pending').reverse();
  const [formOpen, setFormOpen] = useState(false);
  const [changeDeadline, setChangeDeadline] = useState(false);
  const [note, setNote] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');
  const [proposedDeadline, setProposedDeadline] = useState(() => (
    suggestedExtendedDeadline(shipment.deadline)
  ));
  const [responseDeadline, setResponseDeadline] = useState(() => (
    suggestedAmendmentResponseDeadline(shipment.deadline)
  ));
  const [gasPolicy, setGasPolicy] = useState(0);
  const [responseAllowance, setResponseAllowance] = useState('');
  const [existingAmounts, setExistingAmounts] = useState({});
  const [newMilestones, setNewMilestones] = useState([]);
  const [draggedNewMilestone, setDraggedNewMilestone] = useState(null);
  const [amendmentDropTarget, setAmendmentDropTarget] = useState(null);
  const [formError, setFormError] = useState('');
  const [confirmationDraft, setConfirmationDraft] = useState(null);
  const [fundingPlanOpen, setFundingPlanOpen] = useState(false);
  const noteWordCount = countWords(note);
  const rejectionWordCount = countWords(rejectionNote);
  const noteTooLong = exceedsTextLimit(note, MAX_AMENDMENT_NOTE_WORDS, MAX_AMENDMENT_NOTE_BYTES);
  const rejectionTooLong = exceedsTextLimit(
    rejectionNote,
    MAX_AMENDMENT_NOTE_WORDS,
    MAX_AMENDMENT_NOTE_BYTES,
  );
  const shipmentActive = ['Funded', 'InProgress'].includes(shipment.status)
    && nowSeconds < shipment.deadline;
  const accountLower = account?.toLowerCase();
  const isRequester = Boolean(pending && accountLower === pending.requester.toLowerCase());
  const isResponder = Boolean(pending && accountLower === pending.responder.toLowerCase());
  const responseExpired = Boolean(pending && nowSeconds > pending.responseDeadline);
  const firstUnpaidIndex = shipment.milestones.findIndex(
    (milestone) => milestone.status !== 'Paid',
  );
  const milestoneLimitReached = shipment.milestones.length + newMilestones.length >= 20;

  const resetForm = () => {
    setNote('');
    setChangeDeadline(false);
    setProposedDeadline(suggestedExtendedDeadline(shipment.deadline));
    setResponseDeadline(suggestedAmendmentResponseDeadline(shipment.deadline));
    setGasPolicy(0);
    setResponseAllowance('');
    setExistingAmounts({});
    setNewMilestones([]);
    setDraggedNewMilestone(null);
    setAmendmentDropTarget(null);
    setFormError('');
    setConfirmationDraft(null);
    setFundingPlanOpen(false);
    setFormOpen(false);
  };

  const addNewMilestone = () => {
    if (firstUnpaidIndex < 0 || milestoneLimitReached) return;
    setFundingPlanOpen(true);
    setNewMilestones((current) => [...current, {
      key: `${Date.now()}-${current.length}`,
      name: '',
      amount: '',
      insertBefore: null,
    }]);
  };

  const startNewMilestoneDrag = (event, key) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
    setDraggedNewMilestone(key);
  };

  const dragOverOriginalMilestone = (event, milestone) => {
    if (!draggedNewMilestone) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    const nextUnpaid = shipment.milestones.find((entry) => (
      entry.index > milestone.index && entry.status !== 'Paid'
    ));
    const blocked = milestone.status === 'Paid';
    event.dataTransfer.dropEffect = blocked ? 'none' : 'move';
    setAmendmentDropTarget({
      type: 'original',
      milestoneId: milestone.milestoneId,
      placement,
      insertBefore: placement === 'before'
        ? milestone.milestoneId
        : nextUnpaid
          ? nextUnpaid.milestoneId
          : null,
      blocked,
    });
  };

  const dropOnOriginalMilestone = (event) => {
    event.preventDefault();
    const target = amendmentDropTarget;
    if (!draggedNewMilestone || !target || target.blocked) {
      setDraggedNewMilestone(null);
      setAmendmentDropTarget(null);
      return;
    }
    setNewMilestones((current) => {
      const moved = current.find((entry) => entry.key === draggedNewMilestone);
      if (!moved) return current;
      const remaining = current.filter((entry) => entry.key !== draggedNewMilestone);
      const firstTargetIndex = remaining.findIndex(
        (entry) => entry.insertBefore === target.insertBefore,
      );
      const insertionIndex = firstTargetIndex < 0 ? remaining.length : firstTargetIndex;
      remaining.splice(insertionIndex, 0, { ...moved, insertBefore: target.insertBefore });
      return remaining;
    });
    setDraggedNewMilestone(null);
    setAmendmentDropTarget(null);
  };

  const dragOverNewMilestone = (event, targetKey) => {
    if (!draggedNewMilestone) return;
    if (draggedNewMilestone === targetKey) {
      setAmendmentDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    setAmendmentDropTarget({
      type: 'new',
      key: targetKey,
      placement: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
      blocked: false,
    });
  };

  const dropOnNewMilestone = (event, targetKey) => {
    event.preventDefault();
    const sourceKey = draggedNewMilestone;
    const placement = amendmentDropTarget?.placement || 'before';
    if (!sourceKey || sourceKey === targetKey) {
      finishNewMilestoneDrag();
      return;
    }
    setNewMilestones((current) => {
      const source = current.find((entry) => entry.key === sourceKey);
      const target = current.find((entry) => entry.key === targetKey);
      if (!source || !target) return current;
      const next = current.filter((entry) => entry.key !== sourceKey);
      let targetIndex = next.findIndex((entry) => entry.key === targetKey);
      if (placement === 'after') targetIndex += 1;
      next.splice(targetIndex, 0, { ...source, insertBefore: target.insertBefore });
      return next;
    });
    setDraggedNewMilestone(null);
    setAmendmentDropTarget(null);
  };

  const finishNewMilestoneDrag = () => {
    setDraggedNewMilestone(null);
    setAmendmentDropTarget(null);
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setFormError('');
    const deadline = changeDeadline
      ? Math.floor(new Date(proposedDeadline).getTime() / 1000)
      : shipment.deadline;
    const answerBy = Math.floor(new Date(responseDeadline).getTime() / 1000);
    const trimmedNote = note.trim();
    try {
      if (!trimmedNote) throw new Error('Explain the requested agreement change.');
      if (noteTooLong) {
        throw new Error(`Reason for change must be ${MAX_AMENDMENT_NOTE_WORDS} words or fewer.`);
      }
      if (!Number.isFinite(deadline) || deadline <= nowSeconds) {
        throw new Error('Choose a shipment deadline in the future.');
      }
      if (deadline !== shipment.deadline
        && Math.abs(deadline - shipment.deadline) < MIN_DEADLINE_CHANGE_SECONDS) {
        throw new Error('Deadline changes must be at least 15 minutes.');
      }
      if (!isShipper && deadline < shipment.deadline) {
        throw new Error('A carrier can extend the deadline, but cannot shorten it.');
      }
      const existingFunding = shipment.milestones
        .filter((milestone) => milestone.status !== 'Paid')
        .map((milestone) => {
          const value = existingAmounts[milestone.milestoneId]?.trim();
          return value ? [BigInt(milestone.milestoneId), parsePositiveEth(value)] : null;
        })
        .filter(Boolean);
      const additions = newMilestones.map((milestone) => {
        if (!milestone.name.trim() || !milestone.amount.trim()) {
          throw new Error('Each new milestone needs a name and funding amount.');
        }
        return [
          milestone.name.trim(),
          milestone.insertBefore == null
            ? APPEND_MILESTONE_ID
            : BigInt(milestone.insertBefore),
          parsePositiveEth(milestone.amount),
        ];
      }).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      const additionalFunding = [...existingFunding, ...additions]
        .reduce((total, allocation) => total + allocation[allocation.length - 1], 0n);
      const responseAllowanceValue = gasPolicy === 1
        ? parsePositiveEth(responseAllowance)
        : 0n;
      if (gasPolicy === 1 && responseAllowanceValue === 0n) {
        throw new Error('Enter a CARGO response allowance or choose Each Pays Own.');
      }

      if (additionalFunding > 0n && additionalFunding < MIN_ADDITIONAL_FUNDING_WEI) {
        throw new Error('New amendment funding must total at least 0.01 C.');
      }
      if (deadline < shipment.deadline && additionalFunding < MIN_ADDITIONAL_FUNDING_WEI) {
        throw new Error('A shorter deadline requires at least 0.01 C. of new funding.');
      }
      if (deadline === shipment.deadline && additionalFunding === 0n) {
        throw new Error('Change the deadline or add new escrow funding.');
      }

      const directExtension = isShipper
        && deadline > shipment.deadline
        && additionalFunding === 0n;
      if (!directExtension && (!Number.isFinite(answerBy) || answerBy <= nowSeconds)) {
        throw new Error('Choose a response deadline in the future.');
      }
      if (!directExtension && answerBy > shipment.deadline) {
        throw new Error('The response deadline cannot exceed the current shipment deadline.');
      }
      if (!directExtension && deadline < shipment.deadline && answerBy > deadline) {
        throw new Error('Answering a shortened deadline must happen before that proposed deadline.');
      }
      if (!directExtension
        && shipment.deadline - nowSeconds <= MIN_AMENDMENT_LEAD_SECONDS) {
        throw new Error('Mutual amendment requests close one hour before the shipment deadline.');
      }
      setConfirmationDraft({
        proposedDeadline: deadline,
        responseDeadline: answerBy,
        note: trimmedNote,
        existingFunding,
        newMilestones: additions,
        additionalFunding,
        gasPolicy,
        responseAllowance: responseAllowanceValue,
        directExtension,
      });
    } catch (error) {
      setFormError(error.message);
    }
  };

  const confirmRequest = async () => {
    if (!confirmationDraft) return;
    const completed = await onRequest(confirmationDraft);
    if (completed) resetForm();
  };

  const submitRejection = async (event) => {
    event.preventDefault();
    if (rejectionTooLong) return;
    const completed = await onReject(pending.id, rejectionNote);
    if (completed) setRejectionNote('');
  };

  const renderNewMilestoneCard = (newMilestone, placementLabel) => {
    const newDropState = amendmentDropTarget?.type === 'new'
      && amendmentDropTarget.key === newMilestone.key;
    return (
      <div key={newMilestone.key} className={styles.amendmentTimelineRow}>
        <div className={styles.amendmentNewMarker}>+</div>
        <div
          className={`${styles.amendmentInputCard} ${styles.amendmentNewCard} ${draggedNewMilestone === newMilestone.key ? styles.amendmentCardDragging : ''} ${newDropState && amendmentDropTarget.placement === 'before' ? styles.amendmentDropBefore : ''} ${newDropState && amendmentDropTarget.placement === 'after' ? styles.amendmentDropAfter : ''}`}
          draggable
          onDragStart={(event) => startNewMilestoneDrag(event, newMilestone.key)}
          onDragOver={(event) => dragOverNewMilestone(event, newMilestone.key)}
          onDrop={(event) => dropOnNewMilestone(event, newMilestone.key)}
          onDragEnd={finishNewMilestoneDrag}
        >
          <div className={styles.amendmentCardKicker}>
            <span>New funded milestone</span>
            <button
              type="button"
              className={styles.amendmentRemoveButton}
              onClick={() => setNewMilestones((current) => current.filter(
                (entry) => entry.key !== newMilestone.key,
              ))}
              aria-label={`Remove ${newMilestone.name || 'new milestone'}`}
              title="Remove milestone"
            >
              <HiOutlineTrash />
            </button>
          </div>
          <div className={styles.amendmentCardFields}>
            <label>
              <span>Milestone name</span>
              <input
                value={newMilestone.name}
                onChange={(event) => setNewMilestones((current) => current.map(
                  (entry) => entry.key === newMilestone.key
                    ? { ...entry, name: event.target.value }
                    : entry,
                ))}
                placeholder="e.g. Customs inspection"
              />
            </label>
            <label>
              <span>Funded CARGO</span>
              <div className={styles.amendmentEthInput}>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  inputMode="decimal"
                  value={newMilestone.amount}
                  onChange={(event) => setNewMilestones((current) => current.map(
                    (entry) => entry.key === newMilestone.key
                      ? { ...entry, amount: event.target.value }
                      : entry,
                  ))}
                  placeholder="0.00"
                />
                <span>C.</span>
              </div>
              {isShipper ? (
                <AvailableCargoBalance
                  balance={cargoBalance}
                  requiredAmount={parseOptionalCargo(newMilestone.amount)}
                  onTopUp={onTopUpCargo}
                />
              ) : (
                <span className={styles.availableBalance}>The shipper funds this if accepted.</span>
              )}
            </label>
          </div>
          <small className={styles.amendmentPlacementNote}>{placementLabel}</small>
        </div>
      </div>
    );
  };

  return (
    <Card className={styles.amendmentCard}>
      <div className={styles.amendmentHeader}>
        <div className={styles.amendmentIcon} aria-hidden="true">
          <HiOutlinePencilSquare />
        </div>
        <div>
          <h2>Shipment agreement changes</h2>
          <p>
            Extend or renegotiate the deadline, add funded checkpoints, or increase unpaid
            milestone compensation without changing completed work.
          </p>
        </div>
        {!pending && shipmentActive && isParticipant && !formOpen && (
          <Button variant="secondary" onClick={() => setFormOpen(true)} disabled={busy}>
            Request change
          </Button>
        )}
      </div>

      {pending ? (
        <section className={styles.amendmentPending} aria-label="Pending shipment amendment">
          <div className={styles.amendmentMetaGrid}>
            <div>
              <span>Requested by</span>
              <strong>{walletIdentityLabel(pending.requester, walletIdentities)}</strong>
            </div>
            <div>
              <span>Proposed deadline</span>
              <strong>{formatDate(pending.proposedDeadline)}</strong>
            </div>
            <div>
              <span>New escrow</span>
              <strong>{formatCargo(pending.additionalFunding)}</strong>
            </div>
            <div>
              <span>Answer before</span>
              <strong>{formatDate(pending.responseDeadline)}</strong>
            </div>
            {!pending.directExtension && <div><span>Response gas</span><strong>{pending.gasPolicy === 1 ? 'Requester covers response' : 'Each pays own'}</strong></div>}
            {pending.gasPolicy === 1 && <div><span>Response allowance</span><strong>{formatCargo(pending.responseAllowance)}</strong></div>}
          </div>
          {!pending.directExtension && <p className={styles.amendmentPolicyExplanation}>{pending.gasPolicy === 1
            ? 'The responder pays ETH upfront and receives capped CARGO reimbursement after a successful acceptance or rejection. Unused allowance returns to the requester.'
            : 'The requester pays submission gas and the responder pays their own acceptance or rejection gas. No response reimbursement is funded.'}</p>}
          <blockquote className={styles.amendmentNote}>{pending.requesterNote}</blockquote>
          <AmendmentAllocations amendment={pending} milestones={shipment.milestones} />

          <div className={styles.amendmentActions}>
            {responseExpired ? (
              <Button
                variant="secondary"
                onClick={() => onExpire(pending.id)}
                disabled={busy}
              >
                {actionStage === 'expiring-amendment' ? 'Closing...' : 'Close expired request'}
              </Button>
            ) : (
              <>
                {isRequester && (
                  <Button
                    variant="secondary"
                    onClick={() => onWithdraw(pending.id)}
                    disabled={busy}
                  >
                    {actionStage === 'withdrawing-amendment' ? 'Withdrawing...' : 'Withdraw'}
                  </Button>
                )}
                {isResponder && (
                  <Button onClick={() => onAccept(pending)} disabled={busy}>
                    {actionStage === 'accepting-amendment' ? 'Accepting...' : 'Accept amendment'}
                  </Button>
                )}
              </>
            )}
          </div>

          {isResponder && !responseExpired && (
            <form className={styles.amendmentRejectForm} onSubmit={submitRejection}>
              <label htmlFor="amendment-rejection-note">
                Rejection note <span>Optional</span>
              </label>
              <textarea
                id="amendment-rejection-note"
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                maxLength={500}
                placeholder="Explain why the existing agreement should continue."
              />
              <div className={styles.amendmentFormFooter}>
                <span className={rejectionTooLong ? styles.wordLimitError : ''}>
                  {rejectionWordCount}/{MAX_AMENDMENT_NOTE_WORDS} words
                </span>
                <Button type="submit" variant="danger" disabled={busy || rejectionTooLong}>
                  {actionStage === 'rejecting-amendment' ? 'Rejecting...' : 'Reject amendment'}
                </Button>
              </div>
            </form>
          )}
        </section>
      ) : formOpen ? (
        <form className={styles.amendmentForm} onSubmit={submitRequest}>
          <label className={styles.amendmentDeadlineToggle}>
            <input
              type="checkbox"
              checked={changeDeadline}
              onChange={(event) => setChangeDeadline(event.target.checked)}
            />
            <span>
              <strong>Change shipment deadline</strong>
              <small>Enable this only when the amendment needs a deadline change.</small>
            </span>
          </label>
          <div className={styles.amendmentFormGrid}>
            {changeDeadline && (
              <label>
                <span>Proposed shipment deadline</span>
                <input
                  type="datetime-local"
                  value={proposedDeadline}
                  min={toDateTimeLocal((nowSeconds + 60) * 1000)}
                  onChange={(event) => setProposedDeadline(event.target.value)}
                />
                <small>{isShipper ? 'A later deadline is applied directly if nothing else changes.' : 'Carriers may only keep or extend the current deadline.'}</small>
              </label>
            )}
            <label>
              <span>Response deadline</span>
              <input
                type="datetime-local"
                value={responseDeadline}
                min={toDateTimeLocal((nowSeconds + 60) * 1000)}
                max={toDateTimeLocal(Math.min(
                  shipment.deadline * 1000,
                  changeDeadline
                    ? new Date(proposedDeadline).getTime() || shipment.deadline * 1000
                    : shipment.deadline * 1000,
                ))}
                onChange={(event) => setResponseDeadline(event.target.value)}
              />
              <small>Must be no later than the current shipment deadline.</small>
            </label>
          </div>

            <div className={styles.amendmentFormGrid}>
              <label>
              <span>Who pays the response gas?</span>
              <select value={gasPolicy} onChange={(event) => setGasPolicy(Number(event.target.value))}>
                <option value={0}>Each pays own</option>
                <option value={1}>Requester covers response</option>
              </select>
              <small>{gasPolicy === 0
                ? 'You pay gas to submit this change. The other party pays gas to accept or reject it; neither response is reimbursed.'
                : 'You pay submission gas and fund a separate CARGO allowance. The responder pays ETH upfront, then receives capped CARGO reimbursement for accepting or rejecting.'}</small>
            </label>
            {gasPolicy === 1 && (
              <label>
                <span>Response allowance (C.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={responseAllowance}
                  onChange={(event) => setResponseAllowance(event.target.value)}
                  placeholder="Minimum calculated on-chain"
                />
                <AvailableCargoBalance
                  balance={cargoBalance}
                  requiredAmount={parseOptionalCargo(responseAllowance)}
                  onTopUp={onTopUpCargo}
                />
                <small>This is a refundable budget, not a fixed fee. It must meet the contract minimum; unused allowance returns to you and reimbursement may not cover the full network fee.</small>
              </label>
            )}
          </div>

          <label className={styles.amendmentNoteField}>
            <span>Reason for change</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Describe what should change and why."
            />
            <small className={noteTooLong ? styles.wordLimitError : ''}>
              {noteWordCount}/{MAX_AMENDMENT_NOTE_WORDS} words
            </small>
          </label>

          <section className={styles.amendmentMilestoneEditor}>
            <div className={styles.amendmentEditorHeader}>
              <div>
                <h3>
                  <button
                    type="button"
                    className={styles.amendmentEditorTitleButton}
                    aria-expanded={fundingPlanOpen}
                    aria-controls="amendment-funding-plan"
                    onClick={() => setFundingPlanOpen((current) => !current)}
                  >
                    Milestone funding plan
                  </button>
                </h3>
                <p>
                  {fundingPlanOpen
                    ? 'Add CARGO on top of unpaid payouts, insert a funded checkpoint, or append a new final checkpoint.'
                    : 'Expand to review existing allocations or add newly funded milestones.'}
                </p>
              </div>
              <div className={styles.amendmentEditorActions}>
                <button
                  type="button"
                  className={styles.amendmentAddButton}
                  onClick={addNewMilestone}
                  disabled={firstUnpaidIndex < 0 || milestoneLimitReached}
                >
                  <HiOutlinePlus /> Add funded milestone
                </button>
                <span className={styles.amendmentLimit}>{shipment.milestones.length + newMilestones.length} / 20 total checkpoints{milestoneLimitReached ? ' · Maximum reached' : ''}</span>
                <button
                  type="button"
                  className={styles.amendmentEditorChevron}
                  aria-label={fundingPlanOpen ? 'Collapse milestone funding plan' : 'Expand milestone funding plan'}
                  aria-expanded={fundingPlanOpen}
                  aria-controls="amendment-funding-plan"
                  onClick={() => setFundingPlanOpen((current) => !current)}
                >
                  <HiOutlineChevronDown
                    className={fundingPlanOpen ? styles.amendmentEditorChevronOpen : ''}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            {fundingPlanOpen && (
              <div id="amendment-funding-plan" className={styles.amendmentEditorBody}>
                <div className={styles.amendmentTimeline}>
                  <div className={styles.amendmentStaticNode}>
                    <span>A</span>
                    <div>
                      <small>Starting pickup point</small>
                      <strong>{shipment.from}</strong>
                    </div>
                  </div>

                  <div className={styles.amendmentTimelineLine} />

                  {shipment.milestones.map((milestone) => {
                    const stagedBefore = newMilestones.filter(
                      (entry) => entry.insertBefore === milestone.milestoneId,
                    );
                    const oldFunding = milestone.payoutAmount + milestone.additionalPayoutAmount;
                    const newFunding = parseEthInputOrZero(existingAmounts[milestone.milestoneId]);
                    const combinedFunding = oldFunding + newFunding;
                    const originalDropState = amendmentDropTarget?.type === 'original'
                      && amendmentDropTarget.milestoneId === milestone.milestoneId;
                    return (
                      <div key={`amendment-segment-${milestone.milestoneId}`} className={styles.amendmentTimelineSegment}>
                        {stagedBefore.map((newMilestone) => renderNewMilestoneCard(
                          newMilestone,
                          `Placed before #${milestone.index + 1} ${milestone.name}`,
                        ))}

                        <div className={styles.amendmentTimelineRow}>
                          <div className={styles.amendmentOriginalMarker}>{milestone.index + 1}</div>
                          <div
                            className={`${styles.amendmentInputCard} ${styles.amendmentOriginalCard} ${milestone.status === 'Paid' ? styles.amendmentPaidCard : ''} ${originalDropState && amendmentDropTarget.blocked ? styles.amendmentDropBlocked : ''} ${originalDropState && !amendmentDropTarget.blocked && amendmentDropTarget.placement === 'before' ? styles.amendmentDropBefore : ''} ${originalDropState && !amendmentDropTarget.blocked && amendmentDropTarget.placement === 'after' ? styles.amendmentDropAfter : ''}`}
                            onDragOver={(event) => dragOverOriginalMilestone(event, milestone)}
                            onDrop={dropOnOriginalMilestone}
                          >
                            {originalDropState && amendmentDropTarget.blocked && (
                              <span className={styles.amendmentDisabledDrop}>Drop disabled</span>
                            )}
                            <div className={styles.amendmentCardKicker}>
                              Existing milestone
                              <Badge tone={milestone.status === 'Paid' ? 'success' : 'neutral'}>
                                {milestone.status === 'Paid' ? 'Paid' : 'Unpaid'}
                              </Badge>
                            </div>
                            <div className={styles.amendmentCardFields}>
                              <label>
                                <span>Milestone name</span>
                                <input value={milestone.name} disabled />
                              </label>
                              <label>
                                <span>New added funds</span>
                                <div className={styles.amendmentEthInput}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    inputMode="decimal"
                                    value={existingAmounts[milestone.milestoneId] || ''}
                                    onChange={(event) => setExistingAmounts((current) => ({
                                      ...current,
                                      [milestone.milestoneId]: event.target.value,
                                    }))}
                                    disabled={milestone.status === 'Paid'}
                                    placeholder={milestone.status === 'Paid' ? 'Paid' : '0.00'}
                                  />
                                  <span>C.</span>
                                </div>
                                {milestone.status !== 'Paid' && (isShipper ? (
                                  <AvailableCargoBalance
                                    balance={cargoBalance}
                                    requiredAmount={parseOptionalCargo(existingAmounts[milestone.milestoneId])}
                                    onTopUp={onTopUpCargo}
                                  />
                                ) : (
                                  <span className={styles.availableBalance}>The shipper funds this if accepted.</span>
                                ))}
                              </label>
                            </div>
                            <div className={styles.amendmentFundingEquation}>
                              {milestone.status === 'Paid' ? (
                                <strong>{formatCargo(oldFunding)}</strong>
                              ) : (
                                <>
                                  <span>{formatCargo(oldFunding)}</span>
                                  <span aria-hidden="true">+</span>
                                  <span>{formatCargo(newFunding)}</span>
                                  <span aria-hidden="true">=</span>
                                  <strong>{formatCargo(combinedFunding)}</strong>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {newMilestones
                    .filter((entry) => entry.insertBefore == null)
                    .map((newMilestone) => renderNewMilestoneCard(
                      newMilestone,
                      'Placed as the new final milestone',
                    ))}

                  <div className={styles.amendmentTimelineLine} />
                  <div className={styles.amendmentStaticNode}>
                    <span>B</span>
                    <div>
                      <small>Final destination point</small>
                      <strong>{shipment.to}</strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.amendmentBottomAddButton}
                  onClick={addNewMilestone}
                  disabled={firstUnpaidIndex < 0 || milestoneLimitReached}
                >
                  <HiOutlinePlus aria-hidden="true" /> Add funded milestone
                </button>

                <p className={styles.amendmentDragHint}>
                  Paid milestones are locked. New milestones can be dropped before an unpaid
                  milestone or after the final unpaid milestone; invalid targets show a disabled cursor.
                </p>
              </div>
            )}
          </section>

          {formError && <div className={styles.amendmentError} role="alert">{formError}</div>}
          <div className={styles.amendmentFormFooter}>
            <span>New funding is added on top; original payouts cannot be reduced.</span>
            <div>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || noteTooLong}>
                {actionStage === 'requesting-amendment' || actionStage === 'extending-deadline'
                  ? 'Submitting...'
                  : 'Submit agreement change'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {history.length > 0 && (
        <details className={styles.amendmentHistory}>
          <summary>
            <span className={styles.amendmentHistoryTitle}>Previous agreement changes</span>
            <span className={styles.amendmentHistorySummaryMeta}>
              <span className={styles.amendmentHistoryCount}>{history.length}</span>
              <HiOutlineChevronDown
                className={styles.amendmentHistoryChevron}
                aria-hidden="true"
              />
            </span>
          </summary>
          <div className={history.length > 3 ? styles.amendmentHistoryListScrollable : ''}>
            {history.map((entry) => (
              <article key={entry.id}>
                <div className={styles.amendmentHistoryHeading}>
                  <div>
                    <strong>{entry.directExtension ? 'Direct deadline extension' : `Agreement change #${entry.id + 1}`}</strong>
                    <small>
                      {walletIdentityLabel(entry.requester, walletIdentities)} · {formatDate(entry.createdAt)}
                    </small>
                  </div>
                  <Badge tone={cancellationStatusTone(entry.status)}>{entry.status}</Badge>
                </div>
                <p>
                  <strong className={styles.amendmentReasonLabel}>Reason for change:</strong>{' '}
                  {entry.requesterNote}
                </p>
                <AmendmentChangeSummary amendment={entry} milestones={shipment.milestones} />
                {entry.rejectionNote && (
                  <small className={styles.amendmentHistoryResponse}>
                    Response: {entry.rejectionNote}
                  </small>
                )}
              </article>
            ))}
          </div>
        </details>
      )}

      {confirmationDraft && (
        <AmendmentConfirmationModal
          shipment={shipment}
          draft={confirmationDraft}
          isShipper={isShipper}
          busy={busy}
          actionStage={actionStage}
          onClose={() => setConfirmationDraft(null)}
          onConfirm={confirmRequest}
        />
      )}
    </Card>
  );
}

function milestoneReferenceLabel(milestoneId, milestones) {
  const targetId = Number(milestoneId);
  const index = milestones.findIndex((milestone) => milestone.milestoneId === targetId);
  if (index < 0) return `Checkpoint ID ${milestoneId}`;
  return `Checkpoint #${index + 1} · ${milestones[index].name}`;
}

function insertionReferenceLabel(milestoneId, milestones) {
  if (milestoneId === APPEND_MILESTONE_ID) return 'New final checkpoint';
  const targetId = Number(milestoneId);
  const target = milestones.find((milestone) => milestone.milestoneId === targetId);
  return target
    ? `Before ${target.name}`
    : `Before checkpoint ID ${milestoneId}`;
}

function AmendmentAllocations({ amendment, milestones }) {
  if (amendment.existingFunding.length === 0 && amendment.newMilestones.length === 0) {
    return <div className={styles.amendmentNoFunding}>Deadline change only — no new escrow requested.</div>;
  }
  return (
    <div className={styles.amendmentAllocations}>
      {amendment.existingFunding.map((allocation) => (
        <div key={`existing-${allocation.milestoneId}`}>
          <span>Extra for {milestoneReferenceLabel(allocation.milestoneId, milestones)}</span>
          <strong>+{formatCargo(allocation.amount)}</strong>
        </div>
      ))}
      {amendment.newMilestones.map((milestone, index) => (
        <div key={`new-${index}-${milestone.name}`}>
          <span>New: {milestone.name} · {insertionReferenceLabel(milestone.insertBeforeMilestoneId, milestones)}</span>
          <strong>{formatCargo(milestone.amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function AmendmentChangeSummary({ amendment, milestones }) {
  const deadlineChanged = amendment.previousDeadline > 0
    && amendment.proposedDeadline !== amendment.previousDeadline;
  const legacyDeadline = amendment.previousDeadline === 0 && amendment.proposedDeadline > 0;
  const hasFunding = amendment.existingFunding.length > 0 || amendment.newMilestones.length > 0;

  if (!deadlineChanged && !legacyDeadline && !hasFunding) {
    return <div className={styles.amendmentNoFunding}>No deadline or funding allocation changed.</div>;
  }

  return (
    <ul className={styles.amendmentChangeList}>
      {deadlineChanged && (
        <li>
          <span>Deadline changed</span>
          <strong>{formatDate(amendment.previousDeadline)} → {formatDate(amendment.proposedDeadline)}</strong>
        </li>
      )}
      {legacyDeadline && (
        <li>
          <span>Resulting deadline</span>
          <strong>{formatDate(amendment.proposedDeadline)}</strong>
        </li>
      )}
      {amendment.existingFunding.map((allocation) => (
        <li key={`history-existing-${allocation.milestoneId}`}>
          <span>{milestoneReferenceLabel(allocation.milestoneId, milestones)} funding increased</span>
          <strong>+{formatCargo(allocation.amount)}</strong>
        </li>
      ))}
      {amendment.newMilestones.map((milestone, index) => (
        <li key={`history-new-${index}-${milestone.name}`}>
          <span>
            New milestone · {insertionReferenceLabel(milestone.insertBeforeMilestoneId, milestones)}
          </span>
          <strong>{milestone.name} · {formatCargo(milestone.amount)}</strong>
        </li>
      ))}
    </ul>
  );
}

function AmendmentConfirmationModal({
  shipment,
  draft,
  isShipper,
  busy,
  actionStage,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const existingFunding = new Map(
    draft.existingFunding.map(([milestoneId, amount]) => [Number(milestoneId), amount]),
  );
  const additionsByMilestoneId = new Map();
  const finalAdditions = [];
  draft.newMilestones.forEach(([name, insertBeforeMilestoneId, amount], draftIndex) => {
    const added = {
      key: `${insertBeforeMilestoneId.toString()}-${draftIndex}-${name}`,
      name,
      amount,
      isNew: true,
    };
    if (insertBeforeMilestoneId === APPEND_MILESTONE_ID) {
      finalAdditions.push(added);
      return;
    }
    const targetId = Number(insertBeforeMilestoneId);
    const current = additionsByMilestoneId.get(targetId) || [];
    current.push(added);
    additionsByMilestoneId.set(targetId, current);
  });
  const afterMilestones = [];
  shipment.milestones.forEach((milestone, index) => {
    afterMilestones.push(...(additionsByMilestoneId.get(milestone.milestoneId) || []));
    const added = existingFunding.get(milestone.milestoneId) || 0n;
    afterMilestones.push({
      key: `existing-${milestone.milestoneId}`,
      name: milestone.name,
      amount: milestone.payoutAmount + milestone.additionalPayoutAmount + added,
      added,
      status: milestone.status,
    });
  });
  afterMilestones.push(...finalAdditions);
  const resultingEscrow = shipment.escrow + draft.additionalFunding;

  return (
    <div className={styles.amendmentConfirmScrim} onMouseDown={() => !busy && onClose()}>
      <section
        className={styles.amendmentConfirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="amendment-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.amendmentConfirmHeader}>
          <div>
            <span>Final review</span>
            <h2 id="amendment-confirm-title">Confirm the full agreement change</h2>
            <p>Compare every funded checkpoint and deadline before recording this request on-chain.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close confirmation">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <div className={styles.amendmentConfirmRoute}>
          <span>{shipment.from}</span>
          <HiOutlineArrowRight aria-hidden="true" />
          <span>{shipment.to}</span>
        </div>

        <div className={styles.amendmentComparisonGrid}>
          <AgreementSnapshot
            title="Before"
            deadline={shipment.deadline}
            escrow={shipment.escrow}
            milestones={shipment.milestones.map((milestone) => ({
              key: `before-${milestone.index}`,
              name: milestone.name,
              amount: milestone.payoutAmount + milestone.additionalPayoutAmount,
              status: milestone.status,
            }))}
          />
          <AgreementSnapshot
            title="After"
            deadline={draft.proposedDeadline}
            escrow={resultingEscrow}
            milestones={afterMilestones}
            changed
          />
        </div>

        <blockquote className={styles.amendmentConfirmNote}>
          <strong>Reason for change:</strong> {draft.note}
        </blockquote>
        <div className={styles.amendmentConfirmFunding}>
          <span>Additional escrow required</span>
          <strong>{formatCargo(draft.additionalFunding)}</strong>
        </div>
        {draft.gasPolicy === 1 && (
          <div className={styles.amendmentConfirmFunding}>
            <span>Response allowance</span>
            <strong>{formatCargo(draft.responseAllowance)}</strong>
          </div>
        )}
        <p className={styles.amendmentConfirmWarning}>
          {draft.directExtension
            ? 'This deadline-only extension is applied immediately by the shipper.'
            : isShipper
              ? 'The new CARGO is staged with this request and only enters escrow if the carrier accepts.'
              : 'If the shipper accepts, they must fund the new CARGO allocation in the acceptance transaction.'}
        </p>

        <footer className={styles.amendmentConfirmFooter}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Back to edit</Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {actionStage === 'requesting-amendment' || actionStage === 'extending-deadline'
              ? 'Confirming...'
              : draft.directExtension
                ? 'Confirm and extend deadline'
                : 'Confirm agreement change'}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function AgreementSnapshot({ title, deadline, escrow, milestones, changed = false }) {
  return (
    <section className={`${styles.agreementSnapshot} ${changed ? styles.agreementSnapshotAfter : ''}`}>
      <div className={styles.agreementSnapshotHeader}>
        <h3>{title}</h3>
        {changed && <Badge tone="success">Proposed</Badge>}
      </div>
      <dl>
        <div><dt>Deadline</dt><dd>{formatDate(deadline)}</dd></div>
        <div><dt>Funded escrow</dt><dd>{formatCargo(escrow)}</dd></div>
      </dl>
      <ol className={styles.agreementSnapshotMilestones}>
        {milestones.map((milestone, index) => (
          <li key={milestone.key}>
            <span>{index + 1}</span>
            <div>
              <strong>{milestone.name}</strong>
              <small>
                {formatCargo(milestone.amount)}
                {milestone.isNew ? ' · New funded milestone' : milestone.added > 0n ? ` · +${formatCargo(milestone.added)}` : ''}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CancellationPanel({
  cancellations,
  shipment,
  account,
  isParticipant,
  busy,
  actionStage,
  nowSeconds,
  walletIdentities,
  onRequest,
  onAccept,
  onReject,
  onWithdraw,
  onExpire,
}) {
  const pendingCancellation = cancellations.find((entry) => entry.status === 'Pending');
  const history = [...cancellations]
    .filter((entry) => entry.status !== 'Pending')
    .sort((a, b) => b.createdAt - a.createdAt);
  const shipmentActive = ['Funded', 'InProgress'].includes(shipment.status)
    && nowSeconds <= shipment.deadline;
  const cancellationWindowOpen = shipmentActive
    && shipment.deadline - nowSeconds > MIN_CANCELLATION_LEAD_SECONDS;
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [responseDeadline, setResponseDeadline] = useState(() => (
    suggestedCancellationDeadline(shipment.deadline)
  ));
  const [rejectFormOpen, setRejectFormOpen] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');

  const sameWallet = (left, right) => Boolean(
    left && right && left.toLowerCase() === right.toLowerCase()
  );
  const isRequester = sameWallet(account, pendingCancellation?.requester);
  const isResponder = sameWallet(account, pendingCancellation?.responder);
  const responseExpired = Boolean(
    pendingCancellation && nowSeconds > pendingCancellation.responseDeadline
  );
  const proofAwaitingReview = shipment.milestones.some(
    (milestone) => milestone.status === 'Submitted'
  );
  const requestWordCount = countWords(requestNote);
  const rejectionWordCount = countWords(rejectionNote);
  const requestTooLong = exceedsTextLimit(
    requestNote,
    MAX_CANCELLATION_NOTE_WORDS,
    MAX_CANCELLATION_NOTE_BYTES,
  );
  const rejectionTooLong = exceedsTextLimit(
    rejectionNote,
    MAX_CANCELLATION_NOTE_WORDS,
    MAX_CANCELLATION_NOTE_BYTES,
  );
  const parsedResponseDeadline = Math.floor(new Date(responseDeadline).getTime() / 1000);
  const responseDeadlineAfterShipment = Number.isFinite(parsedResponseDeadline)
    && parsedResponseDeadline > shipment.deadline;
  const displayParticipant = (wallet) => {
    const role = sameWallet(wallet, shipment.shipper) ? 'Shipper' : 'Carrier';
    if (sameWallet(wallet, account)) return `You · ${role}`;
    return `${role} · ${walletIdentityLabel(wallet, walletIdentities)}`;
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    const sent = await onRequest(requestNote, responseDeadline);
    if (sent) {
      setRequestNote('');
      setRequestFormOpen(false);
    }
  };

  const submitRejection = async (event) => {
    event.preventDefault();
    const rejected = await onReject(pendingCancellation.id, rejectionNote);
    if (rejected) {
      setRejectionNote('');
      setRejectFormOpen(false);
    }
  };

  return (
    <Card className={styles.cancellationCard}>
      <div className={styles.cancellationHeader}>
        <div className={styles.cancellationIcon} aria-hidden="true">
          <HiOutlineArrowPath />
        </div>
        <div className={styles.cancellationHeading}>
          <div className={styles.proposalKicker}>Two-party decision</div>
          <h2>Cancellation agreement</h2>
          <p>
            Either participant may ask to stop an accepted shipment. Nothing is cancelled
            until the other participant accepts on-chain.
          </p>
        </div>
        {pendingCancellation ? (
          <Badge tone={responseExpired ? 'danger' : 'warning'}>
            {responseExpired ? 'Response overdue' : 'Awaiting response'}
          </Badge>
        ) : (
          <Badge tone="neutral">No pending request</Badge>
        )}
      </div>

      {pendingCancellation ? (
        <section className={styles.cancellationPending} aria-label="Pending cancellation request">
          <div className={styles.cancellationPendingTop}>
            <div>
              <span className={styles.cancellationMetaLabel}>Requested by</span>
              <strong>{displayParticipant(pendingCancellation.requester)}</strong>
            </div>
            <div>
              <span className={styles.cancellationMetaLabel}>Answer before</span>
              <strong className={styles.tabularValue}>
                {formatDate(pendingCancellation.responseDeadline)}
              </strong>
            </div>
          </div>

          <blockquote className={styles.cancellationNote}>
            {pendingCancellation.requesterNote}
          </blockquote>

          <div className={styles.cancellationSettlement}>
            <div>
              <span>Already released</span>
              <strong>{formatCargo(shipment.released)}</strong>
              <small>Remains with carrier</small>
            </div>
            <HiOutlineArrowRight aria-hidden="true" />
            <div>
              <span>Remaining escrow</span>
              <strong>{formatCargo(shipment.remaining)}</strong>
              <small>Returns to shipper if accepted</small>
            </div>
          </div>

          {proofAwaitingReview && (
            <div className={styles.cancellationWarning} role="status">
              <HiOutlineExclamationCircle aria-hidden="true" />
              <span>
                Acceptance is paused while milestone proof awaits verification. Approve or reject
                that proof first; rejecting this cancellation is still available.
              </span>
            </div>
          )}

          {isParticipant && (
            <div className={styles.cancellationActions}>
              {responseExpired ? (
                <Button
                  variant="secondary"
                  onClick={() => onExpire(pendingCancellation.id)}
                  disabled={busy}
                >
                  {actionStage === 'expiring-cancellation' ? 'Closing...' : 'Close expired request'}
                </Button>
              ) : isResponder ? (
                <>
                  <Button
                    onClick={() => onAccept(pendingCancellation.id)}
                    disabled={busy || proofAwaitingReview}
                  >
                    <HiOutlineCheck aria-hidden="true" />
                    {actionStage === 'accepting-cancellation' ? 'Accepting...' : 'Accept cancellation'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setRejectFormOpen((open) => !open)}
                    disabled={busy}
                  >
                    <HiOutlineXMark aria-hidden="true" />
                    Reject
                  </Button>
                </>
              ) : isRequester ? (
                <Button
                  variant="secondary"
                  onClick={() => onWithdraw(pendingCancellation.id)}
                  disabled={busy}
                >
                  {actionStage === 'withdrawing-cancellation' ? 'Withdrawing...' : 'Withdraw request'}
                </Button>
              ) : null}
            </div>
          )}

          {rejectFormOpen && isResponder && !responseExpired && (
            <form className={styles.cancellationRejectForm} onSubmit={submitRejection}>
              <label htmlFor="cancellation-rejection-note">
                Rejection note <span>Optional</span>
              </label>
              <textarea
                id="cancellation-rejection-note"
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                placeholder="Explain why the shipment should continue or suggest discussing an amendment."
                rows={3}
                disabled={busy}
              />
              <div className={styles.cancellationFormFooter}>
                <span className={rejectionTooLong ? styles.wordLimitError : ''}>
                  {rejectionWordCount}/{MAX_CANCELLATION_NOTE_WORDS} words
                </span>
                <Button
                  variant="danger"
                  type="submit"
                  disabled={busy || rejectionTooLong}
                >
                  {actionStage === 'rejecting-cancellation' ? 'Rejecting...' : 'Confirm rejection'}
                </Button>
              </div>
            </form>
          )}
        </section>
      ) : shipmentActive && isParticipant ? (
        cancellationWindowOpen ? (
          requestFormOpen ? (
          <form className={styles.cancellationRequestForm} onSubmit={submitRequest}>
            <div className={styles.cancellationFormGrid}>
              <label htmlFor="cancellation-request-note">
                <span>Why should this shipment stop?</span>
                <textarea
                  id="cancellation-request-note"
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="Give the other participant enough context to decide."
                  rows={4}
                  required
                  disabled={busy}
                />
              </label>
              <label htmlFor="cancellation-response-deadline">
                <span>Response deadline</span>
                <div className={styles.cancellationDateInput}>
                  <HiOutlineCalendarDays aria-hidden="true" />
                  <input
                    id="cancellation-response-deadline"
                    type="datetime-local"
                    value={responseDeadline}
                    min={toDateTimeLocal((nowSeconds + 60) * 1000)}
                    max={toDateTimeLocal(shipment.deadline * 1000)}
                    onChange={(event) => setResponseDeadline(event.target.value)}
                    aria-invalid={responseDeadlineAfterShipment}
                    required
                    disabled={busy}
                  />
                </div>
                {responseDeadlineAfterShipment ? (
                  <small className={styles.deadlineError} role="alert">
                    Response deadline cannot be after {formatDate(shipment.deadline)}.
                  </small>
                ) : (
                  <small>
                    New cancellation requests close 1 hour before the shipment deadline.
                    The response deadline cannot be after that shipment deadline.
                  </small>
                )}
              </label>
            </div>
            <div className={styles.cancellationFormFooter}>
              <span className={requestTooLong ? styles.wordLimitError : ''}>
                {requestWordCount}/{MAX_CANCELLATION_NOTE_WORDS} words
              </span>
              <div className={styles.cancellationFormActions}>
                <Button
                  variant="ghost"
                  onClick={() => setRequestFormOpen(false)}
                  disabled={busy}
                >
                  Keep shipment active
                </Button>
                <Button
                  variant="danger"
                  type="submit"
                  disabled={
                    busy
                    || requestWordCount === 0
                    || requestTooLong
                    || responseDeadlineAfterShipment
                  }
                >
                  {actionStage === 'requesting-cancellation'
                    ? 'Requesting...'
                    : 'Send cancellation request'}
                </Button>
              </div>
            </div>
            </form>
          ) : (
            <div className={styles.cancellationEmpty}>
              <div>
                <strong>Need to stop the shipment?</strong>
                <span>
                  Start a cancellation request with a note and response deadline. The shipment
                  continues normally while the decision is pending.
                </span>
              </div>
              <Button
                variant="secondary"
                className={styles.cancellationRequestButton}
                onClick={() => {
                  setResponseDeadline(suggestedCancellationDeadline(shipment.deadline));
                  setRequestFormOpen(true);
                }}
                disabled={busy}
              >
                Request cancellation
              </Button>
            </div>
          )
        ) : (
          <div className={styles.cancellationUnavailable} role="status">
            <HiOutlineLockClosed aria-hidden="true" />
            <div>
              <strong>Cancellation request window closed</strong>
              <span>
                New cancellation requests are not allowed during the final hour before the
                shipment deadline.
              </span>
            </div>
          </div>
        )
      ) : null}

      {history.length > 0 && (
        <details className={styles.cancellationHistory}>
          <summary>
            <span>Previous cancellation requests</span>
            <Badge tone="neutral">{history.length}</Badge>
            <HiOutlineChevronRight aria-hidden="true" />
          </summary>
          <div className={styles.cancellationHistoryList}>
            {history.map((entry) => (
              <article key={entry.id} className={styles.cancellationHistoryItem}>
                <div className={styles.cancellationHistoryHead}>
                  <div>
                    <strong>{displayParticipant(entry.requester)}</strong>
                    <span>{formatDate(entry.createdAt)}</span>
                  </div>
                  <Badge tone={cancellationStatusTone(entry.status)}>{entry.status}</Badge>
                </div>
                <p>{entry.requesterNote}</p>
                {entry.rejectionNote && (
                  <div className={styles.cancellationHistoryResponse}>
                    <strong>Response</strong>
                    <span>{entry.rejectionNote}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function DetailFact({ label, value, title }) {
  return (
    <div className={styles.detailFact}>
      <dt>{label}</dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}

function PaymentMetric({ label, value }) {
  return (
    <div className={styles.checkpointPaymentMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ShipmentContents({ items }) {
  return (
    <section className={styles.shipmentContents} aria-label="Shipment contents">
      <div className={styles.shipmentContentsHeader}>
        <HiOutlineCube aria-hidden="true" />
        <div>
          <div className={styles.summaryFieldLabel}>Shipment contents</div>
          <div className={styles.shipmentContentsMeta}>
            {items.length} item type{items.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <div className={styles.shipmentContentsList}>
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`} className={styles.shipmentContentItem}>
            <div>
              <strong>{item.name}</strong>
              {item.description && <span>{item.description}</span>}
            </div>
            <span>Qty {item.quantity}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProposalReview({
  requestId,
  proposals,
  proposedAmount,
  isShipper,
  account,
  busy,
  actionStage,
  onAccept,
  onReject,
  walletIdentities,
  onOpenCarrierReputation,
  canPropose = false,
  onPropose,
  presentation,
  showHistory = true,
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
  const proposalView = presentation?.proposalView || {
    visible: true,
    badgeLabel: activeProposals.length
      ? `${activeProposals.length} proposal${activeProposals.length === 1 ? '' : 's'} ready`
      : 'Awaiting proposals',
    badgeTone: activeProposals.length ? 'warning' : 'neutral',
    emptyLabel: isShipper ? 'Awaiting proposals' : 'Proposal needed',
    emptyTitle: isShipper ? 'Open for carrier proposals' : 'Submit a milestone plan',
    canPropose,
    actionLabel: 'Propose milestones',
  };
  const showProposalAction = canPropose && proposalView.canPropose !== false;

  return (
    <>
      <Card className={styles.proposalCard}>
        <div className={styles.proposalHeader}>
          <div>
            <div className={styles.proposalKicker}>Open request</div>
            <h2>Carrier proposals</h2>
          </div>
          <div className={styles.proposalHeaderActions}>
            <Badge tone={proposalView.badgeTone || 'neutral'} variant="outlined">
              {proposalView.badgeLabel}
            </Badge>
            {showProposalAction && (
              <Button onClick={onPropose}>{proposalView.actionLabel || 'Propose milestones'}</Button>
            )}
          </div>
        </div>

        {activeProposals.length > 1 && (
          <div className={styles.proposalControls}>
            <span>Sort proposals</span>
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
        )}

        {sortedProposals.length > 0 ? (
          <div className={styles.proposalList}>
            {sortedProposals.map((proposal) => (
              <ProposalSummaryCard
                key={proposal.id}
                proposal={proposal}
                walletIdentities={walletIdentities}
                onOpenCarrierReputation={onOpenCarrierReputation}
                onOpen={() => setSelectedProposal(proposal)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.proposalEmpty} role="status">
            <Badge tone={proposalView.badgeTone || 'neutral'} variant="outlined">
              {proposalView.emptyLabel || proposalView.badgeLabel}
            </Badge>
            <strong>{proposalView.emptyTitle || proposalView.badgeLabel}</strong>
            {proposalView.emptyDescription && <span>{proposalView.emptyDescription}</span>}
          </div>
        )}

        {showHistory && historicalProposals.length > 0 && (
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
                      <span title={proposal.carrier}>{walletIdentityLabel(proposal.carrier, walletIdentities)}</span>
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
          requestId={requestId}
          proposal={selectedProposal}
          proposedAmount={proposedAmount}
          walletIdentities={walletIdentities}
          isShipper={isShipper}
          account={account}
          busy={busy}
          actionStage={actionStage}
          onAccept={onAccept}
          onReject={onReject}
          onOpenCarrierReputation={onOpenCarrierReputation}
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </>
  );
}

function ProposalSummaryCard({ proposal, status, onOpen, walletIdentities, onOpenCarrierReputation, actionLabel = 'View proposal details' }) {
  const handleCardClick = (event) => {
    // The card is a review affordance, while the reputation and eye controls
    // keep their own actions. Pointer crossing only changes the affordance;
    // opening the review remains an explicit click or keyboard action.
    if (event.target !== event.currentTarget && event.target.closest?.('button, a, input, select, textarea')) return;
    onOpen();
  };

  const handleCardKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
  };

  return (
    <article
      className={styles.proposalSummaryCard}
      role="button"
      tabIndex={0}
      aria-label={`Review carrier proposal ${proposal.id + 1}`}
      aria-haspopup="dialog"
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className={styles.proposalSummaryIdentity}>
        <div className={styles.proposalSummaryCarrier}>
          <span className={styles.proposalCarrierLabel}>Carrier proposal #{proposal.id + 1}</span>
          <strong title={proposal.carrier}>{walletIdentityLabel(proposal.carrier, walletIdentities)}</strong>
          <CarrierReputationSummary carrier={proposal.carrier} compact onOpenProfile={onOpenCarrierReputation} />
        </div>
        {status && <span className={styles.proposalSummaryStatus}><Badge tone={proposalStatusTone(status)}>{status}</Badge></span>}
      </div>
      <div className={styles.proposalSummaryMeta}>
        <span className={styles.proposalSummaryMetric}>
          <strong>{proposal.milestones.length}</strong>
          <span>milestones</span>
        </span>
      </div>
      <button
        type="button"
        className={styles.proposalSummaryAction}
        onClick={onOpen}
        title={actionLabel}
        aria-label={actionLabel}
      >
        <HiOutlineEye aria-hidden="true" />
        <span className={styles.proposalSummaryActionLabel}>Review proposal</span>
      </button>
      <span className={styles.proposalSummaryTime}>
        Submitted {formatDate(proposal.createdAt)}
        {proposal.updatedAt > proposal.createdAt ? ` · Updated ${formatDate(proposal.updatedAt)}` : ''}
      </span>
    </article>
  );
}

function ProposalHistoryPanel({
  requestId,
  proposals,
  proposedAmount,
  walletIdentities,
  collapsedByDefault = false,
  onOpenCarrierReputation,
}) {
  const [dateSort, setDateSort] = useState('');
  const [milestoneSort, setMilestoneSort] = useState('');
  const [selectedProposal, setSelectedProposal] = useState(null);
  const sortedProposals = [...proposals].sort((a, b) => {
    const milestoneDifference = milestoneSort === 'most'
      ? b.milestones.length - a.milestones.length
      : milestoneSort === 'fewest'
        ? a.milestones.length - b.milestones.length
        : 0;
    if (milestoneDifference) return milestoneDifference;
    if (dateSort === 'oldest') return a.createdAt - b.createdAt;
    if (dateSort === 'newest') return b.createdAt - a.createdAt;
    return 0;
  });

  return (
    <>
      <div className={styles.proposalHistoryPanel}>
        {collapsedByDefault ? (
          <details className={styles.proposalHistoryDisclosure}>
            <summary>
              <span className={styles.proposalHistoryDisclosureTitle}>
                <span className={styles.proposalKicker}>Recorded on-chain</span>
                <strong>Proposal history</strong>
              </span>
              <span className={styles.proposalHistoryDisclosureMeta}>
                {proposals.length > 0 && <Badge tone="neutral">{proposals.length} recorded</Badge>}
                <HiOutlineChevronRight className={styles.proposalHistoryDisclosureChevron} aria-hidden="true" />
              </span>
            </summary>
            <div className={styles.proposalHistoryDisclosureBody}>
              <p>Review every carrier plan that was not selected for this delivery.</p>
              <ProposalHistoryContent
                proposals={proposals}
                sortedProposals={sortedProposals}
                dateSort={dateSort}
                milestoneSort={milestoneSort}
                onDateSort={setDateSort}
                onMilestoneSort={setMilestoneSort}
                onOpen={setSelectedProposal}
                walletIdentities={walletIdentities}
                onOpenCarrierReputation={onOpenCarrierReputation}
              />
            </div>
          </details>
        ) : (
          <>
            <div className={styles.proposalHeader}>
              <div>
                <div className={styles.proposalKicker}>Recorded on-chain</div>
                <h2>Proposal history</h2>
                <p>Review every carrier plan that was not selected for this delivery.</p>
              </div>
              {proposals.length > 0 && <Badge tone="neutral">{proposals.length} recorded</Badge>}
            </div>
            <ProposalHistoryContent
              proposals={proposals}
              sortedProposals={sortedProposals}
              dateSort={dateSort}
              milestoneSort={milestoneSort}
              onDateSort={setDateSort}
              onMilestoneSort={setMilestoneSort}
              onOpen={setSelectedProposal}
              walletIdentities={walletIdentities}
              onOpenCarrierReputation={onOpenCarrierReputation}
            />
          </>
        )}
      </div>

      {selectedProposal && (
        <ProposalDetailModal
          requestId={requestId}
          proposal={selectedProposal}
          proposedAmount={proposedAmount}
          walletIdentities={walletIdentities}
          isShipper={false}
          account={null}
          busy={false}
          actionStage="idle"
          onAccept={() => {}}
          onReject={() => {}}
          onOpenCarrierReputation={onOpenCarrierReputation}
          readOnly
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </>
  );
}

function ProposalHistoryContent({
  proposals,
  sortedProposals,
  dateSort,
  milestoneSort,
  onDateSort,
  onMilestoneSort,
  onOpen,
  walletIdentities,
  onOpenCarrierReputation,
}) {
  return proposals.length === 0 ? (
    <div className={styles.proposalHistoryEmpty}>No earlier carrier proposal was recorded for this request.</div>
  ) : (
    <>
            <div className={styles.proposalControls}>
              <span>Recorded proposals</span>
              {proposals.length > 1 && <div className={styles.proposalSortControls}>
                <label className={styles.proposalSortLabel}>
                  <span>Date</span>
                  <select value={dateSort} onChange={(event) => onDateSort(event.target.value)}>
                    <option value="">No date sort</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
                <label className={styles.proposalSortLabel}>
                  <span>Milestones</span>
                  <select value={milestoneSort} onChange={(event) => onMilestoneSort(event.target.value)}>
                    <option value="">No milestone sort</option>
                    <option value="most">Most first</option>
                    <option value="fewest">Fewest first</option>
                  </select>
                </label>
              </div>}
            </div>

            <div className={styles.proposalList}>
              {sortedProposals.map((proposal) => (
                <ProposalSummaryCard
                  key={proposal.id}
                  proposal={proposal}
                  status={proposal.status}
                  walletIdentities={walletIdentities}
                  onOpenCarrierReputation={onOpenCarrierReputation}
                  actionLabel="View proposal"
                  onOpen={() => onOpen(proposal)}
                />
              ))}
            </div>
    </>
  );
}

function proposalStatusTone(status) {
  if (status === 'Rejected') return 'danger';
  if (status === 'Accepted') return 'success';
  return 'neutral';
}

function ProposalDetailModal({
  requestId,
  proposal,
  proposedAmount,
  walletIdentities,
  isShipper,
  account,
  busy,
  actionStage,
  onAccept,
  onReject,
  onOpenCarrierReputation,
  readOnly = false,
  onClose,
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');
  const dialogRef = useDialogFocus({ onClose });
  const rejectionNoteWordCount = countWords(rejectionNote);
  const rejectionNoteTooLong = exceedsTextLimit(
    rejectionNote,
    MAX_PROPOSAL_REJECTION_NOTE_WORDS,
    MAX_PROPOSAL_REJECTION_NOTE_BYTES,
  );

  useEffect(() => {
    setShowRejectForm(false);
    setRejectionNote('');
  }, [proposal.id]);

  const confirmRejection = async () => {
    if (busy || rejectionNoteTooLong) return;
    const rejected = await onReject(proposal.id, rejectionNote);
    if (rejected) onClose();
  };

  return (
    <div className={styles.proposalModalOverlay} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.proposalModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.proposalPlanHeader}>
          <div>
            <span className={styles.proposalCarrierLabel}>Carrier proposal #{proposal.id + 1}</span>
            <strong id="proposal-modal-title" title={proposal.carrier}>{walletIdentityLabel(proposal.carrier, walletIdentities)}</strong>
            <span className={styles.proposalCreated}>Submitted {formatDate(proposal.createdAt)}</span>
            <CarrierReputationSummary carrier={proposal.carrier} onOpenProfile={onOpenCarrierReputation} />
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
            <div className={styles.proposalMetricTile}>
              <span>Milestones</span>
              <strong>{proposal.milestones.length}</strong>
            </div>
            <div className={styles.proposalMetricTile}>
              <span>Planned escrow</span>
              <strong>{formatCargo(proposedAmount)}</strong>
            </div>
          </div>
          <ol className={styles.proposalSteps}>
            {proposal.milestones.map((milestone, index) => (
              <li key={`${milestone.name}-${index}`} className={styles.proposalStep}>
                <span className={styles.proposalIndex}>{index + 1}</span>
                <div className={styles.proposalStepBody}>
                  <div className={styles.proposalStepHeader}>
                    <strong>{milestone.name}</strong>
                  </div>
                  <div className={styles.proposalStepMeta}>
                    <span>{milestone.payoutPercentage}% of payment</span>
                    <strong>{formatCargo(calculateProposedPayout(
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
          {proposal.status === 'Rejected' && proposal.rejectionNote && (
            <div className={styles.proposalRejectionRecord}>
              <span>Rejection note</span>
              <p>{proposal.rejectionNote}</p>
            </div>
          )}
          {showRejectForm && (
            <div className={styles.proposalRejectionForm}>
              <label htmlFor={`proposal-rejection-note-${proposal.id}`}>
                Rejection note <span>(optional)</span>
              </label>
              <p>Tell the carrier what could be changed before they submit another plan.</p>
              <textarea
                id={`proposal-rejection-note-${proposal.id}`}
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                placeholder="Explain what should be revised..."
                rows={3}
                autoFocus
              />
              <div className={styles.proposalRejectionMeta}>
                <span className={rejectionNoteTooLong ? styles.proposalRejectionError : undefined}>
                  {rejectionNoteTooLong ? 'Shorten the note before confirming.' : 'This note will be recorded on-chain.'}
                </span>
                <span>{rejectionNoteWordCount}/{MAX_PROPOSAL_REJECTION_NOTE_WORDS} words</span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.proposalActions}>
          {isShipper && (
            <ChatButton
              requestId={requestId}
              carrierWallet={proposal.carrier}
              label="Message Carrier"
              variant="secondary"
            />
          )}
          {!isShipper && account && account.toLowerCase() === proposal.carrier.toLowerCase() && (
            <ChatButton
              requestId={requestId}
              label="Message Shipper"
              variant="primary"
            />
          )}
          {isShipper && proposal.status === 'Active' && !readOnly && (
            showRejectForm ? (
              <>
                <Button variant="softNeutral" onClick={() => setShowRejectForm(false)} disabled={busy}>
                  Keep proposal
                </Button>
                <Button variant="softDanger" onClick={confirmRejection} disabled={busy || rejectionNoteTooLong}>
                  {actionStage === 'rejecting' ? 'Rejecting...' : 'Confirm rejection'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="softDanger" onClick={() => setShowRejectForm(true)} disabled={busy}>
                  Reject proposal
                </Button>
                <Button onClick={() => onAccept(proposal.id)} disabled={busy}>
                  {actionStage === 'accepting' ? 'Confirming...' : 'Accept & fund escrow'}
                </Button>
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function TimelinePanel({
  events,
  milestones,
  selectedIndex,
  onSelect,
  walletIdentities,
  onViewProof,
  proofViewerLoadingMilestoneId,
  canVerify,
  busy,
  actionStage,
  onVerify,
  canSubmitProof,
  onSubmitProof,
  onWithdrawProof,
  ratingRequestId,
  ratingCarrier,
  ratingIsShipper,
  ratingStatus,
  onRatingPublished,
  canTipCarrier,
  onFocusTip,
}) {
  const selectedEvent = events[selectedIndex] || events[0];
  const selectedMilestone = selectedEvent.milestoneId == null
    ? null
    : milestones.find((milestone) => milestone.milestoneId === selectedEvent.milestoneId);
  const hasPhotoProof = selectedMilestone?.proofUris?.length > 0;
  const [showProofRejectForm, setShowProofRejectForm] = useState(false);
  const [proofRejectionReason, setProofRejectionReason] = useState('');

  useEffect(() => {
    setShowProofRejectForm(false);
    setProofRejectionReason('');
  }, [selectedEvent?.milestoneId, selectedEvent?.status]);

  if (!selectedEvent) return <div className={styles.tabEmpty}>No timeline entries yet.</div>;

  return (
    <div className={styles.timelineWorkspace}>
      <div className={styles.timelineListContainer}>
        <div className={styles.timelineRoadmap}>
          <div className={styles.timelineTrackLine} />
          <ol className={styles.timeline}>
            {events.map((event, index) => {
              const active = index === selectedIndex;
              const eventMilestone = event.milestoneId == null
                ? null
                : milestones.find((milestone) => milestone.milestoneId === event.milestoneId);
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
                      <span className={styles.tlBriefCopy}>
                        <span className={styles.tlBriefTime}>
                          {event.timestamp ? formatDate(event.timestamp) : event.statusLabel}
                        </span>
                        <strong className={styles.tlBriefTitle}>{event.label}</strong>
                      </span>
                      {eventMilestone && (
                        <span className={styles.tlEscrowAllocation}>
                          <span>Escrow allocation</span>
                          <strong>{formatCargo(milestoneEscrowAllocation(eventMilestone))}</strong>
                          <small>
                            {eventMilestone.addedByAmendment
                              ? 'Amendment funded'
                              : `${eventMilestone.payoutPercentage}% payout`}
                          </small>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {ratingRequestId && ratingCarrier && ratingStatus === 'Completed' && (
          <>
            <CarrierRatingPanel
              requestId={ratingRequestId}
              carrier={ratingCarrier}
              isShipper={ratingIsShipper}
              status={ratingStatus}
              onRatingPublished={onRatingPublished}
            />
            {canTipCarrier && (
              <section className={styles.tipTimelineCta} aria-labelledby="carrier-tip-cta-title">
                <span className={styles.tipTimelineIcon} aria-hidden="true"><HiOutlineGift /></span>
                <div>
                  <span className={styles.tipTimelineKicker}>Delivery complete</span>
                  <strong id="carrier-tip-cta-title">Thank the carrier</strong>
                  <p>Send one optional tip directly to the carrier.</p>
                </div>
                <Button onClick={onFocusTip}>Add a tip <HiOutlineArrowRight aria-hidden="true" /></Button>
              </section>
            )}
          </>
        )}
      </div>

      <div className={styles.timelineSidebar}>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarHeader}>
            <Badge tone={timelineTone(selectedEvent.status)}>{selectedEvent.statusLabel}</Badge>
            <h3 className={styles.sidebarTitle}>{selectedEvent.label}</h3>
          </div>
          <div className={styles.sidebarBody}>
            {selectedMilestone ? (
              <section
                className={`${styles.sidebarCheckpoint} ${
                  selectedMilestone.addedByAmendment
                    ? styles.sidebarFundedCheckpoint
                    : styles.sidebarOriginalCheckpoint
                }`}
              >
                <div className={styles.sidebarCheckpointHeader}>
                  <span className={styles.sidebarCheckpointIcon} aria-hidden="true">
                    {selectedMilestone.addedByAmendment ? <HiOutlinePlus /> : <HiOutlineCube />}
                  </span>
                  <div>
                    <span className={styles.sidebarLabel}>Checkpoint details</span>
                    <strong>
                      {selectedMilestone.addedByAmendment
                        ? 'New funded checkpoint'
                        : 'Original milestone checkpoint'}
                    </strong>
                  </div>
                </div>
                <p>
                  {selectedMilestone.addedByAmendment
                    ? 'Added through an accepted agreement change and funded separately from the original milestone plan.'
                    : 'Part of the original accepted milestone plan and funded from the initial escrow.'}
                </p>
                <div className={styles.sidebarCheckpointAmount}>
                  <span>{checkpointPaymentState(selectedMilestone.status)}</span>
                  <strong>
                    {formatCargo(
                      selectedMilestone.payoutAmount
                        + selectedMilestone.additionalPayoutAmount,
                    )}
                  </strong>
                </div>
                {selectedMilestone.status !== 'Paid' && (
                  <p className={styles.sidebarCheckpointUpdate}>
                    {firstMeaningfulRemark(selectedMilestone.remark, selectedMilestone.rejectionReason)
                      || milestoneDescription(selectedMilestone.status)}
                  </p>
                )}
              </section>
            ) : (
              <div className={styles.sidebarField}>
                <span className={styles.sidebarLabel}>Checkpoint details</span>
                <p className={styles.sidebarDesc}>{selectedEvent.details}</p>
              </div>
            )}
            {selectedEvent.actor && (
              <div className={styles.sidebarField}>
                <span className={styles.sidebarLabel}>Actor</span>
                <span className={styles.sidebarValueAddress} title={selectedEvent.actor}>
                  {walletIdentityLabel(selectedEvent.actor, walletIdentities)}
                </span>
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
                  disabled={busy || proofViewerLoadingMilestoneId === selectedMilestone.milestoneId}
                  onClick={() => onViewProof(selectedMilestone)}
                >
                  {proofViewerLoadingMilestoneId === selectedMilestone.milestoneId ? 'Authorising proof…' : 'Review photo proof'}
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
                  reimbursed={Boolean(selectedMilestone?.proofSubmissionReimbursed)}
                />
              )}
            {selectedEvent.status === 'pending' && canVerify && (
              <div className={styles.sidebarVerifyPanel}>
                <span className={styles.sidebarLabel}>Shipper verification required</span>
                <p className={styles.sidebarVerifyHint}>
                  Approve to release {formatCargo(
                    selectedMilestone
                      ? selectedMilestone.payoutAmount + selectedMilestone.additionalPayoutAmount
                      : 0n,
                  )} to the carrier, or explain what needs to be corrected.
                </p>
                {showProofRejectForm && (
                  <div className={styles.proofRejectionForm}>
                    <label htmlFor={`proof-rejection-${selectedEvent.milestoneId}`}>
                      Reason for rejection
                    </label>
                    <textarea
                      id={`proof-rejection-${selectedEvent.milestoneId}`}
                      value={proofRejectionReason}
                      onChange={(event) => setProofRejectionReason(event.target.value)}
                      placeholder="Tell the carrier what to retake or clarify..."
                      rows={3}
                      autoFocus
                    />
                    <span className={styles.proofRejectionMeta}>
                      This reason is recorded on-chain and shown on resubmission.
                    </span>
                  </div>
                )}
                <div className={styles.actionRow}>
                  {showProofRejectForm ? (
                    <>
                      <Button
                        size="sm"
                        variant="softNeutral"
                        disabled={busy}
                        onClick={() => {
                          setShowProofRejectForm(false);
                          setProofRejectionReason('');
                        }}
                      >
                        Keep reviewing
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy || !proofRejectionReason.trim()}
                        onClick={() => onVerify(selectedEvent.milestoneId, false, proofRejectionReason)}
                      >
                        Reject proof
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => onVerify(selectedEvent.milestoneId, true)}
                      >
                        Approve proof & release
                      </Button>
                      <Button
                        size="sm"
                        variant="softDanger"
                        disabled={busy}
                        onClick={() => setShowProofRejectForm(true)}
                      >
                        Request correction
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            {selectedEvent.status === 'pending' && canSubmitProof && hasPhotoProof && (
              <div className={styles.sidebarVerifyPanel}>
                <span className={styles.sidebarLabel}>Proof submitted</span>
                <p className={styles.sidebarVerifyHint}>Withdraw this proof before shipper review if you need to replace the image.</p>
                <p className={styles.proofLimitText}>{selectedMilestone.proofWithdrawalsThisRound} of 5 withdrawals used this review round.</p>
                {selectedMilestone.proofWithdrawalsThisRound === 4 && <p className={styles.reserveWarning}>This is your last withdrawal until the shipper rejects a submitted proof.</p>}
                {selectedMilestone.proofWithdrawalsThisRound >= 5 && <p className={styles.reserveWarning}>Withdrawal limit reached. The shipper can still review this submitted proof.</p>}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || selectedMilestone.proofWithdrawalsThisRound >= 5}
                  onClick={() => onWithdrawProof(selectedMilestone.milestoneId)}
                >
                  {busy && actionStage === 'withdrawing-proof' ? 'Withdrawing…' : 'Withdraw proof'}
                </Button>
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

export function ProofSubmitBox({ milestoneId, rejected, busy, onSubmit, reimbursed = false }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [remark, setRemark] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const remarkInputId = useId();

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  const chooseFile = (file) => {
    const nextError = proofFileError(file);
    setFileError(nextError);
    setSelectedFile(nextError ? null : file);
  };

  const handleSubmit = async () => {
    if (!selectedFile || fileError) return;
    const success = await onSubmit(milestoneId, selectedFile, remark);
    if (success) {
      setSelectedFile(null);
      setFileError('');
      setRemark('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  return (
    <div className={`${styles.sidebarVerifyPanel} ${styles.proofSubmitPanel}`}>
      <span className={styles.sidebarLabel}>
        {rejected ? 'Resubmit proof for this milestone' : 'Carrier checkpoint update'}
      </span>
      <label htmlFor={fileInputId} className={styles.proofDropzone}>
        <HiOutlinePhoto className={styles.proofDropzoneIcon} aria-hidden="true" />
        <span>{selectedFile ? 'Replace photo' : 'Choose photo proof'}</span>
        <small id={`${fileInputId}-hint`}>{selectedFile ? selectedFile.name : 'Use a well-lit image where the package is visible. JPEG, PNG, WebP, GIF, AVIF, or BMP · maximum 2 MB.'}</small>
        <input
          ref={fileInputRef}
          id={fileInputId}
          className={styles.proofFileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp"
          disabled={busy}
          onChange={(event) => chooseFile(event.target.files?.[0])}
          aria-describedby={`${fileInputId}-hint`}
        />
      </label>
      {fileError && <span className={styles.proofUploadError} role="alert">{fileError}</span>}
      {previewUrl && selectedFile && (
        <div className={styles.proofPreview}>
          <img src={previewUrl} alt={`Preview of ${selectedFile.name}`} />
          <span>{Math.ceil(selectedFile.size / 1024)} KB ready to submit</span>
        </div>
      )}
      <div className={styles.proofRemarkField}>
        <label htmlFor={remarkInputId}>Carrier remark <span>(optional)</span></label>
        <textarea
          id={remarkInputId}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder="Add context for the shipper, such as handover time or packaging condition."
          rows={2}
          disabled={busy}
        />
      </div>
      <Button size="sm" disabled={busy || !selectedFile || Boolean(fileError)} onClick={handleSubmit}>
        {rejected ? 'Resubmit photo proof' : 'Submit photo proof'}
      </Button>
      <p className={styles.proofReimbursementNote}>{reimbursed
        ? 'Gas-reimbursement already used'
        : 'Eligible for gas-reimbursement'}</p>
    </div>
  );
}

function ProofUploadProgressModal({ stage }) {
  const dialogRef = useDialogFocus({ onClose: () => {} });
  const content = {
    'authorizing-proof': {
      title: 'Sign in to authorise encrypted upload',
      body: 'Confirm the wallet signature in MetaMask. No gas fee is charged.',
    },
    'uploading-proof': {
      title: 'Encrypting and uploading proof',
      body: 'Your image is encrypted before upload. Keep this page open.',
    },
    'confirming-proof': {
      title: 'Confirm proof transaction in MetaMask',
      body: 'Upload complete. Confirm the on-chain proof submission.',
    },
    'waiting-proof-confirmation': {
      title: 'Waiting for on-chain confirmation',
      body: 'Your proof has been submitted to the network.',
    },
  }[stage];

  if (!content) return null;
  return (
    <div className={styles.proofProgressScrim} role="presentation">
      <section ref={dialogRef} className={styles.proofProgressModal} role="dialog" aria-modal="true" aria-labelledby="proof-progress-title" aria-describedby="proof-progress-description">
        <span className={styles.proofProgressSpinner} aria-hidden="true" />
        <h2 id="proof-progress-title">{content.title}</h2>
        <p id="proof-progress-description">{content.body}</p>
      </section>
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
              key={`${milestone.milestoneId}-${proofIndex}`}
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
  const parsedProof = parseProofUri(proofUri);
  const imageUrl = parsedProof.kind === 'legacy' ? parsedProof.url : '';
  const proofHash = parsedProof.kind === 'ipfs'
    ? parsedProof.plaintextSha256
    : (() => {
      try {
        return new URL(imageUrl).searchParams.get('sha256') || '';
      } catch {
        return '';
      }
    })();

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
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={`Proof ${proofIndex + 1} for ${milestone.name}`}
            className={styles.proofImage}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.proofImageError}>
            <HiOutlineExclamationCircle aria-hidden="true" />
            <span>{parsedProof.kind === 'ipfs'
              ? 'Encrypted proof — open Review photo proof'
              : 'Photo could not be loaded'}</span>
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

        {hasRemarks(milestone.remark) && (
          <div className={styles.proofRemark}>
            <span className={styles.proofCardLabel}>
              Carrier remark
            </span>

            <p>{String(milestone.remark).trim()}</p>
          </div>
        )}

        {milestone.submittedAt > 0 && (
          <div className={styles.proofSubmittedTime}>
            Submitted {formatDate(milestone.submittedAt)}
          </div>
        )}

        <div className={styles.proofActions}>
          {imageUrl && (
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.proofActionLink}
            >
              View full image
            </a>
          )}

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

export function ProofViewerModal({
  milestone,
  onClose,
  requestId,
  accessToken,
  gatewayBases,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const closeRef = useRef(null);
  const proofUris = milestone.proofUris || [];
  const hasMultipleProofs = proofUris.length > 1;
  const proofUri = proofUris[activeIndex];
  const parsedProof = parseProofUri(proofUri);
  const legacyImageUrl = parsedProof.kind === 'legacy' ? parsedProof.url : '';
  const gatewayKey = (gatewayBases || []).join('|');
  const focusedDialogRef = useDialogFocus({
    onClose,
    initialFocusRef: closeRef,
  });

  useEffect(() => {
    let active = true;
    let cleanup = null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    setImageFailed(false);
    setImageError('');
    setImageUrl('');

    if (!proofUri) {
      setImageLoading(false);
      return () => controller?.abort();
    }
    if (parsedProof.kind === 'legacy') {
      setImageLoading(true);
      return () => controller?.abort();
    }
    if (parsedProof.kind !== 'ipfs') {
      setImageLoading(false);
      setImageFailed(true);
      setImageError(parsedProof.error || 'This proof reference is invalid.');
      return () => controller?.abort();
    }
    if (!requestId || !accessToken) {
      setImageLoading(false);
      setImageFailed(true);
      setImageError('Wallet sign-in is required to view this encrypted proof.');
      return () => controller?.abort();
    }

    setImageLoading(true);
    loadEncryptedProof(proofUri, {
      requestId,
      milestoneId: milestone.milestoneId,
      token: accessToken,
      gatewayBases,
      signal: controller?.signal,
    }).then((result) => {
      if (!active) {
        result.cleanup();
        return;
      }
      cleanup = result.cleanup;
      setImageUrl(result.objectUrl);
      setImageLoading(false);
    }).catch((error) => {
      if (!active || error?.name === 'AbortError') return;
      setImageLoading(false);
      setImageFailed(true);
      setImageError(error?.message || 'Encrypted proof could not be loaded.');
    });

    return () => {
      active = false;
      controller?.abort();
      cleanup?.();
    };
  }, [proofUri, requestId, accessToken, milestone.milestoneId, gatewayKey]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft' && hasMultipleProofs) {
        setImageFailed(false);
        setImageLoading(true);
        setActiveIndex((index) => (index - 1 + proofUris.length) % proofUris.length);
      }
      if (event.key === 'ArrowRight' && hasMultipleProofs) {
        setImageFailed(false);
        setImageLoading(true);
        setActiveIndex((index) => (index + 1) % proofUris.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasMultipleProofs, proofUris.length]);

  const move = (direction) => {
    setImageFailed(false);
    setImageLoading(true);
    setActiveIndex((index) => (index + direction + proofUris.length) % proofUris.length);
  };

  return (
    <div
      className={styles.proofViewerScrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={focusedDialogRef}
        className={styles.proofViewerDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proof-viewer-title"
      >
        <header className={styles.proofViewerHeader}>
          <div>
            <span className={styles.proofCardLabel}>Photo proof</span>
            <h2 id="proof-viewer-title">{milestone.name}</h2>
          </div>
          <button ref={closeRef} type="button" className={styles.proofViewerClose} onClick={onClose} aria-label="Close proof viewer">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <div className={styles.proofViewerBody}>
          {imageLoading && !imageFailed && (
            <div className={styles.proofViewerLoading} role="status">Loading photo proof…</div>
          )}
          {(legacyImageUrl || imageUrl) && !imageFailed ? (
            <img
              src={legacyImageUrl || imageUrl}
              alt={`Photo proof attempt ${activeIndex + 1} for ${milestone.name}`}
              className={styles.proofViewerImage}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageFailed(true);
              }}
            />
          ) : !imageLoading ? (
            <div className={styles.proofViewerError}>
              <HiOutlineExclamationCircle aria-hidden="true" />
              <span>{proofUris.length ? (imageError || 'Photo could not be loaded') : 'No photo proof is available'}</span>
            </div>
          ) : null}
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
          <span>Attempt {proofUris.length ? activeIndex + 1 : 0} of {proofUris.length}</span>
          {(legacyImageUrl || imageUrl) && <a href={legacyImageUrl || imageUrl} target="_blank" rel="noreferrer">Open full image</a>}
        </footer>
      </section>
    </div>
  );
}

function EscrowActivityPanel({
  shipment,
  isShipper,
  busy,
  actionStage,
  onTip,
  onTopUp,
  account,
  cargoToken,
  cargoBalance,
  onTopUpCargo,
}) {
  const [tipAmountEth, setTipAmountEth] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpBalance, setTopUpBalance] = useState(null);
  const tipInputRef = useRef(null);
  const canTip = isShipper && shipment.status === 'Completed' && shipment.tipAmount === 0n;
  const amendmentFunding = shipment.escrow > shipment.proposedAmount
    ? shipment.escrow - shipment.proposedAmount
    : 0n;

  const submitTip = async (event) => {
    event.preventDefault();
    const sent = await onTip(tipAmountEth);
    if (sent) setTipAmountEth('');
  };
  const openTopUp = async () => {
    setTopUpOpen(true);
    setTopUpBalance(null);
    if (cargoToken && account) {
      try { setTopUpBalance(BigInt(await cargoToken.balanceOf(account))); } catch { setTopUpBalance(null); }
    }
  };
  const eligibleProofs = shipment.milestones.filter((milestone) => !milestone.proofSubmissionReimbursed && milestone.status !== 'Paid').length;
  const topUpValue = parseOptionalCargo(topUpAmount);

  return (
    <div className={styles.paymentsPanel}>
      <details className={styles.escrowDisclosure}>
      <summary className={styles.paymentsHeader}>
        <div>
          <div className={styles.paymentsHeaderTitle}>Escrow activity</div>
          <div className={styles.paymentsHeaderBody}>
            {escrowActivitySummary(shipment)}
          </div>
        </div>
        <HiOutlineChevronRight className={styles.escrowChevron} aria-hidden="true" />
      </summary>
      <div className={styles.escrowDisclosureBody}>
      <PaymentRow
        label={shipment.escrow > 0n ? 'Original escrow' : 'Planned payment'}
        value={formatCargo(shipment.proposedAmount)}
      />
      {amendmentFunding > 0n && <PaymentRow label="Added through amendments" value={formatCargo(amendmentFunding)} />}
      <PaymentRow label="Current funded escrow" value={formatCargo(shipment.escrow)} />
      <PaymentRow label="Released so far" value={formatCargo(shipment.released)} />
      {shipment.refunded > 0n && <PaymentRow label="Refunded" value={formatCargo(shipment.refunded)} />}
      <PaymentRow label="Remaining escrow" value={formatCargo(shipment.remaining)} />
      {shipment.operationalAllowance > 0n && (
        <>
          <PaymentRow label="Reserve funded" value={formatCargo(shipment.operationalAllowance)} />
          <PaymentRow label="Gas reimbursed to carrier" value={formatCargo(shipment.operationalReimbursed)} />
          <PaymentRow label="Returned to shipper" value={formatCargo(shipment.operationalReturned)} />
          <PaymentRow label="Reserve remaining" value={formatCargo(shipment.operationalRemaining)} />
        </>
      )}
      {isShipper && ['Funded', 'InProgress'].includes(shipment.status) && (
        <Button size="sm" variant="secondary" onClick={openTopUp} disabled={busy}>Add reserve</Button>
      )}
      {shipment.tipAmount > 0n && (
        <PaymentRow label="Completion tip" value={formatCargo(shipment.tipAmount)} />
      )}
      </div>
      </details>

      {(canTip || shipment.tipAmount > 0n) && (
        <section
          id="carrier-tip-card"
          className={styles.tipCard}
          aria-labelledby="carrier-tip-title"
          tabIndex={shipment.tipAmount > 0n ? -1 : undefined}
        >
          <div className={styles.tipCardIcon} aria-hidden="true">
            <HiOutlineGift />
          </div>
          <div className={styles.tipCardContent}>
            <div className={styles.tipCardHeading}>
              <div>
                <h3 id="carrier-tip-title">
                  {shipment.tipAmount > 0n
                    ? isShipper ? 'Carrier thanked' : 'Shipper tipped'
                    : 'Thank the carrier'}
                </h3>
                <p>
                  {shipment.tipAmount > 0n
                    ? isShipper
                      ? `${formatCargo(shipment.tipAmount)} was sent directly to the carrier.`
                      : `${formatCargo(shipment.tipAmount)} was tipped directly by the shipper.`
                    : 'Send one optional tip directly to the carrier after successful delivery.'}
                </p>
              </div>
              {shipment.tipAmount > 0n && (
                <Badge tone="success">{isShipper ? 'Tip sent' : 'Tip received'}</Badge>
              )}
            </div>
            {canTip && (
              <form className={styles.tipForm} onSubmit={submitTip}>
                <label htmlFor="carrier-tip-amount">Tip amount</label>
                <div className={styles.tipInputRow}>
                  <div className={styles.tipInputWrap}>
                    <input
                      id="carrier-tip-amount"
                      ref={tipInputRef}
                      type="text"
                      inputMode="decimal"
                      value={tipAmountEth}
                      onChange={(event) => setTipAmountEth(event.target.value)}
                      placeholder="0.01"
                      aria-describedby="carrier-tip-help"
                      disabled={busy}
                    />
                    <span>C.</span>
                  </div>
                  <Button type="submit" disabled={busy || !tipAmountEth.trim()}>
                    {actionStage === 'tipping' ? 'Sending tip...' : 'Send one-time tip'}
                  </Button>
                </div>
                <AvailableCargoBalance
                  balance={cargoBalance}
                  requiredAmount={parseOptionalCargo(tipAmountEth)}
                  onTopUp={onTopUpCargo}
                />
                <p id="carrier-tip-help" className={styles.tipHelp}>
                  This is a separate, irreversible wallet payment and does not enter escrow.
                </p>
              </form>
            )}
          </div>
        </section>
      )}
      {topUpOpen && (
        <BrandedModal title="Add gas reserve" description="Add refundable CARGO coverage for future eligible proof submissions." Icon={HiOutlineCreditCard} onClose={() => !busy && setTopUpOpen(false)} busy={busy} footer={<><Button variant="secondary" onClick={() => setTopUpOpen(false)} disabled={busy}>Cancel</Button><Button onClick={async () => { const added = await onTopUp(topUpAmount); if (added) { setTopUpAmount(''); setTopUpOpen(false); } }} disabled={busy || topUpValue <= 0n}>{actionStage === 'topping-up-allowance' ? 'Adding…' : 'Confirm top-up'}</Button></>}>
          <div className={styles.reserveReferenceGrid}>
            <PaymentRow label="Reserve funded" value={formatCargo(shipment.operationalAllowance)} />
            <PaymentRow label="Gas reimbursed to carrier" value={formatCargo(shipment.operationalReimbursed)} />
            <PaymentRow label="Returned to shipper" value={formatCargo(shipment.operationalReturned)} />
            <PaymentRow label="Reserve remaining" value={formatCargo(shipment.operationalRemaining)} />
            <PaymentRow label="Eligible proofs remaining" value={String(eligibleProofs)} />
            <PaymentRow label="Available CARGO" value={topUpBalance == null ? 'Unavailable' : formatCargo(topUpBalance)} />
          </div>
          <label className={styles.reserveInputLabel} htmlFor="operational-reserve-amount">Additional reserve</label>
          <div className={styles.tipInputWrap}><input id="operational-reserve-amount" inputMode="decimal" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} placeholder="0.00" disabled={busy} /><span>C.</span></div>
          <AvailableCargoBalance
            balance={topUpBalance ?? cargoBalance}
            requiredAmount={topUpValue}
            onTopUp={onTopUpCargo}
          />
          <PaymentRow label="Reserve after top-up" value={formatCargo(shipment.operationalRemaining + topUpValue)} />
          {shipment.amendments.some((amendment) => amendment.status === 'Pending') && <p className={styles.reserveWarning}>Increasing gas coverage makes the current pending amendment stale. Withdraw it and submit a fresh quote after this top-up.</p>}
          <p className={styles.fundingExplanation}>This reserve does not increase milestone compensation. Unused funds return to the shipper when the shipment settles.</p>
        </BrandedModal>
      )}
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

function AvailableCargoBalance({ balance, requiredAmount = 0n, onTopUp }) {
  const required = BigInt(requiredAmount || 0n);
  const shortfall = balance != null && required > balance ? required - balance : 0n;
  return (
    <span className={styles.availableBalance}>
      {shortfall > 0n ? (
        <span className={styles.shortfallNote}>Need {formatCargo(shortfall)} more</span>
      ) : balance == null ? 'Available C.: Loading…' : `Available C.: ${formatCargo(balance)}`}
      {shortfall > 0n && onTopUp && (
        <button type="button" className={styles.inlineTopUpButton} onClick={() => onTopUp(required)}>
          Top up
        </button>
      )}
    </span>
  );
}

function CargoTopUpModal({
  suggestedCargo,
  cargoBalance,
  ethBalance,
  busy,
  onClose,
  onConfirm,
}) {
  const suggestedIsConvertible = suggestedCargo > 0n && suggestedCargo % 10_000n === 0n;
  const [cargoText, setCargoText] = useState(() => (
    suggestedIsConvertible ? formatEditableAmount(suggestedCargo) : ''
  ));
  const [ethText, setEthText] = useState(() => (
    suggestedIsConvertible ? formatEditableAmount(suggestedCargo / 10_000n) : ''
  ));
  const [error, setError] = useState('');

  useEffect(() => {
    const convertible = suggestedCargo > 0n && suggestedCargo % 10_000n === 0n;
    setCargoText(convertible ? formatEditableAmount(suggestedCargo) : '');
    setEthText(convertible ? formatEditableAmount(suggestedCargo / 10_000n) : '');
    setError('');
  }, [suggestedCargo]);

  const updateFromCargo = (value) => {
    setCargoText(value);
    setError('');
    if (!value.trim()) {
      setEthText('');
      return;
    }
    try {
      const cargoWei = parseEther(value.trim());
      if (cargoWei <= 0n || cargoWei % 10_000n !== 0n) throw new Error();
      setEthText(formatEditableAmount(cargoWei / 10_000n));
    } catch {
      setEthText('');
      setError('Enter a positive C. amount that converts exactly at the fixed rate.');
    }
  };

  const updateFromEth = (value) => {
    setEthText(value);
    setError('');
    if (!value.trim()) {
      setCargoText('');
      return;
    }
    try {
      const ethWei = parseEther(value.trim());
      if (ethWei <= 0n) throw new Error();
      setCargoText(formatEditableAmount(ethWei * 10_000n));
    } catch {
      setCargoText('');
      setError('Enter a positive ETH amount.');
    }
  };

  const confirm = async () => {
    try {
      const ethWei = parseEther(ethText.trim());
      const cargoWei = parseEther(cargoText.trim());
      if (ethWei <= 0n || cargoWei <= 0n || cargoWei !== ethWei * 10_000n) throw new Error();
      if (ethBalance != null && ethWei >= ethBalance) {
        setError('Keep enough ETH available to pay the transaction gas.');
        return;
      }
      await onConfirm({ ethWei, cargoWei });
    } catch {
      setError('Enter a positive amount to continue.');
    }
  };

  return (
    <BrandedModal
      title="Top up C."
      description="Add C. without leaving your current shipment form."
      Icon={HiOutlineCreditCard}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || !cargoText || !ethText}>
            {busy ? 'Topping up…' : 'Confirm top-up'}
          </Button>
        </>
      )}
    >
      <div className={styles.cargoTopUpForm}>
        <label htmlFor="inline-cargo-top-up-amount">CARGO you receive</label>
        <div className={styles.tipInputWrap}>
          <input id="inline-cargo-top-up-amount" inputMode="decimal" value={cargoText} onChange={(event) => updateFromCargo(event.target.value)} placeholder="0.00" disabled={busy} />
          <span>C.</span>
        </div>
        <span className={styles.availableBalance}>
          {cargoBalance == null ? 'C. balance: Loading…' : `C. balance: ${formatCargo(cargoBalance)}`}
        </span>
        <span className={styles.cargoTopUpExchange} aria-hidden="true">↓</span>
        <label htmlFor="inline-eth-top-up-amount">ETH you pay</label>
        <div className={styles.tipInputWrap}>
          <input id="inline-eth-top-up-amount" inputMode="decimal" value={ethText} onChange={(event) => updateFromEth(event.target.value)} placeholder="0.00" disabled={busy} />
          <span>ETH</span>
        </div>
        <span className={styles.availableBalance}>
          {ethBalance == null ? 'Available ETH: Loading…' : `Available ETH: ${formatEth(ethBalance)}`}
        </span>
        {error && <span className={styles.cargoTopUpError} role="alert">{error}</span>}
      </div>
      <p className={styles.cargoTopUpRate}>Fixed rate: 1 ETH = 10,000 C. Network gas is paid separately in ETH.</p>
    </BrandedModal>
  );
}

function escrowActivitySummary(shipment) {
  if (shipment.escrow <= 0n) return `${formatCargo(shipment.proposedAmount)} is planned but not funded yet.`;
  return `${formatCargo(shipment.remaining)} locked · ${formatCargo(shipment.released)} distributed · ${formatCargo(shipment.operationalRemaining)} reserved · ${formatCargo(shipment.operationalReimbursed)} gas reimbursed.`;
}

function parseOptionalCargo(value) {
  try { return String(value || '').trim() ? parseEther(String(value).trim()) : 0n; } catch { return 0n; }
}

function formatEditableAmount(value) {
  return formatEther(value).replace(/\.0$/, '');
}

function receiptEventAmount(receipt, contract, eventName) {
  for (const log of receipt?.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return BigInt(parsed.args?.amount ?? 0n);
    } catch { /* Log belongs to another contract. */ }
  }
  return 0n;
}

function lifecycleStateClass(state) {
  if (state === 'complete') return styles.lifecycleComplete;
  if (state === 'current') return styles.lifecycleCurrent;
  if (state === 'failed/cancelled') return styles.lifecycleFailed;
  return styles.lifecycleUpcoming;
}

export function visibleOpenProposalsFor(proposals = [], account = '', shipper = '') {
  const wallet = String(account || '').toLowerCase();
  if (!wallet) return [];
  if (wallet === String(shipper || '').toLowerCase()) return proposals;
  return proposals.filter((proposal) => (
    String(proposal?.carrier || '').toLowerCase() === wallet
  ));
}

export function shipmentLoadView({ loading, shipment, error, deployError } = {}) {
  if (loading && !shipment) return 'loading';
  if (shipment) return 'ready';
  if (deployError || error) return 'error';
  return 'empty';
}

export function proofFileError(file) {
  return validateProofFile(file);
}

async function loadShipment(deliveryEscrow, lifecycleManager, idParam) {
  const requestId = BigInt(idParam);
  const [
    request,
    milestoneResult,
    proposalResult,
    itemResult,
    tipAmountResult,
    paymentSummary,
    cancellationResult,
    amendmentResult,
    reimbursementLogs,
    reserveRefundLogs,
  ] = await Promise.all([
    deliveryEscrow.getRequest(requestId),
    deliveryEscrow.getMilestones(requestId),
    deliveryEscrow.getProposals(requestId),
    deliveryEscrow.getItems(requestId),
    deliveryEscrow.tipAmounts(requestId),
    deliveryEscrow.getPaymentSummary(requestId),
    lifecycleManager.getCancellationRequests(requestId),
    lifecycleManager.getAmendmentRequests(requestId),
    deliveryEscrow.filters?.OperationalAllowanceReimbursed
      ? deliveryEscrow.queryFilter(deliveryEscrow.filters.OperationalAllowanceReimbursed(requestId))
      : Promise.resolve([]),
    deliveryEscrow.filters?.OperationalAllowanceRefunded
      ? deliveryEscrow.queryFilter(deliveryEscrow.filters.OperationalAllowanceRefunded(requestId))
      : Promise.resolve([]),
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
  const operationalAllowance = BigInt(
    paymentSummary?.operationalAllowance ?? request.operationalAllowance ?? request[13] ?? 0n,
  );
  const operationalSpent = BigInt(
    paymentSummary?.operationalSpent ?? request.operationalSpent ?? request[14] ?? 0n,
  );
  const operationalRemaining = BigInt(
    paymentSummary?.operationalRemaining
      ?? (operationalAllowance > operationalSpent ? operationalAllowance - operationalSpent : 0n),
  );
  const operationalReimbursed = Array.from(reimbursementLogs || []).reduce((total, log) => total + BigInt(log.args?.amount ?? log.args?.[3] ?? 0n), 0n);
  const operationalReturned = Array.from(reserveRefundLogs || []).reduce((total, log) => total + BigInt(log.args?.amount ?? log.args?.[2] ?? 0n), 0n);
  const milestones = Array.from(milestoneResult || []).map((milestone, index) => ({
    index,
    milestoneId: Number(milestone.milestoneId ?? milestone[11] ?? index),
    name: milestone.name ?? milestone[0],
    payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
    payoutAmount: BigInt(milestone.payoutAmount ?? milestone[2] ?? 0n),
    proofUris: Array.from(milestone.proofUris ?? milestone[3] ?? []),
    remark: milestone.remark ?? milestone[4] ?? '',
    rejectionReason: milestone.rejectionReason ?? milestone[5] ?? '',
    status: MILESTONE_STATUS[Number(milestone.status ?? milestone[6])] || 'Unknown',
    submittedAt: Number(milestone.submittedAt ?? milestone[7] ?? 0n),
    verifiedAt: Number(milestone.verifiedAt ?? milestone[8] ?? 0n),
     additionalPayoutAmount: BigInt(
       milestone.additionalPayoutAmount ?? milestone[9] ?? 0n,
     ),
     addedByAmendment: Boolean(milestone.addedByAmendment ?? milestone[10] ?? false),
     proofSubmissionNumber: Number(milestone.proofSubmissionNumber ?? milestone[12] ?? 0n),
     proofWithdrawalsThisRound: Number(milestone.proofWithdrawalsThisRound ?? milestone[13] ?? 0n),
     submittedAfterRejection: Boolean(milestone.submittedAfterRejection ?? milestone[14] ?? false),
     proofSubmissionReimbursed: Boolean(milestone.proofSubmissionReimbursed ?? milestone[15] ?? false),
   }));
  const proposals = await Promise.all(Array.from(proposalResult || []).map(async (proposal, id) => {
    const proposalMilestoneResult = await deliveryEscrow.getProposalMilestones(requestId, id);
    return {
      id,
      carrier: proposal.carrier ?? proposal[0],
      status: PROPOSAL_STATUS[Number(proposal.status ?? proposal[1])] || 'Unknown',
      createdAt: Number(proposal.createdAt ?? proposal[2] ?? 0n),
      updatedAt: Number(proposal.updatedAt ?? proposal[3] ?? 0n),
      rejectionNote: proposal.rejectionNote ?? proposal[4] ?? '',
      milestones: Array.from(proposalMilestoneResult || []).map((milestone) => ({
        name: milestone.name ?? milestone[0],
        payoutPercentage: Number(milestone.payoutPercentage ?? milestone[1]),
      })),
    };
  }));
  const items = Array.from(itemResult || []).map((item) => ({
    name: item.itemName ?? item[0],
    description: item.itemDescription ?? item[1],
    quantity: Number(item.quantity ?? item[2] ?? 0),
  }));
  const cancellations = Array.from(cancellationResult || []).map((cancellation, index) => ({
    id: index,
    requester: cancellation.requester ?? cancellation[0],
    responder: cancellation.responder ?? cancellation[1],
    requesterNote: cancellation.requesterNote ?? cancellation[2] ?? '',
    rejectionNote: cancellation.rejectionNote ?? cancellation[3] ?? '',
    responseDeadline: Number(cancellation.responseDeadline ?? cancellation[4] ?? 0n),
    status: CANCELLATION_STATUS[Number(cancellation.status ?? cancellation[5])] || 'Unknown',
    createdAt: Number(cancellation.createdAt ?? cancellation[6] ?? 0n),
    resolvedAt: Number(cancellation.resolvedAt ?? cancellation[7] ?? 0n),
  }));
  const amendments = await Promise.all(Array.from(amendmentResult || []).map(
    async (amendment, index) => {
      const [existingResult, newResult] = await Promise.all([
        lifecycleManager.getAmendmentExistingFunding(requestId, index),
        lifecycleManager.getAmendmentNewMilestones(requestId, index),
      ]);
      const positional = Array.from(amendment || []);
      const expandedDeadlineCandidate = Number(amendment[5] ?? 0n);
      const expandedStatusCandidate = Number(amendment[8] ?? -1);
      const expandedHistoryRecord = positional.length >= 12
        && expandedDeadlineCandidate >= 1_000_000_000
        && expandedDeadlineCandidate <= 10_000_000_000
        && expandedStatusCandidate >= 0
        && expandedStatusCandidate < AMENDMENT_STATUS.length;
      return {
        id: index,
        requester: amendment.requester ?? amendment[0],
        responder: amendment.responder ?? amendment[1],
        requesterNote: amendment.requesterNote ?? amendment[2] ?? '',
        rejectionNote: amendment.rejectionNote ?? amendment[3] ?? '',
        previousDeadline: expandedHistoryRecord
          ? Number(amendment.previousDeadline ?? amendment[4] ?? 0n)
          : 0,
        proposedDeadline: expandedHistoryRecord
          ? Number(amendment.proposedDeadline ?? amendment[5] ?? 0n)
          : Number(amendment[4] ?? 0n),
        additionalFunding: expandedHistoryRecord
          ? BigInt(amendment.additionalFunding ?? amendment[6] ?? 0n)
          : BigInt(amendment[5] ?? 0n),
        responseDeadline: expandedHistoryRecord
          ? Number(amendment.responseDeadline ?? amendment[7] ?? 0n)
          : Number(amendment[6] ?? 0n),
        status: AMENDMENT_STATUS[Number(
          expandedHistoryRecord
            ? amendment.status ?? amendment[8]
            : amendment[7],
        )] || 'Unknown',
        createdAt: Number(
          expandedHistoryRecord
            ? amendment.createdAt ?? amendment[9] ?? 0n
            : amendment.createdAt ?? amendment[9] ?? amendment[8] ?? 0n,
        ),
        resolvedAt: Number(
          expandedHistoryRecord
            ? amendment.resolvedAt ?? amendment[10] ?? 0n
            : amendment[9] ?? 0n,
        ),
         directExtension: expandedHistoryRecord
           ? Boolean(amendment.directExtension ?? amendment[11] ?? false)
           : false,
         gasPolicy: expandedHistoryRecord ? Number(amendment.gasPolicy ?? amendment[12] ?? 0) : 0,
         responseAllowance: expandedHistoryRecord
           ? BigInt(amendment.responseAllowance ?? amendment[13] ?? 0n)
           : 0n,
         responseAllowanceSpent: expandedHistoryRecord
           ? BigInt(amendment.responseAllowanceSpent ?? amendment[14] ?? 0n)
           : 0n,
         responseAllowanceFunder: expandedHistoryRecord
           ? amendment.responseAllowanceFunder ?? amendment[15] ?? null
           : null,
         responseReimbursed: expandedHistoryRecord
           ? Boolean(amendment.responseReimbursed ?? amendment[16] ?? false)
           : false,
        operationalAllowance: BigInt(amendment.operationalAllowance ?? 0n),
        existingFunding: Array.from(existingResult || []).map((allocation) => ({
          milestoneId: Number(allocation.milestoneId ?? allocation[0] ?? 0n),
          amount: BigInt(allocation.amount ?? allocation[1] ?? 0n),
        })),
        newMilestones: Array.from(newResult || []).map((milestone) => ({
          name: milestone.name ?? milestone[0] ?? '',
          insertBeforeMilestoneId: BigInt(
            milestone.insertBeforeMilestoneId ?? milestone[1] ?? 0n,
          ),
          amount: BigInt(milestone.amount ?? milestone[2] ?? 0n),
        })),
      };
    },
  ));

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
    tipAmount: BigInt(tipAmountResult ?? 0n),
    operationalAllowance,
    operationalSpent,
    operationalRemaining,
    operationalReimbursed,
    operationalReturned,
    items,
    milestones,
    proposals,
    cancellations,
    amendments,
    events: buildTimelineEvents({ shipper, carrier, createdAt, proposedAmount, milestones }),
  };
}

function toDateTimeLocal(timestampMs) {
  const date = new Date(timestampMs);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function suggestedCancellationDeadline(shipmentDeadline) {
  const now = Date.now();
  const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
  const shipmentDeadlineMs = shipmentDeadline * 1000;
  const suggestedDeadline = shipmentDeadlineMs <= threeDaysFromNow
    ? shipmentDeadlineMs - MIN_CANCELLATION_LEAD_SECONDS * 1000
    : threeDaysFromNow;
  return toDateTimeLocal(suggestedDeadline);
}

function suggestedAmendmentResponseDeadline(shipmentDeadline) {
  const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000;
  const oneHourBeforeShipment = (shipmentDeadline - MIN_AMENDMENT_LEAD_SECONDS) * 1000;
  return toDateTimeLocal(Math.min(oneDayFromNow, oneHourBeforeShipment));
}

function suggestedExtendedDeadline(shipmentDeadline) {
  return toDateTimeLocal((shipmentDeadline + 24 * 60 * 60) * 1000);
}

function parsePositiveEth(value) {
  let parsed;
  try {
    parsed = parseEther(value);
  } catch {
    throw new Error('Enter valid funding amounts in CARGO.');
  }
  if (parsed <= 0n) throw new Error('Funding amounts must be greater than zero.');
  return parsed;
}

function parseEthInputOrZero(value) {
  if (!value || !String(value).trim()) return 0n;
  try {
    const parsed = parseEther(String(value));
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function cancellationStatusTone(status) {
  if (status === 'Accepted') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Expired') return 'warning';
  return 'neutral';
}

function buildTimelineEvents({ shipper, carrier, createdAt, proposedAmount, milestones }) {
  const events = [{
    eventType: 'RequestCreated',
    label: 'Shipment request published',
    status: 'verified',
    statusLabel: 'Published',
    timestamp: createdAt,
    actor: shipper,
    details: `The shipper published this request with a planned payment of ${formatCargo(proposedAmount)}.`,
    milestoneId: null,
  }];

  for (const milestone of milestones) {
    const milestonePayout = milestone.payoutAmount + milestone.additionalPayoutAmount;
    const payout = milestonePayout > 0n
      ? milestonePayout
      : (proposedAmount * BigInt(milestone.payoutPercentage)) / 100n;
    events.push({
      eventType: milestone.status,
      label: milestone.name,
      status: timelineStatus(milestone.status),
      statusLabel: milestoneStatusLabel(milestone.status),
      timestamp: milestone.verifiedAt || milestone.submittedAt || null,
      actor: carrier,
      details: milestone.addedByAmendment
        ? `${formatCargo(payout)} funded through an accepted agreement change. ${firstMeaningfulRemark(milestone.remark, milestone.rejectionReason) || milestoneDescription(milestone.status)}`
        : `${milestone.payoutPercentage}% payout (${formatCargo(payout)}). ${firstMeaningfulRemark(milestone.remark, milestone.rejectionReason) || milestoneDescription(milestone.status)}`,
      milestoneId: milestone.milestoneId,
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

function firstMeaningfulRemark(...values) {
  const value = values.find((candidate) => hasRemarks(candidate));
  return value == null ? '' : String(value).trim();
}

export function checkpointPaymentState(status) {
  if (status === 'Paid') return 'Payment released';
  if (status === 'Verified') return 'Release pending';
  if (status === 'Submitted') return 'Funds locked · proof under review';
  if (status === 'Rejected') return 'Funds locked · proof rejected';
  return 'Funds locked';
}

export function milestoneEscrowAllocation(milestone = {}) {
  return BigInt(milestone.payoutAmount ?? 0n)
    + BigInt(milestone.additionalPayoutAmount ?? 0n);
}

function formatActionError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Transaction cancelled in MetaMask.';
  }
  const message = formatWalletTransactionError(error, 'The shipment transaction failed.');
  if (message.includes('proof submission changed')) return 'This proof was replaced while you were reviewing it. Refresh and review the new evidence before deciding.';
  if (message.includes('insufficient funds')) return 'The shipper wallet does not have enough ETH.';
  if (message.includes('CARGO allowance too low')) return 'Approve enough CARGO for this payment and reserve before retrying.';
  if (message.includes('operational allowance below minimum')) return 'The operational reserve is below the contract minimum for this shipment.';
  if (message.includes('response allowance below minimum')) return 'The response reserve is below the contract minimum.';
  if (message.includes('caller is not shipper')) return 'Only the request shipper can perform this action.';
  if (message.includes('proposal is not active')) return 'This proposal is no longer active. Refresh the request and choose another plan.';
  if (message.includes('request is not open')) return 'This request is no longer open for proposal review.';
  if (message.includes('request cannot be cancelled')) return 'This request can no longer be cancelled.';
  if (message.includes('another negotiation is pending')) return 'Another agreement change is already awaiting a response.';
  if (message.includes('note exceeds')) return 'The note is too long. Shorten it and try again.';
  if (message.includes('milestone proof is awaiting verification')) return 'Decide the pending milestone proof before accepting cancellation.';
  if (message.includes('response deadline has passed')) return 'This cancellation response deadline has passed. Close it as expired.';
  if (message.includes('response deadline exceeds shipment deadline')) return 'Choose a response deadline before the shipment deadline.';
  if (message.includes('shipment deadline is within one hour')) return 'Cancellation requests close one hour before the shipment deadline.';
  if (message.includes('cancellation is not pending')) return 'This cancellation request has already been resolved.';
  if (message.includes('caller is not cancellation responder')) return 'Only the requested participant can answer this cancellation.';
  if (message.includes('caller is not cancellation requester')) return 'Only the requester can withdraw this cancellation.';
  if (message.includes('caller is not shipment participant')) return 'Only the shipper or assigned carrier can request cancellation.';
  if (message.includes('request is not refundable')) return 'This request is not currently eligible for a refund.';
  if (message.includes('request deadline has not passed')) return 'The request deadline has not passed yet.';
  if (message.includes('no escrow remaining')) return 'There is no remaining escrow to refund.';
  if (message.includes('request already refunded')) return 'This request has already been refunded.';
  if (message.includes('request is not active')) return 'Proof submission is closed because this request is no longer active.';
  return formatWalletTransactionError(error, message || 'The shipment transaction failed.');
}

function cancellationWalletCopy(method) {
  const labels = {
    requestCancellation: 'cancellation request',
    acceptCancellation: 'cancellation approval',
    rejectCancellation: 'cancellation rejection',
    withdrawCancellation: 'cancellation withdrawal',
    expireCancellation: 'cancellation expiry',
  };
  return labels[method] || 'cancellation update';
}

function amendmentWalletCopy(method) {
  const labels = {
    extendShipmentDeadline: 'deadline extension',
    requestAmendment: 'agreement change request',
    acceptAmendment: 'agreement change approval',
    rejectAmendment: 'agreement change rejection',
    withdrawAmendment: 'agreement change withdrawal',
    expireAmendment: 'agreement change expiry',
  };
  return labels[method] || 'agreement change';
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
