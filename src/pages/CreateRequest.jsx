// src/pages/CreateRequest.jsx — CargoChain
// Single-step form for new delivery requests. The canonical shipper-side
// input set is locked in docs/BusinessFlow.md §6:
//   pickupLocation, deliveryLocation, deadline, specialInstruction,
//   totalAmount, and the embedded Item[] array.
// The carrier proposes milestones (BusinessFlow §4 step 2 / §8) — that
// happens in a separate carrier flow, not here.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiArrowLeft,
  HiOutlineArrowsRightLeft,
  HiOutlineCalendarDays,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineExclamationCircle,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';
import { Topbar } from '../components/Topbar.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { useToast } from '../hooks/useToast.js';
import { formatEth } from '../utils/format.js';
import styles from './CreateRequest.module.css';

const DEFAULT_ITEMS = [
  { itemName: 'Server rack', itemDescription: 'Freight class 85', quantity: '2' },
];

export function CreateRequest() {
  const navigate = useNavigate();
  const { show } = useToast();

  const [details, setDetails] = useState({
    from: 'Kuala Lumpur',
    to: 'Penang',
    // Deadline is a single ISO timestamp per BusinessFlow §6 (no separate
    // pickup window, no separate deadline time).
    deadline: '2026-07-15T18:00',
    specialInstruction: 'Handle with care. Recipient is at the loading bay on Level 2.',
  });
  const [reward, setReward] = useState('2.50');
  const [items, setItems] = useState(DEFAULT_ITEMS);

  const updateDetail = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));
  const swapRoute = () => setDetails((d) => ({ ...d, from: d.to, to: d.from }));

  const addItem = () => setItems((arr) => [...arr, { itemName: '', itemDescription: '', quantity: '' }]);
  const updateItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const rewardWei = useMemo(() => {
    const n = Number(reward);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * 1e18));
  }, [reward]);

  const itemsValid = items.some((it) => it.itemName && it.quantity);

  const goBack = () => navigate(-1);
  const submit = () => {
    if (!details.from || !details.to) {
      show('Please enter both pickup and delivery locations.', 'error');
      return;
    }
    if (!itemsValid) {
      show('Add at least one item with a name and quantity.', 'error');
      return;
    }
    if (rewardWei === 0n) {
      show('Reward must be greater than 0 ETH.', 'error');
      return;
    }
    // Module b wires this to deliveryEscrow.createRequest(items, locations,
    // deadline, specialInstr, msg.value). For now: toast.
    show(
      `createRequest call would submit ${items.length} item(s) from ${details.from} → ${details.to}, ` +
      `deadline ${details.deadline}, escrow ${formatEth(rewardWei)}.`,
      'info',
    );
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Create Delivery Request"
        subtitle="Lock ETH in escrow and publish to the marketplace. The carrier proposes the milestone plan."
      />

      <Card padded={false} className={styles.wizard}>
        <div className={styles.head}>
          <button type="button" onClick={goBack} className={styles.backBtn} aria-label="Go back">
            <HiArrowLeft className={styles.backIcon} aria-hidden="true" /> Back
          </button>
        </div>

        <div className={styles.body}>
          <h2 className={styles.sectionTitle}>Route</h2>
          <div className={styles.row}>
            <Field label="From" value={details.from} onChange={updateDetail('from')} />
            <button type="button" className={styles.swapBtn} onClick={swapRoute} aria-label="Swap origin and destination">
              <HiOutlineArrowsRightLeft className={styles.swapIcon} aria-hidden="true" />
            </button>
            <Field label="To" value={details.to} onChange={updateDetail('to')} />
          </div>

          <h2 className={styles.sectionTitle}>Items</h2>
          <Card className={styles.itemsCard} padded={false}>
            <div className={styles.itemsHead}>
              <span>What is being shipped?</span>
              <span className={styles.itemsCount}>{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>
            {items.map((it, i) => (
              <div key={i} className={styles.itemRow}>
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
                  placeholder="Optional"
                />
                <Field
                  label="Quantity"
                  value={it.quantity}
                  onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  placeholder="e.g. 2"
                />
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
            <div className={styles.itemsFoot}>
              <Button variant="secondary" size="sm" onClick={addItem}>
                <HiOutlinePlus className={styles.plusIcon} aria-hidden="true" /> Add item
              </Button>
            </div>
          </Card>

          <h2 className={styles.sectionTitle}>Deadline &amp; reward</h2>
          <div className={styles.row}>
            <Field
              label="Delivery deadline"
              type="datetime-local"
              value={details.deadline}
              onChange={updateDetail('deadline')}
              Icon={HiOutlineCalendarDays}
            />
            <Card className={styles.rewardCard} padded={false}>
              <div className={styles.rewardRow}>
                <div>
                  <div className={styles.rewardLabel}>Total reward</div>
                  <div className={styles.rewardSub}>Locked in escrow until milestones are verified.</div>
                </div>
                <div className={styles.rewardValue}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={styles.rewardInput}
                    aria-label="Total reward in ETH"
                    value={reward}
                    onChange={(e) => setReward(e.target.value)}
                  />
                  <span className={styles.rewardUnit}>ETH</span>
                </div>
              </div>
            </Card>
          </div>

          <h2 className={styles.sectionTitle}>Special instructions</h2>
          <div className={styles.fullField}>
            <textarea
              className={styles.textarea}
              rows={3}
              value={details.specialInstruction}
              onChange={updateDetail('specialInstruction')}
              placeholder="Anything the carrier should know before pickup?"
            />
          </div>

          <div className={styles.submitHint}>
            {itemsValid && rewardWei > 0n
              ? <HiOutlineCheckCircle className={styles.submitHintIconOk} aria-hidden="true" />
              : <HiOutlineExclamationCircle className={styles.submitHintIcon} aria-hidden="true" />}
            <span>
              Submitting will lock <strong>{formatEth(rewardWei)}</strong> in escrow and publish the request to
              the marketplace. The carrier then proposes a milestone plan; you approve it before any work starts.
            </span>
          </div>

          <div className={styles.footerRow}>
            <Button variant="secondary" onClick={goBack}>Cancel</Button>
            <Button onClick={submit}>Lock escrow &amp; publish</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', suffix, Icon, placeholder }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.inputWrap}>
        {Icon && <Icon className={styles.inputIcon} aria-hidden="true" />}
        <input
          type={type}
          className={`${styles.input} ${Icon ? styles.inputWithIcon : ''}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}
