// server/middleware/rateLimit.js — Simple in-memory rate limiter for auth & API routes
// Prevents brute force and abuse by limiting requests per IP within a sliding window.

function createRateLimiter({ windowMs = 60 * 1000, maxRequests = 30 } = {}) {
  const requests = new Map();

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [key, records] of requests.entries()) {
      const valid = records.filter(ts => now - ts < windowMs);
      if (valid.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, valid);
      }
    }
  }, windowMs).unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    const userRequests = requests.get(ip) || [];
    const validRequests = userRequests.filter(ts => now - ts < windowMs);

    if (validRequests.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    validRequests.push(now);
    requests.set(ip, validRequests);
    next();
  };
}

module.exports = { createRateLimiter };
