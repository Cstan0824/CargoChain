// src/pages/Track.jsx — CargoChain
// Public tracker (no wallet required). Enter a Request ID to view the
// delivery timeline, request details, photo proof, and payment history
// on-chain.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineCheck,
  HiOutlineTruck,
  HiOutlineCheckBadge,
  HiOutlineExclamationCircle,
  HiOutlinePhoto,
  HiOutlineCreditCard,
  HiOutlineInformationCircle,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Badge } from '../components/Badge.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { SearchInput } from '../components/SearchInput.jsx';
import { Button } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import {
  formatDate,
  formatEth,
  shortAddress,
  requestStatus,
  REQUEST_TONE,
  milestoneStatus,
  MILESTONE_TONE,
} from '../utils/format.js';
import { clipboardRouteMap } from '../assets';
import styles from './Track.module.css';

// Demo data used while contracts are not yet deployed.
const DEMO_TIMELINE = [
  { timestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 2,  eventType: 'RequestCreated',     actor: '0xA1B2…C3D4', details: 'for 0x9F8E…7D6C' },
  { timestamp: Math.floor(Date.now() / 1000) - 60 * 55,   eventType: 'AcceptedByCarrier', actor: '0x5566…7788', details: '' },
  { timestamp: Math.floor(Date.now() / 1000) - 60 * 30,   eventType: 'PickupFromShipper', actor: '0x5566…7788', details: 'Photo proof uploaded' },
  { timestamp: Math.floor(Date.now() / 1000) - 60 * 5,    eventType: 'AwaitingVerification', actor: '', details: 'Please review the proof and approve or reject.' },
  { timestamp: Math.floor(Date.now() / 1000) - 60 * 2,    eventType: 'DeliveredToRecipient', actor: '0x5566…7788', details: 'Pending' },
];

const DEMO_SUMMARY = {
  id: 1001,
  category: 'Electronics',
  from: 'Kuala Lumpur',
  to: 'Penang',
  specialInstruction: 'Handle with care. Recipient is at the loading bay on Level 2.',
  createdAt: Math.floor(Date.now() / 1000) - 60 * 60 * 2,
  status: 'InProgress',
  escrow: 2500000000000000000n,
  released: 750000000000000000n,    // 30% (1 milestone paid)
  remaining: 1750000000000000000n,  // 70%
};

const TONE_BY_TYPE = {
  RequestCreated: 'success',
  AcceptedByCarrier: 'info',
  PickupFromShipper: 'info',
  AwaitingVerification: 'warning',
  VerifiedByShipper: 'success',
  DeliveredToRecipient: 'info',
  PaymentReleased: 'success',
  MilestoneRejected: 'danger',
  RequestCancelled: 'danger',
  RefundIssued: 'warning',
  RequestRepublished: 'warning',
};

const TAB_ITEMS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'details',  label: 'Details' },
  { value: 'proof',    label: 'Proof' },
  { value: 'payments', label: 'Payments' },
];

// Statuses where the Shipper CTA "Refund remaining" is allowed
// (BusinessFlow §5 Scenario C).
const REFUNDABLE_STATUSES = new Set(['Cancelled', 'Expired']);

