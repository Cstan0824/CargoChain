import { describe, expect, it } from 'vitest';
import { buildConversationPresentation } from './useConversationPresentation';

const shipper = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const carrier = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const conversation = {
  request_id: 12,
  shipper_wallet: shipper,
  carrier_wallet: carrier,
  latest_message_preview: 'Proof is ready for review.',
};

describe('buildConversationPresentation', () => {
  it('uses the counterpart name, request id, work relationship, route, and preview', () => {
    expect(buildConversationPresentation({
      conversation,
      account: shipper,
      route: 'Makassar → Jakarta',
      shipperName: 'Aina',
      carrierName: 'Luna Logistics',
    })).toMatchObject({
      title: 'Luna Logistics#12',
      workLabel: 'Shipper work',
      route: 'Makassar → Jakarta',
      preview: 'Proof is ready for review.',
      otherName: 'Luna Logistics',
    });
  });

  it('derives Carrier work for the carrier even when one wallet can hold both app roles', () => {
    expect(buildConversationPresentation({
      conversation,
      account: carrier,
      shipperName: 'Aina',
      carrierName: 'Luna Logistics',
    })).toMatchObject({
      title: 'Aina#12',
      workLabel: 'Carrier work',
    });
  });

  it('uses a shortened counterpart wallet and a neutral activity fallback', () => {
    const view = buildConversationPresentation({
      conversation: { ...conversation, latest_message_preview: '' },
      account: shipper,
    });
    expect(view.title).toBe('0xbbbb…bbbb#12');
    expect(view.preview).toBe('Shipment activity');
  });
});
