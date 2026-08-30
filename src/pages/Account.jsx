// src/pages/Account.jsx — canonical CargoChain identity, funds, carrier rating,
// and recent activity surface.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineIdentification,
  HiOutlineInformationCircle,
  HiOutlineUserGroup,
  HiOutlineWallet,
  HiOutlineXMark,
  HiStar,
} from 'react-icons/hi2';
import { parseEther } from 'ethers';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
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

const MAX_DISPLAY_NAME_BYTES = 64;
const MAX_DISPLAY_NAME_WORDS = 8;

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
  const [cargoAmount, setCargoAmount] = useState('');
  const [cargoAction, setCargoAction] = useState(null);
  const snapshotRef = useRef(snapshot);
  const inFlightRef = useRef(null);
  const sourceRevisionRef = useRef(0);
  const snapshotIdentityRef = useRef(null);

  snapshotRef.current = snapshot;

  const walletAddress = selectedWallet?.wallet_address || account || null;
  const deliveryEscrow = contracts?.deliveryEscrow;
  const cargoToken = contracts?.cargoToken;
  const walletIdentityRegistered = Boolean(isRegistered && walletMatches && displayName);
  const profileName = walletIdentityRegistered ? displayName : 'Display name not set';
  const avatarSrc = pickAvatar(null, walletAddress);
  const networkLabel = chainId === CARGO_NETWORK_CONFIG.chainId
    ? CARGO_NETWORK_CONFIG.chainName
    : chainId != null ? `Chain ${chainId}` : 'Network unavailable';

  const loadSnapshot = useCallback(async ({ initial = false, revision = sourceRevisionRef.current } = {}) => {
    if (!provider || !walletAddress || !deliveryEscrow || revision !== sourceRevisionRef.current) return;

    const requestKey = `${walletAddress.toLowerCase()}:${deliveryEscrow.target || ''}:${chainId || ''}`;
    if (inFlightRef.current?.key === requestKey) return;
    const operation = { key: requestKey };
    inFlightRef.current = operation;

    if (initial) {
      setSnapshot((previous) => ({
        ...previous,
        initialLoading: true,
        balanceLoading: true,
        cargoLoading: true,
        lockedLoading: true,
        historyLoading: true,
        balanceError: null,
        lockedError: null,
        historyError: null,
      }));
    }

    const updateSnapshot = (patch) => {
      if (revision !== sourceRevisionRef.current) return;
      setSnapshot((previous) => ({ ...previous, ...patch }));
    };

    try {
    const balancePromise = provider.getBalance(walletAddress)
        .then((value) => updateSnapshot({
          balance: BigInt(value),
          balanceError: null,
          balanceLoading: false,
        }))
        .catch((error) => updateSnapshot({
          balanceError: formatBalanceError(error),
          balanceLoading: false,
        }));
      const cargoPromise = cargoToken
        ? cargoToken.balanceOf(walletAddress)
          .then((value) => updateSnapshot({
            cargoBalance: BigInt(value),
            cargoError: null,
            cargoLoading: false,
          }))
          .catch((error) => updateSnapshot({
            cargoError: formatBalanceError(error),
            cargoLoading: false,
          }))
        : Promise.resolve();
      const lockedPromise = deliveryEscrow.getLockedEscrow(walletAddress)
        .then((value) => updateSnapshot({
          lockedEscrow: mapLockedEscrow(value),
          lockedError: null,
          lockedLoading: false,
        }))
        .catch((error) => updateSnapshot({
          lockedError: formatHistoryError(error),
          lockedLoading: false,
        }));
      const historyPromise = loadPaymentHistory({ contract: deliveryEscrow, provider, account: walletAddress })
        .then((value) => updateSnapshot({
          transactions: value,
          historyError: null,
          historyLoading: false,
        }))
        .catch((error) => updateSnapshot({
          historyError: formatHistoryError(error),
          historyLoading: false,
        }));

      await Promise.all([balancePromise, cargoPromise, lockedPromise, historyPromise]);
      updateSnapshot({ initialLoading: false });
    } finally {
      if (inFlightRef.current === operation) inFlightRef.current = null;
    }
  }, [cargoToken, chainId, deliveryEscrow, provider, walletAddress]);

  useEffect(() => {
    const revision = ++sourceRevisionRef.current;
    const identity = provider && walletAddress && deliveryEscrow
      ? `${walletAddress.toLowerCase()}:${deliveryEscrow.target || ''}:${chainId || ''}`
      : null;
    const identityChanged = snapshotIdentityRef.current !== identity;
    snapshotIdentityRef.current = identity;
    setWalletRevealed(false);
    setWalletCopied(false);

    if (!provider || !walletAddress || !deliveryEscrow) {
      snapshotIdentityRef.current = null;
      setSnapshot({ ...EMPTY_SNAPSHOT });
      return undefined;
    }

    if (identityChanged) setSnapshot({ ...EMPTY_SNAPSHOT });
    loadSnapshot({ initial: true, revision });
    const timer = window.setInterval(() => loadSnapshot({ revision }), 10_000);
    return () => window.clearInterval(timer);
  }, [deliveryEscrow, loadSnapshot, provider, walletAddress]);

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

  const runCargoAction = async (action) => {
    if (!cargoToken || !signer || !provider || cargoAction) return;
    let amount;
    try {
      amount = parseEther(cargoAmount.trim());
    } catch {
      show('Enter a valid CARGO amount.', 'error');
      return;
    }
    if (amount <= 0n) {
      show('Enter a CARGO amount greater than zero.', 'error');
      return;
    }

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
        args: action === 'deposit' ? [] : [amount],
        overrides: action === 'deposit' ? { value: amount } : undefined,
        signer,
        provider,
      });
      transactionToast.submitted();
      await tx.wait();
      transactionToast.success();
      setCargoAmount('');
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
            <Avatar src={avatarSrc} name={profileName} size={72} />
            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}>Profile</span>
              <h2 id="account-identity-title">{profileName}</h2>
              <ul className={styles.capabilities} aria-label="Account roles">
                <li className={styles.roleTag}>Shipper</li>
                <li className={styles.roleTag}>Carrier</li>
              </ul>
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
                  {walletRevealed ? walletAddress : '0x••••••••••••••••'}
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
              <span className={styles.balanceIcon} aria-hidden="true"><HiOutlineWallet /></span>
              <div className={styles.balanceCopy}>
              <h2 id="account-financial-title" className={styles.balanceLabel}>Available balance</h2>
              {snapshot.balanceLoading && snapshot.balance == null ? (
                <Skeleton className={styles.balanceValueSkeleton} width={132} height={32} />
              ) : (
                <strong className={styles.balanceValue} data-numeric="true">{formatEth(snapshot.balance ?? 0n)}</strong>
              )}
              <p>Funds available in your connected wallet.</p>
              </div>
            </div>
            {financialError && <Button variant="secondary" size="sm" onClick={retrySnapshot}>Try again</Button>}
          </div>

          <section className={styles.cargoWallet} aria-labelledby="cargo-wallet-title">
            <div className={styles.cargoWalletHeader}>
              <div>
                <span className={styles.metricLabel}>Cargo wallet</span>
                <h2 id="cargo-wallet-title">CARGO balance</h2>
              </div>
              <strong className={styles.cargoBalanceValue} data-numeric="true">
                {snapshot.cargoLoading && snapshot.cargoBalance == null
                  ? 'Loading…'
                  : formatCargo(snapshot.cargoBalance ?? 0n)}
              </strong>
            </div>
            <p className={styles.cargoWalletHint}>CARGO pays for delivery compensation, escrow, refunds, and tips. Keep ETH available for gas.</p>
            <div className={styles.cargoWalletControls}>
              <label htmlFor="cargo-amount">{cargoAction === 'redeem' ? 'CARGO to redeem' : 'ETH to convert'}</label>
              <input
                id="cargo-amount"
                inputMode="decimal"
                value={cargoAmount}
                onChange={(event) => setCargoAmount(event.target.value)}
                placeholder={cargoAction === 'redeem' ? '0.00 CARGO' : '0.00 ETH'}
                disabled={Boolean(cargoAction) || !cargoToken}
              />
              <div className={styles.cargoWalletButtons}>
                <Button
                  size="sm"
                  disabled={Boolean(cargoAction) || !cargoToken || !signer}
                  onClick={() => runCargoAction('deposit')}
                >
                  Convert ETH to CARGO
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(cargoAction) || !cargoToken || !signer}
                  onClick={() => runCargoAction('redeem')}
                >
                  Redeem CARGO
                </Button>
              </div>
            </div>
            <span className={styles.cargoRate}>Fixed rate: 1 ETH = 10,000 CARGO</span>
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
  const showSkeleton = loading && rows.length === 0;
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
          ) : rows.map((row) => (
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

function EditDisplayNameModal({ account, provider, signer, userRegistry, walletReady, refreshUserProfile, onClose }) {
  const titleId = useId();
  const inputRef = useRef(null);
  const submitLockRef = useRef(false);
  const [newName, setNewName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const trimmedName = useMemo(() => trimAsciiWhitespace(newName), [newName]);
  const trimmedConfirmation = useMemo(() => trimAsciiWhitespace(confirmation), [confirmation]);
  const nameError = getDisplayNameError(trimmedName);
  const confirmationError = getConfirmationError(trimmedConfirmation, trimmedName);

  const submit = async (event) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    setTouched(true);
    setError('');
    if (nameError || confirmationError) return;
    if (!walletReady || !provider || !signer || !userRegistry) {
      setError(`Connect this wallet on ${CARGO_NETWORK_CONFIG.chainName} before updating its display name.`);
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    let transactionToast;
    try {
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== account.toLowerCase()) throw new Error('The active MetaMask account changed. Close this dialog and try again.');
      transactionToast = startTransactionToast({ wallet: 'Confirm display name update in MetaMask…', submitted: 'Updating display name…', success: 'Display name updated.' });
      const transaction = await sendWalletContractTransaction({ contract: userRegistry, method: 'updateDisplayName', args: [trimmedName], signer, provider });
      transactionToast.submitted();
      await transaction.wait();
      await refreshUserProfile();
      transactionToast.success();
      onClose();
    } catch (caughtError) {
      const message = formatDisplayNameUpdateError(caughtError);
      if (transactionToast) transactionToast.error(message);
      else setError(message);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="presentation">
      <section className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <span className={styles.modalIcon} aria-hidden="true"><HiOutlineIdentification /></span>
            <div><h2 id={titleId}>Edit display name</h2><p>Update the public name associated with this wallet.</p></div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} disabled={submitting} aria-label="Close display name editor"><HiOutlineXMark aria-hidden="true" /></button>
        </header>
        <form className={styles.modalBody} onSubmit={submit} noValidate>
          <label className={styles.formLabel} htmlFor={`${titleId}-name`}>New display name</label>
          <input ref={inputRef} id={`${titleId}-name`} className={`${styles.formInput} ${touched && nameError ? styles.formInputError : ''}`} value={newName} onChange={(event) => setNewName(event.target.value)} onBlur={() => setTouched(true)} autoComplete="nickname" disabled={submitting} aria-invalid={Boolean(touched && nameError)} />
          <span className={styles.formHint}>{touched && nameError ? nameError : '1–8 words, up to 64 UTF-8 bytes.'}</span>
          <label className={styles.formLabel} htmlFor={`${titleId}-confirmation`}>Confirm new display name</label>
          <input id={`${titleId}-confirmation`} className={`${styles.formInput} ${touched && confirmationError ? styles.formInputError : ''}`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} onBlur={() => setTouched(true)} autoComplete="off" disabled={submitting} aria-invalid={Boolean(touched && confirmationError)} />
          <span className={styles.formHint}>{touched && confirmationError ? confirmationError : 'Both names must match after trimming.'}</span>
          <div className={styles.gasNotice}><HiOutlineInformationCircle aria-hidden="true" /><span>Updating your display name requires an on-chain transaction and a small gas fee.</span></div>
          {error && <div className={styles.modalError} role="alert">{error}</div>}
          <footer className={styles.modalFooter}><Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? 'Updating…' : 'Update display name'}</Button></footer>
        </form>
      </section>
    </div>
  );
}

function mapLockedEscrow(result) {
  return {
    totalLocked: BigInt(result?.totalLocked ?? result?.[0] ?? 0n),
    activeRequestCount: Number(result?.activeRequestCount ?? result?.[1] ?? 0n),
  };
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

function trimAsciiWhitespace(value) { return value.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, ''); }
function getDisplayNameError(name) {
  if (!name) return 'Enter a new display name.';
  if (countWords(name) > MAX_DISPLAY_NAME_WORDS) return `Display name must be ${MAX_DISPLAY_NAME_WORDS} words or fewer.`;
  if (new TextEncoder().encode(name).length > MAX_DISPLAY_NAME_BYTES) return 'Display name is too long. Shorten it and try again.';
  return '';
}
function getConfirmationError(confirmation, name) {
  if (!confirmation) return 'Confirm the new display name.';
  return confirmation !== name ? 'Display names must match exactly after trimming.' : '';
}
function countWords(value) { return value ? value.split(/\s+/u).filter(Boolean).length : 0; }
function formatDisplayNameUpdateError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') return 'Update was cancelled in MetaMask. Your display name was not changed.';
  return formatWalletTransactionError(error, 'Display name could not be updated. Check MetaMask and try again.');
}
