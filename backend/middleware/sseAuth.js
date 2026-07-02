const jwt = require('jsonwebtoken');

function sseAuth(req, res, next) {
  const token = req.query.token;
  console.log(`[SSE AUTH] Token received: ${token ? 'YES' : 'NO'}`);

  if (!token) {
    console.log('[SSE AUTH] No token in query, returning 401');
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    console.log('[SSE AUTH] Token verified successfully:', decoded);
    req.user = {
      id: String(decoded.id),  // ИСПРАВЛЕНО: поле называется 'id', а не 'userId'
      isAdmin: decoded.isAdmin || false
    };
    console.log('[SSE AUTH] User set:', req.user.id, 'isAdmin:', req.user.isAdmin);
    next();
  } catch (err) {
    console.error('[SSE AUTH] Failed:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = sseAuth;
