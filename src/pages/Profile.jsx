// src/pages/Profile.jsx — CargoChain
// Wallet identity, real funds, carrier earnings, and event-based payment history.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineIdentification, HiOutlineInformationCircle, HiOutlineXMark, HiStar } from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { LineChart } from '../components/LineChart.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { useToast } from '../hooks/useToast.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import {
  shortAddress,
  formatDate,
  formatEth,
  requestStatus,
  REQUEST_TONE,
} from '../utils/format.js';
import {
  loadPaymentHistory,
  paymentActionLabel,
  PAYMENT_ACTION_TONE,
  shortTransactionHash,
} from '../utils/paymentHistory.js';
import { countWords, utf8Length } from '../utils/textLimits.js';
import { pickAvatar } from '../utils/avatar.js';
import { loadCarrierReputationProfile } from '../services/reputationService.js';
import { formatRatingAverage, REPUTATION_TAGS } from '../utils/reputation.js';
import {
  workerPackingInventory,
  escrowFundedTile,
} from '../assets';
import styles from './Profile.module.css';

const CHAIN_NAMES = { 1: 'Mainnet', 11155111: 'Sepolia', 1337: 'Ganache', 5777: 'Ganache' };
const MAX_DISPLAY_NAME_BYTES = 64;
const MAX_DISPLAY_NAME_WORDS = 8;

