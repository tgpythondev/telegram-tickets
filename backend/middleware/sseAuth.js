const { verifyAccessToken, verifyRefreshToken } = require('../utils/jwt');
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
            return next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // 2. Fall back to refreshToken cookie (what EventSource actually sends)
    const refreshToken = req.cookies && req.cookies.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Verify JWT first (synchronous, no DB hit) — fail fast on bad/expired token
        const payload = verifyRefreshToken(refreshToken);

        // Run both DB lookups in parallel — saves one full round-trip
        const [tokenData, user] = await Promise.all([
            db.findRefreshToken(refreshToken),
            db.findUserById(payload.id)
        ]);

        if (!tokenData) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = {
            id: String(user.id),
            username: user.username,
            isAdmin: user.is_admin || false
        };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = sseAuth;
