// src/pages/Shipper.jsx — CargoChain
// Topbar with Create Request + Export, 4 KPI cards, a Pending Verifications
// card (per the BusinessFlow §4 happy path: shipper must verify each proof),
// Recent Shipments table, Escrow Overview donut, and the bottom notice.

import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineTruck,
  HiOutlineCheckBadge,
  HiOutlineChevronRight,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { Table } from '../components/Table.jsx';
import { DonutChart } from '../components/DonutChart.jsx';
import { useToast } from '../hooks/useToast.js';
import { formatEth, formatRelative, requestStatus, REQUEST_TONE, MILESTONE_TONE } from '../utils/format.js';
import {
  escrowFundedTile,
  lockedTile,
  paymentReleasedTile,
  verificationLaptopUser,
} from '../assets';
import styles from './Shipper.module.css';

// Statuses that surface a Badge in the recent shipments table.
const STATUS_ICON = {
  Open:            HiOutlineCheckBadge,
  PendingApproval: HiOutlineExclamationCircle,
  Funded:          HiOutlineCheckBadge,
  InProgress:      HiOutlineTruck,
  Completed:       HiOutlineCheckBadge,
  Cancelled:       HiOutlineExclamationCircle,
  Expired:         HiOutlineExclamationCircle,
  Refunded:        HiOutlineCheckBadge,
};

const SHIPMENTS = [
  { id: 1001, from: 'KL',     to: 'Penang',  status: 'InProgress', rewardWei: 2500000000000000000n, age: '2h ago' },
  { id: 1002, from: 'JB',     to: 'SG',      status: 'Cancelled',  rewardWei: 1400000000000000000n, age: '5h ago' },
  { id: 1003, from: 'KL',     to: 'JB',      status: 'Open',       rewardWei:  900000000000000000n, age: '1d ago' },
  { id: 1004, from: 'Penang', to: 'KL',      status: 'Completed',  rewardWei: 1200000000000000000n, age: '3d ago' },
  { id: 1005, from: 'KL',     to: 'SG',      status: 'Open',       rewardWei:  600000000000000000n, age: '3d ago' },
];

// Milestones awaiting shipper verification (BusinessFlow §4 step 4).
const PENDING_VERIFICATIONS = [
  { requestId: 1001, from: 'KL', to: 'Penang',     milestone: 'In transit', submittedAt: 1700000000 },
  { requestId: 1002, from: 'JB', to: 'Singapore',  milestone: 'Delivered to recipient', submittedAt: 1700000600 },
  { requestId: 1006, from: 'KL', to: 'Ipoh',       milestone: 'Picked up from shipper', submittedAt: 1700001200 },
];

