// src/pages/Profile.jsx — CargoChain
// Single page for "you, your funds, and what your wallet has done".
// Folds in the standalone Wallet page (deleted).
//
//   • Identity         — User entity from BusinessFlow §6
//                        (walletAddress, role, displayName, isRegistered).
//   • Account details  — registered fields + inline registration form.
//   • Funds overview   — Account balance / Locked in escrow / Available.
//   • Network & account — chain pill, copy-address, refresh balance.
//   • Transaction history — TransactionRecord rows (BusinessFlow §6),
//                            each row navigates to /track/:requestId.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import {
  shortAddress,
  roleLabel,
  formatDate,
  formatEth,
  requestStatus,
  REQUEST_TONE,
} from '../utils/format.js';
import { pickAvatar } from '../utils/avatar.js';
import {
  workerPackingInventory,
  escrowFundedTile,
} from '../assets';
import styles from './Profile.module.css';

const CHAIN_NAMES = { 1: 'Mainnet', 11155111: 'Sepolia', 1337: 'Ganache', 5777: 'Ganache' };

// Demo TransactionRecord rows. `requestStatus` is what the request is
// doing right now — it's the "where is this escrow going" indicator
// the user asked for on the history view.
const DEMO_TXS = [
  { id: '0xabc…1234', action: 'EscrowFunded',     requestId: 1001, requestStatus: 'InProgress', amount: 2500000000000000000n, timestamp: 1700000000 },
  { id: '0xdef…5678', action: 'MilestonePayment', requestId: 1001, requestStatus: 'InProgress', amount:  750000000000000000n, timestamp: 1700000600 },
  { id: '0x9ab…cdef', action: 'RefundIssued',     requestId: 1002, requestStatus: 'Refunded',   amount: 1400000000000000000n, timestamp: 1700001200 },
  { id: '0x77a…bb00', action: 'MilestonePayment', requestId: 1003, requestStatus: 'Completed',  amount:  600000000000000000n, timestamp: 1700002000 },
];

