import { useId, useMemo, useRef, useState } from 'react';
import { HiOutlineIdentification, HiOutlineInformationCircle } from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { BrandedModal } from './BrandedModal.jsx';
import { useWallet } from '../hooks/useWallet.js';
import {
  formatWalletTransactionError,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import { countWords, utf8Length } from '../utils/textLimits.js';
import styles from './EditDisplayNameModal.module.css';

const MAX_DISPLAY_NAME_BYTES = 64;
const MAX_DISPLAY_NAME_WORDS = 8;

export function EditDisplayNameModal({
  account,
  provider,
  signer,
  userRegistry,
  walletReady,
  refreshUserProfile,
  onClose,
}) {
  const { walletChainId } = useWallet();
  const inputRef = useRef(null);
  const [newName, setNewName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const formId = `edit-display-name-${useId()}`;

  const trimmedName = useMemo(() => trimAsciiWhitespace(newName), [newName]);
  const trimmedConfirmation = useMemo(() => trimAsciiWhitespace(confirmation), [confirmation]);
  const nameError = getDisplayNameError(trimmedName);
  const confirmationError = getConfirmationError(trimmedConfirmation, trimmedName);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setTouched(true);
    setError('');
    if (nameError || confirmationError) return;
    if (!walletReady || !provider || !signer || !userRegistry) {
      setError(`Connect this wallet on ${CARGO_NETWORK_CONFIG.chainName} before updating its display name.`);
      return;
    }

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
      setSubmitting(false);
    }
  };

  return (
    <BrandedModal
      title="Edit display name"
      description="Update the public name associated with this wallet."
      Icon={HiOutlineIdentification}
      onClose={onClose}
      busy={submitting}
      labelledBy="edit-display-name-title"
      initialFocusRef={inputRef}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? 'Updating…' : 'Update display name'}
          </Button>
        </>
      )}
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.label} htmlFor={`${formId}-name`}>New display name</label>
        <input
          ref={inputRef}
          id={`${formId}-name`}
          className={`${styles.input} ${touched && nameError ? styles.inputError : ''}`}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="nickname"
          disabled={submitting}
          aria-invalid={Boolean(touched && nameError)}
        />
        <span className={styles.hint}>{touched && nameError ? nameError : '1–8 words, up to 64 UTF-8 bytes.'}</span>

        <label className={styles.label} htmlFor={`${formId}-confirmation`}>Confirm new display name</label>
        <input
          id={`${formId}-confirmation`}
          className={`${styles.input} ${touched && confirmationError ? styles.inputError : ''}`}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="off"
          disabled={submitting}
          aria-invalid={Boolean(touched && confirmationError)}
        />
        <span className={styles.hint}>{touched && confirmationError ? confirmationError : 'Both names must match after trimming.'}</span>

        <div className={styles.gasNotice}>
          <HiOutlineInformationCircle aria-hidden="true" />
          <span>Updating your display name requires an on-chain transaction and a small gas fee.</span>
        </div>
        {!walletReady && walletChainId != null && (
          <div className={styles.error} role="alert">Switch to {CARGO_NETWORK_CONFIG.chainName} before updating this wallet.</div>
        )}
        {error && <div className={styles.error} role="alert">{error}</div>}
      </form>
    </BrandedModal>
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

function formatDisplayNameUpdateError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Update was cancelled in MetaMask. Your display name was not changed.';
  }
  return formatWalletTransactionError(error, 'Display name could not be updated. Check MetaMask and try again.');
}
