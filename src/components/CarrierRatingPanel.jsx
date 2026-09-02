import { useEffect, useState } from 'react';
import { HiOutlineArrowRight, HiOutlineStar, HiOutlineXMark, HiStar } from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { useWallet } from '../hooks/useWallet.js';
import {
  buildTagMask,
  getTagsFromMask,
  MAX_REPUTATION_TAGS,
  REPUTATION_TAGS,
} from '../utils/reputation.js';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import { ModalShell } from './ModalShell.jsx';
import styles from './CarrierRatingPanel.module.css';

export function CarrierRatingPanel({ requestId, carrier, isShipper, status, onRatingPublished }) {
  const { contracts } = useContracts();
  const { account, signer, provider } = useWallet();
  const { requireRegistration } = useUserProfile();
  const { show } = useToast();
  const [rating, setRating] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedScore, setSelectedScore] = useState(0);
  const [hoveredScore, setHoveredScore] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [stage, setStage] = useState('idle');

  const loadRating = async () => {
    if (!requestId || !carrier || !contracts?.reputationRegistry) {
      setRating(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rawRating = await contracts.reputationRegistry.getRating(BigInt(requestId));
      const createdAt = BigInt(rawRating.createdAt ?? rawRating[2] ?? 0n);
      setRating(createdAt > 0n ? {
        score: Number(rawRating.score ?? rawRating[4] ?? 0),
        tagMask: Number(rawRating.tagMask ?? rawRating[3] ?? 0),
      } : null);
    } catch {
      setRating(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRating();
  }, [requestId, carrier, contracts?.reputationRegistry]);

  const isCompleted = status === 'Completed';
  const canRate = isCompleted && isShipper && !rating;
  const submitting = stage === 'wallet' || stage === 'mining';
  const visibleScore = hoveredScore || selectedScore;
  const ratedTags = rating ? getTagsFromMask(rating.tagMask) : [];

  const toggleTag = (tagId) => {
    setSelectedTags((current) => {
      if (current.includes(tagId)) return current.filter((id) => id !== tagId);
      if (current.length >= MAX_REPUTATION_TAGS) {
        show(`Choose up to ${MAX_REPUTATION_TAGS} feedback tags.`, 'warning');
        return current;
      }
      return [...current, tagId];
    });
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setSelectedScore(0);
    setHoveredScore(0);
    setSelectedTags([]);
    setStage('idle');
  };

  const submitRating = async () => {
    if (!contracts?.reputationRegistry || !signer || !provider || !account) {
      show('Connect the completed shipment shipper wallet before rating.', 'warning');
      return;
    }
    if (!selectedScore || !carrier || !requestId) return;

    setStage('wallet');
    let transactionToast;
    try {
      const activeSignerAddress = await signer.getAddress();
      if (!(await requireRegistration(
        'Register your CargoChain profile before publishing a carrier rating.',
        activeSignerAddress,
      ))) {
        setStage('idle');
        return;
      }

      transactionToast = startTransactionToast({
        wallet: 'Confirm carrier rating in MetaMask…',
        submitted: 'Publishing carrier rating…',
        success: 'Carrier rating published.',
      });
      const transaction = await sendWalletContractTransaction({
        contract: contracts.reputationRegistry,
        method: 'submitCarrierRating',
        args: [BigInt(requestId), selectedScore, buildTagMask(selectedTags)],
        signer,
        provider,
      });
      setStage('mining');
      transactionToast.submitted();
      await transaction.wait();
      await loadRating();
      onRatingPublished?.();
      transactionToast.success();
      setModalOpen(false);
      setSelectedScore(0);
      setHoveredScore(0);
      setSelectedTags([]);
      setStage('idle');
    } catch (error) {
      setStage('idle');
      const message = formatWalletTransactionError(error, 'Carrier rating could not be published.');
      if (transactionToast) transactionToast.error(message);
      else show(message, 'error');
    }
  };

  if (!carrier || !isCompleted || (!isShipper && !rating)) return null;
  const ratingTitle = rating
    ? isShipper ? 'Your rating' : 'Rating received'
    : 'How did the delivery go?';
  const ratingDescription = rating
    ? ratedTags.length > 0
      ? ratedTags.map((tag) => tag.label).join(' · ')
      : 'No feedback tags selected.'
    : 'Publish one verified rating for this completed request.';

  return (
    <section className={styles.actionBar} aria-labelledby="carrier-rating-cta-title">
      <div className={styles.actionCopy}>
        <span className={styles.actionIcon} aria-hidden="true">{rating ? <HiStar /> : <HiOutlineStar />}</span>
        <div>
          <span className={styles.actionKicker}>{rating && !isShipper ? 'Shipper feedback' : 'Delivery complete'}</span>
          <strong id="carrier-rating-cta-title">{ratingTitle}</strong>
          <p>
            {loading
                ? 'Checking this request...'
                : ratingDescription}
          </p>
        </div>
      </div>
      {rating ? (
        <span className={styles.ratingResult} aria-label={String(rating.score) + ' out of 5 stars'}>
          <HiStar aria-hidden="true" />
          {rating.score} / 5
        </span>
      ) : canRate && (
        <Button className={styles.actionCta} onClick={() => setModalOpen(true)}>Rate carrier <HiOutlineArrowRight aria-hidden="true" /></Button>
      )}

      {modalOpen && (
        <ModalShell
          size="md"
          onClose={closeModal}
          busy={submitting}
          labelledBy="carrier-rating-title"
        >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.kicker}>Completed request #{String(requestId).padStart(4, '0')}</span>
                <h2 id="carrier-rating-title">Rate this carrier</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeModal} disabled={submitting} aria-label="Close rating dialog"><HiOutlineXMark aria-hidden="true" /></button>
            </header>

            <div className={styles.formBody}>
              <fieldset>
                <legend>Overall experience</legend>
                <div className={styles.starPicker} onMouseLeave={() => setHoveredScore(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={styles.starButton}
                      onMouseEnter={() => setHoveredScore(star)}
                      onClick={() => setSelectedScore(star)}
                      aria-label={`${star} star${star === 1 ? '' : 's'}`}
                      aria-pressed={selectedScore === star}
                    >
                      {star <= visibleScore ? <HiStar className={styles.starFilled} /> : <HiOutlineStar className={styles.starEmpty} />}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>What went well <span>Optional</span></legend>
                <div className={styles.tagChoices}>
                  {REPUTATION_TAGS.filter((tag) => tag.tone === 'positive').map((tag) => (
                    <label key={tag.id} className={`${styles.tagChoice} ${selectedTags.includes(tag.id) ? styles.tagChoiceSelected : ''}`}>
                      <input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                      <span>{tag.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Could improve <span>Optional</span></legend>
                <div className={styles.tagChoices}>
                  {REPUTATION_TAGS.filter((tag) => tag.tone === 'improvement').map((tag) => (
                    <label key={tag.id} className={`${styles.tagChoice} ${styles.improvementChoice} ${selectedTags.includes(tag.id) ? styles.tagChoiceSelected : ''}`}>
                      <input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                      <span>{tag.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.modalActions}>
                <Button variant="secondary" onClick={closeModal} disabled={submitting}>Cancel</Button>
                <Button onClick={submitRating} disabled={!selectedScore || submitting}>Publish rating</Button>
              </div>
            </div>
            <div className={styles.tagLimit}>Choose up to {MAX_REPUTATION_TAGS} tags across both groups.</div>
            {submitting && <div className={styles.transactionState} role="status">{stage === 'wallet' ? 'Review and approve the rating in MetaMask.' : 'Waiting for the rating transaction to confirm...'}</div>}
        </ModalShell>
      )}
    </section>
  );
}
