import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: '0xcarrier',
  channel: { on: vi.fn(), subscribe: vi.fn() },
  realtimeHandler: null,
  getConversationMessages: vi.fn(),
  fetchRequestNotices: vi.fn(),
}));

mocks.channel.on.mockImplementation((_event, _filter, handler) => {
  mocks.realtimeHandler = handler;
  return mocks.channel;
});
mocks.channel.subscribe.mockReturnValue(mocks.channel);

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => mocks.channel),
    removeChannel: vi.fn(),
  },
}));
vi.mock('../../services/chatReadService', () => ({
  getConversationMessages: mocks.getConversationMessages,
}));
vi.mock('../../utils/chatTimeline', () => ({
  fetchRequestNotices: mocks.fetchRequestNotices,
  mergeChatTimeline: (messages = [], notices = []) => [
    ...messages.map((message) => ({
      kind: 'message',
      id: `message:${message.message_id}`,
      timestampMs: new Date(message.created_at).getTime(),
      order: 0,
      message,
    })),
    ...notices,
  ],
  subscribeToRequestNotices: vi.fn(() => () => undefined),
}));
vi.mock('../../context/Web3Context', () => ({
  useWallet: () => ({ account: mocks.account }),
}));
vi.mock('../../hooks/useConversationPresentation', () => ({
  displayNameOrAddress: (_name, address) => address,
}));
vi.mock('../Skeleton.jsx', () => ({ Skeleton: () => <span data-testid="skeleton" /> }));
vi.mock('./BlockchainNoticeTile', () => ({ BlockchainNoticeTile: () => null }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

import { MessageTimeline } from './MessageTimeline.jsx';

const baseProps = {
  conversationId: 'conversation-1',
  requestId: 1,
  provider: null,
  initialMessages: [],
  displayNames: {},
};

function pendingMessage(id, content = 'Same text') {
  return {
    message_id: id,
    client_message_id: id,
    conversation_id: 'conversation-1',
    sender_wallet: mocks.account,
    message_content: content,
    created_at: new Date().toISOString(),
    deliveryStatus: 'sending',
    optimistic: true,
  };
}

function serverMessage(id, content = 'Same text') {
  return {
    message_id: id,
    conversation_id: 'conversation-1',
    sender_wallet: mocks.account,
    message_content: content,
    created_at: new Date().toISOString(),
  };
}

describe('MessageTimeline optimistic delivery', () => {
  beforeEach(() => {
    mocks.getConversationMessages.mockReset();
    mocks.fetchRequestNotices.mockReset();
    mocks.getConversationMessages.mockResolvedValue([]);
    mocks.fetchRequestNotices.mockResolvedValue([]);
    mocks.realtimeHandler = null;
  });

  it('shows sending immediately and reconciles the API and realtime rows to Sent without duplication', async () => {
    const pending = pendingMessage('optimistic-1');
    const confirmed = serverMessage('server-1');
    const { rerender } = render(<MessageTimeline {...baseProps} appendedMessage={pending} />);

    expect(await screen.findByText('Sending…')).toBeTruthy();
    expect(screen.getAllByText('Same text')).toHaveLength(1);

    rerender(<MessageTimeline {...baseProps} appendedMessage={confirmed} />);
    await waitFor(() => expect(screen.getByText('Sent')).toBeTruthy());
    expect(screen.queryByText('Sending…')).toBeNull();
    expect(screen.getAllByText('Same text')).toHaveLength(1);

    await act(async () => {
      mocks.realtimeHandler?.({ new: confirmed });
    });
    expect(screen.getAllByText('Same text')).toHaveLength(1);
  });

  it('keeps a failed message while reconciling a retry with the latest sending item', async () => {
    const firstPending = pendingMessage('optimistic-1');
    const firstFailed = { ...firstPending, deliveryStatus: 'failed', deliveryError: 'Service unavailable' };
    const retryPending = pendingMessage('optimistic-2');
    const retryConfirmed = serverMessage('server-2');
    const { rerender } = render(<MessageTimeline {...baseProps} appendedMessage={firstPending} />);

    expect(await screen.findByText('Sending…')).toBeTruthy();
    rerender(<MessageTimeline {...baseProps} appendedMessage={firstFailed} />);
    await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());

    rerender(<MessageTimeline {...baseProps} appendedMessage={retryPending} />);
    await waitFor(() => expect(screen.getAllByText('Same text')).toHaveLength(2));

    await act(async () => {
      mocks.realtimeHandler?.({ new: retryConfirmed });
    });
    await waitFor(() => expect(screen.getByText('Sent')).toBeTruthy());
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getAllByText('Same text')).toHaveLength(2);
  });
});
