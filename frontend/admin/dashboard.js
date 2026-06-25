let currentUser = null;
let tickets = [];
let currentTicket = null;
let currentFilters = {};
let stats = {};

// Инициализация
(async () => {
    try {
        currentUser = await checkAuth();
        if (!currentUser) {
            window.location.href = '../auth.html';
            return;
        }

        if (!currentUser.isAdmin) {
            window.location.href = '../tickets.html';
            return;
        }

        document.getElementById('admin-username').textContent = currentUser.username || 'Администратор';
        await loadStats();
        await loadTickets();
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Ошибка инициализации: ' + error.message);
    }
})();

// Загрузка статистики
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
        // Устанавливаем нули при ошибке
        document.getElementById('stat-open').textContent = '—';
        document.getElementById('stat-progress').textContent = '—';
        document.getElementById('stat-closed').textContent = '—';
        document.getElementById('stat-total').textContent = '—';
    }
}

// Загрузка тикетов
async function loadTickets() {
    const loadingEl = document.getElementById('loading');
    const tableBody = document.getElementById('tickets-tbody');

    loadingEl.style.display = 'block';
    tableBody.innerHTML = '';

    try {
        const data = await API.getAllTickets(currentFilters);

        if (!data || !Array.isArray(data.tickets)) {
            throw new Error('Неверный формат данных');
        }

        tickets = data.tickets;

        if (tickets.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem; color: var(--gray);">
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

        // Рендерить карточки для мобильных
        renderTicketCards(tickets);
    } catch (error) {
        console.error('Load tickets error:', error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #ff6b6b;">
                    Ошибка загрузки: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
    } finally {
        loadingEl.style.display = 'none';
    }
}

// Создание строки таблицы
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
        <td><a class="ticket-link" onclick="event.stopPropagation(); openTicket(${ticket.id})">${escapeHtml(ticket.subject)}</a></td>
        <td>${escapeHtml(ticket.user_username)}</td>
        <td><span class="ticket-status status-${ticket.status}">${statusText[ticket.status]}</span></td>
        <td><span class="priority-badge ${priorityClass[ticket.priority]}">${ticket.priority.toUpperCase()}</span></td>
        <td class="assigned-to">${ticket.assigned_admin_username || '—'}</td>
        <td>${date}</td>
    `;

    return row;
}

// Открыть тикет
async function openTicket(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const modalBody = document.getElementById('admin-modal-body');

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
            <div class="ticket-details">
                <h3>${escapeHtml(currentTicket.subject)}</h3>
                <div class="ticket-details-grid">
                    <div class="detail-item">
                        <div class="detail-label">ID</div>
                        <div class="detail-value">#${currentTicket.id}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Пользователь</div>
                        <div class="detail-value">${escapeHtml(currentTicket.user_username || 'Неизвестный')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Статус</div>
                        <div class="detail-value status-${currentTicket.status}">${statusText[currentTicket.status]}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Приоритет</div>
                        <div class="detail-value">${currentTicket.priority}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Создан</div>
                        <div class="detail-value">${new Date(currentTicket.created_at).toLocaleString('ru-RU')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Назначен</div>
                        <div class="detail-value">${escapeHtml(currentTicket.assigned_admin_username) || '—'}</div>
                    </div>
                </div>

                <div class="admin-actions">
                    <select id="update-status">
                        <option value="">Изменить статус...</option>
                        <option value="open" ${currentTicket.status === 'open' ? 'selected' : ''}>Открыт</option>
                        <option value="in_progress" ${currentTicket.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                        <option value="closed" ${currentTicket.status === 'closed' ? 'selected' : ''}>Закрыт</option>
                    </select>

                    <select id="update-priority">
                        <option value="">Изменить приоритет...</option>
                        <option value="normal" ${currentTicket.priority === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="high" ${currentTicket.priority === 'high' ? 'selected' : ''}>High</option>
                        <option value="urgent" ${currentTicket.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                    </select>

                    <button class="btn" onclick="assignToMe()">Назначить себе</button>
                    <button class="btn" onclick="updateTicketDetails()">Сохранить изменения</button>
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

            ${currentTicket.status !== 'closed' ? `
                <form class="admin-reply-form" id="admin-reply-form">
                    <textarea id="admin-reply-content" placeholder="Напишите ответ пользователю..." required maxlength="5000"></textarea>
                    <button type="submit" class="btn btn-primary">Отправить ответ</button>
                </form>
            ` : ''}
        `;

        if (currentTicket.status !== 'closed') {
            document.getElementById('admin-reply-form').onsubmit = handleReply;
        }

        document.getElementById('update-status').onchange = null;
        document.getElementById('update-priority').onchange = null;
    } catch (error) {
        console.error('Open ticket error:', error);
        modalBody.innerHTML = `<div class="empty-state"><p style="color: #ff6b6b;">Ошибка: ${escapeHtml(error.message)}</p></div>`;
    }
}

