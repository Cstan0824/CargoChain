// src/components/CreateRequestModal.jsx — CargoChain
// Modal for creating new delivery requests.

import { useMemo, useState, useEffect } from 'react';
import { parseEther } from 'ethers';
import {
  HiOutlineArrowsRightLeft,
  HiOutlineCalendarDays,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineTruck,
} from 'react-icons/hi2';
import { Button } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { useContracts } from '../hooks/useContracts.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import {
  formatWalletTransactionError,
  resolveWalletSigner,
  sendWalletContractTransaction,
} from '../utils/walletTransaction.js';
import styles from './CreateRequestModal.module.css';

const DEFAULT_ITEMS = [
  { itemName: '', itemDescription: '', quantity: '' },
];

export function CreateRequestModal({ isOpen, onClose, onSuccess }) {
  const { show } = useToast();
  const { signer, provider, connect, busy: walletBusy } = useWallet();
  const { contracts, deployError } = useContracts();
  const { requireRegistration } = useUserProfile();
  const { confirm: confirmAction, confirmation } = useConfirmDialog();

  const [details, setDetails] = useState({
    from: '',
    to: '',
    deadline: '',
    specialInstruction: '',
  });
  const [reward, setReward] = useState('');
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [submitting, setSubmitting] = useState(false);
  const minimumDeadline = useMemo(() => toLocalDateTimeInput(new Date()), [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDetails({ from: '', to: '', deadline: '', specialInstruction: '' });
      setReward('');
      setItems([{ itemName: '', itemDescription: '', quantity: '' }]);
      setSubmitting(false);
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

  const itemsValid = normalizedItems.length > 0 &&
    normalizedItems.every((it) => it.itemName && Number.isInteger(it.quantity) && it.quantity > 0);

  const submit = async () => {
    if (submitting || walletBusy) return;

    const pickupLocation = details.from.trim();
    const deliveryLocation = details.to.trim();
    const specialInstruction = details.specialInstruction.trim();
    const deadlineUnix = Math.floor(new Date(details.deadline).getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    if (!provider) {
      show('MetaMask is required to publish a request.', 'error');
      return;
    }
    if (!contracts?.deliveryEscrow) {
      show(deployError || 'DeliveryEscrow is not deployed on the current network.', 'error');
      return;
    }
    if (!pickupLocation || !deliveryLocation) {
      show('Please enter both pickup and delivery locations.', 'error');
      return;
    }
    if (!Number.isFinite(deadlineUnix) || deadlineUnix <= nowUnix) {
      show('Delivery deadline must be a future date and time.', 'error');
      return;
    }
    if (!itemsValid) {
      show('Each item needs a name and a positive whole-number quantity.', 'error');
      return;
    }
    if (rewardWei <= 0n) {
      show('Enter a valid payment amount greater than 0 ETH.', 'error');
      return;
    }

    if (!await confirmAction({
      title: 'Publish this delivery request?',
      message: 'Carriers can see the route and submit a checkpoint plan. Your ETH is not locked until you select a plan.',
      details: [
        { label: 'Planned payment', value: `${reward} ETH` },
        { label: 'Escrow now', value: '0 ETH' },
        { label: 'Next step', value: 'Review carrier plans' },
      ],
      confirmLabel: 'Publish request',
    })) return;

    setSubmitting(true);
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
      const receipt = await tx.wait();
      const requestId = getRequestIdFromReceipt(contracts.deliveryEscrow, receipt);

      show(
        requestId
          ? `Request #${requestId} published on-chain.`
          : 'Request published on-chain.',
        'success',
      );
      onSuccess?.(requestId);
      onClose();
    } catch (e) {
      show(formatCreateRequestError(e), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <div className={styles.headIcon}>
              <HiOutlineTruck className={styles.headIconSvg} />
            </div>
            <div className={styles.headTitles}>
              <h2 className={styles.modalTitle}>Create Delivery Request</h2>
              <p className={styles.modalSubtitle}>Publish the job and its payment. Escrow is funded after you approve a carrier plan.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close modal">
            &times;
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
              <Field label="From" value={details.from} onChange={updateDetail('from')} placeholder="Pickup location (e.g. Kuala Lumpur)" />
              <div className={styles.swapBtnWrap}>
                <button type="button" className={styles.swapBtn} onClick={swapRoute} aria-label="Swap origin and destination">
                  <HiOutlineArrowsRightLeft className={styles.swapIcon} aria-hidden="true" />
                </button>
              </div>
              <Field label="To" value={details.to} onChange={updateDetail('to')} placeholder="Delivery location (e.g. Penang)" />
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
                      label="Item name"
                      value={it.itemName}
                      onChange={(e) => updateItem(i, 'itemName', e.target.value)}
                      placeholder="e.g. Server rack"
                    />
                    <Field
                      label="Description"
                      value={it.itemDescription}
                      onChange={(e) => updateItem(i, 'itemDescription', e.target.value)}
                      placeholder="Optional details"
                    />
                    <Field
                      label="Qty"
                      value={it.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
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
                  label="Delivery deadline"
                  type="datetime-local"
                  value={details.deadline}
                  onChange={updateDetail('deadline')}
                  Icon={HiOutlineCalendarDays}
                  min={minimumDeadline}
                />
              </div>
              <div className={styles.splitHalf}>
                <label className={styles.label}>Payment (ETH)</label>
                <div className={styles.rewardBox}>
                  <input
                    type="number"
                    step="any"
                    min="0.000000000000000001"
                    className={styles.rewardInput}
                    aria-label="Total reward in ETH"
                    value={reward}
                    onChange={(e) => setReward(e.target.value)}
                    placeholder="0.00"
                  />
                  <span className={styles.rewardUnit}>ETH</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* ── Step 4: Special instructions ── */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.stepBadge}>4</span>
              <h3 className={styles.sectionTitle}>Special Instructions</h3>
            </div>
            <textarea
              className={styles.textarea}
              rows={3}
              value={details.specialInstruction}
              onChange={updateDetail('specialInstruction')}
              placeholder="Anything the carrier should know before pickup? (fragile, temperature-sensitive, etc.)"
            />
          </div>


          <div className={styles.footerRow}>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || walletBusy}>
              {submitting ? 'Publishing…' : 'Publish request'}
            </Button>
          </div>
        </div>
      </div>
      {confirmation && <ConfirmDialog {...confirmation} />}
    </div>
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

function Field({ label, value, onChange, type = 'text', suffix, Icon, placeholder, min }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.inputWrap}>
        {Icon && <Icon className={styles.inputIcon} aria-hidden="true" />}
        <input
          type={type}
          className={`${styles.input} ${Icon ? styles.inputWithIcon : ''}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          min={min}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
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
