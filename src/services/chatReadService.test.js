import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  const from = vi.fn();
  return { query, from };
});

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { enrichConversationPreviews, listConversations } from './chatReadService';

describe('listConversations', () => {
  beforeEach(() => {
    const { query } = mocks;
    mocks.from.mockReset().mockReturnValue(query);
    query.select.mockReset().mockReturnValue(query);
    query.eq.mockReset().mockReturnValue(query);
    query.order.mockReset().mockReturnValue(query);
    query.then.mockReset().mockImplementation((resolve) => resolve({ data: [{ conversation_id: 'one' }], error: null }));
  });

  it('filters against the active runtime deployment rather than a hardcoded address', async () => {
    const address = '0x254dffcd3277c0b1660f6d42efbb754edababc2b';
    const rows = await listConversations({ chainId: 1337, contractAddress: address.toUpperCase() });

    expect(rows).toEqual([{ conversation_id: 'one' }]);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, 'chain_id', 1337);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, 'contract_address', address);
  });

  it('fails before querying when no valid deployment is active', async () => {
    await expect(listConversations({ chainId: 0, contractAddress: '' }))
      .rejects.toThrow('Active DeliveryEscrow deployment is unavailable');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('adds the latest visible message preview without widening conversation scope', async () => {
    mocks.query.then.mockImplementation((resolve) => resolve({
      data: [
        { message_content: 'Earlier update' },
        { message_content: 'Latest private update' },
      ],
      error: null,
    }));

    const rows = await enrichConversationPreviews([{ conversation_id: 'visible-one', request_id: 4 }]);

    expect(rows).toEqual([expect.objectContaining({
      conversation_id: 'visible-one',
      latest_message_preview: 'Latest private update',
    })]);
    expect(mocks.from).toHaveBeenCalledWith('messages');
    expect(mocks.query.eq).toHaveBeenCalledWith('conversation_id', 'visible-one');
  });
});
