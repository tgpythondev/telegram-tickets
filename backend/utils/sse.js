class SSE {
    constructor() {
        this.admins = new Map();
        this.users = new Map();
        this.eventCache = [];
        this.maxCacheSize = 100;
        this.cacheTTL = 15 * 60 * 1000; // 15 минут

        // Чистим кеш по таймеру раз в минуту вместо вызова на каждую запись
        this._cacheCleanupTimer = setInterval(() => {
            this._cleanExpiredCache();
        }, 60 * 1000);

        // Таймер не должен мешать graceful shutdown
        if (this._cacheCleanupTimer.unref) {
            this._cacheCleanupTimer.unref();
        }
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
        }

        const connId = `${userId}-${Date.now()}`;
        this.admins.set(connId, res);

        res.on('close', () => {
            this.admins.delete(connId);
        });

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
        }

        const connId = `${userId}-${Date.now()}`;
        this.users.set(connId, res);

        res.on('close', () => {
            this.users.delete(connId);
        });

        return connId;
    }

    send(target, event, data) {
        const clients = target === 'admins' ? this.admins : this.users;
        const eventId = Date.now();
        const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

        this._cacheEvent({ id: eventId, event, data, target, timestamp: Date.now() });

        clients.forEach((res, connId) => {
            try {
                if (res.writable && !res.destroyed) {
                    res.write(payload);
                } else {
                    clients.delete(connId);
                }
            } catch (err) {
                clients.delete(connId);
            }
        });
    }

    sendToUser(userId, event, data) {
        userId = String(userId);
        const connIds = Array.from(this.users.keys()).filter(key => key.startsWith(`${userId}-`));

        if (connIds.length === 0) return;

        const eventId = Date.now();
        const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

        connIds.forEach(connId => {
            const res = this.users.get(connId);
            try {
                if (res.writable && !res.destroyed) {
                    res.write(payload);
                } else {
                    this.users.delete(connId);
                }
            } catch (err) {
                this.users.delete(connId);
            }
        });
    }

    sendToAdmin(adminId, event, data) {
        adminId = String(adminId);
        const connIds = Array.from(this.admins.keys()).filter(key => key.startsWith(`${adminId}-`));
        if (connIds.length === 0) return;

        const eventId = Date.now();
        const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

        connIds.forEach(connId => {
            const res = this.admins.get(connId);
            try {
                if (res.writable && !res.destroyed) {
                    res.write(payload);
                } else {
                    this.admins.delete(connId);
                }
            } catch (err) {
                this.admins.delete(connId);
            }
        });
    }

    closeAll() {
        const closePayload = 'event: close\ndata: {}\n\n';

        [...this.admins.values(), ...this.users.values()].forEach(res => {
            try {
                res.write(closePayload);
                res.end();
            } catch (_) {
                // connection уже закрыто
            }
        });

        this.admins.clear();
        this.users.clear();

        // Останавливаем внутренний таймер при shutdown
        clearInterval(this._cacheCleanupTimer);
    }

    _cacheEvent(event) {
        this.eventCache.push(event);
        if (this.eventCache.length > this.maxCacheSize) {
            this.eventCache.shift();
        }
        // Не вызываем _cleanExpiredCache здесь — это делает таймер
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
        return Array.from(this.users.keys()).some(key => key.startsWith(`${userId}-`));
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
        return this.users.delete(connId) || this.admins.delete(connId);
    }
}

module.exports = new SSE();
