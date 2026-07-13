// CSRF protection — double-submit token pattern.
//
// Flow:
//   GET /auth/csrf  → generate token, store with TTL, return { csrfToken }
//   Every non-GET  → read X-CSRF-Token header, validate against store
//
// The previous implementation had two critical bugs:
//   1. generateToken() never stored the token → tokenStore.has() always false
//   2. A valid JWT Bearer token caused the CSRF check to be skipped entirely,
//      meaning CSRF protection was completely bypassed for authenticated requests.

const crypto = require('crypto');

// token → expiry timestamp
const tokenStore = new Map();

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — must survive the full browser session

// Generate AND store a new CSRF token
function generateToken() {
  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

// Middleware: validate X-CSRF-Token header on every state-changing request
function csrfProtection(req, res, next) {
  // Safe methods — skip
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'];

  if (!csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  const expiry = tokenStore.get(csrfToken);

  if (!expiry) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  if (Date.now() > expiry) {
    tokenStore.delete(csrfToken);
    return res.status(403).json({ error: 'CSRF token expired' });
  }

  // Token is valid — keep it alive (frontend caches one token per session)
  // Do NOT delete it here: frontend reuses the same token until logout/reload
  next();
}

csrfProtection.generateToken = generateToken;

// Invalidate a specific token (call on logout)
csrfProtection.invalidateToken = function(token) {
  if (token && tokenStore.has(token)) {
    tokenStore.delete(token);
    console.log('[CSRF] Token invalidated on logout');
  }
};

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, expiry] of tokenStore.entries()) {
    if (now > expiry) {
      tokenStore.delete(token);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[CSRF] Cleaned up ${removed} expired tokens`);
  }
}, 10 * 60 * 1000);

module.exports = csrfProtection;
