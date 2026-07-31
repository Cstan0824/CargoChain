// src/components/chat/BlockchainNoticeTile.jsx — verified on-chain activity notice for the chat stream.

import {
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import { formatDate } from '../../utils/format';
import styles from './BlockchainNoticeTile.module.css';

const ICONS = {
  request: HiOutlineDocumentText,
  proposal: HiOutlineClipboardDocumentCheck,
  payment: HiOutlineBanknotes,
  proof: HiOutlinePhoto,
  success: HiOutlineCheckCircle,
  warning: HiOutlineExclamationTriangle,
};

export function BlockchainNoticeTile({ notice }) {
  const Icon = ICONS[notice.tone] || HiOutlineDocumentText;
  const date = notice.timestampMs ? formatDate(Math.floor(notice.timestampMs / 1000)) : '';

  return (
    <div className={styles.wrap}>
      <div className={`${styles.tile} ${styles[notice.tone] || ''}`}>
        <Icon className={styles.icon} aria-hidden="true" />
        <span>{notice.text}</span>
      </div>
      {date && <time className={styles.time}>{date}</time>}
    </div>
  );
}
