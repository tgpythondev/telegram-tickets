const Dashboard = (() => {
  let user = null;
  let tickets = [];
  let currentTicket = null;
  let filters = {};
  let stats = {};
  let sse = null;

  function initSSE() {
    if (!inMemoryAccessToken) {
      console.error('No access token for SSE');
      return;
    }

    const token = inMemoryAccessToken;
    sse = new EventSource(`${API_URL}/events?token=${token}`);

    sse.addEventListener('admin:ticket:new', (e) => {
      const ticket = JSON.parse(e.data);
      tickets.unshift(ticket);
      renderTickets();
      loadStats();
      showSuccess(`Новый тикет #${ticket.id}`);
      pulseStatCard('stat-open');
    });

    sse.addEventListener('admin:ticket:updated', (e) => {
      const updated = JSON.parse(e.data);
      const idx = tickets.findIndex(t => t.id === updated.id);
      if (idx !== -1) {
        tickets[idx] = updated;
        renderTickets();
      }

      if (currentTicket && currentTicket.id === updated.id) {
        currentTicket = updated;
        refreshModalTicketInfo();
      }

      loadStats();
      showSuccess(`Тикет #${updated.id} обновлен`);
    });

    sse.addEventListener('admin:message:new', (e) => {
      const { ticketId, message } = JSON.parse(e.data);
      if (currentTicket && currentTicket.id === ticketId) {
        appendMessageToModal(message);
      }
      showSuccess(`Новое сообщение в #${ticketId}`);
    });

    sse.onerror = () => {
      console.error('SSE connection lost, reconnecting...');
    };
  }

  function pulseStatCard(statId) {
    const el = document.getElementById(statId);
    if (!el) return;
    el.closest('.stat-card').classList.add('pulse');
    setTimeout(() => {
      el.closest('.stat-card').classList.remove('pulse');
    }, 1000);
  }

  async function loadStats() {
    try {
      const data = await API.getStats();
      if (!data || !data.stats) {
        throw new Error('Неверный формат данных статистики');
      }

      stats = data.stats;
      document.getElementById('stat-open').textContent = stats.open_tickets || 0;
      document.getElementById('stat-progress').textContent = stats.in_progress_tickets || 0;
      document.getElementById('stat-closed').textContent = stats.closed_tickets || 0;
      document.getElementById('stat-total').textContent = stats.total_tickets || 0;
    } catch (error) {
      console.error('Stats load error:', error);
      ['stat-open', 'stat-progress', 'stat-closed', 'stat-total'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
    }
  }

  async function loadTickets() {
    const loadingEl = document.getElementById('loading');
    const tableBody = document.getElementById('tickets-tbody');

    if (loadingEl) loadingEl.style.display = 'block';
    if (tableBody) tableBody.innerHTML = '';

    try {
      const data = await API.getAllTickets(filters);
      if (!data || !Array.isArray(data.tickets)) {
        throw new Error('Неверный формат данных');
      }

      tickets = data.tickets;

      if (tableBody) {
        if (tickets.length === 0) {
          tableBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                Нет тикетов
              </td>
            </tr>
          `;
        } else {
          tickets.forEach(ticket => {
            const row = createTicketRow(ticket);
            tableBody.appendChild(row);
          });
        }
      }

      renderTicketCards(tickets);
    } catch (error) {
      console.error('Load tickets error:', error);
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: var(--accent-red);">
              Ошибка загрузки: ${escapeHtml(error.message)}
            </td>
          </tr>
        `;
      }
      showError('Ошибка загрузки тикетов: ' + error.message);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function createTicketRow(ticket) {
    const row = document.createElement('tr');
    row.onclick = () => openTicket(ticket.id);

    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    const priorityClass = {
      'normal': 'priority-normal',
      'high': 'priority-high',
      'urgent': 'priority-urgent'
    };

    const date = new Date(ticket.created_at).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    row.innerHTML = `
      <td>#${ticket.id}</td>
      <td><a class="ticket-link" onclick="event.stopPropagation(); Dashboard.openTicket(${ticket.id})">${escapeHtml(ticket.subject)}</a></td>
      <td>${escapeHtml(ticket.user_username)}</td>
      <td><span class="ticket-status status-${ticket.status}">${statusText[ticket.status]}</span></td>
      <td><span class="priority-badge ${priorityClass[ticket.priority]}">${ticket.priority.toUpperCase()}</span></td>
      <td class="assigned-to">${ticket.assigned_admin_username || '—'}</td>
      <td>${date}</td>
    `;

    return row;
  }

  async function openTicket(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const modalBody = document.getElementById('admin-modal-body');

    if (!modal || !modalBody) return;

    modal.classList.add('active');
    modalBody.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
      const data = await API.getTicket(ticketId);
      if (!data || !data.ticket || !Array.isArray(data.messages)) {
        throw new Error('Неверный формат данных тикета');
      }

      currentTicket = data.ticket;
      const messages = data.messages;

      renderTicketModal(currentTicket, messages);
      setupModalEventListeners();
    } catch (error) {
      console.error('Open ticket error:', error);
      modalBody.innerHTML = `<div class="empty-state"><p style="color: var(--accent-red);">Ошибка: ${escapeHtml(error.message)}</p></div>`;
      showError('Ошибка открытия тикета: ' + error.message);
    }
  }

  function renderTicketModal(ticket, messages) {
    const modalBody = document.getElementById('admin-modal-body');
    if (!modalBody) return;

    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    modalBody.innerHTML = `
      <div class="ticket-details">
        <h3>${escapeHtml(ticket.subject)}</h3>
        <div class="ticket-details-grid">
          <div class="detail-item">
            <div class="detail-label">ID</div>
            <div class="detail-value">#${ticket.id}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Пользователь</div>
            <div class="detail-value">${escapeHtml(ticket.user_username || 'Неизвестный')}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Статус</div>
            <div class="detail-value status-${ticket.status}">${statusText[ticket.status]}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Приоритет</div>
            <div class="detail-value">${ticket.priority}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Создан</div>
            <div class="detail-value">${new Date(ticket.created_at).toLocaleString('ru-RU')}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Назначен</div>
            <div class="detail-value">${escapeHtml(ticket.assigned_admin_username) || '—'}</div>
          </div>
        </div>

        <div class="admin-actions">
          <div class="status-btns">
            <button class="status-btn ${ticket.status === 'open' ? 'active' : ''}" data-status="open">Открыт</button>
            <button class="status-btn ${ticket.status === 'in_progress' ? 'active' : ''}" data-status="in_progress">В работе</button>
            <button class="status-btn ${ticket.status === 'closed' ? 'active' : ''}" data-status="closed">Закрыт</button>
          </div>

          <div class="priority-btns">
            <button class="priority-btn ${ticket.priority === 'normal' ? 'active' : ''}" data-priority="normal">Normal</button>
            <button class="priority-btn ${ticket.priority === 'high' ? 'active' : ''}" data-priority="high">High</button>
            <button class="priority-btn ${ticket.priority === 'urgent' ? 'active' : ''}" data-priority="urgent">Urgent</button>
          </div>

          <button class="assign-btn" id="assign-btn">
            <span id="assign-text">${ticket.assigned_admin_id === user.id ? 'Снять с себя' : 'Назначить себе'}</span>
          </button>
        </div>
      </div>

      <div class="messages-list">
        ${messages.map(msg => `
          <div class="message ${msg.is_admin_reply ? 'admin-reply' : ''}">
            <div class="message-header">
              <span class="message-author ${msg.is_admin_reply ? 'admin' : ''}">${escapeHtml(msg.username || 'Неизвестный')}</span>
              <span class="message-time">${new Date(msg.created_at).toLocaleString('ru-RU')}</span>
            </div>
            <div class="message-content">${escapeHtml(msg.content)}</div>
          </div>
        `).join('')}
      </div>

      ${ticket.status !== 'closed' ? `
        <form class="admin-reply-form" id="admin-reply-form">
          <textarea id="admin-reply-content" placeholder="Напишите ответ пользователю..." required maxlength="5000"></textarea>
          <button type="submit" class="btn btn-primary">Отправить ответ</button>
        </form>
      ` : ''}
    `;
  }

  function setupModalEventListeners() {
    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.onclick = () => updateTicketField('status', btn.dataset.status);
    });

    document.querySelectorAll('.priority-btn').forEach(btn => {
      btn.onclick = () => updateTicketField('priority', btn.dataset.priority);
    });

    const assignBtn = document.getElementById('assign-btn');
    if (assignBtn) {
      assignBtn.onclick = toggleAssignment;
    }

    const replyForm = document.getElementById('admin-reply-form');
    if (replyForm) {
      replyForm.onsubmit = handleReply;
    }
  }

  async function updateTicketField(field, value) {
    if (!currentTicket) return;

    const currentValue = currentTicket[field];
    if (currentValue === value) return;

    document.querySelectorAll(`.${field}-btn`).forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-${field}="${value}"]`);
    if (btn) btn.classList.add('active');

    try {
      const updates = {};
      updates[field] = value;
      await API.updateTicket(currentTicket.id, updates);
    } catch (err) {
      document.querySelector(`[data-${field}="${currentValue}"]`)?.classList.add('active');
      if (btn) btn.classList.remove('active');
      showError('Ошибка: ' + err.message);
    }
  }

  async function toggleAssignment() {
    if (!currentTicket) return;

    const isAssigned = currentTicket.assigned_admin_id === user.id;
    const newAssignedId = isAssigned ? null : user.id;

    try {
      await API.updateTicket(currentTicket.id, { assignedAdminId: newAssignedId });
    } catch (err) {
      showError('Ошибка: ' + err.message);
    }
  }

  async function handleReply(e) {
    e.preventDefault();

    const textarea = document.getElementById('admin-reply-content');
    const content = textarea.value.trim();

    if (!content) return;

    if (content.length > 5000) {
      showError('Сообщение слишком длинное (максимум 5000 символов)');
      return;
    }

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Отправка...';

    try {
      await API.replyToTicket(currentTicket.id, content);
      textarea.value = '';
      await openTicket(currentTicket.id);
    } catch (error) {
      console.error('Reply error:', error);
      showError('Ошибка: ' + error.message);
      button.disabled = false;
      button.textContent = 'Отправить ответ';
    }
  }

  function refreshModalTicketInfo() {
    if (!currentTicket) return;

    const assignBtn = document.getElementById('assign-btn');
    const assignText = document.getElementById('assign-text');
    if (assignBtn && assignText) {
      const isAssigned = currentTicket.assigned_admin_id === user.id;
      assignText.textContent = isAssigned ? 'Снять с себя' : 'Назначить себе';
    }

    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === currentTicket.status);
    });

    document.querySelectorAll('.priority-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.priority === currentTicket.priority);
    });
  }

  function appendMessageToModal(message) {
    const messagesList = document.querySelector('.messages-list');
    if (!messagesList) return;

    const msgEl = document.createElement('div');
    msgEl.className = `message ${message.is_admin_reply ? 'admin-reply' : ''}`;
    msgEl.innerHTML = `
      <div class="message-header">
        <span class="message-author ${message.is_admin_reply ? 'admin' : ''}">${escapeHtml(message.username || 'Неизвестный')}</span>
        <span class="message-time">${new Date(message.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="message-content">${escapeHtml(message.content)}</div>
    `;

    messagesList.appendChild(msgEl);
    messagesList.scrollTop = messagesList.scrollHeight;
  }

  function closeModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) modal.classList.remove('active');
    currentTicket = null;
  }

  function renderTicketCards(tickets) {
    const container = document.getElementById('tickets-cards');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Нет тикетов</div>';
      return;
    }

    container.innerHTML = tickets.map(ticket => `
      <div class="ticket-card" onclick="Dashboard.openTicket(${ticket.id})">
        <div class="ticket-card-header">
          <div class="ticket-card-id">🎫 #${ticket.id}</div>
          <div class="ticket-card-badges">
            <span class="ticket-badge status-${ticket.status}">${getStatusEmoji(ticket.status)}</span>
            <span class="ticket-badge priority-${ticket.priority}">${getPriorityEmoji(ticket.priority)}</span>
          </div>
        </div>
        <div class="ticket-card-body">
          <div class="ticket-card-subject">${escapeHtml(ticket.subject)}</div>
          <div class="ticket-card-meta">
            <div>👤 ${escapeHtml(ticket.user_username)}</div>
            <div>⏰ ${new Date(ticket.created_at).toLocaleDateString('ru-RU')}</div>
            ${ticket.assigned_admin_username ? `<div>👨‍💼 ${escapeHtml(ticket.assigned_admin_username)}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  function getStatusEmoji(status) {
    const emojis = { 'open': '🟢', 'in_progress': '🟡', 'closed': '⚫' };
    return emojis[status] || '⚪';
  }

  function getPriorityEmoji(priority) {
    const emojis = { 'normal': '🔵', 'high': '🟠', 'urgent': '🔴' };
    return emojis[priority] || '⚪';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function setupFilters() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.onclick = async () => {
        const filter = tab.dataset.filter;

        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (filter === 'all') {
          filters = {};
        } else if (filter === 'mine') {
          filters = { assigned_to_me: true };
        } else {
          filters = { status: filter };
        }

        await loadTickets();
      };
    });
  }

  function setupSearch() {
    let searchTimeout;
    const searchBox = document.getElementById('search-box');
    if (!searchBox) return;

    searchBox.oninput = (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#tickets-tbody tr');

        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      }, 300);
    };
  }

  function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) return;

    logoutBtn.onclick = async () => {
      try {
        await API.logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
      logout();
    };
  }

  function setupModalClose() {
    const modal = document.getElementById('ticket-modal');
    if (!modal) return;

    modal.onclick = (e) => {
      if (e.target.id === 'ticket-modal') {
        closeModal();
      }
    };
  }

  async function init() {
    try {
      user = await checkAuth();
      if (!user) {
        window.location.href = '../auth.html';
        return;
      }

      if (!user.isAdmin) {
        window.location.href = '../tickets.html';
        return;
      }

      const usernameEl = document.getElementById('admin-username');
      if (usernameEl) usernameEl.textContent = user.username || 'Администратор';

      await loadStats();
      await loadTickets();
      initSSE();
      setupFilters();
      setupSearch();
      setupLogout();
      setupModalClose();
    } catch (error) {
      console.error('Initialization error:', error);
      showError('Ошибка инициализации: ' + error.message);
    }
  }

  function renderTickets() {
    loadTickets();
  }

  return {
    init,
    openTicket,
    closeModal
  };
})();

Dashboard.init();

window.closeModal = Dashboard.closeModal;
