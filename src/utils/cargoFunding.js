import { formatCargo } from './format.js';
import { ensureTokenAllowance, sendWalletContractTransaction } from './walletTransaction.js';

// Quote all token liabilities from the current deployment, not a stale UI row.
export async function quoteCargoFunding({ contracts, method, args, sender }) {
  const escrow = contracts.deliveryEscrow;
  const manager = contracts.lifecycleManager;
  const requestId = BigInt(args[0]);
  const request = await escrow.getRequest(requestId);
  const isShipper = request.shipper.toLowerCase() === sender.toLowerCase();
  let compensation = 0n, operational = 0n, response = 0n;
  let contract = manager;
  let transactionMethod = method;
  let transactionArgs = args;

  if (method === 'approveAndFund' || method === 'approveAndFundWithAllowance') {
    if (!isShipper) throw new Error('Only the request shipper can fund this proposal.');
    contract = escrow;
    compensation = BigInt(request.proposedAmount);
    const minimum = BigInt(await escrow.minimumOperationalAllowance(requestId, args[1]));
    operational = args[2] == null ? minimum : BigInt(args[2]);
    if (operational < minimum) throw new Error(`Operational reserve must be at least ${formatCargo(minimum)}.`);
    transactionMethod = 'approveAndFundWithAllowance';
    transactionArgs = [requestId, args[1], operational];
  } else if (method === 'requestAmendment' || method === 'requestAmendmentWithGasPolicy') {
    const existing = args[4] || [];
    const additions = args[5] || [];
    if (isShipper) {
      compensation = [...existing, ...additions].reduce((sum, item) => sum + BigInt(item.at(-1)), 0n);
      operational = BigInt(await escrow.minimumAdditionalOperationalAllowance(requestId, additions.length));
    }
    if (method === 'requestAmendmentWithGasPolicy' && Number(args[6]) === 1) {
      response = BigInt(args[7]);
      const minimum = BigInt(await manager.minimumResponseAllowance());
      if (response < minimum) throw new Error(`Response allowance must be at least ${formatCargo(minimum)}.`);
    }
  } else if (method === 'acceptAmendment') {
    const amendments = await manager.getAmendmentRequests(requestId);
    const amendment = amendments[Number(args[1])];
    if (!amendment || amendment.responder.toLowerCase() !== sender.toLowerCase()) {
      throw new Error('Only the amendment responder can accept this change.');
    }
    if (amendment.requester.toLowerCase() !== request.shipper.toLowerCase()) {
      compensation = BigInt(amendment.additionalFunding);
      operational = BigInt(amendment.operationalAllowance);
    }
  } else {
    throw new Error('Unsupported CARGO funding action.');
  }
  return { contract, method: transactionMethod, args: transactionArgs,
    compensation, operational, response, total: compensation + operational + response };
}

export async function sendCargoFundingTransaction({ contracts, method, args, signer, provider, confirmQuote }) {
  const quote = await quoteCargoFunding({ contracts, method, args, sender: await signer.getAddress() });
  if (confirmQuote && !await confirmQuote(quote)) return null;
  await ensureTokenAllowance({ token: contracts.cargoToken, spender: quote.contract.target,
    amount: quote.total, signer, provider });
  return sendWalletContractTransaction({ contract: quote.contract, method: quote.method,
    args: quote.args, signer, provider });
}
