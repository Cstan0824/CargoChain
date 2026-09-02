import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrandedModal } from './BrandedModal.jsx';

describe('BrandedModal', () => {
  it('does not dismiss a busy dialog with Escape or backdrop clicks', () => {
    const onClose = vi.fn();
    render(
      <BrandedModal title="Working" onClose={onClose} busy>
        <p>Still processing</p>
      </BrandedModal>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Working' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Working' }).disabled).toBe(true);
  });
});
