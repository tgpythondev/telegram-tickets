const Tickets = (() => {
  let user = null;
  let tickets = [];
  let currentTicket = null;
  let currentFilter = 'all';
  let sse = null;
  let lastMessageTimestamp = null;
  let isUserAtBottom = true;

  function initSSE() {
    if (!inMemoryAccessToken) {
      console.error('No access token for SSE');
      return;
    }

    const token = inMemoryAccessToken;
    sse = new EventSource(`${API_URL}/events?token=${token}`);

    sse.addEventListener('user:message:new', (e) => {
      const { ticketId, message } = JSON.parse(e.data);
      if (currentTicket && currentTicket.id === ticketId) {
        appendNewMessage(message);
        playNotificationSound();
        if (isUserAtBottom) {
          scrollToBottom();
        }
      }

      // Обновляем список тикетов чтобы показать что есть новое сообщение
      loadTickets();
      showSuccess(`Новое сообщение в тикете #${ticketId}`);
    });

    sse.addEventListener('user:ticket:updated', (e) => {
      const { ticketId, status, priority, assignedAdminUsername } = JSON.parse(e.data);
      if (currentTicket && currentTicket.id === ticketId) {
        currentTicket.status = status;
        currentTicket.priority = priority;
        currentTicket.assigned_admin_username = assignedAdminUsername;
        updateTicketStatusDisplay(status, priority, assignedAdminUsername);
      }
      loadTickets();
      showSuccess(`Тикет #${ticketId} обновлен`);
    });

    sse.addEventListener('open', () => {
      console.log('SSE connection established');
    });

    sse.onerror = (err) => {
      console.error('SSE connection lost, reconnecting...', err);
      // браузер автоматически переподключится
    };
  }

  async function loadTelegramStatus() {
    const statusTextEl = document.getElementById('telegram-status-text');
    const toggleBtn = document.getElementById('toggle-telegram-btn');

    if (!user) {
      console.error('Current user is null');
      return;
    }

    if (user.telegram_chat_id) {
      statusTextEl.textContent = user.telegram_notifications_enabled
        ? '✅ Уведомления включены'
        : '⏸️ Уведомления отключены';
      toggleBtn.textContent = user.telegram_notifications_enabled
        ? '🔕 Выключить уведомления'
        : '🔔 Включить уведомления';
      toggleBtn.onclick = toggleTelegramNotifications;
    } else {
      statusTextEl.textContent = '❌ Telegram не подключен';
      toggleBtn.textContent = '📱 Подключить Telegram';
      toggleBtn.onclick = () => {
        showError('Подключите бота в Telegram:\n\n1. Найдите бота: @YOUR_BOT_USERNAME\n2. Напишите /start\n3. Используйте команду /auth для безопасной авторизации\n\n⚠️ ВАЖНО: Никогда не отправляйте пароли через команды!');
      };
    }
  }

  async function toggleTelegramNotifications() {
    const toggleBtn = document.getElementById('toggle-telegram-btn');
    toggleBtn.disabled = true;
    toggleBtn.textContent = '⏳ Обновление...';

    try {
      const enabled = !user.telegram_notifications_enabled;
      const data = await API.toggleTelegramNotifications(enabled);

      if (!data || typeof data.enabled === 'undefined') {
        throw new Error('Неверный формат ответа сервера');
      }

      user.telegram_notifications_enabled = data.enabled;
      await loadTelegramStatus();
    } catch (error) {
      console.error('Toggle notifications error:', error);
      showError('Ошибка: ' + error.message);
    } finally {
      toggleBtn.disabled = false;
    }
  }

  async function loadTickets() {
    const loadingEl = document.getElementById('loading');
    const ticketsListEl = document.getElementById('tickets-list');

    if (loadingEl) {
      loadingEl.style.display = 'block';
      const skeletonContainer = loadingEl.querySelector('.skeleton-tickets');
      if (skeletonContainer) {
        skeletonContainer.innerHTML = '';
        const skeleton = createSkeletonTickets(3);
        skeleton.childNodes.forEach(node => skeletonContainer.appendChild(node));
      }
    }
    if (ticketsListEl) ticketsListEl.innerHTML = '';

    try {
      const status = currentFilter === 'all' ? null : currentFilter;
      const data = await API.getTickets(status);

      if (!data || !Array.isArray(data.tickets)) {
        throw new Error('Неверный формат данных');
      }

      tickets = data.tickets;

      if (ticketsListEl) {
        if (tickets.length === 0) {
          ticketsListEl.innerHTML = '<div class="empty-state"><p>У вас пока нет тикетов</p></div>';
        } else {
          tickets.forEach(ticket => {
            const card = createTicketCard(ticket);
            ticketsListEl.appendChild(card);
          });
        }
      }
    } catch (error) {
      console.error('Load tickets error:', error);
      if (ticketsListEl) {
        ticketsListEl.innerHTML = `<div class="empty-state"><p style="color: var(--accent-urgent);">Ошибка: ${escapeHtml(error.message)}</p></div>`;
      }
      showError('Ошибка загрузки тикетов: ' + error.message);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function createTicketCard(ticket) {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    card.onclick = () => openTicket(ticket.id);

    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    const priorityEmoji = {
      'normal': '🔵',
      'high': '🟠',
      'urgent': '🔴'
    };

    const assignedAdminText = ticket.assigned_admin_username
      ? `<div class="ticket-admin">👨‍💼 Администратор: ${escapeHtml(ticket.assigned_admin_username)}</div>`
      : '';

    card.innerHTML = `
      <div class="ticket-card-header">
        <div class="ticket-number">#${ticket.id}</div>
        <div class="ticket-badges">
          <span class="badge status-${ticket.status}">${statusText[ticket.status]}</span>
          <span class="badge priority">${priorityEmoji[ticket.priority]} ${ticket.priority.toUpperCase()}</span>
        </div>
      </div>
      <div class="ticket-card-body">
        <h3 class="ticket-subject">${escapeHtml(ticket.subject)}</h3>
        ${assignedAdminText}
        <div class="ticket-meta">
          <span>📅 ${new Date(ticket.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    `;

    return card;
  }

  async function openTicket(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const modalBody = document.getElementById('modal-body');

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

      if (messages.length > 0) {
        lastMessageTimestamp = messages[messages.length - 1].created_at;
      }

      renderTicketModal(currentTicket, messages);
      setupModalEventListeners();
      setupScrollTracking();
      scrollToBottom();
    } catch (error) {
      console.error('Open ticket error:', error);
      modalBody.innerHTML = `<div class="empty-state"><p style="color: #ff6b6b;">Ошибка: ${escapeHtml(error.message)}</p></div>`;
      showError('Ошибка открытия тикета: ' + error.message);
    }
  }

  function renderTicketModal(ticket, messages) {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    const assignedAdminInfo = ticket.assigned_admin_username
      ? `<div class="ticket-assigned-info">👨‍💼 Администратор <strong>${escapeHtml(ticket.assigned_admin_username)}</strong> работает над вашим тикетом</div>`
      : '';

    modalBody.innerHTML = `
      <div class="ticket-header">
        <h2>${escapeHtml(ticket.subject)}</h2>
        <div class="ticket-info">
          <span class="badge status-${ticket.status}">${statusText[ticket.status]}</span>
          <span class="badge priority">${ticket.priority.toUpperCase()}</span>
          <span class="ticket-id">#${ticket.id}</span>
        </div>
        ${assignedAdminInfo}
      </div>

      <div class="messages-list" id="messages-list">
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
        <form class="message-form" id="message-form">
          <textarea id="message-input" placeholder="Напишите сообщение..." required maxlength="5000"></textarea>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Отправить</button>
            <button type="button" class="btn btn-secondary" onclick="Tickets.closeTicket()">Закрыть тикет</button>
          </div>
        </form>
      ` : '<div class="ticket-closed-notice">Этот тикет закрыт</div>'}
    `;
  }

  function setupModalEventListeners() {
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
      messageForm.onsubmit = handleSendMessage;
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();

    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content) return;

    if (content.length > 5000) {
      showError('Сообщение слишком длинное (максимум 5000 символов)');
      return;
    }

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Отправка...';

    try {
      await API.addMessage(currentTicket.id, content);
      input.value = '';
      await openTicket(currentTicket.id);
    } catch (error) {
      console.error('Send message error:', error);
      showError('Ошибка: ' + error.message);
      button.disabled = false;
      button.textContent = 'Отправить';
    }
  }

  async function closeTicketAction() {
    if (!currentTicket) return;

    if (!confirm('Вы уверены что хотите закрыть этот тикет?')) return;

    try {
      await API.closeTicket(currentTicket.id);
      closeModal();
      await loadTickets();
      showSuccess('Тикет закрыт');
    } catch (error) {
      console.error('Close ticket error:', error);
      showError('Ошибка: ' + error.message);
    }
  }

  function closeModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) modal.classList.remove('active');
    currentTicket = null;
    lastMessageTimestamp = null;
  }

  function appendNewMessage(message) {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.is_admin_reply ? 'admin-reply' : ''} new-message`;
    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-author ${message.is_admin_reply ? 'admin' : ''}">${escapeHtml(message.username || 'Неизвестный')}</span>
        <span class="message-time">${new Date(message.created_at).toLocaleString('ru-RU')}</span>
      </div>
      <div class="message-content">${escapeHtml(message.content)}</div>
    `;
    messagesList.appendChild(messageDiv);

    setTimeout(() => messageDiv.classList.remove('new-message'), 2000);
    lastMessageTimestamp = message.created_at;
  }

  function updateTicketStatusDisplay(status, priority, assignedAdminUsername) {
    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    const statusBadge = document.querySelector('.ticket-info .badge.status-open, .ticket-info .badge.status-in_progress, .ticket-info .badge.status-closed');
    if (statusBadge) {
      statusBadge.className = `badge status-${status}`;
      statusBadge.textContent = statusText[status];
    }

    const priorityBadge = document.querySelector('.ticket-info .badge.priority');
    if (priorityBadge) {
      priorityBadge.textContent = priority.toUpperCase();
    }

    const existingAdminInfo = document.querySelector('.ticket-assigned-info');
    if (assignedAdminUsername) {
      if (!existingAdminInfo) {
        const ticketHeader = document.querySelector('.ticket-header');
        if (ticketHeader) {
          const adminInfoDiv = document.createElement('div');
          adminInfoDiv.className = 'ticket-assigned-info';
          adminInfoDiv.innerHTML = `👨‍💼 Администратор <strong>${escapeHtml(assignedAdminUsername)}</strong> работает над вашим тикетом`;
          ticketHeader.appendChild(adminInfoDiv);
        }
      }
    } else if (existingAdminInfo) {
      existingAdminInfo.remove();
    }
  }

  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.error('Sound error:', error);
    }
  }

  function setupScrollTracking() {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList) return;

    messagesList.addEventListener('scroll', () => {
      const isBottom = messagesList.scrollHeight - messagesList.clientHeight <= messagesList.scrollTop + 50;
      isUserAtBottom = isBottom;
    });
  }

  function scrollToBottom() {
    const messagesList = document.getElementById('messages-list');
    if (messagesList) {
      messagesList.scrollTop = messagesList.scrollHeight;
    }
  }

  function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        loadTickets();
      };
    });
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

    const closeBtn = document.getElementById('close-modal-btn');
    if (closeBtn) {
      closeBtn.onclick = closeModal;
    }
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

  async function init() {
    try {
      user = await checkAuth();
      if (!user) {
        window.location.href = '/auth.html';
        return;
      }

      if (user.isAdmin) {
        window.location.href = 'admin/dashboard.html';
        return;
      }

      const usernameEl = document.getElementById('username');
      if (usernameEl) usernameEl.textContent = user.username || 'Пользователь';

      await loadTelegramStatus();
      await loadTickets();
      initSSE();
      setupFilters();
      setupLogout();
      setupModalClose();
    } catch (error) {
      console.error('Initialization error:', error);
      showError('Ошибка инициализации: ' + error.message);
    }
  }

  return {
    init,
    openTicket,
    closeTicket: closeTicketAction,
    closeModal
  };
})();

Tickets.init();

window.openTicket = Tickets.openTicket;
window.closeModal = Tickets.closeModal;
