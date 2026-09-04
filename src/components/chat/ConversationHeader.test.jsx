import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationHeader } from './ConversationHeader';

describe('ConversationHeader', () => {
  it('shows relationship context and navigates to the shipment', () => {
    const onViewShipment = vi.fn();
    render(
      <ConversationHeader
        conversation={{ request_id: 12 }}
        presentation={{
          title: 'Luna Logistics',
          shipmentLabel: 'Shipment #12',
          route: 'Makassar → Jakarta',
          otherRole: 'Carrier',
          otherName: 'Luna Logistics',
        }}
        onViewShipment={onViewShipment}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Luna Logistics · Carrier' })).toBeTruthy();
    expect(screen.getByText(/Shipment #12/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /view shipment/i }));
    expect(onViewShipment).toHaveBeenCalledTimes(1);
  });
});
