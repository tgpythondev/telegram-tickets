const jwt = require('jsonwebtoken');

function sseAuth(req, res, next) {
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = {
      id: String(decoded.userId),
      isAdmin: decoded.isAdmin || false
    };
    next();
  } catch (err) {
    console.error('SSE auth failed:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = sseAuth;
