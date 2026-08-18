import { useEffect, useMemo, useState } from 'react';
import { HiOutlineCheckBadge, HiOutlineClock, HiOutlineXMark, HiStar } from 'react-icons/hi2';
import { Avatar } from './Avatar.jsx';
import { Badge } from './Badge.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { loadCarrierReputationProfile } from '../services/reputationService.js';
import { formatRatingAverage, REPUTATION_TAGS } from '../utils/reputation.js';
import { pickAvatar } from '../utils/avatar.js';
import { shortAddress } from '../utils/format.js';
import styles from './CarrierReputationModal.module.css';

export function CarrierReputationModal({ carrier, onClose }) {
  const { contracts } = useContracts();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!carrier || !contracts) return () => { cancelled = true; };
    setProfile(null);
    setError('');
    loadCarrierReputationProfile(contracts, carrier)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'Reputation could not be loaded.'); });
    return () => { cancelled = true; };
  }, [carrier, contracts]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const popularTags = useMemo(() => profile
    ? REPUTATION_TAGS
      .map((tag) => ({ ...tag, count: profile.tagCounts[tag.id] || 0 }))
      .filter((tag) => tag.count > 0)
      .sort((left, right) => right.count - left.count)
    : [], [profile]);

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="carrier-reputation-title">
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Verified carrier evidence</span>
            <h2 id="carrier-reputation-title">Carrier reputation</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close carrier reputation"><HiOutlineXMark /></button>
        </header>

        {!profile && !error && <div className={styles.state}>Reading verified delivery outcomes...</div>}
        {error && <div className={styles.state}>{error}</div>}
        {profile && (
          <>
            <div className={styles.identity}>
              <Avatar src={pickAvatar('Carrier', carrier)} name={profile.displayName || 'Carrier'} size={52} />
              <div className={styles.identityCopy}>
                <strong>{profile.displayName || 'Unnamed carrier'}</strong>
                <code>{shortAddress(carrier)}</code>
              </div>
              <div className={styles.rating}>
                <strong>{formatRatingAverage(profile.averageRating)}</strong>
                <span><HiStar aria-hidden="true" /> {profile.ratingCount} verified</span>
              </div>
            </div>
            <div className={styles.metrics}>
              <Metric icon={HiOutlineCheckBadge} label="Completed" value={profile.completedDeliveries} />
              <Metric icon={HiOutlineClock} label="On time" value={profile.onTimeRate == null ? '—' : `${profile.onTimeRate}%`} />
            </div>
            <div className={styles.tags}>
              <div className={styles.sectionLabel}>Common feedback</div>
              {popularTags.length > 0
                ? popularTags.slice(0, 5).map((tag) => <Badge key={tag.id} tone={tag.tone === 'improvement' ? 'warning' : 'neutral'}>{tag.label} · {tag.count}</Badge>)
                : <span className={styles.muted}>No structured feedback yet.</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className={styles.metric}><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>;
}
