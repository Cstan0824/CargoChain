// server/middleware/walletRateLimit.js — Per-Wallet Rate Limiting Middleware
// Limits message sending attempts to 30 requests per minute per authenticated wallet address.

const walletRequestMap = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30;

// Periodic cleanup of expired records
setInterval(() => {
  const now = Date.now();
  for (const [wallet, records] of walletRequestMap.entries()) {
    const valid = records.filter(ts => now - ts < WINDOW_MS);
    if (valid.length === 0) {
      walletRequestMap.delete(wallet);
    } else {
      walletRequestMap.set(wallet, valid);
    }
  }
}, WINDOW_MS).unref();

function walletRateLimit(req, res, next) {
  const wallet = req.user?.walletAddress ? req.user.walletAddress.toLowerCase() : null;

  if (!wallet) {
    return res.status(401).json({ error: 'Unauthorized: Wallet identity required for rate limiting' });
  }

  const now = Date.now();
  const userRecords = walletRequestMap.get(wallet) || [];
  const validRecords = userRecords.filter(ts => now - ts < WINDOW_MS);

  if (validRecords.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'Rate limit exceeded: Maximum 30 messages per minute per wallet' });
  }

  validRecords.push(now);
  walletRequestMap.set(wallet, validRecords);
  next();
}

/**
 * Helper to reset rate limit map (useful for test runs).
 */
function resetWalletRateLimit() {
  walletRequestMap.clear();
}

module.exports = {
  walletRateLimit,
  resetWalletRateLimit,
};
