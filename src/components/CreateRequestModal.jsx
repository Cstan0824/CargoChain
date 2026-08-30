// src/components/CreateRequestModal.jsx — CargoChain
// Modal for creating new delivery requests.

import { forwardRef, useMemo, useState, useEffect, useId, useRef } from 'react';
import { parseEther } from 'ethers';
import {
  HiOutlineArrowsRightLeft,
  HiOutlineCalendarDays,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineTruck,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import {
  formatWalletTransactionError,
  resolveWalletSigner,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import { startTransactionToast } from '../utils/transactionToast.js';
import styles from './CreateRequestModal.module.css';

const DEFAULT_ITEMS = [
  { itemName: '', itemDescription: '', quantity: '' },
];

export function CreateRequestModal({ isOpen, onClose, onSuccess }) {
  const { show } = useToast();
  const { signer, provider, connect, busy: walletBusy } = useWallet();
  const { contracts, deployError } = useContracts();
  const { requireRegistration } = useUserProfile();
  const { confirm, confirmation } = useConfirmDialog();

  const [details, setDetails] = useState({
    from: '',
    to: '',
    deadline: '',
    specialInstruction: '',
  });
  const [reward, setReward] = useState('');
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fromRef = useRef(null);
  const toRef = useRef(null);
  const deadlineRef = useRef(null);
  const paymentRef = useRef(null);
  const itemFieldRefs = useRef({});
  const minimumDeadline = useMemo(() => toLocalDateTimeInput(new Date()), [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDetails({ from: '', to: '', deadline: '', specialInstruction: '' });
      setReward('');
      setItems([{ itemName: '', itemDescription: '', quantity: '' }]);
      setSubmitting(false);
      setTouched({});
      setSubmitAttempted(false);
      itemFieldRefs.current = {};
    }
  }, [isOpen]);

  const updateDetail = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));
  const swapRoute = () => setDetails((d) => ({ ...d, from: d.to, to: d.from }));

  const addItem = () => setItems((arr) => [...arr, { itemName: '', itemDescription: '', quantity: '' }]);
  const updateItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const rewardWei = useMemo(() => {
    try {
      if (!reward || Number(reward) <= 0) return 0n;
      return parseEther(reward);
    } catch {
      return 0n;
    }
  }, [reward]);

  const normalizedItems = useMemo(() => {
    return items
      .map((it) => ({
        itemName: it.itemName.trim(),
        itemDescription: it.itemDescription.trim(),
        quantity: Number(it.quantity),
      }))
      .filter((it) => it.itemName || it.itemDescription || it.quantity);
  }, [items]);

  const validation = useMemo(
    () => validateRequestFields(details, reward, items, rewardWei),
    [details, reward, items, rewardWei],
  );
  const hasChanges = Boolean(
    details.from || details.to || details.deadline || details.specialInstruction || reward
    || items.some((item) => item.itemName || item.itemDescription || item.quantity),
  );

  const requestClose = async () => {
    if (submitting) return;
    if (hasChanges) {
      const discard = await confirm({
        title: 'Discard this request?',
        message: 'The route, cargo, and payment details you entered will be lost.',
        confirmLabel: 'Discard draft',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!discard) return;
    }
    onClose();
  };

  const dialogRef = useDialogFocus({
    enabled: isOpen && !confirmation,
    onClose: requestClose,
    initialFocusRef: fromRef,
  });

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }));
  const shouldShowError = (field) => submitAttempted || Boolean(touched[field]);

  const focusFirstInvalid = (nextValidation = validation) => {
    const target = nextValidation.errors.from
      ? fromRef.current
      : nextValidation.errors.to
        ? toRef.current
        : nextValidation.errors.deadline
          ? deadlineRef.current
            : nextValidation.errors.reward
              ? paymentRef.current
              : nextValidation.firstItemField
                ? itemFieldRefs.current[nextValidation.firstItemField]
                : nextValidation.errors.items
                  ? itemFieldRefs.current['0-name']
                  : null;
    target?.scrollIntoView?.({ block: 'center' });
    target?.focus?.();
  };

  const submit = async () => {
    if (submitting || walletBusy) return;

    setSubmitAttempted(true);

    const fail = (message) => {
      show(message, 'error');
    };

    const pickupLocation = details.from.trim();
    const deliveryLocation = details.to.trim();
    const specialInstruction = details.specialInstruction.trim();
    const deadlineUnix = Math.floor(new Date(details.deadline).getTime() / 1000);
    if (!provider) {
      fail('MetaMask is required to publish a request.');
      return;
    }
    if (!contracts?.deliveryEscrow) {
      fail(deployError || 'The delivery contract is unavailable on the current network.');
      return;
    }
    const nextValidation = validateRequestFields(details, reward, items, rewardWei);
    if (!nextValidation.isValid) {
      focusFirstInvalid(nextValidation);
      return;
    }

    setSubmitting(true);
    let transactionToast = null;
    try {
      const activeSigner = await resolveWalletSigner(signer, connect);
      const activeSignerAddress = await activeSigner.getAddress();
      const contractItems = normalizedItems.map((it) => [
        it.itemName,
        it.itemDescription,
        BigInt(it.quantity),
      ]);

      if (!await requireRegistration(
        'Register your CargoChain profile to publish a delivery request.',
        activeSignerAddress,
      )) return;

      transactionToast = startTransactionToast({
        wallet: 'Confirm the delivery request in MetaMask.',
        submitted: 'Publishing the delivery request on-chain…',
      });
      const tx = await sendWalletContractTransaction({
        contract: contracts.deliveryEscrow,
        method: 'createRequest',
        args: [
          pickupLocation,
          deliveryLocation,
          specialInstruction,
          BigInt(deadlineUnix),
          rewardWei,
          contractItems,
        ],
        signer: activeSigner,
        provider,
      });
      transactionToast.submitted();
      const receipt = await tx.wait();
      const requestId = getRequestIdFromReceipt(contracts.deliveryEscrow, receipt);

      transactionToast.success(
        requestId
          ? `Request #${requestId} published on-chain.`
          : 'Request published on-chain.',
      );
      onSuccess?.(requestId);
      onClose();
    } catch (e) {
      const message = formatCreateRequestError(e);
      if (transactionToast) transactionToast.error(message);
      else fail(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <div className={styles.overlay} onClick={requestClose} role="presentation">
      <section
        ref={dialogRef}
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-request-title"
      >

        {/* ── Header ── */}
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <div className={styles.headIcon}>
              <HiOutlineTruck className={styles.headIconSvg} />
            </div>
            <div className={styles.headTitles}>
              <h2 id="create-request-title" className={styles.modalTitle}>Create delivery request</h2>
            </div>
          </div>
          <button type="button" onClick={requestClose} className={styles.closeBtn} aria-label="Close create request">
            <HiOutlineXMark aria-hidden="true" />
          </button>
        </div>

        <div className={styles.body}>

          {/* ── Step 1: Route ── */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.stepBadge}>1</span>
              <h3 className={styles.sectionTitle}>Route</h3>
            </div>
            <div className={styles.routeRow}>
              <Field
                ref={fromRef}
                label="From"
                value={details.from}
                onChange={updateDetail('from')}
                onBlur={() => markTouched('from')}
                error={shouldShowError('from') ? validation.errors.from : ''}
                placeholder="Pickup location (e.g. Kuala Lumpur)"
              />
              <div className={styles.swapBtnWrap}>
                <button type="button" className={styles.swapBtn} onClick={swapRoute} aria-label="Swap origin and destination">
                  <HiOutlineArrowsRightLeft className={styles.swapIcon} aria-hidden="true" />
                </button>
              </div>
              <Field
                ref={toRef}
                label="To"
                value={details.to}
                onChange={updateDetail('to')}
                onBlur={() => markTouched('to')}
                error={shouldShowError('to') ? validation.errors.to : ''}
                placeholder="Delivery location (e.g. Penang)"
              />
            </div>
          </div>

          <div className={styles.divider} />

          {/* ── Step 2: Items ── */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.stepBadge}>2</span>
              <h3 className={styles.sectionTitle}>Items</h3>
              <span className={styles.sectionRight}>
                <span className={styles.itemsCount}>{items.length} item{items.length === 1 ? '' : 's'}</span>
              </span>
            </div>
            <div className={styles.itemsList}>
              {items.map((it, i) => (
                <div key={i} className={styles.itemRow}>
                  <div className={styles.itemInputs}>
                    <Field
                      ref={(node) => { itemFieldRefs.current[`${i}-name`] = node; }}
                      label="Item name"
                      value={it.itemName}
                      onChange={(e) => updateItem(i, 'itemName', e.target.value)}
                      onBlur={() => markTouched(`item-${i}-name`)}
                      error={shouldShowError(`item-${i}-name`) ? validation.itemErrors[i]?.name : ''}
                      placeholder="e.g. Server rack"
                    />
                    <Field
                      label="Description"
                      value={it.itemDescription}
                      onChange={(e) => updateItem(i, 'itemDescription', e.target.value)}
                      onBlur={() => markTouched(`item-${i}-description`)}
                      placeholder="Optional details"
                    />
                    <Field
                      ref={(node) => { itemFieldRefs.current[`${i}-quantity`] = node; }}
                      label="Qty"
                      value={it.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      onBlur={() => markTouched(`item-${i}-quantity`)}
                      error={shouldShowError(`item-${i}-quantity`) ? validation.itemErrors[i]?.quantity : ''}
                      placeholder="0"
                      type="number"
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeItem(i)}
                    aria-label="Remove item"
                    disabled={items.length === 1}
                  >
                    <HiOutlineTrash className={styles.removeIcon} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {shouldShowError('items') && validation.errors.items && (
              <span className={styles.fieldError} role="alert">{validation.errors.items}</span>
            )}
            <button type="button" className={styles.addBtn} onClick={addItem}>
              <HiOutlinePlus className={styles.addIcon} aria-hidden="true" /> Add another item
            </button>
          </div>

          <div className={styles.divider} />

          {/* ── Step 3: Deadline & Reward ── */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.stepBadge}>3</span>
              <h3 className={styles.sectionTitle}>Deadline &amp; Reward</h3>
            </div>
            <div className={styles.splitRow}>
              <div className={styles.splitHalf}>
                <Field
                  ref={deadlineRef}
                  label="Delivery deadline"
                  type="datetime-local"
                  value={details.deadline}
                  onChange={updateDetail('deadline')}
                  onBlur={() => markTouched('deadline')}
                  error={shouldShowError('deadline') ? validation.errors.deadline : ''}
                  Icon={HiOutlineCalendarDays}
                  min={minimumDeadline}
                />
              </div>
              <div className={styles.splitHalf}>
                <label className={styles.label} htmlFor="request-payment">Payment (ETH)</label>
                <div className={`${styles.rewardBox} ${shouldShowError('reward') && validation.errors.reward ? styles.inputError : ''}`}>
                  <input
                    ref={paymentRef}
                    type="number"
                    step="any"
                    min="0.000000000000000001"
                    className={styles.rewardInput}
                    id="request-payment"
                    value={reward}
                    onChange={(e) => setReward(e.target.value)}
                    onBlur={() => markTouched('reward')}
                    aria-invalid={Boolean(shouldShowError('reward') && validation.errors.reward)}
                    aria-describedby={shouldShowError('reward') && validation.errors.reward ? 'request-payment-error' : undefined}
                    placeholder="0.00"
                  />
                  <span className={styles.rewardUnit}>ETH</span>
                </div>
                {shouldShowError('reward') && validation.errors.reward && (
                  <span id="request-payment-error" className={styles.fieldError} role="alert">{validation.errors.reward}</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* ── Step 4: Remarks ── */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.stepBadge}>4</span>
              <h3 className={styles.sectionTitle}>Remarks</h3>
            </div>
            <textarea
              className={styles.textarea}
              rows={3}
              value={details.specialInstruction}
              onChange={updateDetail('specialInstruction')}
              aria-label="Remarks"
              placeholder="Anything the carrier should know before pickup? (fragile, temperature-sensitive, etc.)"
            />
          </div>
          <div className={styles.footerRow}>
            <Button variant="secondary" onClick={requestClose} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || walletBusy}>
              {submitting ? 'Publishing…' : 'Publish request'}
            </Button>
          </div>
        </div>
      </section>
    </div>
    {confirmation && <ConfirmDialog {...confirmation} />}
    </>
  );
}

function getRequestIdFromReceipt(contract, receipt) {
  for (const log of receipt?.logs || []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === 'RequestCreated') {
        return parsed.args.requestId.toString();
      }
    } catch {
      // Ignore logs from other contracts in the same transaction receipt.
    }
  }
  return null;
}

const Field = forwardRef(function Field({
  label,
  value,
  onChange,
  onBlur,
  error,
  type = 'text',
  suffix,
  Icon,
  placeholder,
  min,
}, ref) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <div className={`${styles.inputWrap} ${error ? styles.inputError : ''}`}>
        {Icon && <Icon className={styles.inputIcon} aria-hidden="true" />}
        <input
          ref={ref}
          type={type}
          id={id}
          className={`${styles.input} ${Icon ? styles.inputWithIcon : ''}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          min={min}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      {error && <span id={errorId} className={styles.fieldError} role="alert">{error}</span>}
    </div>
  );
});

function validateRequestFields(details, reward, items, rewardWei) {
  const errors = {};
  const itemErrors = {};
  const pickupLocation = details.from.trim();
  const deliveryLocation = details.to.trim();
  const deadlineUnix = Math.floor(new Date(details.deadline).getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);

  if (!pickupLocation) errors.from = 'Enter a pickup location.';
  if (!deliveryLocation) errors.to = 'Enter a delivery location.';
  if (!Number.isFinite(deadlineUnix) || deadlineUnix <= nowUnix) {
    errors.deadline = 'Choose a delivery deadline in the future.';
  }
  if (rewardWei <= 0n) errors.reward = 'Enter a payment amount greater than 0 ETH.';

  const hasPopulatedItem = items.some((item) => (
    item.itemName.trim() || item.itemDescription.trim() || String(item.quantity).trim()
  ));
  items.forEach((item, index) => {
    const populated = item.itemName.trim() || item.itemDescription.trim() || String(item.quantity).trim();
    if (!populated) return;
    const rowErrors = {};
    if (!item.itemName.trim()) rowErrors.name = 'Add an item name.';
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) rowErrors.quantity = 'Use a whole number greater than 0.';
    if (Object.keys(rowErrors).length) itemErrors[index] = rowErrors;
  });
  if (!hasPopulatedItem) errors.items = 'Add at least one item with a name and quantity.';

  const firstItemField = Object.entries(itemErrors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, rowErrors]) => rowErrors.name ? `${index}-name` : `${index}-quantity`)[0];

  return {
    errors,
    itemErrors,
    firstItemField,
    isValid: Object.keys(errors).length === 0 && Object.keys(itemErrors).length === 0,
  };
}

function toLocalDateTimeInput(date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function formatCreateRequestError(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'Request creation cancelled in MetaMask.';
  }

  const message = error?.shortMessage || error?.reason || error?.message || '';
  if (message.includes('deadline must be future')) {
    return 'Delivery deadline must be later than the current time.';
  }
  if (message.includes('payment amount required')) {
    return 'Payment must be greater than 0 ETH.';
  }
  if (message.includes('insufficient funds')) {
    return 'The connected wallet does not have enough ETH to pay the transaction gas fee.';
  }
  return formatWalletTransactionError(error, message || 'Could not publish the request.');
}
