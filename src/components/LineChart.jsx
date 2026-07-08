// src/components/LineChart.jsx — CargoChain
// Tiny inline-SVG line chart placeholder. Renders a single trendline
// (default: upward-right) over a soft gradient fill, with a light
// horizontal baseline grid. Real data binding is TODO.

import styles from './LineChart.module.css';

export function LineChart({ points = 7, height = 140, color = 'var(--chart-5)', className = '' }) {
  // Deterministic pseudo-trend for the demo: a smooth up-and-right curve
  const w = 100; // viewBox is normalized 0-100 wide
  const h = 100;
  const stepX = w / (points - 1);
  const seed = points * 13 + 7;
  const ys = [];
  for (let i = 0; i < points; i++) {
    // shape a wave that trends upward; values 0..1
    const t = i / (points - 1);
    const noise = (((seed * (i + 1)) % 17) - 8) / 80;
    const v = 0.2 + 0.6 * t + 0.1 * Math.sin(t * Math.PI * 1.6) + noise;
    ys.push(Math.max(0.05, Math.min(0.95, v)));
  }

  const path = ys
    .map((y, i) => {
      const x = i * stepX;
      const yy = (1 - y) * h;
      // smooth using quadratic Bézier between successive points
      if (i === 0) return `M ${x.toFixed(1)} ${yy.toFixed(1)}`;
      const px = (i - 1) * stepX;
      const py = (1 - ys[i - 1]) * h;
      const cx = (px + x) / 2;
      return `Q ${cx.toFixed(1)} ${py.toFixed(1)} ${x.toFixed(1)} ${yy.toFixed(1)}`;
    })
    .join(' ');

  const area = `${path} L ${w} ${h} L 0 ${h} Z`;

  // simple baseline grid: 3 horizontal lines
  const gridYs = [25, 50, 75];

  return (
    <div className={`${styles.wrap} ${className}`} style={{ height }}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridYs.map((gy) => (
          <line key={gy} x1="0" y1={gy} x2={w} y2={gy} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="1.5 2" />
        ))}
        <path d={area} fill="url(#lineFill)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
