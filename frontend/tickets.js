let currentUser = null;
let tickets = [];
let currentTicket = null;
let currentFilter = 'all';

// Инициализация
(async () => {
    try {
        currentUser = await checkAuth();
        if (!currentUser) {
            window.location.href = '/auth.html';
            return;
        }

        if (currentUser.isAdmin) {
            window.location.href = 'admin/dashboard.html';
            return;
        }

        document.getElementById('username').textContent = currentUser.username || 'Пользователь';
        await loadTelegramStatus();
        await loadTickets();
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Ошибка инициализации: ' + error.message);
    }
})();

// Загрузка статуса Telegram интеграции
async function loadTelegramStatus() {
    const statusTextEl = document.getElementById('telegram-status-text');
    const toggleBtn = document.getElementById('toggle-telegram-btn');

    if (!currentUser) {
        console.error('Current user is null');
        return;
    }

    if (currentUser.telegram_chat_id) {
        statusTextEl.textContent = currentUser.telegram_notifications_enabled
            ? '✅ Уведомления включены'
            : '⏸️ Уведомления отключены';
        toggleBtn.textContent = currentUser.telegram_notifications_enabled
            ? '🔕 Выключить уведомления'
            : '🔔 Включить уведомления';
        toggleBtn.onclick = toggleTelegramNotifications;
    } else {
        statusTextEl.textContent = '❌ Telegram не подключен';
        toggleBtn.textContent = '📱 Подключить Telegram';
        toggleBtn.onclick = () => {
            alert('Пожалуйста, подключите бота в Telegram:\n\n1. Найдите бота: @YOUR_BOT_USERNAME\n2. Напишите /start\n3. Используйте команду /auth для безопасной авторизации\n\n⚠️ ВАЖНО: Никогда не отправляйте пароли через команды!');
        };
    }
}

// Переключение Telegram уведомлений
async function toggleTelegramNotifications() {
    const toggleBtn = document.getElementById('toggle-telegram-btn');
    toggleBtn.disabled = true;
    toggleBtn.textContent = '⏳ Обновление...';

    try {
        const enabled = !currentUser.telegram_notifications_enabled;
        const data = await API.toggleTelegramNotifications(enabled);

        if (!data || typeof data.enabled === 'undefined') {
            throw new Error('Неверный формат ответа сервера');
        }

        currentUser.telegram_notifications_enabled = data.enabled;
        await loadTelegramStatus();
    } catch (error) {
        console.error('Toggle notifications error:', error);
        showError('Ошибка: ' + error.message);
    } finally {
        toggleBtn.disabled = false;
    }
}

