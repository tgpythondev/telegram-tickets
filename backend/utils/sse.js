class SSE {
  constructor() {
    this.admins = new Map();
    this.users = new Map();
    this.eventCache = [];
    this.maxCacheSize = 100;
    this.cacheTTL = 15 * 60 * 1000; // 15 минут
  }

  addAdmin(userId, res) {
    const existing = Array.from(this.admins.keys()).filter(key => key.startsWith(`${userId}-`));
    if (existing.length >= 3) {
      throw new Error('Max SSE connections reached');
    }

    const connId = `${userId}-${Date.now()}`;
    this.admins.set(connId, res);

    res.on('close', () => {
      this.admins.delete(connId);
      console.log(`Admin SSE closed: ${connId}`);
    });

    console.log(`Admin SSE connected: ${connId}`);
  }

  addUser(userId, res) {
    const existing = Array.from(this.users.keys()).filter(key => key.startsWith(`${userId}-`));
    if (existing.length >= 3) {
      throw new Error('Max SSE connections reached');
    }

    const connId = `${userId}-${Date.now()}`;
    this.users.set(connId, res);

    res.on('close', () => {
      this.users.delete(connId);
      console.log(`User SSE closed: ${connId}`);
    });

    console.log(`User SSE connected: ${connId}`);
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
        res.write(payload);
        sent++;
      } catch (err) {
        failed++;
        console.error(`Failed to send to ${connId}:`, err.message);
      }
    });

    if (sent > 0 || failed > 0) {
      console.log(`SSE event ${event} sent to ${target}: ${sent} ok, ${failed} failed`);
    }
  }

  sendToUser(userId, event, data) {
    const connId = Array.from(this.users.keys()).find(key => key.startsWith(`${userId}-`));
    if (!connId) {
      return;
    }

    const res = this.users.get(connId);
    const eventId = Date.now();
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    try {
      res.write(payload);
      console.log(`SSE event ${event} sent to user ${userId}`);
    } catch (err) {
      console.error(`Failed to send to user ${userId}:`, err.message);
    }
  }

  sendToAdmin(adminId, event, data) {
    const connIds = Array.from(this.admins.keys()).filter(key => key.startsWith(`${adminId}-`));
    if (connIds.length === 0) {
      return;
    }

    const eventId = Date.now();
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    connIds.forEach(connId => {
      const res = this.admins.get(connId);
      try {
        res.write(payload);
      } catch (err) {
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

  getStats() {
    return {
      admins: this.admins.size,
      users: this.users.size,
      cachedEvents: this.eventCache.length
    };
  }
}

module.exports = new SSE();
