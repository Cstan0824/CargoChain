import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CargoPreview, truncateDescription } from './CargoPreview.jsx';

const items = [
  { itemName: 'Server rack', itemDescription: 'Keep upright', quantity: 2 },
  { itemName: 'Network switch', itemDescription: '', quantity: 1 },
];

describe('CargoPreview', () => {
  it('keeps a compact summary and exposes shipment contents on click', () => {
    render(<CargoPreview items={items} />);

    expect(screen.getByText('2 items · 3 units')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2 items · 3 units' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Shipment contents' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2 items · 3 units' }));
    expect(screen.getByRole('dialog', { name: 'Shipment contents' })).toBeTruthy();
    expect(screen.getByText('2 item types')).toBeTruthy();
    expect(screen.getByText('Server rack')).toBeTruthy();
    expect(screen.getByText('Keep upright')).toBeTruthy();
    expect(screen.getByText('No description provided.')).toBeTruthy();
  });

  it('supports keyboard toggling and Escape dismissal', () => {
    render(<CargoPreview items={items} />);
    const trigger = screen.getByRole('button', { name: '2 items · 3 units' });

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Shipment contents' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Shipment contents' })).toBeNull();
  });

  it('truncates descriptions at 50 characters and keeps the full value available to assistive technology', () => {
    const description = '12345678901234567890123456789012345678901234567890abcdef';
    expect(truncateDescription(description)).toBe('12345678901234567890123456789012345678901234567890…');
    render(<CargoPreview items={[{ itemName: 'Crate', itemDescription: description, quantity: 1 }]} />);
    fireEvent.click(screen.getByRole('button', { name: '1 item · 1 unit' }));
    const descriptionNode = screen.getByText('12345678901234567890123456789012345678901234567890…');
    expect(descriptionNode.getAttribute('title')).toBe(description);
    expect(descriptionNode.getAttribute('aria-label')).toBe(description);
    expect(descriptionNode.textContent).toHaveLength(51);
  });

  it('does not bubble preview row clicks into a clickable marketplace row', () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <CargoPreview items={items} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: '2 items · 3 units' }));
    fireEvent.click(screen.getByText('Server rack'));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
