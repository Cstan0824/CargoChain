// src/pages/Carrier.jsx — CargoChain
// Two-column carrier dashboard.
// Left: Next Action (proof upload) + My Jobs (tabs).
// Right: Quick Actions + Earnings chart.

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineMap,
  HiOutlineArrowUpTray,
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineCreditCard,
  HiOutlineCheckBadge,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineXMark,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { ProgressLine } from '../components/ProgressLine.jsx';
import { LineChart } from '../components/LineChart.jsx';
import { useToast } from '../hooks/useToast.js';
import { formatCargo } from '../utils/format.js';
import { hashFile } from '../utils/upload.js';
import styles from './Carrier.module.css';

// Demo jobs. status mirrors the MilestoneStatus enum from BusinessFlow §6:
//   'InTransit'             → a milestone is currently in progress
//   'AwaitingVerification'  → proof submitted, shipper reviewing
//   'AwaitingResubmission'  → proof rejected, needs new photo
//   'Completed'             → all milestones paid
const STATUS_TONE = {
  InTransit:              'info',
  AwaitingVerification:   'warning',
  AwaitingResubmission:   'danger',
  Completed:              'success',
};

const STATUS_ICON = {
  InTransit:             HiOutlineTruck,
  AwaitingVerification:  HiOutlineClock,
  AwaitingResubmission:  HiOutlineExclamationCircle,
  Completed:             HiOutlineCheckBadge,
};

const STATUS_LABEL = {
  InTransit:            'In Transit',
  AwaitingVerification: 'Awaiting Verification',
  AwaitingResubmission: 'Awaiting Resubmission',
  Completed:            'Completed',
};

const JOBS = [
  {
    id: 1001,
    from: 'Kuala Lumpur', to: 'Penang',
    status: 'InTransit',
    milestones: 4, current: 2,
    currentMilestone: 'In transit',
    rewardWei: 2500000000000000000n,
    rejectionReason: null,
  },
  {
    id: 1002,
    from: 'Johor Bahru', to: 'Singapore',
    status: 'AwaitingResubmission',
    milestones: 3, current: 3,
    currentMilestone: 'Delivered to recipient',
    rewardWei: 350000000000000000n,
    rejectionReason: 'Photo too dark — package labels not readable. Please retake in better light.',
  },
  {
    id: 1003,
    from: 'Shah Alam', to: 'Kuala Lumpur',
    status: 'Completed',
    milestones: 3, current: 3,
    currentMilestone: 'Delivered to recipient',
    rewardWei: 1800000000000000000n,
    rejectionReason: null,
  },
];

