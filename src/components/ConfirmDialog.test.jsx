import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

function ConfirmationHarness() {
  const [answer, setAnswer] = useState('unanswered');
  const { confirm, confirmation } = useConfirmDialog();

  const open = async () => {
    const confirmed = await confirm({
      title: 'Cancel this request?',
      message: 'This action cannot be reversed.',
      confirmLabel: 'Cancel request',
      tone: 'danger',
    });
    setAnswer(confirmed ? 'confirmed' : 'cancelled');
  };

  return (
    <>
      <button type="button" onClick={open}>Open confirmation</button>
      <output>{answer}</output>
      {confirmation && <ConfirmDialog {...confirmation} />}
    </>
  );
}

describe('ConfirmDialog', () => {
  it('resolves a confirmed action through the custom modal', async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness />);

    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('This action cannot be reversed.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(screen.getByText('confirmed')).toBeTruthy());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false when the user goes back', async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness />);

    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    await user.click(screen.getByRole('button', { name: 'Go back' }));

    await waitFor(() => expect(screen.getByText('cancelled')).toBeTruthy());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('traps focus and restores it to the opener', async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness />);

    const opener = screen.getByRole('button', { name: 'Open confirmation' });
    await user.click(opener);
    const cancelButton = screen.getByRole('button', { name: 'Go back' });
    const confirmButton = screen.getByRole('button', { name: 'Cancel request' });
    const closeButton = screen.getByRole('button', { name: 'Close confirmation' });

    await waitFor(() => expect(document.activeElement).toBe(cancelButton));
    confirmButton.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    await user.click(cancelButton);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
