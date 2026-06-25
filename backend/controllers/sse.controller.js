const sse = require('../utils/sse');

async function stream(req, res) {
  const { user } = req;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    if (user.isAdmin) {
      sse.addAdmin(user.id, res);
    } else {
      sse.addUser(user.id, res);
    }

    res.write(': connected\n\n');

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (err) {
        clearInterval(keepAlive);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  } catch (err) {
    console.error('SSE stream error:', err);
    res.status(429).json({ error: err.message });
  }
}

module.exports = { stream };
