// src/pages/Account.jsx — canonical CargoChain identity, funds, carrier rating,
// and recent activity surface.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineArrowsRightLeft,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiStar,
} from 'react-icons/hi2';
import { SiEthereum } from 'react-icons/si';
import { formatEther, parseEther } from 'ethers';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { BrandedModal } from '../components/BrandedModal.jsx';
import { EditDisplayNameModal } from '../components/EditDisplayNameModal.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useAccountAccess } from '../context/AccountAccessContext.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { pickAvatar } from '../utils/avatar.js';
import { loadCarrierReputationProfile } from '../services/reputationService.js';
import { formatRatingAverage } from '../utils/reputation.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
import { formatCargo, formatDate, formatEth, requestStatusLabel, REQUEST_TONE } from '../utils/format.js';
import {
  loadPaymentHistory,
  paymentActionLabel,
  PAYMENT_ACTION_TONE,
  shortTransactionHash,
} from '../utils/paymentHistory.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import styles from './Account.module.css';

const EMPTY_SNAPSHOT = {
  balance: null,
  cargoBalance: null,
  lockedEscrow: null,
  transactions: [],
  balanceError: null,
  cargoError: null,
  lockedError: null,
  historyError: null,
  initialLoading: false,
  balanceLoading: false,
  cargoLoading: false,
  lockedLoading: false,
  historyLoading: false,
};

const ACTIVITY_PAGE_SIZE = 5;

