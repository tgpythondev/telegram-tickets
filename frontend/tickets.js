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
        if (sse) { sse.close(); sse = null; }
        sse = new EventSource(`${API_URL}/events`, { withCredentials: true });

        sse.addEventListener('user:message:new', e => {
            const { ticketId, message } = JSON.parse(e.data);
            if (currentTicket && currentTicket.id === ticketId) {
                appendMessage(message);
                if (isAtBottom) scrollToBottom();
            }
            loadTickets();
            if (!currentTicket || currentTicket.id !== ticketId) {
                showSuccess(t('sse_new_message').replace('{id}', ticketId));
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
            showSuccess(t('sse_ticket_updated').replace('{id}', ticketId));
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
                ? t('tg_enabled')
                : t('tg_disabled');
            toggleBtn.textContent = user.telegram_notifications_enabled
                ? t('tg_btn_disable') : t('tg_btn_enable');
            toggleBtn.onclick = toggleTelegramNotifications;
        } else {
            textEl.textContent = t('tg_not_connected');
            toggleBtn.textContent = t('tg_btn_connect');
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
            showError(t('tickets_load_error') + ': ' + err.message);
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
            if (!data || !Array.isArray(data.tickets)) throw new Error(t('tickets_load_error'));
            tickets = data.tickets;
            renderTicketList(body);
            updateCounts();
        } catch (err) {
            body.innerHTML = '';
            const empty = makeEmptyState(t('tickets_load_error'), err.message);
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
                t('tickets_empty_title'),
                t('tickets_empty_sub')
            ));
            document.getElementById('tickets-count').textContent = '';
            return;
        }

        document.getElementById('tickets-count').textContent = I18n.ticketCount(tickets.length);

        tickets.forEach(ticket => {
            container.appendChild(makeTicketRow(ticket));
        });
    }

    function makeTicketRow(ticket) {
        const statusLabels = {
            open: t('status_open'),
            in_progress: t('status_progress'),
            closed: t('status_closed')
        };

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
        const firstRow = document.querySelector(`.ticket-row[tabindex="0"]`);
        if (firstRow) firstRow.classList.add('active');

        panel.classList.add('open');
        overlay.classList.add('active');
        msgs.innerHTML = `<div style="padding:2rem;text-align:center;color:rgba(255,255,255,.3)">${escapeHtml(t('panel_loading'))}</div>`;

        document.getElementById('tp-subject').textContent = '—';
        document.getElementById('tp-meta-row').innerHTML  = '';

        try {
            const data = await API.getTicket(ticketId);
            if (!data || !data.ticket) throw new Error(t('tickets_load_error'));
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
            msgs.innerHTML = `<div class="tickets-empty"><div class="tickets-empty-title">${escapeHtml(t('tickets_load_error'))}</div><div class="tickets-empty-sub">${escapeHtml(err.message)}</div></div>`;
        }
    }

    function renderPanelHeader(ticket) {
        const statusLabels = {
            open: t('status_open'),
            in_progress: t('status_progress'),
            closed: t('status_closed')
        };

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
            assigned.textContent = t('admin_assigned').replace('{name}', ticket.assigned_admin_username);
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
            notice.textContent = t('panel_closed');
            area.appendChild(notice);
            return;
        }

        const form = document.createElement('div');
        form.className = 'tp-form';

        const textarea = document.createElement('textarea');
        textarea.className = 'tp-textarea';
        textarea.placeholder = t('msg_placeholder');
        textarea.maxLength = 5000;

        const actions = document.createElement('div');
        actions.className = 'tp-form-actions';

        const closeTicketBtn = document.createElement('button');
        closeTicketBtn.className = 'tp-close-ticket';
        closeTicketBtn.textContent = t('btn_close_ticket');
        closeTicketBtn.addEventListener('click', closeTicketAction);

        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn btn-primary';
        sendBtn.textContent = t('btn_send');
        sendBtn.style.padding = '0.55rem 1.2rem';
        sendBtn.style.fontSize = 'var(--text-sm)';

        sendBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content) return;
            if (content.length > 5000) { showError(t('ticket_max_chars')); return; }
            sendBtn.disabled = true;
            sendBtn.textContent = t('btn_sending');
            try {
                await API.addMessage(currentTicket.id, content);
                textarea.value = '';
                const data = await API.getTicket(currentTicket.id);
                if (data && data.messages) renderMessages(data.messages);
                scrollToBottom();
            } catch (err) {
                showError(t('tickets_load_error') + ': ' + err.message);
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = t('btn_send');
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
        const confirmed = await showConfirmDialog(t('btn_close_confirm'));
        if (!confirmed) return;
        try {
            await API.closeTicket(currentTicket.id);
            closePanel();
            await loadTickets();
            showSuccess(t('ticket_closed_ok'));
        } catch (err) {
            showError(t('tickets_load_error') + ': ' + err.message);
        }
    }

    function showConfirmDialog(message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';

            const dialog = document.createElement('div');
            dialog.className = 'confirm-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.style.cssText = 'background:var(--bg-card,#1a1a2e);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:2rem;max-width:360px;width:90%;text-align:center;';

            const msg = document.createElement('p');
            msg.style.cssText = 'margin:0 0 1.5rem;color:rgba(255,255,255,.85);font-size:var(--text-sm,14px);';
            msg.textContent = message;

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:.75rem;justify-content:center;';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-ghost';
            cancelBtn.textContent = t('cfg_btn_back') || '← Назад';
            cancelBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(false); });

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.textContent = t('btn_close_ticket');
            confirmBtn.style.cssText = 'background:var(--accent-urgent,#ff3333);border-color:var(--accent-urgent,#ff3333);';
            confirmBtn.addEventListener('click', () => { document.body.removeChild(overlay); resolve(true); });

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);
            dialog.appendChild(msg);
            dialog.appendChild(btnRow);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            confirmBtn.focus();
        });
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

        // Promo state for this modal (reset on each open)
        let modalPromoCode     = null;
        let modalChosenBenefit = null;

        function resetModalPromo() {
            modalPromoCode     = null;
            modalChosenBenefit = null;
            const input = document.getElementById('ticket-promo-input');
            if (input) input.value = '';
            const statusEl = document.getElementById('ticket-promo-status');
            if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
            const benefitsEl = document.getElementById('ticket-promo-benefits');
            if (benefitsEl) benefitsEl.style.display = 'none';
            document.querySelectorAll('input[name="ticket-promo-benefit"]').forEach(r => r.checked = false);
        }

        function setModalPromoStatus(type, message) {
            const el = document.getElementById('ticket-promo-status');
            if (!el) return;
            el.style.display = '';
            el.className = `ticket-promo-status ticket-promo-status--${type}`;
            el.textContent = message;
        }

        async function applyModalPromo() {
            const input    = document.getElementById('ticket-promo-input');
            const applyBtn = document.getElementById('ticket-promo-apply-btn');
            const code     = input ? input.value.trim() : '';

            if (!code) {
                setModalPromoStatus('error', t('cfg_promo_err_empty'));
                return;
            }

            applyBtn.disabled    = true;
            applyBtn.textContent = t('cfg_promo_checking');

            try {
                const result = await API.validatePromo(code);

                if (!result || !result.valid) {
                    const reasonKey = {
                        promo_not_found:     'cfg_promo_err_not_found',
                        promo_inactive:      'cfg_promo_err_inactive',
                        promo_limit_reached: 'cfg_promo_err_limit',
                        promo_already_used:  'cfg_promo_err_used',
                        too_many_requests:   'cfg_promo_err_rate'
                    }[result?.reason] || 'cfg_promo_err_invalid';

                    setModalPromoStatus('error', t(reasonKey));
                    document.getElementById('ticket-promo-benefits').style.display = 'none';
                    modalPromoCode     = null;
                    modalChosenBenefit = null;
                    return;
                }

                // Valid — show benefit options
                modalPromoCode = result.code;
                setModalPromoStatus('ok', t('cfg_promo_valid') + ' ' + result.code);

                const benefitsEl     = document.getElementById('ticket-promo-benefits');
                const freeMiniLabel  = document.getElementById('ticket-benefit-free-mini');
                const hasFreeMini    = result.options.some(o => o.type === 'free_mini');
                freeMiniLabel.style.display = hasFreeMini ? '' : 'none';
                benefitsEl.style.display = '';

                // Reset radio selection
                document.querySelectorAll('input[name="ticket-promo-benefit"]').forEach(r => r.checked = false);
                modalChosenBenefit = null;

            } catch (err) {
                setModalPromoStatus('error', t('cfg_promo_err_server'));
            } finally {
                applyBtn.disabled    = false;
                applyBtn.textContent = t('cfg_promo_apply');
            }
        }

        openBtn.addEventListener('click', () => {
            resetModalPromo();
            modal.classList.add('active');
        });

        closeBtn.addEventListener('click', () => {
            resetModalPromo();
            modal.classList.remove('active');
        });

        modal.addEventListener('click', e => {
            if (e.target === modal) {
                resetModalPromo();
                modal.classList.remove('active');
            }
        });

        // Apply button
        const applyBtn = document.getElementById('ticket-promo-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', applyModalPromo);
        }

        // Enter on promo input
        const promoInput = document.getElementById('ticket-promo-input');
        if (promoInput) {
            promoInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); applyModalPromo(); }
            });
        }

        // Track radio selection
        document.querySelectorAll('input[name="ticket-promo-benefit"]').forEach(radio => {
            radio.addEventListener('change', () => {
                modalChosenBenefit = radio.value;
            });
        });

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const subject  = document.getElementById('ticket-subject').value.trim();
            const message  = document.getElementById('ticket-message').value.trim();
            const priority = document.getElementById('ticket-priority').value;

            if (!subject || !message) { showError(t('fill_all_fields')); return; }

            // If promo code was validated but no benefit chosen, prompt
            if (modalPromoCode && !modalChosenBenefit) {
                showError(t('cfg_promo_err_choose'));
                return;
            }

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled    = true;
            btn.textContent = t('creating_ticket');

            try {
                await API.createTicket(
                    subject,
                    message,
                    priority,
                    null,                          // no orderConfig
                    modalPromoCode     || null,
                    modalChosenBenefit || null
                );
                resetModalPromo();
                modal.classList.remove('active');
                form.reset();
                await loadTickets();
                showSuccess(t('ticket_created'));
            } catch (err) {
                showError(t('tickets_load_error') + ': ' + err.message);
            } finally {
                btn.disabled    = false;
                btn.textContent = t('create_submit');
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
            btn.textContent = visible ? t('tg_how_hide') : t('tg_how');
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
            showError(t('tickets_load_error') + ': ' + err.message);
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
