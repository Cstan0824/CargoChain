// src/pages/Funds.jsx — wallet-level financial activity.

import { useEffect, useMemo, useState } from 'react';
import { HiOutlineBanknotes, HiOutlineExclamationTriangle, HiOutlineWallet } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { LineChart } from '../components/LineChart.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useAccountAccess } from '../context/AccountAccessContext.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import {
  formatDate,
  formatEth,
  formatCargo,
  requestStatusLabel,
  REQUEST_TONE,
  shortAddress,
} from '../utils/format.js';
import {
  loadPaymentHistory,
  paymentActionLabel,
  PAYMENT_ACTION_TONE,
  shortTransactionHash,
} from '../utils/paymentHistory.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
import styles from './Funds.module.css';

export function Funds() {
  const navigate = useNavigate();
  const { account, chainId, provider, connect } = useWallet();
  const { selectedWallet } = useAccountAccess();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [lockedEscrow, setLockedEscrow] = useState(null);
  const [lockedLoading, setLockedLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const walletAddress = selectedWallet?.wallet_address || account || null;
  const networkLabel = chainId === CARGO_NETWORK_CONFIG.chainId
    ? CARGO_NETWORK_CONFIG.chainName
    : chainId != null
      ? `Chain ${chainId}`
      : '—';

  useEffect(() => {
    if (!provider || !walletAddress) {
      setBalance(null);
      setBalanceLoading(false);
      return undefined;
    }

    let cancelled = false;
    setBalanceLoading(true);
    provider.getBalance(walletAddress)
      .then((value) => {
        if (!cancelled) setBalance(value);
      })
      .catch((error) => {
        if (!cancelled) {
          setBalance(null);
          show(`Could not fetch wallet balance: ${error.shortMessage || error.message}`, 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, walletAddress, chainId, refreshKey, show]);

  useEffect(() => {
    const deliveryEscrow = contracts?.deliveryEscrow;
    if (!walletAddress || !deliveryEscrow) {
      setLockedEscrow(null);
      setLockedLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLockedLoading(true);
    deliveryEscrow.getLockedEscrow(walletAddress)
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
        if (!cancelled) setLockedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts?.deliveryEscrow, walletAddress, refreshKey]);

  useEffect(() => {
    if (!provider || !walletAddress || !contracts?.deliveryEscrow) {
      setTransactions([]);
      setHistoryLoading(false);
      setHistoryError(null);
      return undefined;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    loadPaymentHistory({
      contract: contracts.deliveryEscrow,
      provider,
      account: walletAddress,
    })
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          setTransactions([]);
          setHistoryError(formatHistoryError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, provider, walletAddress, refreshKey]);

  const earningsPayments = useMemo(() => {
    const normalizedAccount = walletAddress?.toLowerCase();
    if (!normalizedAccount) return [];
    return transactions.filter((transaction) => (
      ['PaymentReleased', 'CarrierTipped'].includes(transaction.action)
      && transaction.recipient?.toLowerCase() === normalizedAccount
    ));
  }, [transactions, walletAddress]);

  const cumulativeEarnings = useMemo(() => {
    let cumulative = 0n;
    return [...earningsPayments]
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .map((payment) => {
        cumulative += BigInt(payment.amount);
        return cumulative;
      });
  }, [earningsPayments]);

  const totalEarnings = cumulativeEarnings.at(-1) ?? 0n;
  const financialLoading = balanceLoading || lockedLoading;
  const refresh = () => setRefreshKey((value) => value + 1);

  if (!walletAddress) {
    return (
      <div className={styles.page}>
        <Topbar title="Funds" subtitle="Available balance, escrow, earnings, and wallet activity." />
        <Card className={styles.compactState}>
          <span className={styles.stateIcon} aria-hidden="true"><HiOutlineWallet /></span>
          <div>
            <h2>Connect a wallet to view funds</h2>
            <p>Wallet balances and on-chain payment history appear here for the active MetaMask account.</p>
          </div>
          <Button onClick={connect}>Connect wallet</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Topbar title="Funds" subtitle="Available balance, escrow, earnings, and wallet activity." />

      {deployError && (
        <Card className={styles.inlineNotice} role="alert">
          <HiOutlineExclamationTriangle aria-hidden="true" />
          <span>{deployError}</span>
        </Card>
      )}

      <section aria-labelledby="financial-flow-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Wallet financial flow</span>
            <h2 id="financial-flow-title">Your CargoChain funds</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={financialLoading}>
            {financialLoading ? 'Refreshing…' : 'Refresh funds'}
          </Button>
        </div>
        <div className={styles.kpiGrid}>
          <KpiCard
            label="Available balance"
            value={balance == null ? '—' : formatEth(balance)}
            sub="Wallet balance"
          />
          <KpiCard
            label="Locked escrow"
            value={lockedEscrow == null ? '—' : formatCargo(lockedEscrow.totalLocked)}
            sub={lockedEscrow ? `${lockedEscrow.activeRequestCount} active request${lockedEscrow.activeRequestCount === 1 ? '' : 's'}` : 'No escrow data'}
            tone="info"
          />
          <KpiCard
            label="Released earnings"
            value={formatCargo(totalEarnings)}
            sub={`${earningsPayments.length} payment${earningsPayments.length === 1 ? '' : 's'} received`}
            tone="positive"
          />
        </div>
      </section>

      {earningsPayments.length > 0 && (
        <Card className={styles.earningsCard}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Earnings trend</h2>
              <p>Milestone releases and completion tips received by this wallet.</p>
            </div>
            <Badge tone="success">{formatCargo(totalEarnings)} total</Badge>
          </div>
          <LineChart
            values={cumulativeEarnings}
            height={160}
            color="var(--chart-5)"
            ariaLabel={`Cumulative earnings ending at ${formatCargo(totalEarnings)}`}
          />
        </Card>
      )}

      <Card className={styles.utilityCard}>
        <div className={styles.utilityItem}>
          <span className={styles.utilityLabel}>Network</span>
          <Badge tone={chainId === CARGO_NETWORK_CONFIG.chainId ? 'success' : 'warning'}>{networkLabel}</Badge>
        </div>
        <div className={styles.utilityItem}>
          <span className={styles.utilityLabel}>Wallet address</span>
          <code title={walletAddress}>{shortAddress(walletAddress)}</code>
        </div>
        <Button variant="secondary" size="sm" onClick={() => copyAddress(walletAddress, show)}>
          Copy address
        </Button>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={financialLoading || historyLoading}>
          {financialLoading || historyLoading ? 'Refreshing…' : 'Refresh activity'}
        </Button>
      </Card>

      <section className={styles.historySection} aria-labelledby="funds-history-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>On-chain events</span>
            <h2 id="funds-history-title">Transaction history</h2>
          </div>
          <p>Funding, released payments, refunds, and tips route to the shipment timeline.</p>
        </div>
        <Card padded={false} className={styles.historyCard}>
          {historyLoading ? (
            <div className={styles.historyState} role="status">Loading payment events…</div>
          ) : historyError || deployError ? (
            <EmptyState
              icon={HiOutlineExclamationTriangle}
              title="Payment history unavailable"
              description={historyError || deployError}
              action={contracts?.deliveryEscrow && <Button variant="secondary" onClick={refresh}>Try again</Button>}
            />
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={HiOutlineBanknotes}
              title="No on-chain activity yet"
              description="Create a request or accept a job to see payment events appear here."
            />
          ) : (
            <TxHistoryTable rows={transactions} onRowClick={(requestId) => navigate(`/track/${requestId}`)} show={show} />
          )}
        </Card>
      </section>
    </div>
  );
}

function TxHistoryTable({ rows, onRowClick, show }) {
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
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr><th>Action</th><th>Request</th><th>Status</th><th>Amount</th><th>When</th><th>Transaction</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
              <td><Badge tone={PAYMENT_ACTION_TONE[row.action] || 'neutral'}>{paymentActionLabel(row.action, row.milestoneId)}</Badge></td>
              <td><span className={styles.requestId}>#{String(row.requestId).padStart(4, '0')}</span></td>
              <td><Badge tone={REQUEST_TONE[row.requestStatus] || 'neutral'}>{requestStatusLabel(row.requestStatus)}</Badge></td>
              <td className={styles.numeric}>{formatCargo(row.amount)}</td>
              <td className={styles.muted}>{formatDate(row.timestamp)}</td>
              <td>
                <button type="button" className={styles.hashButton} onClick={(event) => copyHash(event, row.transactionHash)}>
                  <code>{shortTransactionHash(row.transactionHash)}</code>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function copyAddress(address, show) {
  try {
    await navigator.clipboard.writeText(address);
    show('Wallet address copied to clipboard.', 'success');
  } catch {
    show('Could not copy the wallet address.', 'error');
  }
}

function formatHistoryError(error) {
  const message = error?.shortMessage || error?.reason || error?.message || '';
  return message || 'Could not load on-chain payment history.';
}