export function Account() {
  const navigate = useNavigate();
  const { account, chainId, signer, provider, connect } = useWallet();
  const { selectedWallet, walletMatches, walletReady } = useAccountAccess();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const {
    isRegistered,
    displayName,
    isProfileLoading,
    openRegistrationModal,
    refreshUserProfile,
  } = useUserProfile();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reputationProfile, setReputationProfile] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState(null);
  const [walletRevealed, setWalletRevealed] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [conversionDirection, setConversionDirection] = useState('deposit');
  const [cargoAmount, setCargoAmount] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [conversionError, setConversionError] = useState('');
  const [conversionConfirmation, setConversionConfirmation] = useState(null);
  const [cargoAction, setCargoAction] = useState(null);
  const snapshotRef = useRef(snapshot);
  const balanceLaneRef = useRef(null);
  const cargoLaneRef = useRef(null);
  const lockedLaneRef = useRef(null);
  const historyLaneRef = useRef(null);
  const historyCursorRef = useRef(null);
  const historyIdentityRef = useRef(null);
  const sourceRevisionRef = useRef(0);
  const snapshotIdentityRef = useRef(null);

  snapshotRef.current = snapshot;

  const walletAddress = selectedWallet?.wallet_address || account || null;
  const deliveryEscrow = contracts?.deliveryEscrow;
  const cargoToken = contracts?.cargoToken;
  const contractsPending = Boolean(provider && walletAddress && !contracts && !deployError);
  const walletIdentityRegistered = Boolean(isRegistered && walletMatches && displayName);
  const profileName = walletIdentityRegistered ? displayName : 'Register your wallet';
  const avatarSrc = pickAvatar(null, walletAddress);
  const networkLabel = chainId === CARGO_NETWORK_CONFIG.chainId
    ? CARGO_NETWORK_CONFIG.chainName
    : chainId != null ? `Chain ${chainId}` : 'Network unavailable';

  const loadSnapshot = useCallback(({ initial = false, revision = sourceRevisionRef.current } = {}) => {
    if (!provider || !walletAddress || revision !== sourceRevisionRef.current) return Promise.resolve();

    const normalizedWallet = walletAddress.toLowerCase();
    // Include the source revision so a newly validated deployment can start a
    // fresh read even if an earlier provider request is still pending.
    const balanceKey = `${normalizedWallet}:${chainId || ''}:${revision}`;
    const cargoKey = `${normalizedWallet}:${cargoToken?.target || ''}:${chainId || ''}:${revision}`;
    const escrowKey = `${normalizedWallet}:${deliveryEscrow?.target || ''}:${chainId || ''}:${revision}`;

    if (initial) {
      setSnapshot((previous) => ({
        ...previous,
        initialLoading: true,
        balanceLoading: true,
        cargoLoading: Boolean(cargoToken || contractsPending),
        lockedLoading: Boolean(deliveryEscrow || contractsPending),
        historyLoading: Boolean(deliveryEscrow || contractsPending),
        balanceError: null,
        cargoError: null,
        lockedError: null,
        historyError: null,
      }));
    }

    const updateSnapshot = (patch) => {
      if (revision !== sourceRevisionRef.current) return;
      setSnapshot((previous) => ({ ...previous, ...patch }));
    };

    const balancePromise = runAccountLane(balanceLaneRef, balanceKey, () => provider.getBalance(walletAddress)
      .then((value) => updateSnapshot({
        balance: BigInt(value),
        balanceError: null,
        balanceLoading: false,
      }))
      .catch((error) => updateSnapshot({
        balanceError: formatBalanceError(error),
        balanceLoading: false,
      })));

    const cargoPromise = cargoToken
      ? runAccountLane(cargoLaneRef, cargoKey, () => cargoToken.balanceOf(walletAddress)
        .then((value) => updateSnapshot({
          cargoBalance: BigInt(value),
          cargoError: null,
          cargoLoading: false,
        }))
        .catch((error) => updateSnapshot({
          cargoError: formatBalanceError(error),
          cargoLoading: false,
        })))
      : Promise.resolve(updateSnapshot({ cargoLoading: contractsPending }));

    const lockedPromise = deliveryEscrow
      ? runAccountLane(lockedLaneRef, escrowKey, () => deliveryEscrow.getLockedEscrow(walletAddress)
        .then((value) => updateSnapshot({
          lockedEscrow: mapLockedEscrow(value),
          lockedError: null,
          lockedLoading: false,
        }))
        .catch((error) => updateSnapshot({
          lockedError: formatHistoryError(error),
          lockedLoading: false,
        })))
      : Promise.resolve(updateSnapshot({ lockedLoading: contractsPending }));

    if (deliveryEscrow) {
      runAccountLane(historyLaneRef, escrowKey, async () => {
        const latestBlockValue = typeof provider.getBlockNumber === 'function'
          ? await provider.getBlockNumber()
          : null;
        const latestBlock = latestBlockValue == null ? null : Number(latestBlockValue);
        const previousCursor = historyCursorRef.current;
        const chainReset = latestBlock != null && previousCursor != null && latestBlock < previousCursor;
        const fromBlock = chainReset || previousCursor == null ? 0 : previousCursor + 1;
        if (latestBlock != null && fromBlock > latestBlock) {
          updateSnapshot({ historyError: null, historyLoading: false });
          return;
        }

        const value = await loadPaymentHistory({
          contract: deliveryEscrow,
          provider,
          account: walletAddress,
          fromBlock,
          toBlock: latestBlock ?? 'latest',
        });
        if (latestBlock != null && revision === sourceRevisionRef.current) {
          historyCursorRef.current = latestBlock;
        }
        updateSnapshot({
          transactions: fromBlock === 0 || chainReset
            ? value
            : mergePaymentHistory(snapshotRef.current.transactions, value),
          historyError: null,
          historyLoading: false,
        });
      }).catch((error) => updateSnapshot({
        historyError: formatHistoryError(error),
        historyLoading: false,
      }));
    } else {
      updateSnapshot({ historyLoading: contractsPending });
    }

    // Initial readiness is based on the balance lanes. Activity history can
    // remain pending without keeping the financial workspace busy.
    return Promise.allSettled([balancePromise, cargoPromise, lockedPromise])
      .then(() => updateSnapshot({ initialLoading: false }));
  }, [cargoToken, chainId, contractsPending, deliveryEscrow, provider, walletAddress]);

  useEffect(() => {
    const revision = ++sourceRevisionRef.current;
    const identity = provider && walletAddress
      ? `${walletAddress.toLowerCase()}:${chainId || ''}`
      : null;
    const identityChanged = snapshotIdentityRef.current !== identity;
    snapshotIdentityRef.current = identity;
    const historyIdentity = provider && walletAddress && deliveryEscrow
      ? `${walletAddress.toLowerCase()}:${chainId || ''}:${deliveryEscrow.target || ''}`
      : null;
    const historyIdentityChanged = historyIdentityRef.current !== historyIdentity;
    historyIdentityRef.current = historyIdentity;
    setWalletRevealed(false);
    setWalletCopied(false);

    if (!provider || !walletAddress) {
      snapshotIdentityRef.current = null;
      historyIdentityRef.current = null;
      historyCursorRef.current = null;
      setSnapshot({ ...EMPTY_SNAPSHOT });
      return undefined;
    }

    if (identityChanged) {
      setSnapshot({ ...EMPTY_SNAPSHOT });
    }
    if (historyIdentityChanged) {
      historyCursorRef.current = null;
      setSnapshot((previous) => ({
        ...previous,
        transactions: [],
        historyError: null,
        historyLoading: Boolean(deliveryEscrow || contractsPending),
      }));
    }
    loadSnapshot({ initial: true, revision });
    const timer = window.setInterval(() => loadSnapshot({ revision }), 10_000);
    return () => window.clearInterval(timer);
  }, [contractsPending, deliveryEscrow, loadSnapshot, provider, walletAddress]);

  useEffect(() => {
    if (!walletAddress || !contracts?.reputationRegistry) {
      setReputationProfile(null);
      setReputationLoading(false);
      setReputationError(null);
      return undefined;
    }

    let cancelled = false;
    setReputationProfile(null);
    setReputationLoading(true);
    setReputationError(null);
    Promise.resolve()
      .then(() => loadCarrierReputationProfile(contracts, walletAddress))
      .then((result) => {
        if (!cancelled) setReputationProfile(result || null);
      })
      .catch((error) => {
        if (!cancelled) {
          setReputationProfile(null);
          setReputationError(formatReputationError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setReputationLoading(false);
      });

    return () => { cancelled = true; };
  }, [contracts, walletAddress]);

  const copyWalletAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setWalletCopied(true);
      show('Wallet address copied to clipboard.', 'success');
      window.setTimeout(() => setWalletCopied(false), 1600);
    } catch {
      show('Could not copy the wallet address.', 'error');
    }
  };

  const retrySnapshot = () => loadSnapshot({ initial: true, revision: sourceRevisionRef.current });
  const earningsPayments = useMemo(() => {
    const normalizedAccount = walletAddress?.toLowerCase();
    if (!normalizedAccount) return [];
    return snapshot.transactions.filter((transaction) => (
      ['PaymentReleased', 'CarrierTipped'].includes(transaction.action)
      && transaction.recipient?.toLowerCase() === normalizedAccount
    ));
  }, [snapshot.transactions, walletAddress]);

  const totalEarnings = useMemo(
    () => earningsPayments.reduce((total, payment) => total + BigInt(payment.amount), 0n),
    [earningsPayments],
  );
  const financialError = snapshot.balanceError || snapshot.cargoError || snapshot.lockedError;

  const updateConversionFromCargo = (value) => {
    setCargoAmount(value);
    setConversionError('');
    if (!value.trim()) { setEthAmount(''); return; }
    try {
      setEthAmount(conversionFromCargo(value).ethText);
    } catch { setEthAmount(''); setConversionError('Enter a CARGO amount that converts exactly at the fixed rate.'); }
  };

  const updateConversionFromEth = (value) => {
    setEthAmount(value);
    setConversionError('');
    if (!value.trim()) { setCargoAmount(''); return; }
    try {
      setCargoAmount(conversionFromEth(value).cargoText);
    } catch { setCargoAmount(''); setConversionError('Enter a valid ETH amount.'); }
  };

  const prepareCargoAction = () => {
    try {
      const ethWei = parseEther(ethAmount.trim());
      const cargoWei = parseEther(cargoAmount.trim());
      if (ethWei <= 0n || cargoWei <= 0n || cargoWei !== ethWei * 10_000n) throw new Error();
      if (conversionDirection === 'deposit' && snapshot.balance != null && ethWei >= snapshot.balance) {
        setConversionError('Keep enough ETH in your wallet to pay the transaction gas.');
        return;
      }
      if (conversionDirection === 'redeem' && snapshot.cargoBalance != null && cargoWei > snapshot.cargoBalance) {
        setConversionError('Your CARGO balance is too low for this redemption.');
        return;
      }
      setConversionConfirmation({ action: conversionDirection, ethWei, cargoWei });
    } catch { setConversionError('Enter a positive amount to continue.'); }
  };

  const runCargoAction = async ({ action, ethWei, cargoWei }) => {
    if (!cargoToken || !signer || !provider || cargoAction) return;
    setConversionConfirmation(null);
    setCargoAction(action);
    let transactionToast;
    try {
      transactionToast = startTransactionToast({
        wallet: action === 'deposit' ? 'Confirm the ETH deposit in MetaMask…' : 'Confirm the CARGO redemption in MetaMask…',
        submitted: action === 'deposit' ? 'Converting ETH to CARGO…' : 'Redeeming CARGO for ETH…',
        success: action === 'deposit' ? 'CARGO balance updated.' : 'CARGO redeemed for ETH.',
      });
      const tx = await sendWalletContractTransaction({
        contract: cargoToken,
        method: action === 'deposit' ? 'deposit' : 'redeem',
        args: action === 'deposit' ? [] : [cargoWei],
        overrides: action === 'deposit' ? { value: ethWei } : undefined,
        signer,
        provider,
      });
      transactionToast.submitted();
      await tx.wait();
      transactionToast.success();
      setCargoAmount('');
      setEthAmount('');
      await loadSnapshot({ initial: false, revision: sourceRevisionRef.current });
    } catch (error) {
      const message = formatWalletTransactionError(error, 'The CARGO wallet transaction failed.');
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    } finally {
      setCargoAction(null);
    }
  };

  if (!walletAddress) {
    return (
      <div className={styles.page}>
        <Topbar title="Account" subtitle="Identity, wallet, finances, and activity." />
        <Card className={styles.compactState} grouped>
          <span className={styles.stateIcon} aria-hidden="true"><HiOutlineUserGroup /></span>
          <div>
            <h2>Connect a wallet to view your account</h2>
          <p>Your Profile, financial summary, and activity are tied to the active MetaMask wallet.</p>
          </div>
          <Button onClick={connect}>Connect wallet</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Topbar title="Account" subtitle="Identity, wallet, finances, and activity." />

      <Card className={styles.accountWorkspace} grouped padded={false}>
        <aside className={styles.profileRail} aria-labelledby="account-identity-title">
          <div className={styles.identityMain}>
            {walletIdentityRegistered ? <Avatar src={avatarSrc} name={profileName} size={72} /> : <span className={styles.unregisteredAvatar} aria-hidden="true"><HiOutlineUser /></span>}
            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}>{walletIdentityRegistered ? 'Profile' : 'Identity'}</span>
              <h2 id="account-identity-title">{profileName}</h2>
              {!walletIdentityRegistered && <p className={styles.registrationHint}>Choose a display name so other users can recognise you.</p>}
            </div>
          </div>

          <section className={styles.walletMeta} aria-label="Wallet details">
            <div className={styles.walletHeading}>
              <span className={styles.metaLabel}>Wallet</span>
              <span className={styles.networkTag} role="status" aria-label={`Current network: ${networkLabel}`}>
                <span className={`${styles.networkTagDot} ${chainId === CARGO_NETWORK_CONFIG.chainId ? styles.networkTagDotActive : ''}`} aria-hidden="true" />
                {networkLabel}
              </span>
            </div>
            <div className={styles.walletDisclosure}>
              <button type="button" className={styles.addressButton} onClick={copyWalletAddress} aria-label="Copy wallet address">
                <span className={`${styles.walletAddressValue} ${!walletRevealed ? styles.walletAddressHidden : ''}`} aria-hidden={!walletRevealed}>
                  {walletAddress}
                </span>
              </button>
              <button
                type="button"
                className={styles.eyeToggle}
                onClick={() => setWalletRevealed((value) => !value)}
                aria-label={walletRevealed ? 'Hide wallet address' : 'Show wallet address'}
                aria-pressed={walletRevealed}
                title={walletRevealed ? 'Hide wallet address' : 'Show wallet address'}
              >
                <span className={`${styles.eyeGlyph} ${walletRevealed ? styles.eyeGlyphInactive : styles.eyeGlyphActive}`} aria-hidden="true"><HiOutlineEye /></span>
                <span className={`${styles.eyeGlyph} ${walletRevealed ? styles.eyeGlyphActive : styles.eyeGlyphInactive}`} aria-hidden="true"><HiOutlineEyeSlash /></span>
              </button>
              {walletCopied && <span className={styles.copiedIndicator} role="status">Copied</span>}
            </div>
          </section>

          <div className={styles.identityActions}>
            {walletIdentityRegistered ? (
              <Button variant="secondary" onClick={() => setIsEditOpen(true)} disabled={!walletReady}>
                Edit display name
              </Button>
            ) : (
              <Button onClick={() => openRegistrationModal()} disabled={isProfileLoading || !walletMatches}>
                Register display name
              </Button>
            )}
          </div>

          <div className={styles.railDivider} aria-hidden="true" />

          <section className={styles.railRating} aria-labelledby="account-rating-title">
            <h3 id="account-rating-title" className={styles.ratingLabel}>Carrier rating</h3>
            {reputationLoading && !reputationProfile ? (
              <RatingSkeleton />
            ) : reputationError && !reputationProfile ? (
              <span className={styles.ratingError} role="alert">Carrier rating unavailable.</span>
            ) : reputationProfile ? (
              <>
                {reputationLoading && <span className="visually-hidden" role="status">Refreshing carrier rating…</span>}
                <RatingSummary profile={reputationProfile} />
              </>
            ) : (
              <RatingSummary />
            )}
          </section>
        </aside>

        <section className={styles.financeWorkspace} aria-labelledby="account-financial-title" aria-busy={snapshot.initialLoading}>
          {deployError && (
            <div className={styles.inlineNotice} role="alert">
              <HiOutlineExclamationTriangle aria-hidden="true" />
              <span>{deployError}</span>
            </div>
          )}

          <div className={styles.balanceOverview}>
            <div className={styles.balanceCard}>
              <span className={styles.balanceIcon} aria-hidden="true">C.</span>
              <div className={styles.balanceCopy}>
              <h2 id="account-financial-title" className={styles.balanceLabel}>CARGO Balance</h2>
              {snapshot.cargoLoading && snapshot.cargoBalance == null ? (
                <Skeleton className={styles.balanceValueSkeleton} width={132} height={32} />
              ) : (
                <strong className={styles.balanceValue} data-numeric="true" title={formatCargo(snapshot.cargoBalance ?? 0n)}>{formatCargo(snapshot.cargoBalance ?? 0n)}</strong>
              )}
              <p>Used for delivery compensation, escrow, refunds, and tips.</p>
              </div>
            </div>
            <div className={styles.balanceCard}>
              <span className={styles.balanceIcon} aria-hidden="true"><SiEthereum /></span>
              <div className={styles.balanceCopy}>
                <h2 className={styles.balanceLabel}>ETH Balance</h2>
                {snapshot.balanceLoading && snapshot.balance == null ? <Skeleton className={styles.balanceValueSkeleton} width={132} height={32} /> : <strong className={styles.balanceValue} data-numeric="true" title={formatEth(snapshot.balance ?? 0n)}>{formatEth(snapshot.balance ?? 0n)}</strong>}
                <p>Used to top up your CARGO wallet and pay gas. Keep ETH available to initiate transactions.</p>
              </div>
            </div>
            {financialError && <Button variant="secondary" size="sm" onClick={retrySnapshot}>Try again</Button>}
          </div>

          <section className={styles.cargoWallet} aria-labelledby="cargo-wallet-title">
            <div className={styles.cargoWalletHeader}>
              <div>
                <span className={styles.metricLabel}>Fixed-rate conversion</span>
                <h2 id="cargo-wallet-title">Convert CARGO and ETH</h2>
              </div>
            </div>
            <div className={styles.conversionTabs} role="tablist" aria-label="Conversion direction">
              <button type="button" role="tab" aria-selected={conversionDirection === 'deposit'} className={conversionDirection === 'deposit' ? styles.conversionTabActive : ''} onClick={() => setConversionDirection('deposit')}>ETH to C.</button>
              <button type="button" role="tab" aria-selected={conversionDirection === 'redeem'} className={conversionDirection === 'redeem' ? styles.conversionTabActive : ''} onClick={() => setConversionDirection('redeem')}>C. to ETH</button>
            </div>
            <div className={styles.cargoWalletControls}>
              <label htmlFor="cargo-amount">{conversionDirection === 'deposit' ? 'CARGO you receive' : 'CARGO you redeem'}</label>
              <div className={styles.conversionInput}><input id="cargo-amount" inputMode="decimal" value={cargoAmount} onChange={(event) => updateConversionFromCargo(event.target.value)} placeholder="0.00" disabled={Boolean(cargoAction) || !cargoToken} /><span>C.</span></div>
              {conversionDirection === 'redeem' && (
                <span className={styles.conversionBalance}>
                  {snapshot.cargoBalance == null ? 'Available C.: Loading…' : `Available C.: ${formatCargo(snapshot.cargoBalance)}`}
                </span>
              )}
              <span className={styles.conversionArrow} aria-hidden="true"><HiOutlineArrowsRightLeft /></span>
              <label htmlFor="eth-amount">{conversionDirection === 'deposit' ? 'ETH you pay' : 'ETH you receive'}</label>
              <div className={styles.conversionInput}><input id="eth-amount" inputMode="decimal" value={ethAmount} onChange={(event) => updateConversionFromEth(event.target.value)} placeholder="0.00" disabled={Boolean(cargoAction) || !cargoToken} /><span>ETH</span></div>
              {conversionError && <span className={styles.conversionError} role="alert">{conversionError}</span>}
              <Button size="sm" disabled={Boolean(cargoAction) || !cargoToken || !signer || !cargoAmount || !ethAmount} onClick={prepareCargoAction}>{conversionDirection === 'deposit' ? 'Top up CARGO' : 'Redeem CARGO'}</Button>
            </div>
            <span className={styles.cargoRate}>Fixed rate: 1 ETH = 10,000 C.</span>
          </section>

          <div className={styles.financialGrid}>
            <FinancialMetric
              label="Locked escrow"
              value={formatCargo(snapshot.lockedEscrow?.totalLocked ?? 0n)}
              sub={snapshot.lockedEscrow ? `${snapshot.lockedEscrow.activeRequestCount} active request${snapshot.lockedEscrow.activeRequestCount === 1 ? '' : 's'}` : 'No escrow data'}
              loading={snapshot.lockedLoading && snapshot.lockedEscrow == null}
            />
            <FinancialMetric
              label="Released earnings"
              value={formatCargo(totalEarnings)}
              sub={`${earningsPayments.length} payment${earningsPayments.length === 1 ? '' : 's'} received`}
              loading={snapshot.historyLoading && snapshot.transactions.length === 0}
            />
          </div>
          {snapshot.initialLoading && <span className="visually-hidden" role="status">Loading account finances…</span>}
          {financialError && <span className={styles.errorNote} role="alert">{financialError}</span>}

          <section className={styles.activitySection} aria-labelledby="account-activity-title">
            <div className={styles.activityHeading}>
              <div>
                <span className={styles.metricLabel}>On-chain events</span>
                <h2 id="account-activity-title">Recent activity</h2>
              </div>
            </div>
            <div className={styles.activityPanel}>
              <TxHistoryTable
                rows={snapshot.transactions}
                loading={snapshot.historyLoading}
                error={snapshot.historyError || deployError}
                onRetry={retrySnapshot}
                onRowClick={(requestId) => navigate(`/track/${requestId}`)}
                show={show}
              />
            </div>
          </section>
        </section>
      </Card>

      {walletIdentityRegistered && isEditOpen && (
        <EditDisplayNameModal
          account={walletAddress}
          provider={provider}
          signer={signer}
          userRegistry={contracts?.userRegistry}
          walletReady={walletReady}
          refreshUserProfile={refreshUserProfile}
          onClose={() => setIsEditOpen(false)}
        />
      )}
      {conversionConfirmation && (
        <BrandedModal title={conversionConfirmation.action === 'deposit' ? 'Confirm CARGO top-up' : 'Confirm CARGO redemption'} description="Review the fixed-rate conversion before opening MetaMask." Icon={HiOutlineArrowsRightLeft} onClose={() => setConversionConfirmation(null)} busy={Boolean(cargoAction)} footer={<><Button variant="secondary" onClick={() => setConversionConfirmation(null)} disabled={Boolean(cargoAction)}>Cancel</Button><Button onClick={() => runCargoAction(conversionConfirmation)} disabled={Boolean(cargoAction)}>{cargoAction ? 'Confirming…' : conversionConfirmation.action === 'deposit' ? 'Confirm top-up' : 'Confirm redemption'}</Button></>}>
          <dl className={styles.conversionReview}>
            <div><dt>{conversionConfirmation.action === 'deposit' ? 'You pay' : 'You receive'}</dt><dd>{formatEth(conversionConfirmation.ethWei)}</dd></div>
            <div><dt>{conversionConfirmation.action === 'deposit' ? 'You receive' : 'You redeem'}</dt><dd>{formatCargo(conversionConfirmation.cargoWei)}</dd></div>
            <div><dt>Fixed rate</dt><dd>1 ETH = 10,000 C.</dd></div>
          </dl>
          <p className={styles.conversionNotice}>Network gas is paid separately in ETH.</p>
        </BrandedModal>
      )}
    </div>
  );
}

