// src/components/DonutChart.jsx — CargoChain
// Inline-SVG donut chart. Each segment is a stroke-dasharray arc on a
// circle. The center shows the total + label. Used for the Shipper
// "Escrow Overview" card.

import styles from './DonutChart.module.css';

const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export function DonutChart({
  segments = [],
  total,
  centerLabel = 'Total Locked',
  size = 180,
  stroke = 22,
  className = '',
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const totalValue = total ?? segments.reduce((s, x) => s + (x.value || 0), 0);
  const sum = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;

  let offset = 0;
  return (
    <div className={`${styles.wrap} ${className}`}>
      <svg
        className={styles.svg}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth={stroke}
        />
        {segments.map((seg, i) => {
          const portion = (seg.value || 0) / sum;
          const length = portion * c;
          const gap = c - length;
          const dashArray = `${length} ${gap}`;
          const dashOffset = -offset;
          offset += length;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={stroke}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className={styles.center}>
        <div className={styles.total}>{totalValue.toFixed(2)} ETH</div>
        <div className={styles.label}>{centerLabel}</div>
      </div>
    </div>
  );
}
