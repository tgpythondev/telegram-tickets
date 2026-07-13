const sse = require('../utils/sse');

async function stream(req, res) {
  const { user } = req;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // addAdmin/addUser return the connId so we can reference it in keepAlive
    let connId;
    if (user.isAdmin) {
      connId = sse.addAdmin(user.id, res);
    } else {
      connId = sse.addUser(user.id, res);
    }

    res.write(': connected\n\n');

    const keepAlive = setInterval(() => {
      try {
        if (res.writable && !res.destroyed) {
          res.write(': ping\n\n');
        } else {
          throw new Error('Connection closed');
        }
      } catch (err) {
        clearInterval(keepAlive);
        sse.removeConnection(connId);
        console.log(`SSE: Removed dead connection ${connId} during ping`);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      // sse.addUser/addAdmin already register a 'close' listener that removes the connId,
      // but clearing the interval here prevents the next ping from firing on a dead socket.
    });
  } catch (err) {
    console.error('SSE stream error:', err);
    // Can't send JSON after headers are flushed — just end the response
    res.end();
  }
}

module.exports = { stream };