export function Shipper() {
  const navigate = useNavigate();
  const { show } = useToast();

  return (
    <div className={styles.page}>
      <Topbar
        title="Shipper Dashboard"
        subtitle="Manage your shipments, escrow and milestones."
        actions={
          <>
            <Button variant="secondary" onClick={() => show('Export coming soon.', 'info')}>
              <HiOutlineArrowDownTray className={styles.btnIcon} aria-hidden="true" /> Export
            </Button>
            <Button onClick={() => navigate('/create-request')}>+ Create request</Button>
          </>
        }
      />

      <div className={styles.kpiRow}>
        <KpiCard label="Active requests" value="8"   delta="2 from last week" tone="positive" icon={lockedTile} />
        <KpiCard label="Escrow locked"  value="12.45 ETH" sub="≈ S$24,890.00" delta="2 from last week" tone="positive" icon={escrowFundedTile} />
        <KpiCard
          label="Pending verifications"
          value={String(PENDING_VERIFICATIONS.length)}
          delta="awaiting your review"
          tone="negative"
          icon={HiOutlineExclamationCircle}
        />
        <KpiCard label="Completed (this month)" value="15" delta="5 this month" tone="positive" icon={paymentReleasedTile} />
      </div>

      <Card className={styles.pending} padded={false}>
        <div className={styles.pendingHeader}>
          <div>
            <h2 className={styles.cardTitle}>Pending verifications</h2>
            <p className={styles.pendingSub}>
              The carrier has submitted proof for these milestones. Review the photo and approve or reject.
            </p>
          </div>
          <Badge tone="warning" icon={HiOutlineExclamationCircle}>
            {PENDING_VERIFICATIONS.length} awaiting
          </Badge>
        </div>
        <ul className={styles.pendingList}>
          {PENDING_VERIFICATIONS.map((p) => (
            <li key={p.requestId} className={styles.pendingRow}>
              <span className={styles.pendingThumb} aria-hidden="true">
                <HiOutlinePhoto className={styles.pendingThumbIcon} />
              </span>
              <div className={styles.pendingMain}>
                <div className={styles.pendingTopLine}>
                  <span className={styles.pendingId}>#{String(p.requestId).padStart(4, '0')}</span>
                  <span className={styles.pendingRoute}><strong>{p.from}</strong> → <strong>{p.to}</strong></span>
                </div>
                <div className={styles.pendingBottomLine}>
                  <Badge tone="info">{p.milestone}</Badge>
                  <span className={styles.pendingAge}>Submitted {formatRelative(p.submittedAt)}</span>
                </div>
              </div>
              <div className={styles.pendingActions}>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/track/${p.requestId}`)}>
                  Review proof
                </Button>
                <HiOutlineChevronRight className={styles.pendingChev} aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className={styles.body}>
        <Card className={styles.recent} padded={false}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Recent shipments</h2>
            <a className={styles.viewAll} onClick={() => navigate('/my-shipments')} role="button" tabIndex={0}>
              View all
            </a>
          </div>
          <Table
            columns={[
              { key: 'id', header: 'ID', width: '8%', render: (r) => <span className={styles.idCell}>#{String(r.id).padStart(4, '0')}</span> },
              { key: 'route', header: 'Route', width: '24%', render: (r) => <span><strong>{r.from}</strong> <span className={styles.arrow}>→</span> <strong>{r.to}</strong></span> },
              { key: 'status', header: 'Status', width: '22%', render: (r) => (
                <Badge tone={REQUEST_TONE[r.status] || 'neutral'} icon={STATUS_ICON[r.status]}>
                  {requestStatus(r.status)}
                </Badge>
              )},
              { key: 'reward', header: 'Reward', width: '12%', render: (r) => <span className={styles.numCell}>{formatEth(r.rewardWei)}</span> },
              { key: 'age',    header: 'Age',    width: '10%', render: (r) => <span className={styles.muted}>{r.age}</span> },
            ]}
            rows={SHIPMENTS}
          />
        </Card>

        <Card className={styles.escrow}>
          <h2 className={styles.cardTitle}>Escrow overview</h2>
          <DonutChart
            total={12.45}
            centerLabel="Total locked"
            segments={[
              { value: 6.2,  label: 'In progress' },
              { value: 3.15, label: 'Awaiting verify' },
              { value: 2.1,  label: 'Pending' },
              { value: 1.2,  label: 'Completed' },
            ]}
          />
          <ul className={styles.legend}>
            <li><span className={styles.dot} style={{ background: 'var(--chart-1)' }} /> <span>In progress</span> <span className={styles.legendVal}>6.20 ETH (49%)</span></li>
            <li><span className={styles.dot} style={{ background: 'var(--chart-2)' }} /> <span>Awaiting verify</span> <span className={styles.legendVal}>3.15 ETH (29%)</span></li>
            <li><span className={styles.dot} style={{ background: 'var(--chart-3)' }} /> <span>Pending</span> <span className={styles.legendVal}>2.10 ETH (17%)</span></li>
            <li><span className={styles.dot} style={{ background: 'var(--chart-4)' }} /> <span>Completed</span> <span className={styles.legendVal}>1.20 ETH (9%)</span></li>
          </ul>
        </Card>
      </div>

      <Card className={styles.notice}>
        <div className={styles.noticeLeft}>
          <HiOutlineCheckCircle className={styles.noticeIcon} aria-hidden="true" />
          <div>
            <div className={styles.noticeTitle}>Milestones are verified by you.</div>
            <div className={styles.noticeBody}>
              Review proofs carefully to release payments. Funds stay locked in escrow until you sign off.
            </div>
          </div>
        </div>
        <img src={verificationLaptopUser} alt="" className={styles.noticeArt} />
      </Card>
    </div>
  );
}