function FinancialMetric({ label, value, sub, loading = false }) {
  return (
    <div className={styles.financialMetric}>
      <span className={styles.metricLabel}>{label}</span>
      {loading ? (
        <>
          <Skeleton className={styles.metricValueSkeleton} width={112} height={24} />
          <Skeleton className={styles.metricHintSkeleton} width="68%" height={12} />
        </>
      ) : (
        <>
          <strong className={styles.metricValue} data-numeric="true">{value}</strong>
          <span className={styles.metricHint}>{sub}</span>
        </>
      )}
    </div>
  );
}

function RatingSkeleton() {
  return (
    <div className={styles.ratingSummary} aria-busy="true">
      <span className="visually-hidden" role="status">Loading verified rating…</span>
      <Skeleton width={52} height={28} />
      <div className={styles.stars} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => <Skeleton key={star} variant="circle" width={18} height={18} />)}
      </div>
      <Skeleton width={100} height={12} />
    </div>
  );
}

function RatingSummary({ profile = {} }) {
  const average = profile.averageRating == null ? '—' : formatRatingAverage(profile.averageRating);
  const ratingCount = Number(profile.ratingCount || 0);
  const roundedAverage = profile.averageRating == null ? 0 : Math.round(profile.averageRating);

  return (
    <div className={styles.ratingSummary}>
      <strong className={styles.ratingValue} data-numeric="true">{average}</strong>
      <div className={styles.stars} aria-label={`${ratingCount} verified ratings`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <HiStar key={star} className={star <= roundedAverage ? styles.starActive : styles.starInactive} aria-hidden="true" />
        ))}
      </div>
      <span className={styles.ratingCount}>{ratingCount} verified rating{ratingCount === 1 ? '' : 's'}</span>
    </div>
  );
}