export function Track() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const [draft, setDraft] = useState(idParam || '');
  const [committed, setCommitted] = useState(idParam || '');
  const [tab, setTab] = useState('timeline');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!committed) {
      setEvents([]);
      return;
    }
    if (!contracts?.lifecycleManager) {
      setEvents(DEMO_TIMELINE);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      contracts.lifecycleManager.getRequestTimeline(BigInt(committed))
        .then((result) => {
          setEvents(Array.isArray(result) && result.length > 0 ? result : DEMO_TIMELINE);
        })
        .catch((e) => {
          setError(e.shortMessage || e.message);
          setEvents(DEMO_TIMELINE);
        })
        .finally(() => setLoading(false));
    } catch (e) {
      setError(e.shortMessage || e.message);
      setEvents(DEMO_TIMELINE);
      setLoading(false);
    }
  }, [contracts, committed]);

  const submit = (val) => {
    const v = (val ?? draft).toString().trim();
    if (!v) return;
    setCommitted(v);
    navigate(`/track/${v}`);
  };

  const handleRefund = () => {
    show(`Refund flow — module c (Jeremy). Request #${committed} would call refundRemaining(${committed}).`, 'info');
  };

  const showSummary = !!committed;
  const summary = DEMO_SUMMARY;
  const isRefundable = REFUNDABLE_STATUSES.has(summary.status);
  const hasUnreleased = summary.remaining > 0n;

  return (
    <div className={styles.page}>
      <Topbar
        title="Track Shipment"
        subtitle="Enter a Request ID to view its delivery timeline."
        actions={
          showSummary ? (
            <Button variant="secondary" onClick={() => { setDraft(''); setCommitted(''); navigate('/track'); }}>
              New search
            </Button>
          ) : null
        }
      />

      <Card className={styles.searchCard} padded={false}>
        <div className={styles.searchInner}>
          <SearchInput
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            placeholder="Enter Request ID…"
            actionLabel="Trace"
          />
        </div>
      </Card>

      {!showSummary && (
        <Card padded={false} className={styles.emptyCard}>
          <EmptyState
            illustration={clipboardRouteMap}
            title="Track any shipment"
            description="Enter a Request ID above to see the route, milestones, proof of delivery, and payment history on-chain. Public — no wallet needed."
          />
        </Card>
      )}

      {showSummary && (
        <Card className={styles.summary}>
          <div className={styles.summaryHead}>
            <div className={styles.summaryId}>
              <span className={styles.summaryIdLabel}>Request</span>
              <span className={styles.summaryIdVal}>#{String(summary.id).padStart(4, '0')}</span>
            </div>
            <Badge tone={REQUEST_TONE[summary.status] || 'neutral'} icon={HiOutlineTruck}>
              {requestStatus(summary.status)}
            </Badge>
          </div>

          <div className={styles.summaryGrid}>
            <div>
              <div className={styles.summaryFieldLabel}>Category</div>
              <div className={styles.summaryFieldVal}>{summary.category}</div>
            </div>
            <div>
              <div className={styles.summaryFieldLabel}>Route</div>
              <div className={styles.summaryFieldVal}>
                {summary.from}
                <span className={styles.routeArrow}>→</span>
                {summary.to}
              </div>
            </div>
            <div>
              <div className={styles.summaryFieldLabel}>Created</div>
              <div className={styles.summaryFieldVal}>{formatDate(summary.createdAt)}</div>
            </div>
            <div>
              <div className={styles.summaryFieldLabel}>Escrow</div>
              <div className={styles.summaryFieldVal}>
                {formatEth(summary.escrow)}
                <Badge tone="success" icon={HiOutlineCheckBadge}>Funded</Badge>
              </div>
            </div>
          </div>

          {summary.specialInstruction && (
            <div className={styles.specialNote}>
              <HiOutlineInformationCircle className={styles.specialNoteIcon} aria-hidden="true" />
              <div>
                <div className={styles.specialNoteTitle}>Special instructions</div>
                <div className={styles.specialNoteBody}>{summary.specialInstruction}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {showSummary && (
        <Card padded={false} className={styles.tabsCard}>
          <div className={styles.tabsWrap}>
            <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
          </div>
          <div className={styles.tabBody}>
            {tab === 'timeline' && (
              <TimelinePanel events={events} loading={loading} error={error} deployError={deployError} />
            )}
            {tab === 'details' && (
              <DetailsPanel summary={summary} />
            )}
            {tab === 'proof' && (
              <ProofPanel showToast={show} />
            )}
            {tab === 'payments' && (
              <PaymentsPanel
                summary={summary}
                showToast={show}
                onRefund={handleRefund}
                canRefund={isRefundable && hasUnreleased}
              />
            )}
          </div>
        </Card>
      )}

      {!showSummary && !loading && (
        <Card className={styles.intro}>
          <div className={styles.introTitle}>No request selected</div>
          <p className={styles.introBody}>
            Enter a Request ID above to view its delivery timeline. Tracking is public — no wallet required.
          </p>
          <Button onClick={() => { setDraft('1001'); submit('1001'); }}>
            Try demo request #1001
          </Button>
        </Card>
      )}
    </div>
  );
}

function TimelinePanel({ events, loading, error, deployError }) {
  if (loading) return <div className={styles.tabEmpty}>Loading timeline…</div>;

  if (deployError) {
    return (
      <div className={styles.tabEmpty}>
        Contracts not deployed. Showing demo timeline. Run <code>npm run migrate</code> to populate from the contract.
      </div>
    );
  }
  if (error) {
    return <div className={styles.tabEmpty}>Couldn't load timeline: {error}. Showing demo data.</div>;
  }
  if (!events.length) return <div className={styles.tabEmpty}>No events for this request yet.</div>;

  return (
    <ol className={styles.timeline}>
      {events.map((ev, i) => {
        const tone = TONE_BY_TYPE[ev.eventType] || 'neutral';
        const isRejection = ev.eventType === 'MilestoneRejected';
        return (
          <li key={i} className={`${styles.tlItem} ${styles[`tl_${tone}`]}`}>
            <span className={styles.tlDot} aria-hidden="true">
              {tone === 'success' ? <HiOutlineCheck aria-hidden="true" /> : null}
            </span>
            <div className={styles.tlBody}>
              <div className={styles.tlTime}>{formatDate(ev.timestamp)}</div>
              <div className={styles.tlTitle}>{ev.eventType}</div>
              {ev.actor && <div className={styles.tlActor}>by {shortAddress(ev.actor)}</div>}
              {ev.details && <div className={styles.tlDetails}>{ev.details}</div>}
              {isRejection && ev.details && (
                <div className={styles.rejectionBox}>
                  <HiOutlineExclamationCircle className={styles.rejectionIcon} aria-hidden="true" />
                  <div>
                    <div className={styles.rejectionTitle}>Rejection reason</div>
                    <div className={styles.rejectionBody}>{ev.details}</div>
                  </div>
                </div>
              )}
              {ev.eventType === 'PickupFromShipper' && (
                <div className={styles.proofRow}>
                  <div className={styles.proofStub} title="Photo proof placeholder">Proof submitted</div>
                  <div className={styles.proofStub} title="Photo proof placeholder">Proof submitted</div>
                  <a href="#" className={styles.proofLink}>View Proof</a>
                </div>
              )}
              {ev.eventType === 'AwaitingVerification' && (
                <div className={styles.actionRow}>
                  <Button size="sm" onClick={() => alert('TODO[Module c]: verifyMilestone(reqId, msId, true)')}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => alert('TODO[Module c]: verifyMilestone(reqId, msId, false)')}>Reject</Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DetailsPanel({ summary }) {
  return (
    <div className={styles.detailsGrid}>
      <DetailRow label="Request ID" value={`#${String(summary.id).padStart(4, '0')}`} />
      <DetailRow label="Status" value={
        <Badge tone={REQUEST_TONE[summary.status] || 'neutral'} icon={HiOutlineTruck}>
          {requestStatus(summary.status)}
        </Badge>
      } />
      <DetailRow label="Category" value={summary.category} />
      <DetailRow label="From" value={summary.from} />
      <DetailRow label="To" value={summary.to} />
      <DetailRow label="Created" value={formatDate(summary.createdAt)} />
      <DetailRow label="Escrow locked" value={<><strong>{formatEth(summary.escrow)}</strong>{' '}<Badge tone="success" icon={HiOutlineCheckBadge}>Funded</Badge></>} />
      <DetailRow label="Released so far" value={formatEth(summary.released)} />
      <DetailRow label="Remaining in escrow" value={formatEth(summary.remaining)} />
      {summary.specialInstruction && (
        <DetailRow label="Special instructions" value={summary.specialInstruction} />
      )}
      <DetailRow label="Contract" value="DeliveryEscrow.sol" />
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className={styles.detailRow}>
      <div className={styles.detailLabel}>{label}</div>
      <div className={styles.detailValue}>{value}</div>
    </div>
  );
}

function ProofPanel({ showToast }) {
  return (
    <div className={styles.proofPanel}>
      <div className={styles.proofHeader}>
        <HiOutlinePhoto className={styles.proofHeaderIcon} aria-hidden="true" />
        <div>
          <div className={styles.proofHeaderTitle}>Photo proof</div>
          <div className={styles.proofHeaderBody}>
            Photo-proof hash is stored on-chain; the bytes themselves live on the upload server.
          </div>
        </div>
      </div>
      <div className={styles.proofList}>
        <div className={styles.proofPlaceholder} onClick={() => showToast('Photo viewer coming soon — module d.', 'info')}>
          <span>Proof #1</span>
          <span className={styles.proofPlaceholderHint}>Click to open</span>
        </div>
        <div className={styles.proofPlaceholder} onClick={() => showToast('Photo viewer coming soon — module d.', 'info')}>
          <span>Proof #2</span>
          <span className={styles.proofPlaceholderHint}>Click to open</span>
        </div>
      </div>
    </div>
  );
}

function PaymentsPanel({ summary, showToast, onRefund, canRefund }) {
  return (
    <div className={styles.paymentsPanel}>
      <div className={styles.paymentsHeader}>
        <HiOutlineCreditCard className={styles.paymentsHeaderIcon} aria-hidden="true" />
        <div>
          <div className={styles.paymentsHeaderTitle}>Payment history</div>
          <div className={styles.paymentsHeaderBody}>
            {formatEth(summary.escrow)} total locked in escrow for this request.
          </div>
        </div>
      </div>
      <div className={styles.paymentRow}>
        <div className={styles.paymentLabel}>Locked in escrow</div>
        <div className={styles.paymentValue}>{formatEth(summary.escrow)}</div>
      </div>
      <div className={styles.paymentRow}>
        <div className={styles.paymentLabel}>Released so far</div>
        <div className={styles.paymentValue}>{formatEth(summary.released)}</div>
      </div>
      <div className={styles.paymentRow}>
        <div className={styles.paymentLabel}>Remaining (refundable)</div>
        <div className={styles.paymentValue}>{formatEth(summary.remaining)}</div>
      </div>

      {canRefund && (
        <div className={styles.refundBlock}>
          <div className={styles.refundText}>
            <strong>Request is refundable.</strong>{' '}
            Only the remaining unpaid escrow ({formatEth(summary.remaining)}) can be refunded —
            already-paid milestones are not reversed.
          </div>
          <Button variant="secondary" onClick={onRefund}>
            Refund remaining
          </Button>
        </div>
      )}

      <div className={styles.paymentNote}>
        Payment events are emitted by <code>DeliveryEscrow.releaseStage()</code> after the shipper
        approves each milestone proof. Refunds go through <code>refundRemaining(requestId)</code>.
      </div>
    </div>
  );
}
