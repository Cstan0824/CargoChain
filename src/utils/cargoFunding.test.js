import { describe, expect, it, vi } from 'vitest';
import { quoteCargoFunding, sendCargoFundingTransaction } from './cargoFunding.js';
import { ensureTokenAllowance, sendWalletContractTransaction } from './walletTransaction.js';
vi.mock('./walletTransaction.js', () => ({ ensureTokenAllowance: vi.fn(), sendWalletContractTransaction: vi.fn().mockResolvedValue({ hash: 'tx' }) }));
function fixture() {
  return { cargoToken: {}, deliveryEscrow: { target: 'escrow', getRequest: vi.fn().mockResolvedValue({ shipper: 'shipper', proposedAmount: 100n }),
    minimumOperationalAllowance: vi.fn().mockResolvedValue(12n), minimumAdditionalOperationalAllowance: vi.fn().mockResolvedValue(6n) },
  lifecycleManager: { target: 'manager', minimumResponseAllowance: vi.fn().mockResolvedValue(4n),
    getAmendmentRequests: vi.fn().mockResolvedValue([{ requester: 'carrier', responder: 'shipper', additionalFunding: 10n, operationalAllowance: 6n }]) } };
}
describe('CARGO funding transactions', () => {
  it('approves compensation plus reserve for a fresh proposal, then sends that explicit reserve', async () => {
    vi.clearAllMocks();
    const contracts = fixture(), signer = { getAddress: async () => 'shipper' }, provider = {};
    const confirmQuote = vi.fn().mockResolvedValue(true);
    await sendCargoFundingTransaction({ contracts, method: 'approveAndFund', args: [1n, 0n], signer, provider, confirmQuote });
    expect(confirmQuote).toHaveBeenCalledWith(expect.objectContaining({ total: 112n, operational: 12n }));
    expect(ensureTokenAllowance).toHaveBeenCalledWith(expect.objectContaining({ spender: 'escrow', amount: 112n }));
    expect(sendWalletContractTransaction).toHaveBeenCalledWith(expect.objectContaining({ method: 'approveAndFundWithAllowance', args: [1n, 0n, 12n] }));
  });
  it('includes new-checkpoint reserve and response budget when shipper requests an amendment', async () => {
    const quote = await quoteCargoFunding({ contracts: fixture(), method: 'requestAmendmentWithGasPolicy',
      args: [1n, 100n, 90n, 'note', [], [['new', 0n, 10n]], 1, 4n], sender: 'shipper' });
    expect(quote.total).toBe(20n);
  });
  it('does not charge carrier for shipper-funded delivery work', async () => {
    const quote = await quoteCargoFunding({ contracts: fixture(), method: 'requestAmendmentWithGasPolicy',
      args: [1n, 100n, 90n, 'note', [], [['new', 0n, 10n]], 1, 4n], sender: 'carrier' });
    expect(quote.total).toBe(4n);
  });
  it('reads staged reserve when the shipper accepts a carrier amendment', async () => {
    const quote = await quoteCargoFunding({ contracts: fixture(), method: 'acceptAmendment', args: [1n, 0n], sender: 'shipper' });
    expect(quote.total).toBe(16n);
  });
  it('rejects underfunded response policy before asking for an approval', async () => {
    await expect(quoteCargoFunding({ contracts: fixture(), method: 'requestAmendmentWithGasPolicy',
      args: [1n, 100n, 90n, 'note', [], [], 1, 0n], sender: 'shipper' })).rejects.toThrow('Response allowance must');
  });
  it('does not submit anything when the user declines the full quote', async () => {
    vi.clearAllMocks();
    await sendCargoFundingTransaction({ contracts: fixture(), method: 'approveAndFund', args: [1n, 0n],
      signer: { getAddress: async () => 'shipper' }, provider: {}, confirmQuote: async () => false });
    expect(ensureTokenAllowance).not.toHaveBeenCalled();
    expect(sendWalletContractTransaction).not.toHaveBeenCalled();
  });
});
