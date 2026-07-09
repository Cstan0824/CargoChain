// src/pages/RequestDetail.jsx - Marketplace request preview.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiArrowLeft,
  HiOutlineCube,
  HiOutlineMapPin,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useWallet } from '../hooks/useWallet.js';
import {
  formatDate,
  formatDaysLeft,
  formatEth,
  formatRelative,
  requestStatus,
  REQUEST_TONE,
  shortAddress,
} from '../utils/format.js';
import { deliveryTruckCity } from '../assets';
import styles from './RequestDetail.module.css';

export function RequestDetail() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { account } = useWallet();
  const { contracts, deployError } = useContracts();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!idParam || !contracts?.deliveryEscrow) {
      setRequest(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadRequest(contracts.deliveryEscrow, idParam)
      .then((nextRequest) => {
        if (!cancelled) setRequest(nextRequest);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRequest(null);
          setError(loadError.shortMessage || loadError.reason || loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, idParam]);

  const goBack = () => navigate('/');

  if (loading) {
    return (
      <div className={styles.page}>
        <Topbar title={`Request #${String(idParam || '').padStart(4, '0')}`} />
        <Card><div className={styles.muted}>Loading request from DeliveryEscrow...</div></Card>
      </div>
    );
  }

  if (deployError || error || !request) {
    return (
      <div className={styles.page}>
        <Topbar title={`Request #${String(idParam || '').padStart(4, '0')}`} />
        <Card padded={false}>
          <EmptyState
            illustration={deliveryTruckCity}
            title="Request unavailable"
            description={deployError || error || 'This request could not be found.'}
            action={<Button variant="secondary" onClick={goBack}>Back to marketplace</Button>}
          />
        </Card>
      </div>
    );
  }

  const isShipper = Boolean(account && account.toLowerCase() === request.shipper.toLowerCase());
  const displayedPayment = request.escrow > 0n ? request.escrow : request.proposedAmount;

  return (
    <div className={styles.page}>
      <Topbar
        title={`Request #${String(request.id).padStart(4, '0')}`}
        subtitle="Review the shipment requirements before proposing milestones."
        actions={
          <Button variant="secondary" onClick={goBack}>
            <HiArrowLeft className={styles.backIcon} aria-hidden="true" />
            Marketplace
          </Button>
        }
      />

      <div className={styles.dashboardGrid}>
        <div className={styles.leftColumn}>
          <Card padded={false} className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <HiOutlineMapPin className={styles.sectionIcon} aria-hidden="true" />
              <div>
                <h2>Shipping route</h2>
                <p>Pickup and final delivery locations</p>
              </div>
            </div>
            <div className={styles.routeTimeline}>
              <div className={styles.routeStop}>
                <span className={styles.routeDot}>A</span>
                <div>
                  <span className={styles.label}>Pickup from</span>
                  <strong>{request.from}</strong>
                </div>
              </div>
              <span className={styles.routeLine} aria-hidden="true" />
              <div className={styles.routeStop}>
                <span className={`${styles.routeDot} ${styles.routeDotEnd}`}>B</span>
                <div>
                  <span className={styles.label}>Deliver to</span>
                  <strong>{request.to}</strong>
                </div>
              </div>
            </div>
          </Card>

          <Card padded={false} className={styles.manifest}>
            <div className={styles.sectionHeader}>
              <HiOutlineCube className={styles.sectionIcon} aria-hidden="true" />
              <div>
                <h2>Cargo manifest</h2>
                <p>{request.items.length} item type{request.items.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className={styles.itemList}>
              {request.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className={styles.itemRow}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.description || 'No description provided.'}</p>
                  </div>
                  <span className={styles.quantity}>Qty {item.quantity}</span>
                </div>
              ))}
            </div>
            {request.specialInstruction && (
              <div className={styles.instructions}>
                <span className={styles.label}>Special instructions</span>
                <p>{request.specialInstruction}</p>
              </div>
            )}
          </Card>
        </div>

        <div className={styles.rightColumn}>
          <Card className={styles.escrowCard}>
            <span className={styles.label}>
              {request.escrow > 0n ? 'Total locked in escrow' : 'Planned payment'}
            </span>
            <strong className={styles.escrowValue}>{formatEth(displayedPayment)}</strong>
            <span className={styles.muted}>
              {request.escrow > 0n ? 'Escrow funded' : 'Funded after the shipper accepts a proposal'}
            </span>
          </Card>

          <Card className={styles.metaCard}>
            <MetaRow
              label="Request status"
              value={
                <Badge tone={REQUEST_TONE[request.status] || 'neutral'}>
                  {requestStatus(request.status)}
                </Badge>
              }
            />
            <MetaRow label="Shipper" value={<span title={request.shipper}>{shortAddress(request.shipper)}</span>} />
            <MetaRow
              label="Delivery deadline"
              value={
                <span>
                  {formatDate(Math.floor(request.deadlineMs / 1000))}
                  <small>{formatDaysLeft(request.deadlineMs)}</small>
                </span>
              }
            />
            <MetaRow
              label="Published"
              value={
                <span>
                  {formatRelative(request.createdAt)}
                  <small>{formatDate(request.createdAt)}</small>
                </span>
              }
            />
            <MetaRow
              label="Milestone plan"
              value={request.milestones.length ? `${request.milestones.length} proposed` : 'Awaiting carrier'}
            />
          </Card>
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="secondary" onClick={goBack}>Back</Button>
        {request.status === 'Open' && !isShipper && (
          <Button onClick={() => navigate(`/shipments/${request.id}/propose`)}>
            Propose milestones
          </Button>
        )}
        {request.status === 'Open' && isShipper && (
          <Button onClick={() => navigate(`/track/${request.id}`)}>View shipment status</Button>
        )}
        {request.status !== 'Open' && (
          <Button onClick={() => navigate(`/track/${request.id}`)}>
            {request.status === 'PendingApproval' ? 'Review proposal' : 'Open shipment timeline'}
          </Button>
        )}
      </div>
    </div>
  );
}

async function loadRequest(deliveryEscrow, idParam) {
  const requestId = BigInt(idParam);
  const [rawRequest, rawItems, rawMilestones] = await Promise.all([
    deliveryEscrow.getRequest(requestId),
    deliveryEscrow.getItems(requestId),
    deliveryEscrow.getMilestones(requestId),
  ]);

  const carrier = rawRequest.carrier ?? rawRequest[2];
  return {
    id: Number(rawRequest.requestId ?? rawRequest[0]),
    shipper: rawRequest.shipper ?? rawRequest[1],
    carrier: isZeroAddress(carrier) ? null : carrier,
    from: rawRequest.pickupLocation ?? rawRequest[3],
    to: rawRequest.deliveryLocation ?? rawRequest[4],
    escrow: BigInt(rawRequest.totalAmount ?? rawRequest[5] ?? 0n),
    deadlineMs: Number(rawRequest.deadline ?? rawRequest[7] ?? 0n) * 1000,
    specialInstruction: rawRequest.specialInstruction ?? rawRequest[8],
    status: requestStatus(rawRequest.status ?? rawRequest[9]),
    createdAt: Number(rawRequest.createdAt ?? rawRequest[10] ?? 0n),
    proposedAmount: BigInt(rawRequest.proposedAmount ?? rawRequest[11] ?? 0n),
    items: Array.from(rawItems || []).map((item) => ({
      name: item.itemName ?? item[0],
      description: item.itemDescription ?? item[1],
      quantity: Number(item.quantity ?? item[2]),
    })),
    milestones: Array.from(rawMilestones || []),
  };
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}

function MetaRow({ label, value }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.label}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
