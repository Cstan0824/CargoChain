// src/components/LineChart.jsx — CargoChain
// Lightweight inline-SVG line chart. Supplying `values` renders real data;
// omitting it preserves the deterministic demo trend used by legacy screens.

import { useId } from 'react';
import styles from './LineChart.module.css';

export function LineChart({
  values,
  points = 7,
  height = 140,
  color = 'var(--chart-5)',
  className = '',
  ariaLabel = 'Line chart',
}) {
  const gradientId = `line-fill-${useId().replace(/:/g, '')}`;
  const hasRealValues = values !== undefined;
  const normalizedValues = hasRealValues
    ? normalizeValues(Array.from(values || []))
    : createDemoValues(points);
  const plotValues = normalizedValues.length === 1
    ? [normalizedValues[0], normalizedValues[0]]
    : normalizedValues;

  if (!plotValues.length) return null;

  const width = 100;
  const heightUnits = 100;
  const stepX = width / Math.max(plotValues.length - 1, 1);
  const path = plotValues
    .map((value, index) => {
      const x = index * stepX;
      const y = (1 - value) * heightUnits;
      if (index === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;

      const previousX = (index - 1) * stepX;
      const previousY = (1 - plotValues[index - 1]) * heightUnits;
      const controlX = (previousX + x) / 2;
      return `Q ${controlX.toFixed(1)} ${previousY.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${path} L ${width} ${heightUnits} L 0 ${heightUnits} Z`;
  const gridYs = [25, 50, 75];

  return (
    <div className={`${styles.wrap} ${className}`} style={{ height }}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${heightUnits}`}
        preserveAspectRatio="none"
        role={hasRealValues ? 'img' : undefined}
        aria-label={hasRealValues ? ariaLabel : undefined}
        aria-hidden={hasRealValues ? undefined : 'true'}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridYs.map((gridY) => (
          <line
            key={gridY}
            x1="0"
            y1={gridY}
            x2={width}
            y2={gridY}
            className={styles.gridLine}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hasRealValues && plotValues.map((value, index) => (
          <circle
            key={`${index}-${value}`}
            cx={index * stepX}
            cy={(1 - value) * heightUnits}
            r="2.4"
            className={styles.point}
            style={{ color }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function createDemoValues(points) {
  const pointCount = Math.max(2, Number(points) || 7);
  const seed = pointCount * 13 + 7;

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const noise = (((seed * (index + 1)) % 17) - 8) / 80;
    const value = 0.2 + 0.6 * progress + 0.1 * Math.sin(progress * Math.PI * 1.6) + noise;
    return Math.max(0.05, Math.min(0.95, value));
  });
}

function normalizeValues(values) {
  if (!values.length) return [];

  if (values.every((value) => typeof value === 'bigint')) {
    const minimum = values.reduce((lowest, value) => value < lowest ? value : lowest, values[0]);
    const maximum = values.reduce((highest, value) => value > highest ? value : highest, values[0]);
    const range = maximum - minimum;
    if (range === 0n) return values.map(() => 0.5);

    return values.map((value) => {
      const ratio = Number(((value - minimum) * 1_000_000n) / range) / 1_000_000;
      return 0.08 + ratio * 0.84;
    });
  }

  const numericValues = values.map((value) => Number(value));
  if (numericValues.some((value) => !Number.isFinite(value))) return [];

  const minimum = Math.min(...numericValues);
  const maximum = Math.max(...numericValues);
  const range = maximum - minimum;
  if (range === 0) return numericValues.map(() => 0.5);

  return numericValues.map((value) => 0.08 + ((value - minimum) / range) * 0.84);
}