export function Carrier() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [tab, setTab] = useState('in_progress');
  const [proofJob, setProofJob] = useState(null); // job currently in the upload modal

  const handleProof = (job) => setProofJob(job);

  // Pick the first non-completed job as the "next action" suggestion.
  const next = JOBS.find((j) => j.status !== 'Completed') || JOBS[0];

  const filteredJobs = JOBS.filter((j) => {
    if (tab === 'in_progress') return j.status === 'InTransit';
    if (tab === 'pending')     return j.status === 'AwaitingVerification';
    if (tab === 'resubmit')    return j.status === 'AwaitingResubmission';
    if (tab === 'completed')   return j.status === 'Completed';
    return true;
  });

  const counts = {
    all:        JOBS.length,
    in_progress: JOBS.filter((j) => j.status === 'InTransit').length,
    pending:    JOBS.filter((j) => j.status === 'AwaitingVerification').length,
    resubmit:   JOBS.filter((j) => j.status === 'AwaitingResubmission').length,
    completed:  JOBS.filter((j) => j.status === 'Completed').length,
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Carrier Dashboard"
        subtitle="Track your active jobs, submit proof, and watch your earnings grow."
      />

      <div className={styles.layout}>
        {/* LEFT COLUMN */}
        <div className={styles.left}>
          <Card className={styles.nextAction}>
            <div className={styles.nextHeader}>
              <div className={styles.nextLabel}>Next action</div>
              <Badge tone={STATUS_TONE[next.status] || 'neutral'} icon={STATUS_ICON[next.status]}>
                {STATUS_LABEL[next.status] || next.status}
              </Badge>
            </div>
            <div className={styles.nextRoute}>
              <span className={styles.jobId}>#{String(next.id).padStart(4, '0')}</span>
              <span className={styles.routeText}>{next.from}</span>
              <HiOutlineMap className={styles.routeArrow} aria-hidden="true" />
              <span className={styles.routeText}>{next.to}</span>
            </div>
            <div className={styles.nextSub}>
              Milestone {next.current} of {next.milestones} — <strong>{next.currentMilestone}</strong>
            </div>
            {next.rejectionReason && (
              <div className={styles.rejectionBlock}>
                <HiOutlineExclamationCircle className={styles.rejectionIcon} aria-hidden="true" />
                <div>
                  <div className={styles.rejectionTitle}>Shipper rejected the previous proof</div>
                  <div className={styles.rejectionBody}>{next.rejectionReason}</div>
                </div>
              </div>
            )}
            <Button onClick={() => handleProof(next)}>
              <HiOutlineArrowUpTray className={styles.btnIcon} aria-hidden="true" /> Upload proof
            </Button>
          </Card>

          <Card padded={false} className={styles.jobsCard}>
            <div className={styles.jobsHeader}>
              <h2 className={styles.cardTitle}>My jobs</h2>
              <a className={styles.viewAll} onClick={() => navigate('/my-shipments')} role="button" tabIndex={0}>
                View all jobs
              </a>
            </div>
            <div className={styles.tabsWrap}>
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'all',         label: 'All',                 count: counts.all },
                  { value: 'in_progress', label: 'In progress',         count: counts.in_progress },
                  { value: 'pending',     label: 'Awaiting verify',     count: counts.pending },
                  { value: 'resubmit',    label: 'Resubmit',            count: counts.resubmit },
                  { value: 'completed',   label: 'Completed',           count: counts.completed },
                ]}
              />
            </div>
            <div className={styles.jobsList}>
              {filteredJobs.length === 0 && (
                <div className={styles.empty}>No jobs in this state yet.</div>
              )}
              {filteredJobs.map((j) => (
                <div key={j.id} className={styles.jobRow}>
                  <div className={styles.jobMain}>
                    <div className={styles.jobTopLine}>
                      <span className={styles.jobId}>#{String(j.id).padStart(4, '0')}</span>
                      <span className={styles.routeText}>{j.from}</span>
                      <HiOutlineMap className={styles.routeArrow} aria-hidden="true" />
                      <span className={styles.routeText}>{j.to}</span>
                    </div>
                    <div className={styles.jobBottomLine}>
                      <ProgressLine count={j.milestones} current={j.current} label={false} />
                      <span className={styles.milestoneLabel}>Milestone {j.current} / {j.milestones}</span>
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[j.status] || 'neutral'} icon={STATUS_ICON[j.status]}>
                    {STATUS_LABEL[j.status] || j.status}
                  </Badge>
                  <div className={styles.jobReward}>{formatCargo(j.rewardWei)}</div>
                  <span className={styles.chev} aria-hidden="true">›</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.right}>
          <Card className={styles.quick}>
            <h2 className={styles.cardTitle}>Quick actions</h2>
            <ul className={styles.quickList}>
              <li>
                <button type="button" onClick={() => navigate('/')}>
                  <HiOutlineShoppingCart className={styles.quickIcon} aria-hidden="true" /> Browse marketplace
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/my-shipments')}>
                  <HiOutlineTruck className={styles.quickIcon} aria-hidden="true" /> My shipments
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleProof(next)}>
                  <HiOutlineArrowUpTray className={styles.quickIcon} aria-hidden="true" /> Upload proof
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/wallet')}>
                  <HiOutlineCreditCard className={styles.quickIcon} aria-hidden="true" /> Payments
                </button>
              </li>
            </ul>
          </Card>

          <Card className={styles.earnings}>
            <h2 className={styles.cardTitle}>Earnings (this month)</h2>
            <div className={styles.earningsValue}>2,850.00 C.</div>
            <div className={styles.chartWrap}>
              <LineChart points={9} color="var(--chart-5)" />
            </div>
          </Card>
        </div>
      </div>

      {proofJob && (
        <ProofUploadModal
          job={proofJob}
          onClose={() => setProofJob(null)}
          onSubmitted={() => setProofJob(null)}
        />
      )}
    </div>
  );
}

// Legacy dashboard proof modal. The active tracking flow performs encryption,
// Pinata upload, and the submitProof transaction in Track.jsx.
function ProofUploadModal({ job, onClose, onSubmitted }) {
  const { show } = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const submit = async () => {
    if (!file) {
      show('Pick a photo first.', 'error');
      return;
    }
    setBusy(true);
    try {
      const hash = await hashFile(file);
      show(
        `Photo hashed (${hash.slice(0, 10)}…). Open this request from My Shipments to upload and submit proof.`,
        'info',
      );
      onSubmitted?.();
    } catch (e) {
      show(e.message || 'Upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalScrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHead}>
          <div>
            <div className={styles.modalTitle}>Upload milestone proof</div>
            <div className={styles.modalSub}>
              Request <strong>#{String(job.id).padStart(4, '0')}</strong> · {job.from} → {job.to}
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <HiOutlineXMark className={styles.modalCloseIcon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div
            className={styles.dropZone}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
          >
            {preview ? (
              <img src={preview} alt="Selected proof preview" className={styles.preview} />
            ) : (
              <>
                <HiOutlinePhoto className={styles.dropIcon} aria-hidden="true" />
                <div className={styles.dropTitle}>Click or drag a photo</div>
              <div className={styles.dropHint}>JPEG, PNG, WebP, GIF, AVIF, or BMP up to 2 MiB. Open the shipment in Track to encrypt and submit proof through Pinata.</div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={onPick}
              className={styles.fileInput}
              aria-label="Choose photo"
            />
          </div>
        </div>
        <div className={styles.modalFoot}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !file}>
            {busy ? 'Preparing proof…' : 'Submit proof'}
          </Button>
        </div>
      </div>
    </div>
  );
}
