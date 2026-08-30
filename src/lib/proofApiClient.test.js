import { webcrypto } from 'node:crypto';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildEncryptedProofUri } from '../utils/proofUri.js';
import { encryptProofFile } from '../utils/proofCrypto.js';
import { loadEncryptedProof, uploadCiphertext } from './proofApiClient.js';

const CID = `b${'a'.repeat(58)}`;

beforeAll(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('proof API client', () => {
  it('sends Pinata v3 public multipart fields without exposing credentials', async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.method).toBe('POST');
      expect(options.headers).toBeUndefined();
      expect(options.body.get('network')).toBe('public');
      expect(options.body.get('name')).toBe('proof.bin');
      expect(options.body.get('file')).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: { cid: CID } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await uploadCiphertext(
      'https://uploads.pinata.cloud/v3/files/abc',
      new Blob(['ciphertext'], { type: 'application/octet-stream' }),
      { fetchImpl },
    );
    expect(result.cid).toBe(CID);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retrieves, verifies, decrypts, and revokes an authorized proof Blob URL', async () => {
    const source = new TextEncoder().encode('authorized synthetic proof');
    const file = {
      name: 'proof.png',
      type: 'image/png',
      size: source.length,
      arrayBuffer: async () => source.slice().buffer,
    };
    const encrypted = await encryptProofFile(file);
    const uri = buildEncryptedProofUri({
      cid: CID,
      iv: encrypted.iv,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
      mediaType: encrypted.mediaType,
    });
    const ciphertext = await readBlob(encrypted.blob);
    const createObjectURL = vi.fn(() => 'blob:cargochain-proof');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const fetchImpl = vi.fn(async (url, options) => {
      if (url.includes('/api/proofs/')) {
        expect(options.headers.Authorization).toBe('Bearer session-token');
        return new Response(JSON.stringify({
          dataKey: encrypted.dataKey,
          iv: encrypted.iv,
          mediaType: encrypted.mediaType,
          plaintextSha256: encrypted.plaintextSha256,
          ciphertextSha256: encrypted.ciphertextSha256,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(ciphertext, {
        status: 200,
        headers: { 'content-length': String(ciphertext.length) },
      });
    });

    const loaded = await loadEncryptedProof(uri, {
      requestId: 1,
      milestoneId: 0,
      token: 'session-token',
      gatewayBases: ['https://gateway.example/ipfs'],
      fetchImpl,
    });
    expect(loaded.objectUrl).toBe('blob:cargochain-proof');
    expect(loaded.gatewayUrl).toBe(`https://gateway.example/ipfs/${CID}`);
    loaded.cleanup();
    loaded.cleanup();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
