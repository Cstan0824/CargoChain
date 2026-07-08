// src/pages/RequestDetail.jsx — CargoChain
// Read-only preview of an Open delivery request. Items live here, not in
// the marketplace row. The carrier's "Accept Job" action lives here.
// Once a request is accepted, the user moves to /track/:id for the
// timeline view (per BusinessFlow §7: Track is for accepted requests).

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiArrowLeft,
  HiOutlineMapPin,
  HiOutlineCalendarDays,
  HiOutlineCube,
  HiOutlineCheckBadge,
  HiOutlineTruck,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { useToast } from '../hooks/useToast.js';
import {
  formatEth,
  formatRelative,
  formatDate,
  formatDeadlineDuration,
  formatItems,
  requestStatus,
  REQUEST_TONE,
} from '../utils/format.js';
import styles from './RequestDetail.module.css';

// Demo request. status is `Open` for the marketplace flow. Items
// follow the §6 `Item` entity: { itemName, itemDescription, quantity }.
const DEMO_REQUEST = {
  id: 1001,
  from: 'Kuala Lumpur',
  to: 'Penang',
  status: 'Open',
  items: [
    { itemName: 'Server rack',  itemDescription: 'Freight class 85, original packaging', quantity: '2' },
    { itemName: 'Cable bundle', itemDescription: 'CAT6, 50m roll',                      quantity: '1 bundle' },
    { itemName: 'Spare parts',  itemDescription: '',                                       quantity: '4 boxes' },
  ],
  specialInstruction: 'Handle with care. Recipient is at the loading bay on Level 2. Call ahead 30 minutes before arrival.',
  rewardWei: 2500000000000000000n,
  createdAt: Math.floor(Date.now() / 1000) - 7200,
  deadlineMs: Date.now() + 5 * 86400000,
  milestones: 4,
  current: 0,
  // Carrier hasn't accepted yet — these are unset.
  carrier: null,
};

export function RequestDetail() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const [request, setRequest] = useState(DEMO_REQUEST);
  const [loading, setLoading] = useState(false);

  // When Module b wires the per-id fetch, swap this for the contract call.
  useEffect(() => {
    if (!idParam) return;
    setLoading(true);
    // Simulated: pull a different `id` to prove the URL parameter drives the view.
    setRequest((prev) => ({ ...prev, id: Number(idParam) || prev.id }));
    setLoading(false);
  }, [idParam]);

  const accept = () => {
    show(
      `Accept Job — module d (Melissa). Request #${request.id} would transition Open → PendingApproval.`,
      'info',
    );
  };

  const goBack = () => navigate('/');
  const goTimeline = () => navigate(`/track/${request.id}`);

  const isAccepted = !['Open', 'PendingApproval', 'Cancelled', 'Expired', 'Refunded'].includes(request.status);

  return (
    <div className={styles.page}>
      <Topbar
        title={`Request #${String(request.id).padStart(4, '0')}`}
        subtitle="Preview the full request before you accept."
        actions={
          <Button variant="secondary" onClick={goBack}>
            <HiArrowLeft className={styles.backIcon} aria-hidden="true" /> Back to marketplace
          </Button>
        }
      />

      {loading && <Card><div className={styles.muted}>Loading request…</div></Card>}

      {!loading && request && (
        <>
          {/* --- Header card: status + key fields --- */}
          <Card className={styles.header}>
            <div className={styles.headerTop}>
              <div>
                <div className={styles.label}>Request</div>
                <div className={styles.idValue}>#{String(request.id).padStart(4, '0')}</div>
              </div>
              <div className={styles.headerBadges}>
                <Badge tone={REQUEST_TONE[request.status] || 'neutral'} icon={HiOutlineTruck}>
                  {requestStatus(request.status)}
                </Badge>
                {isAccepted
                  ? <Badge tone="success" icon={HiOutlineCheckBadge}>Accepted</Badge>
                  : <Badge tone="info">Awaiting carrier</Badge>}
              </div>
            </div>

            <div className={styles.routeBlock}>
              <div className={styles.routePin} aria-hidden="true">
                <HiOutlineMapPin size={20} />
              </div>
              <div className={styles.routeText}>
                <div className={styles.routeFrom}>{request.from}</div>
                <div className={styles.routeDivider} aria-hidden="true" />
                <div className={styles.routeTo}>{request.to}</div>
              </div>
              <div className={styles.routeMeta}>
                <div className={styles.label}>Reward</div>
                <div className={styles.rewardValue}>{formatEth(request.rewardWei)}</div>
              </div>
              <div className={styles.routeMeta}>
                <div className={styles.label}>Milestones</div>
                <div className={styles.milestoneBlock}>
                  <ProgressLine count={request.milestones} current={request.current} label={false} />
                  <span className={styles.milestoneLabel}>{request.current} / {request.milestones}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* --- Details card: deadline + creation --- */}
          <div className={styles.detailGrid}>
            <Card className={styles.detailCard}>
              <div className={styles.detailHead}>
                <HiOutlineCalendarDays className={styles.detailIcon} aria-hidden="true" />
                <div>
                  <div className={styles.cardTitle}>Deadline</div>
                  <div className={styles.cardSub}>When this delivery must be completed.</div>
                </div>
              </div>
              <div className={styles.detailBody}>
                <div className={styles.bigValue}>{formatDeadlineDuration(request.deadlineMs)}</div>
                <div className={styles.muted}>{formatDate(Math.floor(request.deadlineMs / 1000))}</div>
              </div>
            </Card>

            <Card className={styles.detailCard}>
              <div className={styles.detailHead}>
                <HiOutlineCalendarDays className={styles.detailIcon} aria-hidden="true" />
                <div>
                  <div className={styles.cardTitle}>Created</div>
                  <div className={styles.cardSub}>When the shipper posted the request.</div>
                </div>
              </div>
              <div className={styles.detailBody}>
                <div className={styles.bigValue}>{formatRelative(request.createdAt)}</div>
                <div className={styles.muted}>{formatDate(request.createdAt)}</div>
              </div>
            </Card>
          </div>

          {/* --- Items card --- */}
          <Card className={styles.itemsCard} padded={false}>
            <div className={styles.itemsHead}>
              <HiOutlineCube className={styles.detailIcon} aria-hidden="true" />
              <div>
                <div className={styles.cardTitle}>Items</div>
                <div className={styles.cardSub}>{formatItems(request.items)}</div>
              </div>
            </div>
            <ul className={styles.itemsList}>
              {request.items.map((it, i) => (
                <li key={i} className={styles.itemRow}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemName}>
                      {it.itemName}
                      {it.quantity && <span className={styles.itemQty}> × {it.quantity}</span>}
                    </div>
                    {it.itemDescription && (
                      <div className={styles.itemDesc}>{it.itemDescription}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* --- Special instructions card --- */}
          {request.specialInstruction && (
            <Card className={styles.instrCard}>
              <div className={styles.cardTitle}>Special instructions</div>
              <p className={styles.instrBody}>{request.specialInstruction}</p>
            </Card>
          )}

          {/* --- Footer actions --- */}
          <div className={styles.footerRow}>
            {isAccepted ? (
              <Button onClick={goTimeline}>Open timeline</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={goBack}>Back</Button>
                <Button onClick={accept}>Accept Job</Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