export function Profile() {
  const navigate = useNavigate();
  const { account, chainId, provider, role: sessionRole } = useWallet();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!account || !contracts?.userRegistry) return;
    setLoading(true);
    contracts.userRegistry.getProfile(account)
      .then((p) => setProfile(p))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [contracts, account]);

  // Refresh balance on account / chain change.
  useEffect(() => {
    if (provider && account) fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account, chainId]);

  const fetchBalance = async () => {
    if (!provider || !account) return;
    setBalanceLoading(true);
    try {
      const wei = await provider.getBalance(account);
      setBalance(wei);
    } catch (e) {
      show('Could not fetch balance: ' + (e.shortMessage || e.message), 'error');
    } finally {
      setBalanceLoading(false);
    }
  };

  const displayName = profile?.displayName || profile?.[1] || (account ? shortAddress(account) : 'Guest');
  const role = roleLabel(profile?.role ?? sessionRole);
  const roleSrc = profile?.role ?? sessionRole;
  const avatarSrc = pickAvatar(roleSrc, account);
  const registered = !!profile || (!deployError && account && profile !== null);
  const memberSince = profile?.createdAt;

  const chain = CHAIN_NAMES[chainId] || (chainId != null ? `Chain ${chainId}` : '—');
  const lockedEscrow = 3450000000000000000n; // demo only; module c wires this
  const available = balance != null ? balance - lockedEscrow : null;

  const copy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      show('Address copied to clipboard', 'success');
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Profile"
        subtitle="Your account, funds, and on-chain activity."
      />

      {/* --- Identity --- */}
      <div className={styles.identityGrid}>
        <Card className={styles.identityCard}>
          <Avatar src={avatarSrc} name={displayName} size={88} />
          <div className={styles.name}>{displayName}</div>
          <div className={styles.addr}>{account ? shortAddress(account) : 'Not connected'}</div>
          <div className={styles.roleRow}>
            <Badge tone={roleSrc ? 'info' : 'neutral'}>{role}</Badge>
            {registered
              ? <Badge tone="success">Registered</Badge>
              : <Badge tone="warning">Guest</Badge>}
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => show('Edit profile coming soon — module a.', 'info')}>
              Edit profile
            </Button>
          </div>
        </Card>

        <Card padded={false} className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <h2 className={styles.cardTitle}>Account details</h2>
            {registered && memberSince && (
              <span className={styles.memberSince}>Member since {formatDate(memberSince)}</span>
            )}
          </div>

          {loading && <div className={styles.detailEmpty}>Loading profile…</div>}

          {!loading && profile && (
            <dl className={styles.detailList}>
              <DetailRow label="Wallet address" value={<code className={styles.code}>{account}</code>} />
              <DetailRow label="Display name"  value={displayName} />
              <DetailRow label="Role"          value={<Badge tone="info">{role}</Badge>} />
              <DetailRow label="Registered"    value={<Badge tone="success">Yes</Badge>} />
              {memberSince && <DetailRow label="Member since" value={formatDate(memberSince)} />}
            </dl>
          )}

          {!loading && !profile && !deployError && account && (
            <RegistrationForm />
          )}

          {!loading && deployError && (
            <EmptyState
              illustration={workerPackingInventory}
              title="Contracts not deployed"
              description="Run npm run migrate to enable on-chain profile lookups."
            />
          )}

          {!loading && !account && (
            <EmptyState
              illustration={workerPackingInventory}
              title="No wallet connected"
              description="Connect MetaMask to view or create your on-chain profile."
            />
          )}
        </Card>
      </div>

      {/* --- Funds overview (replaces standalone Wallet page) --- */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.cardTitle}>Funds</h2>
          {account && (
            <Button variant="secondary" size="sm" onClick={fetchBalance} disabled={balanceLoading}>
              {balanceLoading ? 'Refreshing…' : 'Refresh balance'}
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
            value="3.45 ETH"
            sub="across active requests"
            tone="info"
          />
          <KpiCard
            label="Available"
            value={available != null ? formatEth(available) : '—'}
            sub="after escrow lock"
          />
        </div>
      </div>

      {/* --- Network & account --- */}
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
              <div className={styles.value}>
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

      {/* --- Transaction history --- */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.cardTitle}>Transaction history</h2>
            <p className={styles.cardSub}>
              Escrow funding, milestone payments, and refunds emitted on-chain. Click a row to open the request timeline.
            </p>
          </div>
        </div>
        <Card padded={false} className={styles.txsCard}>
          {DEMO_TXS.length === 0 ? (
            <EmptyState
              illustration={escrowFundedTile}
              title="No on-chain activity yet"
              description="Create a request or accept a job to see transactions appear here."
            />
          ) : (
            <TxHistoryTable
              rows={DEMO_TXS}
              onRowClick={(requestId) => navigate(`/track/${requestId}`)}
            />
          )}
          {deployError && (
            <div className={styles.deployNote}>
              Contracts not deployed — showing demo history. Run <code>npm run migrate</code> to populate from the contract.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TxHistoryTable({ rows, onRowClick }) {
  const { show } = useToast();
  const copyHash = async (e, id) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      show('Tx hash copied to clipboard', 'success');
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };
  return (
    <table className={styles.txTable}>
      <thead>
        <tr>
          <th>Tx hash</th>
          <th>Request</th>
          <th>Request status</th>
          <th>Amount</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            className={styles.txRow}
            onClick={() => onRowClick(r.requestId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(r.requestId);
              }
            }}
            aria-label={`Open request #${String(r.requestId).padStart(4, '0')} timeline`}
          >
            <td>
              <button
                type="button"
                className={styles.hashBtn}
                onClick={(e) => copyHash(e, r.id)}
                title="Copy tx hash"
              >
                <code>{r.id}</code>
              </button>
            </td>
            <td><span className={styles.reqId}>#{String(r.requestId).padStart(4, '0')}</span></td>
            <td>
              <Badge tone={REQUEST_TONE[r.requestStatus] || 'neutral'}>
                {requestStatus(r.requestStatus)}
              </Badge>
            </td>
            <td className={styles.numCell}>{formatEth(r.amount)}</td>
            <td className={styles.mutedCell}>{formatDate(r.timestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

function RegistrationForm() {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('Shipper');
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      show('Display name is required.', 'error');
      return;
    }
    setBusy(true);
    setTimeout(() => {
      show(`Registration call would invoke userRegistry.register("${name}", ${role}).`, 'info');
      setBusy(false);
    }, 600);
  };

  return (
    <form className={styles.regForm} onSubmit={submit}>
      <div className={styles.regIntro}>
        <strong>Register on-chain.</strong>{' '}
        Pin your display name and role to your wallet so the marketplace and other
        actors can recognize you.
      </div>
      <div className={styles.regField}>
        <label className={styles.regLabel}>Display name</label>
        <input
          className={styles.regInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Soon Tian"
        />
      </div>
      <div className={styles.regField}>
        <label className={styles.regLabel}>Role</label>
        <div className={styles.regInputWrap}>
          <select className={styles.regSelect} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="Shipper">Shipper</option>
            <option value="Carrier">Carrier</option>
          </select>
          <span className={styles.regCaret} aria-hidden="true">▾</span>
        </div>
      </div>
      <div className={styles.regActions}>
        <Button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register on-chain'}</Button>
      </div>
    </form>
  );
}
