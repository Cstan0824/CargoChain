import { describe, expect, it, vi } from 'vitest';
import { loadOpenRequests } from './Marketplace.jsx';

const shipper = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const walletB = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

function publicMarketplaceContract() {
  return {
    getOpenRequests: vi.fn().mockResolvedValue([1n]),
    getRequest: vi.fn().mockResolvedValue({
      requestId: 1n,
      shipper,
      pickupLocation: 'Kuala Lumpur',
      deliveryLocation: 'Penang',
      totalAmount: 0n,
      proposedAmount: 1_000_000_000_000_000_000n,
      deadline: 1_900_000_000n,
      specialInstruction: 'Handle carefully',
      createdAt: 1_800_000_000n,
    }),
    getItems: vi.fn().mockResolvedValue([{ itemName: 'Server rack', itemDescription: '', quantity: 1n }]),
    getMilestones: vi.fn().mockResolvedValue([{ status: 0n }]),
    getProposals: vi.fn().mockRejectedValue(new Error('wallet-specific proposal read failed')),
  };
}

describe('Marketplace public reads', () => {
  it('keeps public request rows visible when optional wallet proposal enrichment fails', async () => {
    const contract = publicMarketplaceContract();

    const rowsForA = await loadOpenRequests(contract, shipper);
    const rowsForB = await loadOpenRequests(contract, walletB);

    expect(rowsForA.map((row) => row.id)).toEqual([1]);
    expect(rowsForB.map((row) => row.id)).toEqual([1]);
    expect(rowsForB[0]).toMatchObject({
      from: 'Kuala Lumpur',
      to: 'Penang',
      hasOwnActiveProposal: false,
    });
  });
});
