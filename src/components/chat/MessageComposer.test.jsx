import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  show: vi.fn(),
}));

vi.mock('../../lib/chatApiClient', () => ({
  sendMessage: mocks.sendMessage,
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ show: mocks.show }),
}));

import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.show.mockReset();
  });

  it('delivers the trusted API message immediately and clears the draft', async () => {
    const user = userEvent.setup();
    const onMessageSent = vi.fn();
    const returnedMessage = {
      message_id: 'message-1',
      conversation_id: 'conversation-1',
      message_content: 'Hello carrier',
    };
    mocks.sendMessage.mockResolvedValue({ message: returnedMessage });

    render(
      <MessageComposer
        conversationId="conversation-1"
        onMessageSent={onMessageSent}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'Hello carrier{Enter}');

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith('conversation-1', 'Hello carrier');
      expect(onMessageSent).toHaveBeenCalledWith(returnedMessage);
    });
    expect(input.value).toBe('');
  });

  it('keeps the draft when the API rejects the send', async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    render(<MessageComposer conversationId="conversation-1" />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Retry me{Enter}');

    await waitFor(() => {
      expect(screen.getByText('This chat is now read-only.')).toBeTruthy();
    });
    expect(input.value).toBe('Retry me');
  });

  it('uses a disabled read-only input with a concise placeholder', () => {
    render(<MessageComposer conversationId="conversation-1" isWritable={false} />);

    const input = screen.getByRole('textbox');
    expect(input.disabled).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('This chat is read-only.');
  });
});
