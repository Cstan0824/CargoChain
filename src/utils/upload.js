// src/utils/upload.js — CargoChain
// Photo-proof utilities. New proof uploads use encrypted Pinata/IPFS storage;
// Supabase remains available for CargoChain's database and private chat only.

import {
  encryptProofFile,
  hashFile,
  PROOF_MAX_PLAINTEXT_BYTES,
  SUPPORTED_PROOF_IMAGE_TYPES,
} from './proofCrypto.js';
import { pinEncryptedProof } from '../lib/proofApiClient.js';

/**
 * hashFile(file) — returns a 0x-prefixed hex SHA-256 hash of the file.
 * @param {File|Blob} file
 * @returns {Promise<string>} 66-character hex string (0x + 64 chars)
 */
export const PROOF_MAX_BYTES = PROOF_MAX_PLAINTEXT_BYTES;
export const SUPPORTED_IMAGE_TYPES = SUPPORTED_PROOF_IMAGE_TYPES;

export { encryptProofFile, hashFile, pinEncryptedProof };

export function validateProofFile(file) {
  if (!file) return 'Choose a photo proof file.';
  if (!SUPPORTED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    return 'Invalid file type. Please choose a JPEG, PNG, WebP, GIF, AVIF, or BMP image.';
  }
  if (Number(file.size) > PROOF_MAX_BYTES) {
    return 'File size exceeds 2 MB. Choose a smaller image.';
  }
  return '';
}

export async function uploadPhoto(file, hash, requestId, milestoneId) {
  const fileError = validateProofFile(file);
  if (fileError) throw new Error(fileError);
  if (!/^0x[0-9a-f]{64}$/i.test(String(hash || ''))) throw new Error('A valid SHA-256 proof hash is required.');
  if (!Number.isInteger(Number(requestId)) || Number(requestId) <= 0) {
    throw new Error('A valid request ID is required for proof upload.');
  }
  if (!Number.isInteger(Number(milestoneId)) || Number(milestoneId) < 0) {
    throw new Error('A valid milestone ID is required for proof upload.');
  }
  throw new Error('Legacy Supabase proof upload is retired; use pinEncryptedProof.');
}
