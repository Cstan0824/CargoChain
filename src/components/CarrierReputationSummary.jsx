import { useEffect, useState } from 'react';
import { HiStar } from 'react-icons/hi2';
import { useContracts } from '../hooks/useContracts.js';
import {
  calculateRatingAverage,
  formatRatingAverage,
} from '../utils/reputation.js';
import styles from './CarrierReputationSummary.module.css';

export function CarrierReputationSummary({ carrier, onOpenProfile, compact = false }) {
  const { contracts } = useContracts();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!carrier || !contracts?.reputationRegistry) {
      setSummary(null);
      return () => { cancelled = true; };
    }

    contracts.reputationRegistry.getCarrierRatingSummary(carrier)
      .then((result) => {
        if (cancelled) return;
        const ratingCount = Number(result.ratingCount ?? result[0] ?? 0n);
        const totalScore = Number(result.totalScore ?? result[1] ?? 0n);
        setSummary({
          ratingCount,
          totalScore,
          average: calculateRatingAverage(ratingCount, totalScore),
        });
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });

    return () => { cancelled = true; };
  }, [carrier, contracts?.reputationRegistry]);

  const content = (
    <span className={`${styles.summary} ${compact ? styles.compact : ''}`}>
      <HiStar className={styles.star} aria-hidden="true" />
      <strong>{formatRatingAverage(summary?.average)}</strong>
      <span className={styles.count}>
        {summary?.ratingCount ? `${summary.ratingCount} verified rating${summary.ratingCount === 1 ? '' : 's'}` : 'No ratings yet'}
      </span>
    </span>
  );

  if (onOpenProfile && carrier) {
    return (
      <span
        role="button"
        tabIndex={0}
        className={styles.link}
        onClick={(event) => {
          event.stopPropagation();
          onOpenProfile(carrier);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onOpenProfile(carrier);
          }
        }}
      >
        {content}
      </span>
    );
  }

  return content;
}