export function Profile() {
  const navigate = useNavigate();
  const { account, chainId, provider, signer } = useWallet();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const {
    isRegistered,
    displayName,
    userProfile,
    isProfileLoading,
    openRegistrationModal,
    refreshUserProfile,
  } = useUserProfile();
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [lockedEscrow, setLockedEscrow] = useState(null);
  const [lockedEscrowLoading, setLockedEscrowLoading] = useState(false);
  const [fundsRefreshKey, setFundsRefreshKey] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reputationProfile, setReputationProfile] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(false);

  // Refresh the real MetaMask balance on account, chain, and funds refresh.
  useEffect(() => {
    if (provider && account) {
      fetchBalance();
    } else {
      setBalance(null);
      setBalanceLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account, chainId, fundsRefreshKey]);

  useEffect(() => {
    if (!provider || !account || !contracts?.deliveryEscrow) {
      setTransactions([]);
      setHistoryLoading(false);
      setHistoryError(null);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    loadPaymentHistory({
      contract: contracts.deliveryEscrow,
      provider,
      account,
    })
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch((historyLoadError) => {
        if (!cancelled) {
          setTransactions([]);
          setHistoryError(formatHistoryError(historyLoadError));
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, account, contracts, historyRefreshKey]);

  // Locked escrow is contract state, refreshed alongside account/contract/history changes.
  useEffect(() => {
    const deliveryEscrow = contracts?.deliveryEscrow;
    if (!account || !deliveryEscrow) {
      setLockedEscrow(null);
      setLockedEscrowLoading(false);
      return;
    }

    let cancelled = false;
    setLockedEscrowLoading(true);
    deliveryEscrow.getLockedEscrow(account)
      .then((result) => {
        if (cancelled) return;
        setLockedEscrow({
          totalLocked: BigInt(result?.totalLocked ?? result?.[0] ?? 0n),
          activeRequestCount: Number(result?.activeRequestCount ?? result?.[1] ?? 0n),
        });
      })
      .catch(() => {
        if (!cancelled) setLockedEscrow(null);
      })
      .finally(() => {
        if (!cancelled) setLockedEscrowLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account, contracts?.deliveryEscrow, fundsRefreshKey, historyRefreshKey]);

  useEffect(() => {
    if (!isRegistered) setIsEditOpen(false);
  }, [isRegistered]);

  useEffect(() => {
    if (!account || !contracts?.reputationRegistry) {
      setReputationProfile(null);
      setReputationLoading(false);
      return;
    }
    let cancelled = false;
    setReputationLoading(true);
    loadCarrierReputationProfile(contracts, account)
      .then((result) => { if (!cancelled) setReputationProfile(result); })
      .catch(() => { if (!cancelled) setReputationProfile(null); })
      .finally(() => { if (!cancelled) setReputationLoading(false); });
    return () => { cancelled = true; };
  }, [account, contracts]);

  const earningsPayments = useMemo(() => {
    const normalizedAccount = account?.toLowerCase();
    if (!normalizedAccount) return [];

    return transactions.filter((transaction) => (
      ['PaymentReleased', 'CarrierTipped'].includes(transaction.action)
      && transaction.recipient?.toLowerCase() === normalizedAccount
    ));
  }, [account, transactions]);

  const cumulativeEarnings = useMemo(() => {
    let cumulative = 0n;
    return [...earningsPayments]
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .map((payment) => {
        cumulative += BigInt(payment.amount);
        return cumulative;
      });
  }, [earningsPayments]);

  const fetchBalance = async () => {
    if (!provider || !account) return;
    setBalanceLoading(true);
    try {
      const wei = await provider.getBalance(account);
      setBalance(wei);
    } catch (error) {
      show('Could not fetch balance: ' + (error.shortMessage || error.message), 'error');
    } finally {
      setBalanceLoading(false);
    }
  };

  const refreshFunds = () => {
    setFundsRefreshKey((value) => value + 1);
  };

  const copy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      show('Address copied to clipboard', 'success');
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };

  const profileName = isRegistered ? displayName : 'Guest';
  const avatarSrc = pickAvatar(null, account);
  const memberSince = userProfile?.registeredAt;
  const chain = CHAIN_NAMES[chainId] || (chainId != null ? `Chain ${chainId}` : '—');
  const activeRequestCount = lockedEscrow?.activeRequestCount ?? 0;
  const totalEarnings = cumulativeEarnings.at(-1) ?? 0n;
  const fundsAreLoading = balanceLoading || lockedEscrowLoading;

  return (
    <div className={styles.page}>
      <Topbar
        title="Profile"
        subtitle="Your account, funds, and on-chain activity."
      />

      <div className={styles.identityGrid}>
        <Card className={styles.identityCard}>
          <Avatar src={avatarSrc} name={profileName} size={88} />
          <div className={styles.name}>{profileName}</div>
          <div className={styles.addr}>{account ? shortAddress(account) : 'Not connected'}</div>
          <div className={styles.statusRow}>
            <Badge tone={isRegistered ? 'success' : 'warning'}>
              {isRegistered ? 'Registered' : 'Unregistered'}
            </Badge>
          </div>
          {isRegistered && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
                Edit display name
              </Button>
            </div>
          )}
        </Card>

        <Card padded={false} className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <h2 className={styles.cardTitle}>Account details</h2>
            {isRegistered && memberSince > 0n && (
              <span className={styles.memberSince}>Registered {formatDate(memberSince)}</span>
            )}
          </div>

          {isProfileLoading && <div className={styles.detailEmpty}>Loading profile…</div>}

          {!isProfileLoading && isRegistered && (
            <dl className={styles.detailList}>
              <DetailRow label="Display name" value={displayName} />
              <DetailRow label="Wallet address" value={<code className={styles.code}>{account}</code>} />
              <DetailRow label="Registration date" value={formatDate(memberSince)} />
            </dl>
          )}

          {!isProfileLoading && !isRegistered && account && !deployError && (
            <div className={styles.unregisteredDetails}>
              <dl className={styles.detailList}>
                <DetailRow label="Display name" value={<span className={styles.noName}>No display name registered</span>} />
                <DetailRow label="Wallet address" value={<code className={styles.code}>{account}</code>} />
              </dl>
              <div className={styles.unregisteredAction}>
                <p>Register a public display name so other CargoChain users can recognize this wallet.</p>
                <Button onClick={() => openRegistrationModal()}>Register display name</Button>
              </div>
            </div>
          )}

          {!isProfileLoading && deployError && account && (
            <EmptyState
              illustration={workerPackingInventory}
              title="Contracts not deployed"
              description="Run npm run migrate to enable on-chain profile lookups."
            />
          )}

          {!isProfileLoading && !account && (
            <EmptyState
              illustration={workerPackingInventory}
              title="No wallet connected"
              description="Connect MetaMask to view or create your on-chain profile."
            />
          )}
        </Card>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.cardTitle}>Funds</h2>
          {account && (
            <Button variant="secondary" size="sm" onClick={refreshFunds} disabled={fundsAreLoading}>
              {fundsAreLoading ? 'Refreshing…' : 'Refresh funds'}
            </Button>
          )}
        </div>
        <div className={styles.kpiRow}>
          <KpiCard
            label="Account balance"
            value={balance != null ? formatEth(balance) : '—'}
            sub={account ? shortAddress(account) : 'Not connected'}
          />
          <KpiCard
            label="Locked in escrow"
            value={lockedEscrow ? formatEth(lockedEscrow.totalLocked) : '—'}
            sub={account
              ? `${activeRequestCount} active request${activeRequestCount === 1 ? '' : 's'}`
              : 'Not connected'}
            tone="info"
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.cardTitle}>Carrier earnings</h2>
            <p className={styles.cardSub}>Cumulative milestone payments released to this wallet.</p>
          </div>
        </div>
        <Card className={styles.earningsCard}>
          {historyLoading ? (
            <div className={styles.earningsLoading} role="status">Loading released payment events…</div>
          ) : earningsPayments.length > 0 ? (
            <>
              <div className={styles.earningsSummary}>
                <div>
                  <span className={styles.earningsLabel}>Total earned</span>
                  <strong className={styles.earningsTotal}>{formatEth(totalEarnings)}</strong>
                </div>
                <Badge tone="success">
                  {earningsPayments.length} released payment{earningsPayments.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <LineChart
                values={cumulativeEarnings}
                height={180}
                color="var(--chart-5)"
                ariaLabel={`Cumulative carrier earnings ending at ${formatEth(totalEarnings)}`}
              />
            </>
          ) : (
            <EmptyState
              illustration={escrowFundedTile}
              title="No carrier earnings yet"
              description="Payments released to this wallet will appear here as cumulative earnings."
            />
          )}
        </Card>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.cardTitle}>Carrier reputation</h2>
            <p className={styles.cardSub}>Verified delivery outcomes and ratings earned by this wallet.</p>
          </div>
        </div>
        <Card className={styles.reputationCard}>
          {!account ? (
            <div className={styles.reputationEmpty}>Connect your wallet to view its carrier reputation.</div>
          ) : reputationLoading ? (
            <div className={styles.reputationEmpty}>Loading carrier reputation...</div>
          ) : reputationProfile ? (
            <>
              <div className={styles.reputationSummary}>
                <div className={styles.reputationAverage}>
                  <span>Average rating</span>
                  <strong>{formatRatingAverage(reputationProfile.averageRating)}</strong>
                </div>
                <div className={styles.reputationStars} aria-label={`${reputationProfile.ratingCount} verified ratings`}>
                  <div>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <HiStar key={star} className={reputationProfile.averageRating != null && star <= Math.round(reputationProfile.averageRating) ? styles.reputationStarActive : styles.reputationStarInactive} aria-hidden="true" />
                    ))}
                  </div>
                  <span>{reputationProfile.ratingCount} verified</span>
                </div>
                <div className={styles.reputationMetric}><span>Completed deliveries</span><strong>{reputationProfile.completedDeliveries}</strong></div>
                <div className={styles.reputationMetric}><span>On-time completion</span><strong>{reputationProfile.onTimeRate == null ? '—' : `${reputationProfile.onTimeRate}%`}</strong></div>
              </div>
              <div className={styles.reputationTags}>
                {REPUTATION_TAGS
                  .map((tag) => ({ ...tag, count: reputationProfile.tagCounts[tag.id] || 0 }))
                  .filter((tag) => tag.count > 0)
                  .sort((left, right) => right.count - left.count)
                  .slice(0, 5)
                  .map((tag) => <Badge key={tag.id} tone={tag.tone === 'improvement' ? 'warning' : 'neutral'}>{tag.label} · {tag.count}</Badge>)}
                {reputationProfile.ratingCount === 0 && <span className={styles.reputationMuted}>No carrier ratings yet.</span>}
              </div>
            </>
          ) : (
            <div className={styles.reputationEmpty}>Carrier reputation is unavailable for this deployment.</div>
          )}
        </Card>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.cardTitle}>Network &amp; account</h2>
        </div>
        <Card className={styles.networkCard}>
          <div className={styles.networkRow}>
            <div>
              <div className={styles.label}>Network</div>
              <div className={styles.value}>
                <Badge tone={chainId ? 'success' : 'neutral'}>{chain}</Badge>
              </div>
            </div>
            <div>
              <div className={styles.label}>Short address</div>
              <div className={styles.value}>
                <code className={styles.code}>{account ? shortAddress(account) : '—'}</code>
              </div>
            </div>
            <div>
              <div className={styles.label}>Address format</div>
              <div className={styles.value}>EIP-55 checksum</div>
            </div>
            <div>
              <div className={styles.label}>Balance</div>
              <div className={`${styles.value} ${styles.numericValue}`}>
                {balance != null ? formatEth(balance) : '—'}
              </div>
            </div>
          </div>
          {account && (
            <div className={styles.fullAddrRow}>
              <div className={styles.label}>Full address</div>
              <code className={styles.fullAddrCode}>{account}</code>
              <Button variant="secondary" size="sm" onClick={copy}>Copy</Button>
            </div>
          )}
        </Card>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.cardTitle}>Transaction history</h2>
            <p className={styles.cardSub}>
              Escrow funding, milestone payments, and refunds emitted on-chain. Click a row to open the request timeline.
            </p>
          </div>
          {account && contracts?.deliveryEscrow && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setHistoryRefreshKey((value) => value + 1)}
              disabled={historyLoading}
            >
              {historyLoading ? 'Refreshing…' : 'Refresh history'}
            </Button>
          )}
        </div>
        <Card padded={false} className={styles.txsCard}>
          {!account ? (
            <EmptyState
              illustration={escrowFundedTile}
              title="Connect your wallet"
              description="Connect MetaMask to load payment events for your delivery requests."
            />
          ) : historyLoading ? (
            <div className={styles.historyState} role="status">Loading payment events from Ganache…</div>
          ) : historyError || deployError ? (
            <EmptyState
              illustration={escrowFundedTile}
              title="Payment history unavailable"
              description={historyError || deployError}
              action={contracts?.deliveryEscrow && (
                <Button variant="secondary" onClick={() => setHistoryRefreshKey((value) => value + 1)}>
                  Try again
                </Button>
              )}
            />
          ) : transactions.length === 0 ? (
            <EmptyState
              illustration={escrowFundedTile}
              title="No on-chain activity yet"
              description="Create a request or accept a job to see transactions appear here."
            />
          ) : (
            <TxHistoryTable
              rows={transactions}
              onRowClick={(requestId) => navigate(`/track/${requestId}`)}
            />
          )}
        </Card>
      </div>

      {isRegistered && isEditOpen && (
        <EditDisplayNameModal
          account={account}
          currentName={displayName}
          provider={provider}
          signer={signer}
          userRegistry={contracts?.userRegistry}
          refreshUserProfile={refreshUserProfile}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}

function EditDisplayNameModal({
  account,
  currentName,
  provider,
  signer,
  userRegistry,
  refreshUserProfile,
  onClose,
}) {
  const { show } = useToast();
  const titleId = useId();
  const inputRef = useRef(null);
  const submitLockRef = useRef(false);
  const operationRef = useRef(0);
  const [newName, setNewName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState('idle');
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');

  const trimmedName = useMemo(() => trimAsciiWhitespace(newName), [newName]);
  const trimmedConfirmation = useMemo(() => trimAsciiWhitespace(confirmation), [confirmation]);
  const nameBytes = useMemo(() => utf8Length(trimmedName), [trimmedName]);
  const nameWordCount = useMemo(() => countWords(trimmedName), [trimmedName]);
  const nameError = getDisplayNameError(trimmedName, nameBytes, nameWordCount);
  const nameTooLong = nameBytes > MAX_DISPLAY_NAME_BYTES
    || nameWordCount > MAX_DISPLAY_NAME_WORDS;
  const confirmationError = getConfirmationError(trimmedConfirmation, trimmedName);
  const isSubmitting = stage === 'wallet' || stage === 'mining' || stage === 'refreshing';

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitLockRef.current) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    operationRef.current += 1;
    submitLockRef.current = false;
  }, []);

  const requestClose = () => {
    if (!submitLockRef.current) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitLockRef.current) return;

    setTouched(true);
    setError('');
    if (nameError || confirmationError) return;
    if (!account || !userRegistry || !signer || !provider) {
      setError('Display name updates are not available on the current network.');
      return;
    }

    submitLockRef.current = true;
    const operationId = ++operationRef.current;
    const submittedAccount = account;

    try {
      setStage('wallet');
      const activeSigner = signer;
      const signerAddress = await activeSigner.getAddress();
      if (signerAddress.toLowerCase() !== submittedAccount.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Close this dialog and edit the current wallet profile.');
      }

      const transaction = await sendWalletContractTransaction({
        contract: userRegistry,
        method: 'updateDisplayName',
        args: [trimmedName],
        signer: activeSigner,
        provider,
      });

      if (operationId !== operationRef.current) return;
      setTransactionHash(transaction.hash || '');
      setStage('mining');
      await transaction.wait();

      if (operationId !== operationRef.current) return;
      setStage('refreshing');
      await refreshUserProfile();

      if (operationId !== operationRef.current) return;
      show('Display name updated.', 'success');
      onClose();
    } catch (caughtError) {
      if (operationId !== operationRef.current) return;
      setStage('error');
      setError(formatDisplayNameUpdateError(caughtError));
    } finally {
      if (operationId === operationRef.current) submitLockRef.current = false;
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={styles.editModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.modalHeader}>
          <div className={styles.modalHeadingGroup}>
            <span className={styles.modalIcon} aria-hidden="true">
              <HiOutlineIdentification />
            </span>
            <div>
              <h2 id={titleId} className={styles.modalTitle}>Edit display name</h2>
              <p className={styles.modalSubtitle}>Update the public name associated with this wallet.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={requestClose}
            disabled={isSubmitting}
            aria-label="Close display name editor"
          >
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <form className={styles.modalBody} onSubmit={submit} noValidate>
          <div className={styles.readOnlyGrid}>
            <div>
              <span>Current display name</span>
              <strong>{currentName}</strong>
            </div>
            <div>
              <span>Wallet</span>
              <code>{account}</code>
            </div>
          </div>

          <div className={styles.gasNotice}>
            <HiOutlineInformationCircle aria-hidden="true" />
            <span>Updating your display name requires an on-chain transaction and a small gas fee.</span>
          </div>

          <div className={styles.modalField}>
            <div className={styles.modalLabelRow}>
              <label htmlFor={`${titleId}-new-name`}>New display name</label>
              <span className={nameTooLong ? styles.byteCountError : styles.byteCount}>
                {nameWordCount}/{MAX_DISPLAY_NAME_WORDS} words
              </span>
            </div>
            <input
              ref={inputRef}
              id={`${titleId}-new-name`}
              className={`${styles.modalInput} ${touched && nameError ? styles.modalInputError : ''}`}
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                if (error) setError('');
              }}
              onBlur={() => setTouched(true)}
              autoComplete="nickname"
              disabled={isSubmitting}
              aria-invalid={Boolean(touched && nameError)}
            />
            <span className={styles.fieldHelp}>
              {touched && nameError ? <span className={styles.validationError}>{nameError}</span> : 'Leading and trailing ASCII spaces are removed.'}
            </span>
          </div>

          <div className={styles.modalField}>
            <label htmlFor={`${titleId}-confirmation`}>Confirm new display name</label>
            <input
              id={`${titleId}-confirmation`}
              className={`${styles.modalInput} ${touched && confirmationError ? styles.modalInputError : ''}`}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (error) setError('');
              }}
              onBlur={() => setTouched(true)}
              autoComplete="off"
              disabled={isSubmitting}
              aria-invalid={Boolean(touched && confirmationError)}
            />
            <span className={styles.fieldHelp}>
              {touched && confirmationError ? <span className={styles.validationError}>{confirmationError}</span> : 'Both names must match exactly after trimming.'}
            </span>
          </div>

          {isSubmitting && (
            <div className={styles.transactionStatus} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <strong>{getUpdateStageTitle(stage)}</strong>
                <span>{getUpdateStageDescription(stage, transactionHash)}</span>
              </div>
            </div>
          )}

          {error && <div className={styles.modalError} role="alert">{error}</div>}

          <footer className={styles.modalFooter}>
            <button
              type="button"
              className={styles.modalSecondaryButton}
              onClick={requestClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.modalPrimaryButton}
              disabled={isSubmitting}
            >
              {getUpdateSubmitLabel(stage)}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function TxHistoryTable({ rows, onRowClick }) {
  const { show } = useToast();
  const copyHash = async (event, id) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      show('Tx hash copied to clipboard', 'success');
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };

  return (
    <div className={styles.txTableWrap}>
      <table className={styles.txTable}>
        <thead>
          <tr>
            <th>Action</th>
            <th>Tx hash</th>
            <th>Request</th>
            <th>Request status</th>
            <th>Amount</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={styles.txRow}
              onClick={() => onRowClick(row.requestId)}
              role="button"
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
                <Badge tone={PAYMENT_ACTION_TONE[row.action] || 'neutral'}>
                  {paymentActionLabel(row.action, row.milestoneId)}
                </Badge>
              </td>
              <td>
                <button
                  type="button"
                  className={styles.hashBtn}
                  onClick={(event) => copyHash(event, row.transactionHash)}
                  title="Copy tx hash"
                >
                  <code>{shortTransactionHash(row.transactionHash)}</code>
                </button>
              </td>
              <td><span className={styles.reqId}>#{String(row.requestId).padStart(4, '0')}</span></td>
              <td>
                <Badge tone={REQUEST_TONE[row.requestStatus] || 'neutral'}>
                  {requestStatus(row.requestStatus)}
                </Badge>
              </td>
              <td className={styles.numCell}>{formatEth(row.amount)}</td>
              <td className={styles.mutedCell}>{formatDate(row.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{value}</dd>
    </div>
  );
}

function formatHistoryError(error) {
  const message = error?.shortMessage || error?.reason || error?.message || '';
  if (message.includes('could not coalesce error')) {
    return 'Ganache or MetaMask returned an RPC error. Confirm CargoChain is selected, then refresh.';
  }
  return message || 'Could not read payment events from DeliveryEscrow.';
}

function trimAsciiWhitespace(value) {
  return value.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, '');
}

