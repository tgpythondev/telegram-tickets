function requireAdmin(req, res, next) {
    console.log(`[ADMIN AUTH] User: ${req.user?.username}, isAdmin: ${req.user?.isAdmin || false}`);
    if (!req.user || !req.user.isAdmin) {
        console.log('[ADMIN AUTH] Access denied - not admin');
        return res.status(403).json({ error: 'Admin access required' });
    }
    console.log('[ADMIN AUTH] Access granted');
    next();
}

module.exports = requireAdmin;
