// server/middleware/corsMiddleware.js — CargoChain CORS middleware
// Enforces strict CORS policy allowing only the configured CLIENT_ORIGIN (or local dev equivalent).
// Rejects any request containing an unauthorized Origin header with 403 Forbidden.

const { config } = require('../config/environment');

function isLocalDevOrigin(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' &&
      parsed.port === '5173' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigin = config.clientOrigin;

  if (origin) {
    const normOrigin = origin.toLowerCase().replace(/\/$/, '');
    const normAllowed = allowedOrigin.toLowerCase().replace(/\/$/, '');

    // Allow both 127.0.0.1:5173 and localhost:5173 in local development
    const isDevMatch = isLocalDevOrigin(normAllowed) && isLocalDevOrigin(normOrigin);

    if (normOrigin === normAllowed || isDevMatch) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      // Reject any request with an unauthorized Origin header
      return res.status(403).json({ error: 'CORS policy does not allow access from this origin.' });
    }
  }

  // Preflight response headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

module.exports = { corsMiddleware };
