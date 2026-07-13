const { verifyAccessToken } = require('../utils/jwt');
const db = require('../models/db');

/**
 * SSE auth middleware.
 * Frontend uses EventSource with withCredentials:true — no custom headers possible.
 * Auth flow: try accessToken from Authorization header first (won't work for EventSource),
 * then fall back to refreshToken httpOnly cookie to identify the user.
 */
async function sseAuth(req, res, next) {
  // 1. Try Bearer token in Authorization header (for non-EventSource clients / tests)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = verifyAccessToken(token);
      req.user = {
        id: String(decoded.id),
        username: decoded.username || '',
        isAdmin: decoded.isAdmin || false
      };
      console.log(`[SSE AUTH] Bearer token OK, user: ${req.user.id}`);
      return next();
    } catch (err) {
      console.error('[SSE AUTH] Bearer token invalid:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // 2. Fall back to refreshToken cookie (what EventSource actually sends)
  const refreshToken = req.cookies && req.cookies.refreshToken;
  if (!refreshToken) {
    console.log('[SSE AUTH] No auth — no Bearer header and no refreshToken cookie');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verify the refresh token against the DB (ensures it hasn't been invalidated)
    const tokenData = await db.findRefreshToken(refreshToken);
    if (!tokenData) {
      console.log('[SSE AUTH] refreshToken not found in DB or expired');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { verifyRefreshToken } = require('../utils/jwt');
    const payload = verifyRefreshToken(refreshToken);

    const user = await db.findUserById(payload.id);
    if (!user) {
      console.log('[SSE AUTH] User not found for refresh token');
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: String(user.id),
      username: user.username,
      isAdmin: user.is_admin || false
    };
    console.log(`[SSE AUTH] Cookie auth OK, user: ${req.user.id} isAdmin: ${req.user.isAdmin}`);
    next();
  } catch (err) {
    console.error('[SSE AUTH] Cookie auth failed:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = sseAuth;
