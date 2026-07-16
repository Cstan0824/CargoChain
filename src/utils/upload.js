// src/utils/upload.js — CargoChain
// Photo proof upload flow. Stays thin so the team can swap the storage
// backend later (S3, IPFS, etc.) without touching page code.
//
// Browser-side: crypto.subtle.digest('SHA-256', ...) produces a 32-byte
// hash. We send the file + the hash to the Express upload server, which
// stores it as /uploads/{hashprefix}.jpg and echoes the hash back.

/**
 * hashFile(file) — returns a 0x-prefixed hex SHA-256 hash of the file.
 * @param {File|Blob} file
 * @returns {Promise<string>} 66-character hex string (0x + 64 chars)
 */
export async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes  = new Uint8Array(digest);
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * uploadPhoto(file, hash) — POSTs the file + precomputed hash to the
 * upload server. Returns { hash, url, size } on success.
 *
 * In dev, Vite proxies /uploads → http://127.0.0.1:3000 (see
 * vite.config.js). In production, the same path is served by the same
 * Express server, or by a CDN in front of S3.
 *
 * @param {File|Blob} file
 * @param {string} hash  0x-prefixed 32-byte hex (output of hashFile)
 * @returns {Promise<{hash: string, url: string, size: number}>}
 */
export async function uploadPhoto(file, hash) {
  const fd = new FormData();
  fd.append('hash',  hash);
  fd.append('photo', file);


  const res = await fetch('/uploads', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  return res.json();
}
