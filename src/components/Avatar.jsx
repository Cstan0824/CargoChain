// src/components/Avatar.jsx — CargoChain
// Circular avatar. Falls back to colored initials when no image is set.

import { useState } from 'react';
import styles from './Avatar.module.css';

function initialsOf(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';
}

function colorFor(seed = '') {
  const palette = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#db2777'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function Avatar({ src, name = '', size = 40, className = '' }) {
  const [errored, setErrored] = useState(false);
  const showImg = src && !errored;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={style}
      title={name || 'Account'}
      aria-label={name || 'Account avatar'}
    >
      {showImg ? (
        <img
          src={src}
          alt={name || 'avatar'}
          onError={() => setErrored(true)}
        />
      ) : (
        <span
          className={styles.initials}
          style={{ background: colorFor(name || (src || '?')) }}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
