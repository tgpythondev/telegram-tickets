const Tickets = (() => {
  let user = null;
  let tickets = [];
  let currentTicket = null;
  let currentFilter = 'all';
  let sse = null;
  let lastMessageTimestamp = null;
  let isUserAtBottom = true;
  // Храним timestamp последнего сообщения для каждого тикета
  let ticketMessageTimestamps = {};

  function initSSE() {
    if (!inMemoryAccessToken) {
      console.error('No access token for SSE');
      return;
    }

    const token = inMemoryAccessToken;
    sse = new EventSource(`${API_URL}/events?token=${token}`);

    sse.addEventListener('user:message:new', (e) => {
      const { ticketId, message } = JSON.parse(e.data);
      console.log('Received user:message:new for ticket', ticketId, 'currentTicket:', currentTicket?.id);

      // Сохраняем timestamp сообщения
      ticketMessageTimestamps[ticketId] = message.created_at;

      // Если тикет открыт - добавляем сообщение
      if (currentTicket && currentTicket.id === ticketId) {
        appendNewMessage(message);
        playNotificationSound();
        if (isUserAtBottom) {
          scrollToBottom();
        }
      }

      // В любом случае обновляем список тикетов (показываем значок нового сообщения)
      loadTickets();

      // Показываем уведомление если тикет не открыт
      if (!currentTicket || currentTicket.id !== ticketId) {
        showSuccess(`Новое сообщение от админа в тикете #${ticketId}`);
      }
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
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => openTicket(ticket.id));

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

    // Header
    const header = document.createElement('div');
    header.className = 'ticket-card-header';

    const ticketNumber = document.createElement('div');
    ticketNumber.className = 'ticket-number';
    ticketNumber.textContent = `#${ticket.id}`;

    const badges = document.createElement('div');
    badges.className = 'ticket-badges';

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge status-${ticket.status}`;
    statusBadge.textContent = statusText[ticket.status];

    const priorityBadge = document.createElement('span');
    priorityBadge.className = 'badge priority';
    priorityBadge.textContent = `${priorityEmoji[ticket.priority]} ${ticket.priority.toUpperCase()}`;

    badges.appendChild(statusBadge);
    badges.appendChild(priorityBadge);

    header.appendChild(ticketNumber);
    header.appendChild(badges);

    // Body
    const body = document.createElement('div');
    body.className = 'ticket-card-body';

    const subject = document.createElement('h3');
    subject.className = 'ticket-subject';
    subject.textContent = ticket.subject;

    if (ticket.assigned_admin_username) {
      const adminDiv = document.createElement('div');
      adminDiv.className = 'ticket-admin';
      adminDiv.textContent = `👨‍💼 Администратор: ${ticket.assigned_admin_username}`;
      body.appendChild(adminDiv);
    }

    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    meta.textContent = `📅 ${new Date(ticket.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

    body.appendChild(subject);
    body.appendChild(meta);

    card.appendChild(header);
    card.appendChild(body);

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

      // Загружаем новые сообщения если были получены по SSE пока тикет был закрыт
      checkForNewMessages(ticketId);
    } catch (error) {
      console.error('Open ticket error:', error);
      modalBody.innerHTML = `<div class="empty-state"><p style="color: #ff6b6b;">Ошибка: ${escapeHtml(error.message)}</p></div>`;
      showError('Ошибка открытия тикета: ' + error.message);
    }
  }

  async function checkForNewMessages(ticketId) {
    try {
      const data = await API.getTicket(ticketId);
      if (!data || !data.messages) return;

      const messages = data.messages;
      if (messages.length === 0) return;

      const lastLocalTime = lastMessageTimestamp;
      const newMessages = messages.filter(msg => {
        if (!lastLocalTime) return false;
        return new Date(msg.created_at) > new Date(lastLocalTime);
      });

      if (newMessages.length > 0) {
        console.log('Found', newMessages.length, 'new messages to load');
        const messagesList = document.getElementById('messages-list');
        if (messagesList) {
          newMessages.forEach(msg => {
            appendNewMessage(msg);
            lastMessageTimestamp = msg.created_at;
          });
          scrollToBottom();
        }
      }
    } catch (error) {
      console.error('Error checking for new messages:', error);
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

    `;
  }

  function renderTicketModal(ticket, messages) {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    modalBody.textContent = '';

    // Render header
    const header = renderModalHeader(ticket);
    modalBody.appendChild(header);

    // Render messages list
    const messagesList = renderMessagesList(messages);
    modalBody.appendChild(messagesList);

    // Render form if not closed
    if (ticket.status !== 'closed') {
      const form = document.createElement('form');
      form.className = 'message-form';
      form.id = 'message-form';

      const textarea = document.createElement('textarea');
      textarea.id = 'message-input';
      textarea.placeholder = 'Напишите сообщение...';
      textarea.required = true;
      textarea.maxLength = 5000;

      const actions = document.createElement('div');
      actions.className = 'form-actions';

      const submitBtn = document.createElement('button');
      submitBtn.type = 'submit';
      submitBtn.className = 'btn btn-primary';
      submitBtn.textContent = 'Отправить';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-secondary';
      closeBtn.textContent = 'Закрыть тикет';

      actions.appendChild(submitBtn);
      actions.appendChild(closeBtn);
      form.appendChild(textarea);
      form.appendChild(actions);
      modalBody.appendChild(form);

      // Setup form listener
      form.addEventListener('submit', handleSendMessage);
      closeBtn.addEventListener('click', Tickets.closeTicket);
    } else {
      const notice = document.createElement('div');
      notice.className = 'ticket-closed-notice';
      notice.textContent = 'Этот тикет закрыт';
      modalBody.appendChild(notice);
    }
  }

  // Render messages list using DOM API
  function renderMessagesList(messages) {
    const messagesList = document.createElement('div');
    messagesList.className = 'messages-list';
    messagesList.id = 'messages-list';

    messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${msg.is_admin_reply ? 'admin-reply' : ''}`;

      const header = document.createElement('div');
      header.className = 'message-header';

      const author = document.createElement('span');
      author.className = `message-author ${msg.is_admin_reply ? 'admin' : ''}`;
      author.textContent = msg.username || 'Неизвестный';

      const time = document.createElement('span');
      time.className = 'message-time';
      time.textContent = new Date(msg.created_at).toLocaleString('ru-RU');

      header.appendChild(author);
      header.appendChild(time);

      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = msg.content;

      msgDiv.appendChild(header);
      msgDiv.appendChild(content);
      messagesList.appendChild(msgDiv);
    });

    return messagesList;
  }

  // Render ticket modal header using DOM API
  function renderModalHeader(ticket) {
    const header = document.createElement('div');
    header.className = 'ticket-header';

    const title = document.createElement('h2');
    title.textContent = ticket.subject;

    const info = document.createElement('div');
    info.className = 'ticket-info';

    const statusText = {
      'open': 'Открыт',
      'in_progress': 'В работе',
      'closed': 'Закрыт'
    };

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge status-${ticket.status}`;
    statusBadge.textContent = statusText[ticket.status];

    const priorityBadge = document.createElement('span');
    priorityBadge.className = 'badge priority';
    priorityBadge.textContent = ticket.priority.toUpperCase();

    const ticketId = document.createElement('span');
    ticketId.className = 'ticket-id';
    ticketId.textContent = `#${ticket.id}`;

    info.appendChild(statusBadge);
    info.appendChild(priorityBadge);
    info.appendChild(ticketId);

    header.appendChild(title);
    header.appendChild(info);

    if (ticket.assigned_admin_username) {
      const adminInfo = document.createElement('div');
      adminInfo.className = 'ticket-assigned-info';
      adminInfo.innerHTML = `👨‍💼 Администратор <strong>${escapeHtml(ticket.assigned_admin_username)}</strong> работает над вашим тикетом`;
      header.appendChild(adminInfo);
    }

    return header;
  }

  function setupModalEventListeners() {
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
      messageForm.addEventListener('submit', handleSendMessage);
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

    logoutBtn.addEventListener('click', async () => {
      try {
        await API.logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
      logout();
    });
  }

  function setupModalClose() {
    const modal = document.getElementById('ticket-modal');
    if (!modal) return;

    modal.addEventListener('click', (e) => {
      if (e.target.id === 'ticket-modal') {
        closeModal();
      }
    });

    const closeBtn = document.getElementById('close-modal-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
  }

  function setupCreateTicket() {
    const createBtn = document.getElementById('create-ticket-btn');
    const createModal = document.getElementById('create-modal');
    const createForm = document.getElementById('create-ticket-form');
    const closeModalBtn = document.getElementById('create-modal-close');

    if (createBtn) {
      createBtn.addEventListener('click', () => createModal.classList.add('active'));
    }

    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => createModal.classList.remove('active'));
    }

    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const subject = document.getElementById('ticket-subject').value.trim();
        const message = document.getElementById('ticket-message').value.trim();
        const priority = document.getElementById('ticket-priority').value;

        if (!subject || !message) {
          showError('Заполните все поля');
          return;
        }

        try {
          await API.createTicket(subject, message, priority);
          createModal.classList.remove('active');
          document.getElementById('create-ticket-form').reset();
          await loadTickets();
          showSuccess('Тикет создан');
        } catch (error) {
          console.error('Create ticket error:', error);
          showError('Ошибка: ' + error.message);
        }
      });
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
      setupCreateTicket();
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