// Назначить себе
function assignToMe() {
    currentTicket.assigned_admin_id = currentUser.id;
    updateTicketDetails();
}

// Обновить детали тикета
async function updateTicketDetails() {
    const statusEl = document.getElementById('update-status');
    const priorityEl = document.getElementById('update-priority');

    if (!statusEl || !priorityEl) {
        console.error('Update elements not found');
        return;
    }

    const status = statusEl.value;
    const priority = priorityEl.value;

    const updates = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (currentTicket && currentTicket.assigned_admin_id) {
        updates.assignedAdminId = currentTicket.assigned_admin_id;
    }

    if (Object.keys(updates).length === 0) {
        alert('Нет изменений для сохранения');
        return;
    }

    try {
        await API.updateTicket(currentTicket.id, updates);
        closeModal();
        await loadStats();
        await loadTickets();
    } catch (error) {
        console.error('Update ticket error:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Ответить на тикет
async function handleReply(e) {
    e.preventDefault();

    const textarea = document.getElementById('admin-reply-content');
    const content = textarea.value.trim();

    if (!content) return;

    if (content.length > 5000) {
        alert('Сообщение слишком длинное (максимум 5000 символов)');
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
        alert('Ошибка: ' + error.message);
        button.disabled = false;
        button.textContent = 'Отправить ответ';
    }
}

// Закрыть модальное окно
function closeModal() {
    document.getElementById('ticket-modal').classList.remove('active');
    currentTicket = null;
}

// Фильтры
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.onclick = async () => {
        const filter = tab.dataset.filter;

        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (filter === 'all') {
            currentFilters = {};
        } else if (filter === 'mine') {
            currentFilters = { assigned_to_me: true };
        } else {
            currentFilters = { status: filter };
        }

        await loadTickets();
    };
});

// Поиск
let searchTimeout;
document.getElementById('search-box').oninput = (e) => {
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

// Выход
document.getElementById('logout-btn').onclick = async () => {
    try {
        await API.logout();
    } catch (error) {
        console.error('Logout error:', error);
    }
    logout();
};

// Закрытие модалки по клику вне
document.getElementById('ticket-modal').onclick = (e) => {
    if (e.target.id === 'ticket-modal') {
        closeModal();
    }
};

// Утилита
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

// ============ MOBILE CARD VIEW ============

function renderTicketCards(tickets) {
    const container = document.getElementById('tickets-cards');
    if (!container) return;

    if (tickets.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--gray);">Нет тикетов</div>';
        return;
    }

    container.innerHTML = tickets.map(ticket => `
        <div class="ticket-card" onclick="openTicket(${ticket.id})">
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
            <div class="ticket-card-actions">
                <button class="quick-action-btn" onclick="event.stopPropagation(); quickReply(${ticket.id})">
                    💬 Ответить
                </button>
                <button class="quick-action-btn" onclick="event.stopPropagation(); quickAssign(${ticket.id})">
                    👤 Назначить
                </button>
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

// Быстрые действия
async function quickReply(ticketId) {
    const content = prompt('Введите ваш ответ:');
    if (!content) return;

    try {
        await API.replyToTicket(ticketId, content);
        showToast('✅ Ответ отправлен');
        await loadTickets();
    } catch (error) {
        showToast('❌ Ошибка отправки');
    }
}

async function quickAssign(ticketId) {
    try {
        await API.updateTicket(ticketId, { assignedAdminId: currentUser.id });
        showToast('✅ Тикет назначен вам');
        await loadTickets();
    } catch (error) {
        showToast('❌ Ошибка назначения');
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
