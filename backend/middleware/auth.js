const { verifyAccessToken } = require('../utils/jwt');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/audit');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Логирование попытки доступа без токена
        try {
            await logAuditEvent(null, AUDIT_ACTIONS.LOGIN_FAILED, req, {
                endpoint: req.path,
                method: req.method,
                reason: 'missing_token'
            });
        } catch (logError) {
            console.error('Failed to log unauthorized access:', logError.message);
        }
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const user = verifyAccessToken(token);
        req.user = user;
        next();
    } catch (error) {
        // Логирование попытки доступа с невалидным токеном
        try {
            await logAuditEvent(null, AUDIT_ACTIONS.LOGIN_FAILED, req, {
                endpoint: req.path,
                method: req.method,
                reason: 'invalid_token',
                error: error.message
            });
        } catch (logError) {
            console.error('Failed to log unauthorized access:', logError.message);
        }
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = authenticateToken;
