-- ============================================================================
-- CargoChain Off-Chain Chat Module — Phase 3 Database Schema & RLS Policies
-- ============================================================================
-- Target Tables: conversations, messages
-- Fully Idempotent Script — Safe to execute multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section 1. Ensure Base Tables & Lowercase Wallet Constraints
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id NUMERIC NOT NULL DEFAULT 1337,
  contract_address TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  request_id NUMERIC NOT NULL,
  shipper_wallet TEXT NOT NULL,
  carrier_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  CONSTRAINT chk_shipper_wallet_lower CHECK (shipper_wallet = lower(shipper_wallet)),
  CONSTRAINT chk_carrier_wallet_lower CHECK (carrier_wallet = lower(carrier_wallet))
);

CREATE TABLE IF NOT EXISTS messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_wallet TEXT NOT NULL,
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sender_wallet_lower CHECK (sender_wallet = lower(sender_wallet))
);

-- Safely add lowercase check constraints if tables existed prior without them
DO $$
BEGIN
  -- Older Phase 3 drafts used a chain-agnostic key. Remove it so contract
  -- redeployments and different chains can safely reuse request IDs.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_request_carrier'
  ) THEN
    ALTER TABLE conversations DROP CONSTRAINT unique_request_carrier;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_shipper_wallet_lower'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT chk_shipper_wallet_lower CHECK (shipper_wallet = lower(shipper_wallet));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_carrier_wallet_lower'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT chk_carrier_wallet_lower CHECK (carrier_wallet = lower(carrier_wallet));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sender_wallet_lower'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT chk_sender_wallet_lower CHECK (sender_wallet = lower(sender_wallet));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_conversation_identity'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT unique_conversation_identity UNIQUE (chain_id, contract_address, request_id, carrier_wallet);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Section 2. Single-Column & Composite Indexing
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_identity 
ON conversations (chain_id, contract_address, request_id, carrier_wallet);

CREATE INDEX IF NOT EXISTS idx_conversations_shipper_wallet 
ON conversations (shipper_wallet);

CREATE INDEX IF NOT EXISTS idx_conversations_carrier_wallet 
ON conversations (carrier_wallet);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
ON conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
ON messages (conversation_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- Section 3. PostgreSQL Trigger for Automating last_message_at
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_last_message_at ON messages;

CREATE TRIGGER trg_update_last_message_at
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_last_message_at();

-- ----------------------------------------------------------------------------
-- Section 4. Row Level Security (RLS) & SELECT-only Policies
-- ----------------------------------------------------------------------------

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated members can view conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated members can view messages" ON messages;

-- SELECT Policy for conversations
CREATE POLICY "Authenticated members can view conversations"
ON conversations
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'wallet_address') = shipper_wallet
  OR (auth.jwt() ->> 'wallet_address') = carrier_wallet
);

-- SELECT Policy for messages
CREATE POLICY "Authenticated members can view messages"
ON messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.conversation_id = messages.conversation_id
    AND (
      (auth.jwt() ->> 'wallet_address') = c.shipper_wallet
      OR (auth.jwt() ->> 'wallet_address') = c.carrier_wallet
    )
  )
);

-- ----------------------------------------------------------------------------
-- Section 5. Supabase Realtime Publication Setup
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
