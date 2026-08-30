// server/middleware/authenticateChatToken.js — CargoChain Chat JWT Verification Middleware
// Verifies Bearer JWT tokens and attaches normalized req.user = { walletAddress }.

const { verifyToken } = require('../services/tokenService');

function authenticateChatToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'Unauthorized: Malformed Authorization header' });
  }

  const token = parts[1];

  try {
    const verified = verifyToken(token);
    req.user = {
      walletAddress: verified.walletAddress,
      accountId: verified.accountId,
      claims: verified.claims,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = { authenticateChatToken };