function getDisplayNameError(name, byteLength, wordCount) {
  if (!name) return 'Enter a new display name.';
  if (wordCount > MAX_DISPLAY_NAME_WORDS) {
    return `Display name must be ${MAX_DISPLAY_NAME_WORDS} words or fewer.`;
  }
  if (byteLength > MAX_DISPLAY_NAME_BYTES) return 'Display name is too long. Shorten it and try again.';
  return '';
}

function getConfirmationError(confirmation, name) {
  if (!confirmation) return 'Confirm the new display name.';
  if (confirmation !== name) return 'Display names must match exactly after trimming.';
  return '';
}

function getUpdateStageTitle(stage) {
  if (stage === 'wallet') return 'Confirm in MetaMask';
  if (stage === 'mining') return 'Update submitted';
  return 'Update confirmed';
}

function getUpdateStageDescription(stage, transactionHash) {
  if (stage === 'wallet') return 'Review and approve the display name update in your wallet.';
  if (stage === 'mining') {
    return transactionHash
      ? `Waiting for the network to confirm ${shortTransactionHash(transactionHash)}.`
      : 'Waiting for the network to confirm the transaction.';
  }
  return 'Refreshing your CargoChain profile.';
}

function getUpdateSubmitLabel(stage) {
  if (stage === 'wallet') return 'Waiting for wallet…';
  if (stage === 'mining') return 'Confirming on-chain…';
  if (stage === 'refreshing') return 'Refreshing profile…';
  return 'Update display name';
}

