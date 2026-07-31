// src/components/ProposeMilestoneModal.jsx — CargoChain
// Modal for carriers to propose a milestone plan with payout splits.

import { useEffect, useState, useMemo } from 'react';
import {
  HiOutlineCheckBadge,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineInformationCircle,
} from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import {
  formatWalletTransactionError,
  resolveWalletSigner,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import styles from './ProposeMilestoneModal.module.css';

const DEFAULT_MILESTONES = [
  { name: 'Pickup', payoutPercentage: '30' },
  { name: 'In Transit', payoutPercentage: '40' },
  { name: 'Delivery', payoutPercentage: '30' },
];

export function ProposeMilestoneModal({ isOpen, onClose, requestId, onSuccess }) {
  const { show } = useToast();
  const { signer, provider, connect, busy: walletBusy } = useWallet();
  const { contracts } = useContracts();
  const { requireRegistration } = useUserProfile();

  const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMilestones(DEFAULT_MILESTONES);
      setSubmitting(false);
    }
  }, [isOpen]);

  const addMilestone = () => setMilestones((arr) => [...arr, { name: '', payoutPercentage: '' }]);
  const updateMilestone = (i, k, v) => setMilestones((arr) => arr.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));
  const removeMilestone = (i) => setMilestones((arr) => arr.filter((_, idx) => idx !== i));

  const totalPercentage = useMemo(() => {
    return milestones.reduce((sum, m) => sum + (Number(m.payoutPercentage) || 0), 0);
  }, [milestones]);

  const isValid = useMemo(() => {
    return (
      milestones.length > 0 &&
      milestones.every((m) => m.name.trim() && Number(m.payoutPercentage) > 0) &&
      totalPercentage === 100
    );
  }, [milestones, totalPercentage]);

  const submit = async () => {
    if (submitting || walletBusy) return;

    if (!provider) {
      show('MetaMask is required to submit a proposal.', 'error');
      return;
    }
    if (!contracts?.deliveryEscrow) {
      show('DeliveryEscrow contract is not available.', 'error');
      return;
    }
    if (!requestId) {
      show('Invalid request ID.', 'error');
      return;
    }
    if (!isValid) {
      show('All milestones must have names and percentages, summing up to exactly 100%.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const activeSigner = await resolveWalletSigner(signer, connect);
      const activeSignerAddress = await activeSigner.getAddress();

      // Format input into [name, payoutPercentage] tuples for Solidity
      const contractMilestones = milestones.map((m) => [
        m.name.trim(),
        BigInt(m.payoutPercentage),
      ]);

      if (!await requireRegistration(
        'Register your CargoChain profile to submit a milestone proposal.',
        activeSignerAddress,
      )) return;

      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'proposeMilestones',
        args: [BigInt(requestId), contractMilestones],
        signer: activeSigner,
        provider,
      });

      show('Submitting milestone proposal to blockchain...', 'info');
      await tx.wait();

      show('Milestone proposal submitted successfully!', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (e) {
      const message = e.shortMessage || e.reason || e.message || '';
      show(
        message.includes('carrier already has active proposal')
          ? 'You already have an active proposal for this request. Open it to revoke or revise your plan.'
          : formatWalletTransactionError(e, message || 'Failed to submit proposal.'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} aria-modal="true" role="dialog">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <div className={styles.headIcon}>
              <HiOutlineCheckBadge className={styles.headIconSvg} />
            </div>
            <div className={styles.headTitles}>
              <h2 className={styles.modalTitle}>Propose Milestone Plan</h2>
              <p className={styles.modalSubtitle}>Define delivery milestones and payout percentages.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Milestone Split</h3>
              <span className={styles.itemsCount}>{milestones.length} milestone{milestones.length === 1 ? '' : 's'}</span>
            </div>

            <div className={styles.milestonesList}>
              {milestones.map((m, i) => (
                <div key={i} className={styles.milestoneRow}>
                  <div className={styles.milestoneInputs}>
                    <div className={styles.field} style={{ flex: 3 }}>
                      <label className={styles.label}>Milestone Name</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={m.name}
                        onChange={(e) => updateMilestone(i, 'name', e.target.value)}
                        placeholder="e.g. In transit / Delivery"
                      />
                    </div>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.label}>Payout (%)</label>
                      <div className={styles.percentInputWrap}>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          className={styles.input}
                          value={m.payoutPercentage}
                          onChange={(e) => updateMilestone(i, 'payoutPercentage', e.target.value)}
                          placeholder="0"
                        />
                        <span className={styles.percentUnit}>%</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeMilestone(i)}
                    disabled={milestones.length === 1}
                    aria-label="Remove milestone"
                  >
                    <HiOutlineTrash className={styles.removeIcon} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className={styles.addBtn} onClick={addMilestone}>
              <HiOutlinePlus className={styles.addIcon} aria-hidden="true" /> Add milestone
            </button>
          </div>

          <div className={styles.divider} />

          {/* Sum Summary Card */}
          <div className={`${styles.summaryBox} ${totalPercentage === 100 ? styles.summarySuccess : styles.summaryError}`}>
            <HiOutlineInformationCircle className={styles.summaryIcon} />
            <div className={styles.summaryContent}>
              <div className={styles.summaryTitle}>
                Total Percentage: <strong>{totalPercentage}%</strong>
              </div>
              <p className={styles.summaryText}>
                {totalPercentage === 100
                  ? 'All payouts allocated perfectly! Payout splits must sum to exactly 100%.'
                  : `Remaining to allocate: ${100 - totalPercentage}%. Milestone payouts must sum to exactly 100%.`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.footerRow}>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !isValid || walletBusy}>
              {submitting ? 'Submitting proposal…' : 'Submit proposal'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
