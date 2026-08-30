import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  conversationId: undefined,
  conversations: [],
  chat: { isChatAuthenticated: true },
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', rpcChainId: 1337, provider: null },
  contracts: { deliveryEscrow: { target: '0xescrow' } },
  channel: { on: vi.fn(), subscribe: vi.fn() },
}));

mocks.channel.on.mockReturnValue(mocks.channel);

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ conversationId: mocks.conversationId }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('../context/Web3Context', () => ({ useWallet: () => mocks.wallet }));
vi.mock('../hooks/useContracts', () => ({ useContracts: () => ({ contracts: mocks.contracts }) }));
vi.mock('../context/ChatAuthContext', () => ({ useChatAuth: () => mocks.chat }));
vi.mock('../hooks/useConversationPresentation', () => ({ useConversationPresentation: () => ({}) }));
vi.mock('../hooks/useWallet.js', () => ({ useWallet: () => mocks.wallet }));
vi.mock('../hooks/useToast.js', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('../components/chat/ChatAuthGate', () => ({ ChatAuthGate: ({ children }) => <>{children}</> }));
vi.mock('../components/chat/ConversationList', () => ({
  ConversationList: ({ conversations = [] }) => (
    <div data-testid="conversation-list">
      Conversation list
      {conversations.length === 0 && <span>No conversations yet</span>}
    </div>
  ),
}));
vi.mock('../components/chat/ConversationHeader', () => ({ ConversationHeader: () => <div>Conversation header</div> }));
vi.mock('../components/chat/MessageTimeline', () => ({ MessageTimeline: () => <div>Message timeline</div> }));
vi.mock('../components/chat/MessageComposer', () => ({ MessageComposer: () => <div>Message composer</div> }));
vi.mock('../services/chatReadService', () => ({
  listConversations: vi.fn(async () => mocks.conversations),
  enrichConversationPreviews: vi.fn(async (rows) => rows),
}));
vi.mock('../lib/chatApiClient', () => ({ getConversationAccess: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { channel: vi.fn(() => mocks.channel), removeChannel: vi.fn() },
}));

import { Messages } from './Messages.jsx';

describe('Messages states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationId = undefined;
    mocks.conversations = [];
    mocks.chat.isChatAuthenticated = true;
  });

  it('keeps both panes visible when authenticated conversation loading completes with no rows', async () => {
    render(<Messages />);

    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeTruthy());
    expect(screen.getByText('No conversation selected')).toBeTruthy();
    expect(screen.getByTestId('messages-workspace')).toBeTruthy();
  });

  it('restores the two-pane workspace when conversations exist', async () => {
    mocks.conversations = [{
      conversation_id: 'conversation-1',
      request_id: 7,
      shipper_wallet: mocks.wallet.account,
      carrier_wallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      created_at: '2026-08-25T00:00:00.000Z',
    }];

    render(<Messages />);

    await waitFor(() => expect(screen.getByTestId('conversation-list')).toBeTruthy());
    expect(screen.getByText('No conversation selected')).toBeTruthy();
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });
});
