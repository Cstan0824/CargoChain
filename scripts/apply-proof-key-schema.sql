-- CargoChain encrypted milestone proof-key records
--
-- Apply this script in the Supabase SQL editor. The browser must never query
-- this table: no client policies are created, and the Express service-role
-- client is the only application path that reads/writes wrapped keys.

CREATE TABLE IF NOT EXISTS proof_keys (
  proof_key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id NUMERIC NOT NULL,
  contract_address TEXT NOT NULL,
  request_id NUMERIC NOT NULL,
  milestone_id NUMERIC NOT NULL,
  submission_version NUMERIC NOT NULL DEFAULT 1,
  cid TEXT NOT NULL,
  wrapped_data_key TEXT NOT NULL,
  wrap_iv TEXT NOT NULL,
  wrap_tag TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'aes-256-gcm-v1',
  encryption_algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  proof_iv TEXT NOT NULL,
  plaintext_sha256 TEXT NOT NULL,
  ciphertext_sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_length NUMERIC NOT NULL,
  uploader_address TEXT NOT NULL,
  shipper_address TEXT NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT proof_keys_cid_not_empty CHECK (length(trim(cid)) > 0),
  CONSTRAINT proof_keys_wrapped_key_not_empty CHECK (length(trim(wrapped_data_key)) > 0),
  CONSTRAINT proof_keys_addresses_lower CHECK (
    uploader_address = lower(uploader_address)
    AND shipper_address = lower(shipper_address)
    AND contract_address = lower(contract_address)
  ),
  CONSTRAINT proof_keys_byte_length_positive CHECK (byte_length > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_keys_identity
  ON proof_keys (chain_id, contract_address, request_id, milestone_id, cid);

CREATE INDEX IF NOT EXISTS idx_proof_keys_request_milestone
  ON proof_keys (chain_id, contract_address, request_id, milestone_id, created_at DESC);

ALTER TABLE proof_keys ENABLE ROW LEVEL SECURITY;

-- Intentionally no anon/authenticated SELECT, INSERT, UPDATE, or DELETE
-- policies. Supabase's service-role backend client bypasses RLS; browser
-- clients receive no direct proof-key access.

