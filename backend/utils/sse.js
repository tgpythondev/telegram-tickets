class SSE {
  constructor() {
    // Maps: userId -> Set of response objects
    this.adminConnections = new Map();  // adminId -> Set(responses)
    this.userConnections = new Map();   // userId -> Set(responses)
    this.eventId = 0;
  }

  // Add admin connection
  addAdmin(adminId, res) {
    adminId = String(adminId);
    if (!this.adminConnections.has(adminId)) {
      this.adminConnections.set(adminId, new Set());
    }
    this.adminConnections.get(adminId).add(res);

    res.on('close', () => {
      const set = this.adminConnections.get(adminId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.adminConnections.delete(adminId);
        }
      }
    });

    console.log(`SSE: Admin ${adminId} connected`);
  }

  // Add user connection
  addUser(userId, res) {
    userId = String(userId);
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(res);

    res.on('close', () => {
      const set = this.userConnections.get(userId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    });

    console.log(`SSE: User ${userId} connected`);
  }

  // Remove specific admin connection (for manual cleanup)
  removeAdminConnection(adminId, res) {
    adminId = String(adminId);
    const set = this.adminConnections.get(adminId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        this.adminConnections.delete(adminId);
      }
    }
  }

  // Remove specific user connection (for manual cleanup)
  removeUserConnection(userId, res) {
    userId = String(userId);
    const set = this.userConnections.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  // Send event to all admins
  broadcastToAdmins(event, data) {
    const payload = this.formatPayload(event, data);
    this.adminConnections.forEach(set => {
      set.forEach(res => {
        if (res.writable && !res.destroyed) {
          try {
            res.write(payload);
          } catch (err) {
            console.error('SSE send error:', err.message);
          }
        }
      });
    });
  }

  // Send event to specific admin
  sendToAdmin(adminId, event, data) {
    adminId = String(adminId);
    const set = this.adminConnections.get(adminId);
    if (!set || set.size === 0) {
      console.log(`SSE: No active connections for admin ${adminId}`);
      return;
    }

    const payload = this.formatPayload(event, data);
    let sent = 0;
    set.forEach(res => {
      if (res.writable && !res.destroyed) {
        try {
          res.write(payload);
          sent++;
        } catch (err) {
          console.error(`SSE send to admin ${adminId} error:`, err.message);
        }
      }
    });
    console.log(`SSE: Sent ${event} to admin ${adminId} (${sent} connections)`);
  }

  // Send event to specific user
  sendToUser(userId, event, data) {
    userId = String(userId);
    const set = this.userConnections.get(userId);
    if (!set || set.size === 0) {
      console.log(`SSE: No active connections for user ${userId}`);
      return;
    }

    const payload = this.formatPayload(event, data);
    let sent = 0;
    set.forEach(res => {
      if (res.writable && !res.destroyed) {
        try {
          res.write(payload);
          sent++;
        } catch (err) {
          console.error(`SSE send to user ${userId} error:`, err.message);
        }
      }
    });
    console.log(`SSE: Sent ${event} to user ${userId} (${sent} connections)`);
  }

  // Check if user is connected
  isUserConnected(userId) {
    userId = String(userId);
    return this.userConnections.has(userId) && this.userConnections.get(userId).size > 0;
  }

  // Get stats
  getConnectionStats() {
    return {
      admins: this.adminConnections.size,
      users: this.userConnections.size,
      adminConnections: Array.from(this.adminConnections.values()).reduce((sum, set) => sum + set.size, 0),
      userConnections: Array.from(this.userConnections.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }

  // Format SSE payload
  formatPayload(event, data) {
    this.eventId++;
    return `id: ${this.eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

module.exports = new SSE();
