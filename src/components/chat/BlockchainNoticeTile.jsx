// src/components/chat/BlockchainNoticeTile.jsx — verified on-chain activity notice for the chat stream.

import {
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineArrowTopRightOnSquare,
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

export function BlockchainNoticeTile({ notice, onOpenTracking }) {
  const Icon = ICONS[notice.tone] || HiOutlineDocumentText;
  const date = notice.timestampMs ? formatDate(Math.floor(notice.timestampMs / 1000)) : '';

  return (
    <div className={styles.wrap}>
      <div className={styles.tile}>
        <Icon className={styles.icon} aria-hidden="true" />
        <span className={styles.copy} aria-label={notice.text}>
          {notice.subject && notice.action ? (
            <>
              <strong className={styles.subject}>{notice.subject}</strong>{' '}
              <span className={styles.action}>{notice.action}</span>
              {notice.detail && <span className={styles.detail}>{notice.detail}</span>}
            </>
          ) : notice.text}
        </span>
        {date && <time className={styles.time}>{date}</time>}
        {onOpenTracking && (
          <button type="button" className={styles.reviewAction} onClick={onOpenTracking}>
            View shipment
            <HiOutlineArrowTopRightOnSquare aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
