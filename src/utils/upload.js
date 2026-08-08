import { supabase } from '../lib/supabase.js';
// src/utils/upload.js — CargoChain
// Photo proof upload flow using browser-side SHA-256 and Supabase Storage.

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
 * Uploads immutable, content-addressed evidence to Supabase Storage.
 *
 * @param {File|Blob} file
 * @param {string} hash  0x-prefixed 32-byte hex (output of hashFile)
 * @returns {Promise<{hash: string, url: string, path: string, size: number}>}
 */

const PROOF_BUCKET = 'milestone-proofs';
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadPhoto(file, hash, requestId, milestoneId) {
  if (!supabase) {
    throw new Error('Photo proof upload is not configured. Add the Supabase frontend variables, then try again.');
  }
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('A proof image is required.');
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Proof image must be JPEG, PNG, or WebP.');
  }
  if (file.size > MAX_PROOF_BYTES) throw new Error('Proof image must be 10 MB or smaller.');
  if (!/^0x[0-9a-f]{64}$/i.test(String(hash || ''))) throw new Error('A valid SHA-256 proof hash is required.');
  if (!Number.isInteger(Number(requestId)) || Number(requestId) <= 0) {
    throw new Error('A valid request ID is required for proof upload.');
  }
  if (!Number.isInteger(Number(milestoneId)) || Number(milestoneId) < 0) {
    throw new Error('A valid milestone ID is required for proof upload.');
  }

  const cleanHash = hash.replace(/^0x/, '');
  const extension = getImageExtension(file);

  const objectPath =
    `shipments/${requestId}` +
    `/milestones/${milestoneId}` +
    `/${cleanHash}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: '3600',

      // Do not replace existing evidence.
      upsert: false,
    });

  const duplicateUpload =
    uploadError?.message
      ?.toLowerCase()
      .includes('already exists') ||
    uploadError?.message
      ?.toLowerCase()
      .includes('duplicate');

  if (uploadError && !duplicateUpload) {
    throw new Error(
      uploadError.message || 'Supabase upload failed.',
    );
  }

  const { data } = supabase.storage
    .from(PROOF_BUCKET)
    .getPublicUrl(objectPath);

  if (!data?.publicUrl) {
    throw new Error(
      'Supabase did not return a public image URL.',
    );
  }

  return {
    url: data.publicUrl,
    path: objectPath,
    hash,
    size: file.size,
  };
}

function getImageExtension(file) {
  const extensionByType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return extensionByType[file.type] || 'jpg';
}
