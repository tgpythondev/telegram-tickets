const Account = (() => {
    let user = null;
    let tickets = [];
    let currentTicket = null;
    let currentFilter = 'all';
    let currentTab = 'overview';
    let sse = null;
    let isAtBottom = true;

    // ── Helpers ──────────────────────────────
    const isOrder = t => !!t.order_config;
    const orders  = () => tickets.filter(isOrder);
    const support = () => tickets.filter(t => !isOrder(t));

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    function formatDate(iso, full) {
        if (!iso) return '';
        if (typeof I18n !== 'undefined' && typeof I18n.formatDate === 'function') {
            return I18n.formatDate(iso, full);
        }
        return new Date(iso).toLocaleString();
    }

    function statusLabel(status) {
        return { open: t('status_open'), in_progress: t('status_progress'), closed: t('status_closed') }[status] || status;
    }

    // ── SSE ──────────────────────────────────
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
            loadAll({ silent: true });
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
            loadAll({ silent: true });
            showSuccess(t('sse_ticket_updated').replace('{id}', ticketId));
        });

        sse.onerror = () => { /* browser reconnects automatically */ };
    }

    // ── Data loading ─────────────────────────
    async function loadAll(opts = {}) {
        try {
            const data = await API.getTickets(null);
            if (!data || !Array.isArray(data.tickets)) throw new Error(t('tickets_load_error'));
            tickets = data.tickets;
            renderCurrentTab();
            renderOverviewStats();
            renderBadges();
        } catch (err) {
            if (!opts.silent) showError(t('tickets_load_error') + ': ' + err.message);
        }
    }

    function renderBadges() {
        const activeOrders  = orders().filter(o => o.status !== 'closed').length;
        const openSupport   = support().filter(s => s.status !== 'closed').length;
        setBadge('badge-orders',  activeOrders);
        setBadge('badge-support', openSupport);
    }

    function setBadge(id, n) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = n;
        el.style.display = n > 0 ? '' : 'none';
    }

    // ── Tab switching ────────────────────────
    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.acc-nav-item').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.acc-section').forEach(s =>
            s.classList.toggle('active', s.id === `tab-${tab}`));
        renderCurrentTab();
        if (history.replaceState) history.replaceState(null, '', `#${tab}`);
    }

    function renderCurrentTab() {
        if (currentTab === 'overview')      renderOverview();
        else if (currentTab === 'orders')   renderOrders();
        else if (currentTab === 'support')  renderSupport();
    }

    // ── Overview ─────────────────────────────
    function renderOverviewStats() {
        const activeOrders = orders().filter(o => o.status !== 'closed').length;
        const openTickets  = support().filter(s => s.status !== 'closed').length;

        setText('ov-orders-active', activeOrders);
        setText('ov-tickets-open',  openTickets);

        const tgEl = document.getElementById('ov-tg-status');
        if (user && user.telegram_chat_id) {
            tgEl.textContent = user.telegram_notifications_enabled
                ? t('acc_tg_on') : t('acc_tg_off');
            tgEl.className = 'acc-stat-num ' + (user.telegram_notifications_enabled ? 'is-ok' : 'is-off');
        } else {
            tgEl.textContent = '—';
            tgEl.className = 'acc-stat-num is-off';
        }
    }

    function renderOverview() {
        renderOverviewStats();

        const list = document.getElementById('ov-recent-list');
        list.innerHTML = '';

        if (tickets.length === 0) {
            list.appendChild(makeEmptyState(t('tickets_empty_title'), t('tickets_empty_sub')));
            return;
        }

        const recent = [...tickets]
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .slice(0, 4);

        recent.forEach(tk => {
            const row = document.createElement('button');
            row.className = 'acc-recent-row';

            const kind = document.createElement('span');
            kind.className = 'acc-recent-kind';
            kind.textContent = isOrder(tk) ? t('acc_kind_order') : t('acc_kind_ticket');

            const subject = document.createElement('span');
            subject.className = 'acc-recent-subject';
            subject.textContent = tk.subject;

            const badge = document.createElement('span');
            badge.className = `badge status-${tk.status}`;
            badge.textContent = statusLabel(tk.status);

            row.appendChild(kind);
            row.appendChild(subject);
            row.appendChild(badge);
            row.addEventListener('click', () => openTicket(tk.id));
            list.appendChild(row);
        });
    }

    // ── Orders ───────────────────────────────
    function renderOrders() {
        const list = document.getElementById('orders-list');
        list.innerHTML = '';

        const os = orders();
        setText('orders-count', os.length ? I18n.ticketCount(os.length) : '');

        if (os.length === 0) {
            const empty = makeEmptyState(t('acc_orders_empty_title'), t('acc_orders_empty_sub'));
            const cta = document.createElement('a');
            cta.href = 'configurator.html';
            cta.className = 'btn btn-primary';
            cta.textContent = t('acc_btn_new_order');
            empty.appendChild(document.createElement('br'));
            empty.appendChild(cta);
            list.appendChild(empty);
            return;
        }

        os.forEach(o => list.appendChild(makeOrderCard(o)));
    }

    function makeOrderCard(o) {
        const cfg = o.order_config || {};

        const card = document.createElement('button');
        card.className = 'acc-order-card';

        // Top row: id + status + priority
        const top = document.createElement('div');
        top.className = 'acc-order-top';

        const id = document.createElement('span');
        id.className = 'acc-order-id';
        id.textContent = `#${o.id}`;

        const badge = document.createElement('span');
        badge.className = `badge status-${o.status}`;
        badge.textContent = statusLabel(o.status);

        top.appendChild(id);
        top.appendChild(badge);
        card.appendChild(top);

        const subject = document.createElement('div');
        subject.className = 'acc-order-subject';
        subject.textContent = o.subject;
        card.appendChild(subject);

        // Info row: package · price · date
        const info = document.createElement('div');
        info.className = 'acc-order-info';

        if (cfg.package) {
            const pkg = document.createElement('span');
            pkg.className = 'acc-order-package';
            pkg.textContent = cfg.package.toUpperCase();
            info.appendChild(pkg);
        }

        if (cfg.totalPrice !== undefined && cfg.totalPrice !== null) {
            const price = document.createElement('span');
            price.className = 'acc-order-price';
            price.textContent = `$${cfg.totalPrice}`;
            info.appendChild(price);
        }

        const date = document.createElement('span');
        date.className = 'acc-order-date';
        date.textContent = formatDate(o.created_at);
        info.appendChild(date);
        card.appendChild(info);

        // Pipeline
        card.appendChild(makePipeline(o.status));

        card.addEventListener('click', () => openTicket(o.id));
        return card;
    }

    function makePipeline(status) {
        const stages = [t('acc_stage_new'), t('acc_stage_progress'), t('acc_stage_done')];
        const currentIdx = status === 'open' ? 0 : status === 'in_progress' ? 1 : 2;

        const pipe = document.createElement('div');
        pipe.className = 'acc-pipeline';

        stages.forEach((label, i) => {
            if (i > 0) {
                const line = document.createElement('div');
                line.className = 'acc-pipe-line' + (i <= currentIdx ? ' reached' : '');
                pipe.appendChild(line);
            }
            const step = document.createElement('div');
            let cls = 'acc-pipe-step';
            if (i <= currentIdx) cls += ' reached';
            if (i === currentIdx && status !== 'closed') cls += ' current';
            if (i === 2 && status === 'closed') cls += ' done-ok';
            step.className = cls;

            const dot = document.createElement('span');
            dot.className = 'acc-pipe-dot';
            const lbl = document.createElement('span');
            lbl.textContent = label;

            step.appendChild(dot);
            step.appendChild(lbl);
            pipe.appendChild(step);
        });

        return pipe;
    }

    // ── Support ──────────────────────────────
    function renderSupport() {
        const list = document.getElementById('support-list');
        list.innerHTML = '';

        let st = support();
        if (currentFilter !== 'all') st = st.filter(x => x.status === currentFilter);

        if (st.length === 0) {
            list.appendChild(makeEmptyState(t('tickets_empty_title'), t('tickets_empty_sub')));
            return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'acc-tickets-list';

        st.forEach(tk => {
            const row = document.createElement('button');
            row.className = 'acc-ticket-row';

            const id = document.createElement('span');
            id.className = 'acc-ticket-id';
            id.textContent = `#${tk.id}`;

            const body = document.createElement('span');
            body.className = 'acc-ticket-body';

            const subject = document.createElement('span');
            subject.className = 'acc-ticket-subject';
            subject.textContent = tk.subject;

            const meta = document.createElement('span');
            meta.className = 'acc-ticket-meta';
            meta.textContent = formatDate(tk.created_at) +
                (tk.assigned_admin_username ? ` · ${tk.assigned_admin_username}` : '');

            body.appendChild(subject);
            body.appendChild(meta);

            const badge = document.createElement('span');
            badge.className = `badge status-${tk.status}`;
            badge.textContent = statusLabel(tk.status);

            row.appendChild(id);
            row.appendChild(body);
            row.appendChild(badge);
            row.addEventListener('click', () => openTicket(tk.id));
            wrap.appendChild(row);
        });

        list.appendChild(wrap);
    }

    function makeEmptyState(title, sub) {
        const div = document.createElement('div');
        div.className = 'acc-empty';
        div.innerHTML = `
            <div class="acc-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg></div>
            <div class="acc-empty-title">${escapeHtml(title)}</div>
            <div class="acc-empty-sub">${escapeHtml(sub)}</div>
        `;
        return div;
    }

    // ── Ticket panel ─────────────────────────
    async function openTicket(ticketId) {
        const panel   = document.getElementById('acc-panel');
        const overlay = document.getElementById('acc-panel-overlay');
        const msgs    = document.getElementById('ap-messages');

        panel.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        msgs.innerHTML = `<div style="padding:2rem;text-align:center;color:rgba(255,255,255,.3)">${escapeHtml(t('panel_loading'))}</div>`;
        document.getElementById('ap-subject').textContent = '—';
        document.getElementById('ap-meta').innerHTML = '';

        try {
            const data = await API.getTicket(ticketId);
            if (!data || !data.ticket) throw new Error(t('tickets_load_error'));
            currentTicket = data.ticket;

            renderPanelHeader(currentTicket);
            renderMessages(data.messages || []);
            renderFormArea(currentTicket);
            setupScrollTracking();
            scrollToBottom();
        } catch (err) {
            msgs.innerHTML = `<div class="acc-empty"><div class="acc-empty-title">${escapeHtml(t('tickets_load_error'))}</div><div class="acc-empty-sub">${escapeHtml(err.message)}</div></div>`;
        }
    }

    function renderPanelHeader(ticket) {
        document.getElementById('ap-subject').textContent = ticket.subject;

        const meta = document.getElementById('ap-meta');
        meta.innerHTML = '';

        const id = document.createElement('span');
        id.className = 'ap-id';
        id.textContent = `#${ticket.id}`;

        const st = document.createElement('span');
        st.className = `badge status-${ticket.status}`;
        st.textContent = statusLabel(ticket.status);

        const pr = document.createElement('span');
        pr.className = `badge priority-${ticket.priority}`;
        pr.textContent = ticket.priority.toUpperCase();

        const dt = document.createElement('span');
        dt.textContent = formatDate(ticket.created_at, true);

        meta.appendChild(id);
        meta.appendChild(st);
        meta.appendChild(pr);
        meta.appendChild(dt);

        const assigned = document.getElementById('ap-assigned');
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
        const list = document.getElementById('ap-messages');
        list.innerHTML = '';
        messages.forEach(m => list.appendChild(makeMessageEl(m)));
    }

    function makeMessageEl(msg) {
        const wrap = document.createElement('div');
        wrap.className = `ap-message ${msg.is_admin_reply ? 'admin-msg' : 'user-msg'}`;

        const meta = document.createElement('div');
        meta.className = 'ap-msg-meta';

        const author = document.createElement('span');
        author.textContent = msg.username || (msg.is_admin_reply ? 'KALIANG' : (user ? user.username : '—'));

        const time = document.createElement('span');
        time.textContent = formatDate(msg.created_at, true);

        meta.appendChild(author);
        meta.appendChild(time);

        const body = document.createElement('div');
        body.className = 'ap-msg-body';
        body.textContent = msg.content;

        wrap.appendChild(meta);
        wrap.appendChild(body);
        return wrap;
    }

    function appendMessage(msg) {
        const list = document.getElementById('ap-messages');
        if (!list) return;
        // Avoid duplicates (SSE after optimistic append)
        if (msg.id && list.querySelector(`[data-msg-id="${msg.id}"]`)) return;
        const el = makeMessageEl(msg);
        if (msg.id) el.dataset.msgId = msg.id;
        el.classList.add('ap-msg-new');
        list.appendChild(el);
        if (isAtBottom) scrollToBottom();
    }

    function renderFormArea(ticket) {
        const area = document.getElementById('ap-form-area');
        area.innerHTML = '';

        if (ticket.status === 'closed') {
            const notice = document.createElement('div');
            notice.className = 'ap-closed-notice';
            notice.textContent = t('panel_closed');
            area.appendChild(notice);
            return;
        }

        const form = document.createElement('div');
        form.className = 'ap-form';

        const textarea = document.createElement('textarea');
        textarea.className = 'ap-textarea';
        textarea.placeholder = t('msg_placeholder');
        textarea.maxLength = 5000;

        const actions = document.createElement('div');
        actions.className = 'ap-form-actions';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ap-close-ticket';
        closeBtn.textContent = t('btn_close_ticket');
        closeBtn.addEventListener('click', closeTicketAction);

        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn btn-primary';
        sendBtn.textContent = t('btn_send');
        sendBtn.addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content) return;
            if (content.length > 5000) { showError(t('ticket_max_chars')); return; }
            sendBtn.disabled = true;
            sendBtn.textContent = t('btn_sending');
            try {
                const res = await API.addMessage(currentTicket.id, content);
                textarea.value = '';
                // Optimistic append — SSE duplicate is filtered by data-msg-id
                if (res && res.message) {
                    appendMessage({ ...res.message, username: user.username });
                    scrollToBottom();
                }
            } catch (err) {
                showError(t('tickets_load_error') + ': ' + err.message);
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = t('btn_send');
            }
        });

        actions.appendChild(closeBtn);
        actions.appendChild(sendBtn);
        form.appendChild(textarea);
        form.appendChild(actions);
        area.appendChild(form);

        // Ctrl+Enter to send
        textarea.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendBtn.click();
        });
    }

    async function closeTicketAction() {
        if (!currentTicket) return;
        const confirmed = window.confirm(t('btn_close_confirm'));
        if (!confirmed) return;
        try {
            await API.closeTicket(currentTicket.id);
            closePanel();
            await loadAll({ silent: true });
            showSuccess(t('ticket_closed_ok'));
        } catch (err) {
            showError(t('tickets_load_error') + ': ' + err.message);
        }
    }

    function closePanel() {
        document.getElementById('acc-panel').classList.remove('open');
        document.getElementById('acc-panel-overlay').classList.remove('active');
        document.body.style.overflow = '';
        currentTicket = null;
    }

    function setupScrollTracking() {
        const msgs = document.getElementById('ap-messages');
        if (!msgs) return;
        msgs.addEventListener('scroll', () => {
            isAtBottom = msgs.scrollHeight - msgs.clientHeight <= msgs.scrollTop + 60;
        });
    }

    function scrollToBottom() {
        const msgs = document.getElementById('ap-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    // ── Telegram tab ─────────────────────────
    function renderTelegramTab() {
        const icon   = document.getElementById('acc-tg-icon');
        const title  = document.getElementById('acc-tg-title');
        const desc   = document.getElementById('acc-tg-desc');
        const acts   = document.getElementById('acc-tg-actions');
        const notifRow = document.getElementById('acc-tg-notif-row');
        acts.innerHTML = '';

        if (user.telegram_chat_id) {
            icon.classList.add('is-linked');
            title.textContent = t('acc_tg_connected');
            desc.textContent = `ID: ${user.telegram_chat_id}` +
                (user.telegram_linked_at ? ` · ${formatDate(user.telegram_linked_at)}` : '');

            const toggle = document.getElementById('acc-tg-toggle');
            toggle.setAttribute('aria-checked', String(!!user.telegram_notifications_enabled));
            notifRow.style.display = '';

            const unlinkBtn = document.createElement('button');
            unlinkBtn.className = 'btn btn-ghost';
            unlinkBtn.textContent = t('acc_tg_unlink');
            unlinkBtn.addEventListener('click', async () => {
                unlinkBtn.disabled = true;
                try {
                    await API.unlinkTelegram();
                    user.telegram_chat_id = null;
                    user.telegram_notifications_enabled = false;
                    renderTelegramTab();
                    renderOverviewStats();
                    showSuccess(t('acc_tg_unlinked_ok'));
                } catch (err) {
                    showError(err.message);
                } finally {
                    unlinkBtn.disabled = false;
                }
            });
            acts.appendChild(unlinkBtn);
        } else {
            icon.classList.remove('is-linked');
            title.textContent = t('tg_not_connected');
            desc.textContent = t('acc_tg_not_connected_desc');
            notifRow.style.display = 'none';

            const linkBtn = document.createElement('a');
            linkBtn.className = 'btn btn-primary';
            linkBtn.href = 'https://t.me/KaliangSupportBot';
            linkBtn.target = '_blank';
            linkBtn.rel = 'noopener';
            linkBtn.textContent = t('tg_btn_connect');
            acts.appendChild(linkBtn);
        }
    }

    function setupTelegramToggle() {
        document.getElementById('acc-tg-toggle').addEventListener('click', async () => {
            if (!user.telegram_chat_id) return;
            const toggle = document.getElementById('acc-tg-toggle');
            toggle.disabled = true;
            try {
                const enabled = !user.telegram_notifications_enabled;
                const data = await API.toggleTelegramNotifications(enabled);
                user.telegram_notifications_enabled = data.enabled;
                toggle.setAttribute('aria-checked', String(data.enabled));
                renderOverviewStats();
            } catch (err) {
                showError(err.message);
            } finally {
                toggle.disabled = false;
            }
        });
    }

    // ── Profile tab ──────────────────────────
    function renderProfile() {
        setText('profile-username', user.username);
        document.querySelectorAll('#acc-lang-row .acc-lang-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.lang === I18n.getLang()));
    }

    function setupProfile() {
        document.getElementById('profile-nick-form').addEventListener('submit', async e => {
            e.preventDefault();
            const input = document.getElementById('profile-nick-input');
            const newNick = input.value.trim();
            if (!newNick || newNick.length < 3) { showError(t('val_min3')); return; }
            try {
                const data = await API.changeUsername(newNick);
                if (data && data.user && data.user.username) {
                    user.username = data.user.username;
                } else {
                    user.username = newNick;
                }
                input.value = '';
                applyUserToUI();
                renderProfile();
                showSuccess(t('acc_profile_nick_saved'));
            } catch (err) {
                showError(err.message);
            }
        });

        document.querySelectorAll('#acc-lang-row .acc-lang-btn').forEach(btn => {
            btn.addEventListener('click', () => I18n.setLang(btn.dataset.lang));
        });

        document.getElementById('profile-logout').addEventListener('click', doLogout);
    }

    async function doLogout() {
        try { await API.logout(); } catch (_) {}
        logout();
    }

    // ── Create ticket modal ──────────────────
    function setupCreateModal() {
        const modal = document.getElementById('acc-create-modal');

        const openModal = () => modal.classList.add('active');
        const closeModal = () => modal.classList.remove('active');

        document.getElementById('ov-new-ticket-btn').addEventListener('click', openModal);
        document.getElementById('support-new-ticket-btn').addEventListener('click', openModal);
        document.getElementById('acc-create-close').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        document.getElementById('acc-create-form').addEventListener('submit', async e => {
            e.preventDefault();
            const subject = document.getElementById('acc-ticket-subject').value.trim();
            const message = document.getElementById('acc-ticket-message').value.trim();
            if (!subject || !message) { showError(t('fill_all_fields')); return; }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = t('creating_ticket');
            try {
                await API.createTicket(subject, message, 'normal', null, null, null);
                closeModal();
                e.target.reset();
                switchTab('support');
                await loadAll({ silent: true });
                showSuccess(t('ticket_created'));
            } catch (err) {
                showError(t('tickets_load_error') + ': ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = t('create_submit');
            }
        });
    }

    // ── Misc UI ──────────────────────────────
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function applyUserToUI() {
        setText('acc-username', user.username);
        const avatar = document.getElementById('acc-avatar');
        if (avatar) avatar.textContent = (user.username || '?').charAt(0).toUpperCase();
        const greeting = document.getElementById('acc-greeting');
        if (greeting) greeting.textContent = t('acc_greeting').replace('{name}', user.username);
    }

    function initialTabFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('tab');
        const fromHash = window.location.hash.replace('#', '');
        const valid = ['overview', 'orders', 'support', 'telegram', 'profile'];
        const tab = valid.includes(fromQuery) ? fromQuery : valid.includes(fromHash) ? fromHash : 'overview';
        return tab;
    }

    // ── Init ─────────────────────────────────
    async function init() {
        try {
            user = await checkAuth();
            if (!user) { window.location.href = 'auth.html'; return; }
            if (user.isAdmin) { window.location.href = 'admin/dashboard.html'; return; }

            applyUserToUI();

            // Navigation
            document.querySelectorAll('.acc-nav-item').forEach(btn => {
                btn.addEventListener('click', () => switchTab(btn.dataset.tab));
            });

            document.getElementById('acc-logout').addEventListener('click', doLogout);
            document.getElementById('ov-view-all').addEventListener('click', () => switchTab('support'));

            // Support filters
            document.querySelectorAll('.acc-filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    document.querySelectorAll('.acc-filter-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    currentFilter = chip.dataset.filter;
                    renderSupport();
                });
            });

            // Panel close
            document.getElementById('ap-close').addEventListener('click', closePanel);
            document.getElementById('acc-panel-overlay').addEventListener('click', closePanel);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && document.getElementById('acc-panel').classList.contains('open')) {
                    closePanel();
                }
            });

            setupCreateModal();
            setupTelegramToggle();
            setupProfile();

            renderTelegramTab();
            switchTab(initialTabFromUrl());

            await loadAll();
            initSSE();

            // Re-render dynamic content on language change
            window.addEventListener('langchange', () => {
                applyUserToUI();
                renderCurrentTab();
                renderOverviewStats();
                renderTelegramTab();
                renderProfile();
                if (currentTicket) renderPanelHeader(currentTicket);
            });
        } catch (err) {
            console.error('Init error:', err);
            showError(t('tickets_load_error') + ': ' + err.message);
        }
    }

    return { init, openTicket, closePanel };
})();

Account.init();
