const Tickets = (() => {
    let user = null;
    let tickets = [];
    let currentTicket = null;
    let currentFilter = 'all';
    let sse = null;
    let lastMsgTimestamp = null;
    let isAtBottom = true;

    // ── SSE ────────────────────────────────
    function initSSE() {
        if (!inMemoryAccessToken) return;
        sse = new EventSource(`${API_URL}/events?token=${inMemoryAccessToken}`);

        sse.addEventListener('user:message:new', e => {
            const { ticketId, message } = JSON.parse(e.data);
            if (currentTicket && currentTicket.id === ticketId) {
                appendMessage(message);
                if (isAtBottom) scrollToBottom();
            }
            loadTickets();
            if (!currentTicket || currentTicket.id !== ticketId) {
                showSuccess(`Новое сообщение в тикете #${ticketId}`);
            }
        });

        sse.addEventListener('user:ticket:updated', e => {
            const { ticketId, status, priority, assignedAdminUsername } = JSON.parse(e.data);
            if (currentTicket && currentTicket.id === ticketId) {
                currentTicket.status = status;
                currentTicket.priority = priority;
                currentTicket.assigned_admin_username = assignedAdminUsername;
                refreshPanelMeta();
            }
            loadTickets();
            showSuccess(`Тикет #${ticketId} обновлён`);
        });

        sse.onerror = () => { /* browser reconnects automatically */ };
    }

    // ── Telegram ───────────────────────────
    async function loadTelegramStatus() {
        const textEl  = document.getElementById('tg-status-text');
        const toggleBtn = document.getElementById('toggle-telegram-btn');
        if (!user || !textEl) return;

        if (user.telegram_chat_id) {
            textEl.textContent = user.telegram_notifications_enabled
                ? '✅ Уведомления включены'
                : '⏸ Уведомления отключены';
            toggleBtn.textContent = user.telegram_notifications_enabled
                ? 'Выключить' : 'Включить';
            toggleBtn.onclick = toggleTelegramNotifications;
        } else {
            textEl.textContent = 'Telegram не подключён';
            toggleBtn.textContent = 'Подключить';
            toggleBtn.onclick = () => window.open('https://t.me/KaliangSupportBot', '_blank');
        }
    }

    async function toggleTelegramNotifications() {
        const btn = document.getElementById('toggle-telegram-btn');
        btn.disabled = true;
        try {
            const enabled = !user.telegram_notifications_enabled;
            const data = await API.toggleTelegramNotifications(enabled);
            user.telegram_notifications_enabled = data.enabled;
            await loadTelegramStatus();
        } catch (err) {
            showError('Ошибка: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ── Load tickets ───────────────────────
    async function loadTickets() {
        const body = document.getElementById('tickets-body');
        if (!body) return;

        renderSkeletons(body);

        try {
            const status = currentFilter === 'all' ? null : currentFilter;
            const data = await API.getTickets(status);
            if (!data || !Array.isArray(data.tickets)) throw new Error('Неверный формат');
            tickets = data.tickets;
            renderTicketList(body);
            updateCounts();
        } catch (err) {
            body.innerHTML = '';
            const empty = makeEmptyState('Ошибка загрузки', err.message);
            body.appendChild(empty);
        }
    }

    function renderSkeletons(container) {
        container.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const s = document.createElement('div');
            s.className = 'ticket-row-skeleton';
            s.innerHTML = `
                <div class="skeleton skeleton-line" style="width:60%;height:16px;"></div>
                <div class="skeleton skeleton-line" style="width:35%;height:12px;margin-top:6px;"></div>
            `;
            container.appendChild(s);
        }
    }

    function renderTicketList(container) {
        container.innerHTML = '';
        if (tickets.length === 0) {
            container.appendChild(makeEmptyState(
                'Тикетов пока нет',
                'Создайте первый тикет, чтобы начать диалог'
            ));
            document.getElementById('tickets-count').textContent = '';
            return;
        }

        document.getElementById('tickets-count').textContent = `${tickets.length} тикет${ending(tickets.length)}`;

        tickets.forEach(ticket => {
            container.appendChild(makeTicketRow(ticket));
        });
    }

    function makeTicketRow(ticket) {
        const statusLabels = { open: 'Открыт', in_progress: 'В работе', closed: 'Закрыт' };

        const row = document.createElement('div');
        row.className = 'ticket-row';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        if (currentTicket && currentTicket.id === ticket.id) row.classList.add('active');

        const dot = document.createElement('span');
        dot.className = `status-dot ${ticket.status}`;

        const id = document.createElement('span');
        id.className = 'tr-id';
        id.textContent = `#${ticket.id}`;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'tr-body';

        const subject = document.createElement('span');
        subject.className = 'tr-subject';
        subject.textContent = ticket.subject;

        const meta = document.createElement('span');
        meta.className = 'tr-meta';
        meta.textContent = formatDate(ticket.created_at);
        if (ticket.assigned_admin_username) {
            meta.textContent += ` · ${ticket.assigned_admin_username}`;
        }

        bodyDiv.appendChild(subject);
        bodyDiv.appendChild(meta);

        const statusBadge = document.createElement('span');
        statusBadge.className = `badge status-${ticket.status} tr-status`;
        statusBadge.textContent = statusLabels[ticket.status] || ticket.status;

        row.appendChild(dot);
        row.appendChild(id);
        row.appendChild(bodyDiv);
        row.appendChild(statusBadge);

        row.addEventListener('click', () => openTicket(ticket.id));
        row.addEventListener('keydown', e => { if (e.key === 'Enter') openTicket(ticket.id); });

        return row;
    }

    function makeEmptyState(title, sub) {
        const div = document.createElement('div');
        div.className = 'tickets-empty';
        div.innerHTML = `
            <div class="tickets-empty-icon">📋</div>
            <div class="tickets-empty-title">${escapeHtml(title)}</div>
            <div class="tickets-empty-sub">${escapeHtml(sub)}</div>
        `;
        return div;
    }

    function updateCounts() {
        const all      = tickets.length;
        const open     = tickets.filter(t => t.status === 'open').length;
        const progress = tickets.filter(t => t.status === 'in_progress').length;
        const closed   = tickets.filter(t => t.status === 'closed').length;

        setCount('count-all',      all);
        setCount('count-open',     open);
        setCount('count-progress', progress);
        setCount('count-closed',   closed);
    }

    function setCount(id, n) {
        const el = document.getElementById(id);
        if (el) el.textContent = n;
    }

    // ── Open ticket panel ──────────────────
    async function openTicket(ticketId) {
        const panel   = document.getElementById('ticket-panel');
        const overlay = document.getElementById('panel-overlay');
        const msgs    = document.getElementById('tp-messages');

        document.querySelectorAll('.ticket-row').forEach(r => r.classList.remove('active'));
        document.querySelector(`.ticket-row[tabindex="0"]`);

        panel.classList.add('open');
        overlay.classList.add('active');
        msgs.innerHTML = '<div style="padding:2rem;text-align:center;color:rgba(255,255,255,.3)">Загрузка...</div>';

        document.getElementById('tp-subject').textContent = '—';
        document.getElementById('tp-meta-row').innerHTML  = '';

        try {
            const data = await API.getTicket(ticketId);
            if (!data || !data.ticket) throw new Error('Неверный формат');
            currentTicket = data.ticket;
            const messages = data.messages || [];

            if (messages.length) lastMsgTimestamp = messages[messages.length - 1].created_at;

            renderPanelHeader(currentTicket);
            renderMessages(messages);
            renderFormArea(currentTicket);
            setupScrollTracking();
            scrollToBottom();

            // Mark active row
            document.querySelectorAll('.ticket-row').forEach(r => {
                const idEl = r.querySelector('.tr-id');
                if (idEl && idEl.textContent === `#${ticketId}`) r.classList.add('active');
            });
        } catch (err) {
            msgs.innerHTML = `<div class="tickets-empty"><div class="tickets-empty-title">Ошибка загрузки</div><div class="tickets-empty-sub">${escapeHtml(err.message)}</div></div>`;
        }
    }

    function renderPanelHeader(ticket) {
        const statusLabels = { open: 'Открыт', in_progress: 'В работе', closed: 'Закрыт' };

        document.getElementById('tp-subject').textContent = ticket.subject;

        const meta = document.getElementById('tp-meta-row');
        meta.innerHTML = '';

        const idSpan = document.createElement('span');
        idSpan.className = 'tp-id';
        idSpan.textContent = `#${ticket.id}`;

        const statusBadge = document.createElement('span');
        statusBadge.className = `badge status-${ticket.status}`;
        statusBadge.textContent = statusLabels[ticket.status] || ticket.status;

        const priorityBadge = document.createElement('span');
        priorityBadge.className = `badge priority-${ticket.priority}`;
        priorityBadge.textContent = ticket.priority.toUpperCase();

        const dateSpan = document.createElement('span');
        dateSpan.textContent = formatDate(ticket.created_at, true);

        meta.appendChild(idSpan);
        meta.appendChild(statusBadge);
        meta.appendChild(priorityBadge);
        meta.appendChild(dateSpan);

        const assigned = document.getElementById('tp-assigned');
        if (ticket.assigned_admin_username) {
            assigned.style.display = '';
            assigned.textContent = `👨‍💼 Администратор ${ticket.assigned_admin_username} работает над тикетом`;
        } else {
            assigned.style.display = 'none';
        }
    }

    function refreshPanelMeta() {
        if (!currentTicket) return;
        renderPanelHeader(currentTicket);
        renderFormArea(currentTicket);
    }

    function renderMessages(messages) {
        const list = document.getElementById('tp-messages');
        list.innerHTML = '';
        messages.forEach(msg => {
            list.appendChild(makeMessageEl(msg));
        });
    }

    function makeMessageEl(msg) {
        const wrap = document.createElement('div');
        wrap.className = `tp-message ${msg.is_admin_reply ? 'admin-msg' : 'user-msg'}`;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'tp-msg-meta';

        const author = document.createElement('span');
        author.className = 'tp-msg-author';
        author.textContent = msg.username || '—';

        const time = document.createElement('span');
        time.textContent = formatDate(msg.created_at, true);

        metaDiv.appendChild(author);
        metaDiv.appendChild(time);

        const body = document.createElement('div');
        body.className = 'tp-msg-body';
        body.textContent = msg.content;

        wrap.appendChild(metaDiv);
        wrap.appendChild(body);
        return wrap;
    }

    function appendMessage(msg) {
        const list = document.getElementById('tp-messages');
        if (!list) return;
        const el = makeMessageEl(msg);
        el.classList.add('tp-msg-new');
        list.appendChild(el);
        lastMsgTimestamp = msg.created_at;
        if (isAtBottom) scrollToBottom();
    }

    function renderFormArea(ticket) {
        const area = document.getElementById('tp-form-area');
        area.innerHTML = '';

        if (ticket.status === 'closed') {
            const notice = document.createElement('div');
            notice.className = 'tp-closed-notice';
            notice.textContent = 'Тикет закрыт';
            area.appendChild(notice);
            return;
        }

        const form = document.createElement('div');
        form.className = 'tp-form';

        const textarea = document.createElement('textarea');
        textarea.className = 'tp-textarea';
        textarea.placeholder = 'Написать сообщение…';
        textarea.maxLength = 5000;

        const actions = document.createElement('div');
        actions.className = 'tp-form-actions';

        const closeTicketBtn = document.createElement('button');
        closeTicketBtn.className = 'tp-close-ticket';
        closeTicketBtn.textContent = 'Закрыть тикет';
        closeTicketBtn.addEventListener('click', closeTicketAction);

        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn btn-primary';
        sendBtn.textContent = 'Отправить';
        sendBtn.style.padding = '0.55rem 1.2rem';
        sendBtn.style.fontSize = 'var(--text-sm)';

        sendBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content) return;
            if (content.length > 5000) { showError('Максимум 5000 символов'); return; }
            sendBtn.disabled = true;
            sendBtn.textContent = 'Отправка…';
            try {
                await API.addMessage(currentTicket.id, content);
                textarea.value = '';
                const data = await API.getTicket(currentTicket.id);
                if (data && data.messages) renderMessages(data.messages);
                scrollToBottom();
            } catch (err) {
                showError('Ошибка: ' + err.message);
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Отправить';
            }
        });

        actions.appendChild(closeTicketBtn);
        actions.appendChild(sendBtn);
        form.appendChild(textarea);
        form.appendChild(actions);
        area.appendChild(form);
    }

    async function closeTicketAction() {
        if (!currentTicket) return;
        if (!confirm('Закрыть этот тикет?')) return;
        try {
            await API.closeTicket(currentTicket.id);
            closePanel();
            await loadTickets();
            showSuccess('Тикет закрыт');
        } catch (err) {
            showError('Ошибка: ' + err.message);
        }
    }

    function closePanel() {
        document.getElementById('ticket-panel').classList.remove('open');
        document.getElementById('panel-overlay').classList.remove('active');
        document.querySelectorAll('.ticket-row').forEach(r => r.classList.remove('active'));
        currentTicket = null;
        lastMsgTimestamp = null;
    }

    // ── Scroll helpers ─────────────────────
    function setupScrollTracking() {
        const msgs = document.getElementById('tp-messages');
        if (!msgs) return;
        msgs.addEventListener('scroll', () => {
            isAtBottom = msgs.scrollHeight - msgs.clientHeight <= msgs.scrollTop + 60;
        });
    }

    function scrollToBottom() {
        const msgs = document.getElementById('tp-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    // ── Filters ────────────────────────────
    function setupFilters() {
        document.querySelectorAll('.filter-link').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-link').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                loadTickets();
            });
        });
    }

    // ── Create ticket ──────────────────────
    function setupCreateTicket() {
        const openBtn  = document.getElementById('create-ticket-btn');
        const modal    = document.getElementById('create-modal');
        const closeBtn = document.getElementById('create-modal-close');
        const form     = document.getElementById('create-ticket-form');

        openBtn.addEventListener('click', () => modal.classList.add('active'));
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const subject  = document.getElementById('ticket-subject').value.trim();
            const message  = document.getElementById('ticket-message').value.trim();
            const priority = document.getElementById('ticket-priority').value;
            if (!subject || !message) { showError('Заполните все поля'); return; }
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Создание…';
            try {
                await API.createTicket(subject, message, priority);
                modal.classList.remove('active');
                form.reset();
                await loadTickets();
                showSuccess('Тикет создан');
            } catch (err) {
                showError('Ошибка: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Создать тикет';
            }
        });
    }

    // ── Logout ─────────────────────────────
    function setupLogout() {
        document.getElementById('logout-btn').addEventListener('click', async () => {
            try { await API.logout(); } catch (_) {}
            logout();
        });
    }

    // ── Panel close handlers ───────────────
    function setupPanelClose() {
        document.getElementById('tp-close').addEventListener('click', closePanel);
        document.getElementById('panel-overlay').addEventListener('click', closePanel);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.getElementById('ticket-panel').classList.contains('open')) {
                closePanel();
            }
        });
    }

    // ── Telegram sidebar ───────────────────
    function setupTelegramSidebar() {
        document.getElementById('bind-bot-btn').addEventListener('click', () => {
            window.open('https://t.me/KaliangSupportBot', '_blank');
        });

        document.getElementById('tg-instructions-toggle').addEventListener('click', () => {
            const el = document.getElementById('tg-instructions');
            const btn = document.getElementById('tg-instructions-toggle');
            const visible = el.classList.toggle('visible');
            btn.textContent = visible ? 'Скрыть ↑' : 'Как подключить? ↓';
        });
    }

    // ── Helpers ────────────────────────────
    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    function formatDate(iso, full) {
        if (!iso) return '';
        const d = new Date(iso);
        if (full) return d.toLocaleString('ru-RU');
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) +
               ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function ending(n) {
        if (n % 10 === 1 && n % 100 !== 11) return '';
        if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'а';
        return 'ов';
    }

    // ── Init ───────────────────────────────
    async function init() {
        try {
            user = await checkAuth();
            if (!user) { window.location.href = '/auth.html'; return; }
            if (user.isAdmin) { window.location.href = 'admin/dashboard.html'; return; }

            const nameEl = document.getElementById('sidebar-username');
            if (nameEl) nameEl.textContent = user.username || 'Пользователь';

            await loadTelegramStatus();
            await loadTickets();

            setupFilters();
            setupLogout();
            setupPanelClose();
            setupCreateTicket();
            setupTelegramSidebar();

            initSSE();
        } catch (err) {
            console.error('Init error:', err);
            showError('Ошибка инициализации: ' + err.message);
        }
    }

    return {
        init,
        openTicket,
        closePanel,
        closeTicket: closeTicketAction
    };
})();

Tickets.init();