// Загрузка тикетов
async function loadTickets() {
    const loadingEl = document.getElementById('loading');
    const ticketsListEl = document.getElementById('tickets-list');

    loadingEl.style.display = 'block';
    ticketsListEl.innerHTML = '';

    try {
        const status = currentFilter === 'all' ? null : currentFilter;
        const data = await API.getTickets(status);

        if (!data || !Array.isArray(data.tickets)) {
            throw new Error('Неверный формат данных');
        }

        tickets = data.tickets;

        if (tickets.length === 0) {
            ticketsListEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <h3>Нет тикетов</h3>
                    <p>Создайте первый тикет, чтобы задать вопрос</p>
                </div>
            `;
        } else {
            tickets.forEach(ticket => {
                const card = createTicketCard(ticket);
                ticketsListEl.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Load tickets error:', error);
        ticketsListEl.innerHTML = `
            <div class="empty-state">
                <p style="color: #ff6b6b;">Ошибка загрузки: ${escapeHtml(error.message)}</p>
            </div>
        `;
    } finally {
        loadingEl.style.display = 'none';
    }
}

// Создание карточки тикета
function createTicketCard(ticket) {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    card.onclick = () => openTicket(ticket.id);

    const statusText = {
        'open': 'Открыт',
        'in_progress': 'В работе',
        'closed': 'Закрыт'
    };

    const date = new Date(ticket.created_at).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    card.innerHTML = `
        <div class="ticket-card-header">
            <span class="ticket-id">#${ticket.id}</span>
            <span class="ticket-status status-${ticket.status}">${statusText[ticket.status]}</span>
        </div>
        <div class="ticket-subject">${escapeHtml(ticket.subject)}</div>
        <div class="ticket-meta">
            <span>📅 ${date}</span>
            ${ticket.priority !== 'normal' ? `<span>⚠️ ${ticket.priority}</span>` : ''}
        </div>
    `;

    return card;
}

// Открыть тикет
async function openTicket(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const modalBody = document.getElementById('modal-body');

    modal.classList.add('active');
    modalBody.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const data = await API.getTicket(ticketId);

        if (!data || !data.ticket || !Array.isArray(data.messages)) {
            throw new Error('Неверный формат данных тикета');
        }

        currentTicket = data.ticket;
        const messages = data.messages;

        const statusText = {
            'open': 'Открыт',
            'in_progress': 'В работе',
            'closed': 'Закрыт'
        };

        modalBody.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>${escapeHtml(currentTicket.subject)}</h3>
                    <span class="ticket-status status-${currentTicket.status}">${statusText[currentTicket.status]}</span>
                </div>
                <div style="color: var(--gray); font-size: 0.9rem;">
                    Тикет #${currentTicket.id} • ${new Date(currentTicket.created_at).toLocaleString('ru-RU')}
                </div>
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

            ${currentTicket.status !== 'closed' ? `
                <form class="reply-form" id="reply-form">
                    <textarea id="reply-content" placeholder="Напишите сообщение..." required maxlength="5000"></textarea>
                    <div class="reply-form-actions">
                        <button type="submit" class="btn btn-primary">Отправить</button>
                        <button type="button" class="btn" onclick="closeTicketConfirm()">Закрыть тикет</button>
                    </div>
                </form>
            ` : '<p style="text-align: center; color: var(--gray); padding: 2rem;">Тикет закрыт</p>'}
        `;

        if (currentTicket.status !== 'closed') {
            document.getElementById('reply-form').onsubmit = handleReply;
        }
    } catch (error) {
        console.error('Open ticket error:', error);
        modalBody.innerHTML = `<div class="empty-state"><p style="color: #ff6b6b;">Ошибка: ${escapeHtml(error.message)}</p></div>`;
    }
}

// Отправка сообщения
async function handleReply(e) {
    e.preventDefault();

    const textarea = document.getElementById('reply-content');
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
        await API.addMessage(currentTicket.id, content);
        textarea.value = '';
        await openTicket(currentTicket.id); // Перезагрузить тикет
    } catch (error) {
        console.error('Send message error:', error);
        showError('Ошибка отправки: ' + error.message);
        button.disabled = false;
        button.textContent = 'Отправить';
    }
}

// Закрыть тикет
async function closeTicketConfirm() {
    if (!confirm('Закрыть тикет? Вы не сможете добавлять новые сообщения.')) {
        return;
    }

    try {
        await API.closeTicket(currentTicket.id);
        closeModal();
        await loadTickets();
    } catch (error) {
        console.error('Close ticket error:', error);
        showError('Ошибка: ' + error.message);
    }
}

// Закрыть модальное окно
function closeModal() {
    document.getElementById('ticket-modal').classList.remove('active');
    currentTicket = null;
}

// Создать новый тикет
document.getElementById('create-ticket-btn').onclick = () => {
    document.getElementById('create-modal').classList.add('active');
};

document.getElementById('create-ticket-form').onsubmit = async (e) => {
    e.preventDefault();

    const subject = document.getElementById('ticket-subject').value.trim();
    const message = document.getElementById('ticket-message').value.trim();
    const priority = document.getElementById('ticket-priority').value;

    // Валидация
    if (!subject || subject.length < 3) {
        showError('Тема должна содержать минимум 3 символа');
        return;
    }

    if (!message || message.length < 10) {
        showError('Сообщение должно содержать минимум 10 символов');
        return;
    }

    if (message.length > 5000) {
        showError('Сообщение слишком длинное (максимум 5000 символов)');
        return;
    }

    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(priority)) {
        showError('Неверный приоритет');
        return;
    }

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Создание...';

    try {
        await API.createTicket(subject, message, priority);
        document.getElementById('create-modal').classList.remove('active');
        e.target.reset();
        await loadTickets();
    } catch (error) {
        console.error('Create ticket error:', error);
        showError('Ошибка: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Создать тикет';
    }
};

// Фильтры
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.onclick = async () => {
        currentFilter = tab.dataset.filter;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        await loadTickets();
    };
});

// Выход
document.getElementById('logout-btn').onclick = async () => {
    try {
        await API.logout();
    } catch (error) {
        console.error('Logout error:', error);
    }
    logout();
};

// Закрытие модалок по клику вне
document.querySelectorAll('.modal').forEach(modal => {
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    };
});

// Утилиты
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

// Показать ошибку пользователю
function showError(message) {
    alert(message);
}