function formatDisplayNameUpdateError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED' || (error?.code === 'TRANSACTION_REPLACED' && error?.cancelled)) {
    return 'Update was cancelled in MetaMask. Your display name was not changed.';
  }

  const message = [
    error?.info?.error?.data?.reason,
    error?.error?.data?.reason,
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.message,
    error?.message,
  ].find(Boolean) || '';
  const normalized = message.toLowerCase();

  if (normalized.includes('display name required')) return 'The contract rejected the update because the display name is empty.';
  if (normalized.includes('display name exceeds 64 bytes')) return 'The contract rejected the update because the display name is too long.';
  if (normalized.includes('user is not registered')) return 'The contract rejected the update because this wallet is not registered.';
  if (normalized.includes('insufficient funds')) return 'This wallet does not have enough ETH for the transaction gas fee.';
  if (normalized.includes('active metamask account changed')) return message;
  if (normalized.includes('missing revert data')) {
    return 'The deployed UserRegistry contract is unavailable or outdated. Confirm the network and redeploy the contracts.';
  }
  if (error?.code === 'CALL_EXCEPTION' || normalized.includes('execution reverted')) {
    return 'The UserRegistry contract rejected the update. Confirm the profile is registered and try again.';
  }

  return formatWalletTransactionError(
    error,
    message || 'Display name could not be updated. Check MetaMask and try again.',
  );
}
