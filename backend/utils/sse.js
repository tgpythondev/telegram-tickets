class SSE {
  constructor() {
    this.admins = new Map();
    this.users = new Map();
    this.eventCache = [];
    this.maxCacheSize = 100;
    this.cacheTTL = 15 * 60 * 1000; // 15 минут
  }

  addAdmin(userId, res) {
    userId = String(userId);
    const existing = Array.from(this.admins.keys()).filter(key => key.startsWith(`${userId}-`));
    if (existing.length >= 3) {
      const oldest = existing.sort()[0];
      const oldRes = this.admins.get(oldest);
      if (oldRes.writable && !oldRes.destroyed) {
        oldRes.write('event: connection_closed\ndata: {"reason":"new_connection"}\n\n');
        oldRes.end();
      }
      this.admins.delete(oldest);
      console.log(`SSE: Closed oldest admin connection ${oldest} (limit reached)`);
    }

    const connId = `${userId}-${Date.now()}`;
    this.admins.set(connId, res);

    res.on('close', () => {
      this.admins.delete(connId);
      console.log(`Admin SSE closed: ${connId}`);
    });

    console.log(`Admin SSE connected: ${connId}`);
    return connId;
  }

  addUser(userId, res) {
    userId = String(userId);
    const existing = Array.from(this.users.keys()).filter(key => key.startsWith(`${userId}-`));
    if (existing.length >= 3) {
      const oldest = existing.sort()[0];
      const oldRes = this.users.get(oldest);
      if (oldRes.writable && !oldRes.destroyed) {
        oldRes.write('event: connection_closed\ndata: {"reason":"new_connection"}\n\n');
        oldRes.end();
      }
      this.users.delete(oldest);
      console.log(`SSE: Closed oldest user connection ${oldest} (limit reached)`);
    }

    const connId = `${userId}-${Date.now()}`;
    this.users.set(connId, res);

    res.on('close', () => {
      this.users.delete(connId);
      console.log(`User SSE closed: ${connId}`);
    });

    console.log(`User SSE connected: ${connId}`);
    return connId;
  }

  send(target, event, data) {
    const clients = target === 'admins' ? this.admins : this.users;
    const eventId = Date.now();
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    this._cacheEvent({ id: eventId, event, data, target, timestamp: Date.now() });

    let sent = 0;
    let failed = 0;

    clients.forEach((res, connId) => {
      try {
        if (res.writable && !res.destroyed) {
          res.write(payload);
          sent++;
        } else {
          failed++;
          clients.delete(connId);
          console.error(`SSE: Connection ${connId} not writable, removed`);
        }
      } catch (err) {
        failed++;
        clients.delete(connId);
        console.error(`Failed to send to ${connId}:`, err.message);
      }
    });

    if (sent > 0 || failed > 0) {
      console.log(`SSE event ${event} sent to ${target}: ${sent} ok, ${failed} failed`);
    }
  }

  sendToUser(userId, event, data) {
    userId = String(userId);
    console.log(`SSE: Attempting to send ${event} to user ${userId} (type: ${typeof userId})`);

    const connIds = Array.from(this.users.keys()).filter(key => key.startsWith(`${userId}-`));
    console.log(`SSE: Found ${connIds.length} active connections for user ${userId}`);

    if (connIds.length === 0) {
      console.warn(`SSE: No active connection for user ${userId}, event ${event} lost`);
      console.warn(`SSE: Active user keys:`, Array.from(this.users.keys()));
      return;
    }

    const eventId = Date.now();
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    let sent = 0;
    connIds.forEach(connId => {
      const res = this.users.get(connId);
      try {
        if (res.writable && !res.destroyed) {
          res.write(payload);
          sent++;
        } else {
          this.users.delete(connId);
          console.error(`SSE: User connection ${connId} not writable, removed`);
        }
      } catch (err) {
        this.users.delete(connId);
        console.error(`SSE: Failed to send to user ${userId} (${connId}):`, err.message);
      }
    });

    console.log(`SSE: Sent ${event} to user ${userId} (${sent}/${connIds.length} connections)`);
  }

  sendToAdmin(adminId, event, data) {
    adminId = String(adminId);
    const connIds = Array.from(this.admins.keys()).filter(key => key.startsWith(`${adminId}-`));
    if (connIds.length === 0) {
      return;
    }

    const eventId = Date.now();
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    connIds.forEach(connId => {
      const res = this.admins.get(connId);
      try {
        if (res.writable && !res.destroyed) {
          res.write(payload);
        } else {
          this.admins.delete(connId);
          console.error(`SSE: Admin connection ${connId} not writable, removed`);
        }
      } catch (err) {
        this.admins.delete(connId);
        console.error(`Failed to send to admin ${adminId}:`, err.message);
      }
    });
  }

  closeAll() {
    const closePayload = 'event: close\ndata: {}\n\n';

    [...this.admins.values(), ...this.users.values()].forEach(res => {
      try {
        res.write(closePayload);
        res.end();
      } catch (err) {
        // connection уже закрыто
      }
    });

    this.admins.clear();
    this.users.clear();
    console.log('All SSE connections closed');
  }

  _cacheEvent(event) {
    this.eventCache.push(event);
    if (this.eventCache.length > this.maxCacheSize) {
      this.eventCache.shift();
    }

    this._cleanExpiredCache();
  }

  _cleanExpiredCache() {
    const now = Date.now();
    this.eventCache = this.eventCache.filter(evt => now - evt.timestamp < this.cacheTTL);
  }

  getEventsSince(lastEventId) {
    this._cleanExpiredCache();
    return this.eventCache.filter(evt => evt.id > lastEventId);
  }

  isUserConnected(userId) {
    userId = String(userId);
    const connected = Array.from(this.users.keys()).some(key => key.startsWith(`${userId}-`));
    console.log(`SSE: isUserConnected(${userId}) = ${connected}`);
    return connected;
  }

  getConnectionStats() {
    return {
      admins: this.admins.size,
      users: this.users.size,
      cachedEvents: this.eventCache.length,
      activeAdmins: new Set(Array.from(this.admins.keys()).map(k => k.split('-')[0])).size,
      activeUsers: new Set(Array.from(this.users.keys()).map(k => k.split('-')[0])).size
    };
  }

  getStats() {
    return {
      admins: this.admins.size,
      users: this.users.size,
      cachedEvents: this.eventCache.length
    };
  }

  removeConnection(connId) {
    const removed = this.users.delete(connId) || this.admins.delete(connId);
    if (removed) {
      console.log(`SSE: Connection ${connId} removed`);
    }
    return removed;
  }
}

module.exports = new SSE();
