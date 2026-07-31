// src/components/RegistrationModal.jsx — optional wallet identity registration.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineIdentification,
  HiOutlineInformationCircle,
  HiOutlineWallet,
  HiOutlineXMark,
} from 'react-icons/hi2';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import styles from './RegistrationModal.module.css';

const MAX_DISPLAY_NAME_BYTES = 64;

export function RegistrationModal({
  isOpen,
  walletAddress,
  userRegistry,
  signer,
  provider,
  mandatory = false,
  reason = '',
  onClose,
  onRegistered,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef(null);
  const submitLockRef = useRef(false);
  const operationRef = useRef(0);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState('idle');
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');

  const trimmedName = useMemo(() => trimAsciiWhitespace(name), [name]);
  const nameBytes = useMemo(() => utf8ByteLength(trimmedName), [trimmedName]);
  const validationError = getNameValidationError(trimmedName, nameBytes);
  const isSubmitting = stage === 'wallet' || stage === 'mining' || stage === 'refreshing';

  useEffect(() => {
    operationRef.current += 1;
    submitLockRef.current = false;
    setName('');
    setTouched(false);
    setStage('idle');
    setError('');
    setTransactionHash('');

    if (isOpen) {
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(focusTimer);
    }
    return undefined;
  }, [isOpen, walletAddress, userRegistry]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitLockRef.current) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const requestClose = () => {
    if (!submitLockRef.current) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitLockRef.current) return;

    setTouched(true);
    setError('');
    if (validationError) return;
    if (!walletAddress || !userRegistry || !signer || !provider) {
      setError('Wallet registration is not available on the current network.');
      return;
    }

    submitLockRef.current = true;
    const operationId = ++operationRef.current;
    const submittedWallet = walletAddress;
    const submittedRegistry = userRegistry;

    try {
      setStage('wallet');
      const activeSigner = signer;
      const signerAddress = await activeSigner.getAddress();

      if (signerAddress.toLowerCase() !== submittedWallet.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Reopen registration for the current wallet.');
      }

      const transaction = await sendWalletContractTransaction({
        contract: submittedRegistry,
        method: 'registerUser',
        args: [trimmedName],
        signer: activeSigner,
        provider,
      });

      if (operationId !== operationRef.current) return;
      setTransactionHash(transaction.hash || '');
      setStage('mining');
      await transaction.wait();

      if (operationId !== operationRef.current) return;
      setStage('refreshing');
      const shouldClose = await onRegistered?.(submittedWallet, submittedRegistry);
      if (operationId === operationRef.current && shouldClose !== false) onClose();
    } catch (caughtError) {
      if (operationId !== operationRef.current) return;

      const message = formatRegistrationError(caughtError);
      if (message.alreadyRegistered) {
        setStage('refreshing');
        const shouldClose = await onRegistered?.(submittedWallet, submittedRegistry);
        if (operationId === operationRef.current && shouldClose !== false) onClose();
        return;
      }

      setStage('error');
      setError(message.text);
    } finally {
      if (operationId === operationRef.current) submitLockRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <span className={styles.identityIcon} aria-hidden="true">
              <HiOutlineIdentification />
            </span>
            <div>
              <h2 id={titleId} className={styles.title}>
                {mandatory ? 'Register to continue' : 'Choose how CargoChain recognizes you'}
              </h2>
              <p id={descriptionId} className={styles.subtitle}>
                Add a public display name to this wallet. Registration does not assign a shipper or carrier role.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            disabled={isSubmitting}
            aria-label="Close registration"
          >
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </header>

        <form className={styles.body} onSubmit={submit} noValidate>
          {mandatory && reason && (
            <div className={styles.reason}>
              <HiOutlineInformationCircle aria-hidden="true" />
              <span>{reason}</span>
            </div>
          )}

          <div className={styles.walletCard}>
            <span className={styles.walletIcon} aria-hidden="true">
              <HiOutlineWallet />
            </span>
            <div className={styles.walletDetails}>
              <span className={styles.walletLabel}>Wallet to register</span>
              <code className={styles.walletAddress}>{walletAddress}</code>
            </div>
          </div>

          <div className={styles.explanation}>
            <HiOutlineCheckCircle aria-hidden="true" />
            <p>
              Your wallet remains your identity. The display name simply makes activity easier for other CargoChain users to recognize.
            </p>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor={`${titleId}-display-name`}>
                Display name
              </label>
              <span className={`${styles.byteCount} ${nameBytes > MAX_DISPLAY_NAME_BYTES ? styles.byteCountError : ''}`}>
                {nameBytes}/{MAX_DISPLAY_NAME_BYTES} bytes
              </span>
            </div>
            <input
              ref={inputRef}
              id={`${titleId}-display-name`}
              className={`${styles.input} ${(touched && validationError) || nameBytes > MAX_DISPLAY_NAME_BYTES ? styles.inputError : ''}`}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError('');
              }}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Aina Logistics"
              autoComplete="nickname"
              disabled={isSubmitting}
              aria-invalid={Boolean((touched && validationError) || error)}
              aria-describedby={`${titleId}-name-help`}
            />
            <div id={`${titleId}-name-help`} className={styles.fieldHelp}>
              {touched && validationError
                ? <span className={styles.validationError}>{validationError}</span>
                : <span>Leading and trailing spaces are removed before registration.</span>}
            </div>
          </div>

          {stage !== 'idle' && stage !== 'error' && (
            <div className={styles.transactionStatus} role="status" aria-live="polite">
              <span className={stage === 'refreshing' ? styles.statusCheck : styles.spinner} aria-hidden="true">
                {stage === 'refreshing' && <HiOutlineCheckCircle />}
              </span>
              <div>
                <strong>{getStageTitle(stage)}</strong>
                <span>{getStageDescription(stage, transactionHash)}</span>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={requestClose}
              disabled={isSubmitting}
            >
              {mandatory ? 'Cancel' : 'Skip for now'}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {getSubmitLabel(stage)}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function trimAsciiWhitespace(value) {
  return value.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, '');
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function getNameValidationError(name, byteLength) {
  if (!name) return 'Enter a display name.';
  if (byteLength > MAX_DISPLAY_NAME_BYTES) {
    return 'Display name must be 64 UTF-8 bytes or fewer.';
  }
  return '';
}

function getStageTitle(stage) {
  if (stage === 'wallet') return 'Confirm in MetaMask';
  if (stage === 'mining') return 'Registration submitted';
  return 'Registration confirmed';
}

function getStageDescription(stage, transactionHash) {
  if (stage === 'wallet') return 'Review and approve the registration request in your wallet.';
  if (stage === 'mining') {
    return transactionHash
      ? `Waiting for the network to confirm ${shortHash(transactionHash)}.`
      : 'Waiting for the network to confirm the transaction.';
  }
  return 'Refreshing your CargoChain profile.';
}

function getSubmitLabel(stage) {
  if (stage === 'wallet') return 'Waiting for wallet…';
  if (stage === 'mining') return 'Confirming on-chain…';
  if (stage === 'refreshing') return 'Refreshing profile…';
  return 'Register wallet';
}

function shortHash(hash) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatRegistrationError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return { text: 'Registration was cancelled in MetaMask. No changes were made.', alreadyRegistered: false };
  }

  const messages = [
    error?.info?.error?.data?.reason,
    error?.info?.error?.data?.message,
    error?.info?.error?.message,
    error?.error?.data?.reason,
    error?.error?.data?.message,
    error?.error?.message,
    error?.shortMessage,
    error?.reason,
    error?.message,
  ].filter(Boolean);
  const message = messages.find((item) => !item.toLowerCase().includes('could not coalesce error'))
    || messages[0]
    || '';
  const normalized = messages.join(' ').toLowerCase();

  if (normalized.includes('user already registered')) {
    return { text: '', alreadyRegistered: true };
  }
  if (normalized.includes('display name required')) {
    return { text: 'Enter a display name.', alreadyRegistered: false };
  }
  if (normalized.includes('display name exceeds 64 bytes')) {
    return { text: 'Display name must be 64 UTF-8 bytes or fewer.', alreadyRegistered: false };
  }
  if (normalized.includes('insufficient funds')) {
    return { text: 'This wallet does not have enough ETH for the transaction fee.', alreadyRegistered: false };
  }
  if (normalized.includes('active metamask account changed')) {
    return { text: message, alreadyRegistered: false };
  }
  if (normalized.includes('header not found')) {
    return {
      text: 'Ganache rejected a stale wallet block reference. Refresh CargoChain and retry the registration.',
      alreadyRegistered: false,
    };
  }
  if (normalized.includes('current network does not support eip-1559')) {
    return {
      text: 'MetaMask has outdated fee settings for Local Ganache. Refresh CargoChain and retry the registration.',
      alreadyRegistered: false,
    };
  }
  if (normalized.includes('missing revert data')) {
    return {
      text: 'The deployed UserRegistry contract is unavailable or outdated. Confirm the network and redeploy the contracts.',
      alreadyRegistered: false,
    };
  }
  if (normalized.includes('could not coalesce error')) {
    return {
      text: 'MetaMask could not submit the registration to Ganache. Refresh CargoChain, confirm Local Ganache is selected, and try again.',
      alreadyRegistered: false,
    };
  }

  return {
    text: formatWalletTransactionError(
      error,
      message || 'Registration could not be completed. Check MetaMask and try again.',
    ),
    alreadyRegistered: false,
  };
}
