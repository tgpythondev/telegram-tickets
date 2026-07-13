const { verifyAccessToken } = require('../utils/jwt');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    console.log(`[AUTH MIDDLEWARE] Path: ${req.path}, Token present: ${!!token}`);

    if (!token) {
        console.log('[AUTH MIDDLEWARE] No token, rejecting');
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const user = verifyAccessToken(token);
        console.log('[AUTH MIDDLEWARE] Token verified, user:', user.username);
        req.user = user;
        next();
    } catch (error) {
        console.error('[AUTH MIDDLEWARE] Token verification failed:', error.message);
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = authenticateToken;
