// src/pages/Profile.jsx — CargoChain identity and carrier reputation.
// Wallet financial activity lives on /funds so this surface stays focused on
// the person behind a wallet and the delivery reputation they have earned.

import { useEffect, useState } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineUserGroup,
  HiStar,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { EditDisplayNameModal } from '../components/EditDisplayNameModal.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useAccountAccess } from '../context/AccountAccessContext.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { pickAvatar } from '../utils/avatar.js';
import { loadCarrierReputationProfile } from '../services/reputationService.js';
import { formatRatingAverage, REPUTATION_TAGS } from '../utils/reputation.js';
import styles from './Profile.module.css';

export function Profile() {
  const { account, signer, provider, connect } = useWallet();
  const { selectedWallet, walletMatches, walletReady } = useAccountAccess();
  const { contracts, deployError } = useContracts();
  const {
    isRegistered,
    displayName,
    userProfile,
    isProfileLoading,
    openRegistrationModal,
    refreshUserProfile,
  } = useUserProfile();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reputationProfile, setReputationProfile] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(false);

  const walletAddress = selectedWallet?.wallet_address || account || null;
  const walletIdentityRegistered = Boolean(isRegistered && walletMatches && displayName);
  const profileName = walletIdentityRegistered ? displayName : 'Display name not set';
  const avatarSrc = pickAvatar(null, walletAddress);
  const profileStatus = isProfileLoading
    ? 'Loading'
    : deployError
      ? 'Unavailable'
      : walletIdentityRegistered
        ? 'Registered'
        : 'Setup needed';
  const profileTone = profileStatus === 'Registered'
    ? 'success'
    : profileStatus === 'Unavailable'
      ? 'danger'
      : profileStatus === 'Loading'
        ? 'info'
        : 'warning';

  useEffect(() => {
    if (!walletAddress || !contracts?.reputationRegistry) {
      setReputationProfile(null);
      setReputationLoading(false);
      return undefined;
    }

    let cancelled = false;
    setReputationLoading(true);
    loadCarrierReputationProfile(contracts, walletAddress)
      .then((result) => {
        if (!cancelled) setReputationProfile(result);
      })
      .catch(() => {
        if (!cancelled) setReputationProfile(null);
      })
      .finally(() => {
        if (!cancelled) setReputationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contracts, walletAddress]);

  useEffect(() => {
    if (!walletIdentityRegistered) setIsEditOpen(false);
  }, [walletIdentityRegistered]);

  if (!walletAddress) {
    return (
      <div className={styles.page}>
        <Topbar
          title="Profile"
          subtitle="Your profile and delivery reputation."
        />
        <Card className={styles.compactState}>
          <span className={styles.stateIcon} aria-hidden="true"><HiOutlineUserGroup /></span>
          <div>
            <h2>Connect a wallet to view your identity</h2>
            <p>Your registered display name and carrier reputation are tied to the active MetaMask wallet.</p>
          </div>
          <Button onClick={connect}>Connect wallet</Button>
        </Card>
      </div>
    );
  }

  if (!account) {
    return (
      <div className={styles.page}>
        <Topbar
          title="Profile"
          subtitle="Connect your wallet when you are ready to manage your CargoChain identity and delivery activity."
        />
        <Card className={styles.setupCard}>
          <p className={styles.setupEyebrow}>One wallet, both roles</p>
          <h2>Set up your delivery identity in three short steps.</h2>
          <p>
            Your wallet can create delivery requests as a shipper and carry deliveries as a carrier. CargoChain does not lock you into one role.
          </p>
          <ol className={styles.setupSteps}>
            <li><span>1</span>Connect MetaMask using the wallet button above.</li>
            <li><span>2</span>Switch MetaMask to the local Ganache network.</li>
            <li><span>3</span>Register a display name only when an on-chain action needs it.</li>
          </ol>
          <p className={styles.setupNote}>Wallet access is controlled in MetaMask. Your full address, balance, and history appear here after connection.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Topbar
        title="Profile"
        subtitle="Your profile and delivery reputation."
      />

      <Card className={styles.identityCard}>
        <div className={styles.identityMain}>
          <Avatar src={avatarSrc} name={profileName} size={76} />
          <div className={styles.identityCopy}>
            <span className={styles.eyebrow}>Profile</span>
            <h2>{profileName}</h2>
            <div className={styles.capabilities} aria-label="Wallet capabilities">
              <Badge tone="info">Shipper</Badge>
              <Badge tone="success">Carrier</Badge>
            </div>
          </div>
        </div>

        <div className={styles.identityStatus}>
          <span className={styles.statusLabel}>Profile setup</span>
          <Badge tone={profileTone}>{profileStatus}</Badge>
          {!isProfileLoading && !deployError && !walletIdentityRegistered && (
            <span className={styles.statusHint}>Register a public display name so other CargoChain users can recognize this wallet.</span>
          )}
        </div>

        <div className={styles.identityActions}>
          {walletIdentityRegistered ? (
            <Button variant="secondary" onClick={() => setIsEditOpen(true)} disabled={!walletReady}>
              Edit display name
            </Button>
          ) : (
            <Button
              onClick={() => openRegistrationModal()}
              disabled={isProfileLoading || !walletMatches}
            >
              Register display name
            </Button>
          )}
        </div>
      </Card>

      {deployError && (
        <Card className={styles.inlineNotice} role="alert">
          <HiOutlineExclamationTriangle aria-hidden="true" />
          <span>{deployError}</span>
        </Card>
      )}

      <section className={styles.reputationSection} aria-labelledby="carrier-reputation-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Verified delivery outcomes</span>
            <h2 id="carrier-reputation-title">Carrier reputation</h2>
          </div>
          <p>Ratings are published by shippers after a completed delivery.</p>
        </div>

        <Card className={styles.reputationCard}>
          {reputationLoading ? (
            <div className={styles.compactLoading} role="status">Loading verified reputation…</div>
          ) : reputationProfile ? (
            <ReputationSummary profile={reputationProfile} />
          ) : (
            <div className={styles.compactEmpty}>
              <span className={styles.emptyIcon} aria-hidden="true"><HiStar /></span>
              <div>
                <strong>Reputation is not available yet</strong>
                <p>Complete a delivery on this deployment to begin building a verified carrier record.</p>
              </div>
            </div>
          )}
        </Card>
      </section>

      {walletIdentityRegistered && isEditOpen && (
        <EditDisplayNameModal
          account={walletAddress}
          provider={provider}
          signer={signer}
          userRegistry={contracts?.userRegistry}
          walletReady={walletReady}
          refreshUserProfile={refreshUserProfile}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}

function ReputationSummary({ profile }) {
  const average = formatRatingAverage(profile.averageRating);
  const ratingCount = Number(profile.ratingCount || 0);
  const roundedAverage = profile.averageRating == null ? 0 : Math.round(profile.averageRating);
  const visibleTags = REPUTATION_TAGS
    .map((tag) => ({ ...tag, count: profile.tagCounts?.[tag.id] || 0 }))
    .filter((tag) => tag.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  return (
    <>
      <div className={styles.reputationGrid}>
        <div className={styles.ratingBlock}>
          <span className={styles.metricLabel}>Average rating</span>
          <strong className={styles.ratingValue}>{average}</strong>
          <div className={styles.stars} aria-label={`${ratingCount} verified ratings`}>
            {[1, 2, 3, 4, 5].map((star) => (
              <HiStar
                key={star}
                className={star <= roundedAverage ? styles.starActive : styles.starInactive}
                aria-hidden="true"
              />
            ))}
          </div>
          <span className={styles.metricHint}>{ratingCount} verified rating{ratingCount === 1 ? '' : 's'}</span>
        </div>
        <Metric label="Completed deliveries" value={profile.completedDeliveries} />
        <Metric label="On-time completion" value={profile.onTimeRate == null ? '—' : `${profile.onTimeRate}%`} />
      </div>

      {ratingCount === 0 ? (
        <div className={styles.reputationEmptyRow}>
          <span>No verified ratings yet. Ratings appear here after a shipper completes and reviews a delivery.</span>
        </div>
      ) : (
        <div className={styles.tagRow} aria-label="Feedback tags">
          {visibleTags.length > 0 ? visibleTags.map((tag) => (
            <Badge key={tag.id} tone={tag.tone === 'improvement' ? 'warning' : 'neutral'}>
              {tag.label} · {tag.count}
            </Badge>
          )) : <span className={styles.metricHint}>No feedback tags recorded.</span>}
        </div>
      )}
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}
