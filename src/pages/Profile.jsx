// src/pages/Profile.jsx — CargoChain identity and carrier reputation.
// Wallet financial activity lives on /funds so this surface stays focused on
// the person behind a wallet and the delivery reputation they have earned.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineIdentification,
  HiOutlineInformationCircle,
  HiOutlineUserGroup,
  HiOutlineXMark,
  HiStar,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { useAccountAccess } from '../context/AccountAccessContext.jsx';
import { useContracts } from '../hooks/useContracts.js';
import { useToast } from '../hooks/useToast.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { pickAvatar } from '../utils/avatar.js';
import { loadCarrierReputationProfile } from '../services/reputationService.js';
import { formatRatingAverage, REPUTATION_TAGS } from '../utils/reputation.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import styles from './Profile.module.css';

const MAX_DISPLAY_NAME_BYTES = 64;
const MAX_DISPLAY_NAME_WORDS = 8;

export function Profile() {
  const { account, signer, provider, connect } = useWallet();
  const { selectedWallet, walletMatches, walletReady } = useAccountAccess();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
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
          currentName={displayName}
          provider={provider}
          signer={signer}
          userRegistry={contracts?.userRegistry}
          walletReady={walletReady}
          refreshUserProfile={refreshUserProfile}
          onClose={() => setIsEditOpen(false)}
          show={show}
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

function EditDisplayNameModal({
  account,
  currentName,
  provider,
  signer,
  userRegistry,
  walletReady,
  refreshUserProfile,
  onClose,
  show,
}) {
  const titleId = useId();
  const inputRef = useRef(null);
  const submitLockRef = useRef(false);
  const [newName, setNewName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const trimmedName = useMemo(() => trimAsciiWhitespace(newName), [newName]);
  const trimmedConfirmation = useMemo(() => trimAsciiWhitespace(confirmation), [confirmation]);
  const nameError = getDisplayNameError(trimmedName);
  const confirmationError = getConfirmationError(trimmedConfirmation, trimmedName);

  const submit = async (event) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    setTouched(true);
    setError('');
    if (nameError || confirmationError) return;
    if (!walletReady || !provider || !signer || !userRegistry) {
      setError(`Connect this wallet on ${CARGO_NETWORK_CONFIG.chainName} before updating its display name.`);
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    let transactionToast;
    try {
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== account.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Close this dialog and try again.');
      }
      transactionToast = startTransactionToast({
        wallet: 'Confirm display name update in MetaMask…',
        submitted: 'Updating display name…',
        success: 'Display name updated.',
      });
      const transaction = await sendWalletContractTransaction({
        contract: userRegistry,
        method: 'updateDisplayName',
        args: [trimmedName],
        signer,
        provider,
      });
      transactionToast.submitted();
      await transaction.wait();
      await refreshUserProfile();
      transactionToast.success();
      onClose();
    } catch (caughtError) {
      const message = formatDisplayNameUpdateError(caughtError);
      if (transactionToast) transactionToast.error(message);
      else setError(message);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="presentation">
      <section className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <span className={styles.modalIcon} aria-hidden="true"><HiOutlineIdentification /></span>
            <div>
              <h2 id={titleId}>Edit display name</h2>
              <p>Update the public name associated with this wallet.</p>
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} disabled={submitting} aria-label="Close display name editor">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <form className={styles.modalBody} onSubmit={submit} noValidate>
          <label className={styles.formLabel} htmlFor={`${titleId}-name`}>New display name</label>
          <input
            ref={inputRef}
            id={`${titleId}-name`}
            className={`${styles.formInput} ${touched && nameError ? styles.formInputError : ''}`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="nickname"
            disabled={submitting}
            aria-invalid={Boolean(touched && nameError)}
          />
          <span className={styles.formHint}>{touched && nameError ? nameError : '1–8 words, up to 64 UTF-8 bytes.'}</span>

          <label className={styles.formLabel} htmlFor={`${titleId}-confirmation`}>Confirm new display name</label>
          <input
            id={`${titleId}-confirmation`}
            className={`${styles.formInput} ${touched && confirmationError ? styles.formInputError : ''}`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(touched && confirmationError)}
          />
          <span className={styles.formHint}>{touched && confirmationError ? confirmationError : 'Both names must match after trimming.'}</span>

          <div className={styles.gasNotice}>
            <HiOutlineInformationCircle aria-hidden="true" />
            <span>Updating your display name requires an on-chain transaction and a small gas fee.</span>
          </div>

          {error && <div className={styles.modalError} role="alert">{error}</div>}

          <footer className={styles.modalFooter}>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Updating…' : 'Update display name'}</Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function trimAsciiWhitespace(value) {
  return value.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, '');
}

function getDisplayNameError(name) {
  if (!name) return 'Enter a new display name.';
  if (countWords(name) > MAX_DISPLAY_NAME_WORDS) return `Display name must be ${MAX_DISPLAY_NAME_WORDS} words or fewer.`;
  if (utf8Length(name) > MAX_DISPLAY_NAME_BYTES) return 'Display name is too long. Shorten it and try again.';
  return '';
}

function getConfirmationError(confirmation, name) {
  if (!confirmation) return 'Confirm the new display name.';
  return confirmation !== name ? 'Display names must match exactly after trimming.' : '';
}

function countWords(value) {
  return value ? value.split(/\s+/u).filter(Boolean).length : 0;
}

function utf8Length(value) {
  return new TextEncoder().encode(value).length;
}

function formatDisplayNameUpdateError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Update was cancelled in MetaMask. Your display name was not changed.';
  }
  return formatWalletTransactionError(error, 'Display name could not be updated. Check MetaMask and try again.');
}