function TxHistoryTable({ rows, loading, error, onRetry, onRowClick, show }) {
  const [page, setPage] = useState(1);
  const showSkeleton = loading && rows.length === 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstRowIndex = (currentPage - 1) * ACTIVITY_PAGE_SIZE;
  const visibleRows = rows.slice(firstRowIndex, firstRowIndex + ACTIVITY_PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const copyHash = async (event, hash) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      show('Transaction hash copied to clipboard.', 'success');
    } catch {
      show('Could not copy the transaction hash.', 'error');
    }
  };

  return (
    <div className={styles.tableWrap} aria-busy={loading || undefined}>
      {loading && !showSkeleton && <span className="visually-hidden" role="status">Refreshing payment history…</span>}
      {error && rows.length > 0 && (
        <div className={styles.tableRefreshNotice} role="alert">Payment history refresh failed. Showing the last loaded events.</div>
      )}
      <table className={styles.table}>
        <thead>
          <tr><th scope="col">Activity</th><th scope="col">Shipment</th><th scope="col">Amount</th><th scope="col">Status</th></tr>
        </thead>
        <tbody>
          {showSkeleton ? (
            <ActivitySkeletonRows />
          ) : error && rows.length === 0 ? (
            <ActivityTableState
              icon={HiOutlineExclamationTriangle}
              title="Payment history unavailable"
              description={error}
              action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
            />
          ) : rows.length === 0 ? (
            <ActivityTableState
              icon={HiOutlineBanknotes}
              title="No on-chain activity yet"
              description="Create a request or accept a job to see payment events appear here."
            />
          ) : visibleRows.map((row) => (
            <tr
              key={row.id}
              className={styles.tableRow}
              onClick={() => onRowClick(row.requestId)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick(row.requestId);
                }
              }}
              aria-label={`Open request #${String(row.requestId).padStart(4, '0')} timeline`}
            >
              <td>
                <div className={styles.activityCell}>
                  <Badge tone={PAYMENT_ACTION_TONE[row.action] || 'neutral'}>{paymentActionLabel(row.action, row.milestoneId)}</Badge>
                  <span className={styles.activityMeta}>{formatDate(row.timestamp)}</span>
                </div>
              </td>
              <td><span className={styles.requestId}>#{String(row.requestId).padStart(4, '0')}</span></td>
              <td className={styles.numeric}>{formatCargo(row.amount)}</td>
              <td>
                <div className={styles.statusCell}>
                  <Badge tone={REQUEST_TONE[row.requestStatus] || 'neutral'}>{requestStatusLabel(row.requestStatus)}</Badge>
                  <button type="button" className={styles.hashButton} onClick={(event) => copyHash(event, row.transactionHash)} aria-label="Copy transaction hash"><code>{shortTransactionHash(row.transactionHash)}</code></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > ACTIVITY_PAGE_SIZE && !showSkeleton && (
        <nav className={styles.activityPagination} aria-label="Recent activity pagination">
          <span className={styles.paginationSummary} aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <div className={styles.paginationActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function ActivitySkeletonRows() {
  return [1, 2, 3, 4].map((key) => (
    <tr key={key} className={styles.skeletonActivityRow} aria-hidden="true">
      <td>
        <div className={styles.activityCell}>
          <Skeleton variant="block" width={92} height={24} />
          <Skeleton width={78} height={11} />
        </div>
      </td>
      <td><Skeleton width={48} /></td>
      <td><Skeleton width={70} /></td>
      <td>
        <div className={styles.statusCell}>
          <Skeleton variant="block" width={76} height={24} />
          <Skeleton width={88} height={11} />
        </div>
      </td>
    </tr>
  ));
}

function ActivityTableState({ icon: Icon, title, description, action, status = false }) {
  return (
    <tr className={styles.tableStateRow}>
      <td colSpan="4">
        <div className={styles.tableState} {...(status ? { role: 'status' } : {})}>
          <span className={styles.tableStateIcon} aria-hidden="true"><Icon /></span>
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
            {action && <div className={styles.tableStateAction}>{action}</div>}
          </div>
        </div>
      </td>
    </tr>
  );
}

function mapLockedEscrow(result) {
  return {
    totalLocked: BigInt(result?.totalLocked ?? result?.[0] ?? 0n),
    activeRequestCount: Number(result?.activeRequestCount ?? result?.[1] ?? 0n),
  };
}

function runAccountLane(ref, key, operation) {
  if (ref.current?.key === key) return ref.current.promise;
  const entry = { key, promise: null };
  entry.promise = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (ref.current === entry) ref.current = null;
    });
  ref.current = entry;
  return entry.promise;
}

function mergePaymentHistory(previous, next) {
  const byId = new Map((previous || []).map((row) => [row.id, row]));
  (next || []).forEach((row) => byId.set(row.id, row));
  return [...byId.values()]
    .sort((left, right) => right.blockNumber - left.blockNumber || right.logIndex - left.logIndex);
}

function formatInputAmount(value) {
  return formatEther(value).replace(/\.0$/, '');
}

export function conversionFromCargo(value) {
  const cargoWei = parseEther(String(value).trim());
  if (cargoWei < 0n || cargoWei % 10_000n !== 0n) throw new Error('CARGO amount cannot be represented exactly in ETH wei.');
  const ethWei = cargoWei / 10_000n;
  return { cargoWei, ethWei, cargoText: formatInputAmount(cargoWei), ethText: formatInputAmount(ethWei) };
}

export function conversionFromEth(value) {
  const ethWei = parseEther(String(value).trim());
  if (ethWei < 0n) throw new Error('ETH amount cannot be negative.');
  const cargoWei = ethWei * 10_000n;
  return { cargoWei, ethWei, cargoText: formatInputAmount(cargoWei), ethText: formatInputAmount(ethWei) };
}

export function accountSnapshotsEqual(left, right) {
  if (String(left.balance ?? '') !== String(right.balance ?? '')) return false;
  if (String(left.cargoBalance ?? '') !== String(right.cargoBalance ?? '')) return false;
  if (left.lockedEscrow?.totalLocked !== right.lockedEscrow?.totalLocked) return false;
  if (left.lockedEscrow?.activeRequestCount !== right.lockedEscrow?.activeRequestCount) return false;
  if (left.balanceError !== right.balanceError || left.cargoError !== right.cargoError || left.lockedError !== right.lockedError || left.historyError !== right.historyError || left.initialLoading !== right.initialLoading) return false;
  const leftRows = left.transactions || [];
  const rightRows = right.transactions || [];
  if (leftRows.length !== rightRows.length) return false;
  return leftRows.every((row, index) => {
    const next = rightRows[index];
    return row.id === next.id
      && row.requestId === next.requestId
      && row.action === next.action
      && String(row.amount ?? '') === String(next.amount ?? '')
      && row.requestStatus === next.requestStatus
      && row.timestamp === next.timestamp
      && row.transactionHash === next.transactionHash
      && row.blockNumber === next.blockNumber
      && row.logIndex === next.logIndex;
  });
}

function formatBalanceError(error) {
  return error?.shortMessage || error?.reason || error?.message || 'Could not load the wallet balance.';
}

function formatHistoryError(error) {
  return error?.shortMessage || error?.reason || error?.message || 'Could not load on-chain payment history.';
}

function formatReputationError(error) {
  return error?.shortMessage || error?.reason || error?.message || 'Could not load carrier rating.';
}
