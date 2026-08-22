// ============================================================
// KALIANG Admin Panel v2
// Разделы: Обзор / Заказы / Поддержка / Портфолио / Промокоды
// ============================================================
const Dashboard = (() => {
    let user = null;
    let allTickets = [];
    let currentTicket = null;
    let currentSection = 'overview';
    let sse = null;

    const listState = {
        orders:  { filter: 'all', search: '' },
        support: { filter: 'all', search: '' }
    };

    const isOrder = tk => !!tk.order_config;

    // ── Helpers ──────────────────────────────
    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m]));
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function fmtDate(iso, withTime) {
        if (!iso) return '';
        const locale = { ru: 'ru-RU', pl: 'pl-PL', en: 'en-US' }[I18n.getLang()] || 'ru-RU';
        const opts = withTime
            ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
        return new Date(iso).toLocaleString(locale, opts);
    }

    const statusLabel = s => ({
        open: t('status_open'),
        in_progress: t('status_progress'),
        closed: t('status_closed')
    }[s] || s);

    const prioColor = { normal: 'rgba(255,255,255,0.5)', high: '#FFD700', urgent: '#FF3333' };

    function showToastMsg(msg, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'adm-toast';
        el.textContent = msg;
        if (type === 'error') el.style.borderLeftColor = 'var(--accent-urgent)';
        container.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 350);
        }, 3500);
    }

    // Тосты для глобальных вызовов (api.js использует showSuccess/showError)
    window.showSuccess = msg => showToastMsg(msg, 'success');
    window.showError   = msg => showToastMsg(msg, 'error');

    // ── Data ─────────────────────────────────
    async function loadTickets(silent) {
        if (!silent) {
            document.querySelectorAll('.adm-loading').forEach(el => el.style.display = 'flex');
        }
        try {
            const data = await API.getAllTickets();
            if (!data || !Array.isArray(data.tickets)) throw new Error(t('tickets_load_error'));
            allTickets = data.tickets;
            renderAll();
        } catch (err) {
            showToastMsg(`${t('tickets_load_error')}: ${err.message}`, 'error');
        } finally {
            document.querySelectorAll('.adm-loading').forEach(el => el.style.display = 'none');
        }
    }

    async function loadStats() {
        try {
            const data = await API.getStats();
            if (!data || !data.stats) throw new Error('no stats');
            const s = data.stats;
            setText('stat-open',     s.open_tickets || 0);
            setText('stat-progress', s.in_progress_tickets || 0);
            setText('stat-closed',   s.closed_tickets || 0);
            setText('stat-total',    s.total_tickets || 0);
        } catch (_) {
            ['stat-open', 'stat-progress', 'stat-closed', 'stat-total'].forEach(id => setText(id, '—'));
        }
    }

    function pulseStat(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('pulse-anim');
        setTimeout(() => el.classList.remove('pulse-anim'), 450);
    }

    // ── Rendering ────────────────────────────
    function renderAll() {
        renderOverview();
        renderList('orders');
        renderList('support');
        renderNavCounts();
    }

    function renderNavCounts() {
        const ordersActive  = allTickets.filter(tk => isOrder(tk) && tk.status !== 'closed').length;
        const supportActive = allTickets.filter(tk => !isOrder(tk) && tk.status !== 'closed').length;
        setText('nav-count-orders',  ordersActive || '');
        setText('nav-count-support', supportActive || '');
    }

    function renderOverview() {
        const orders  = allTickets.filter(isOrder);
        const support = allTickets.filter(tk => !isOrder(tk));

        setText('ov-orders-count',   orders.length);
        setText('ov-orders-active',  orders.filter(tk => tk.status !== 'closed').length);
        setText('ov-support-count',  support.length);
        setText('ov-support-open',   support.filter(tk => tk.status !== 'closed').length);

        const recent = [...allTickets]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 8);

        const box = document.getElementById('ov-recent');
        box.innerHTML = '';
        if (recent.length === 0) {
            box.innerHTML = `<div class="adm-empty"><div class="adm-empty-title">${t('admin_no_tickets')}</div></div>`;
            return;
        }
        recent.forEach(tk => box.appendChild(makeRow(tk, true)));
    }

    function filteredTickets(scope) {
        const st = listState[scope];
        let list = allTickets.filter(scope === 'orders' ? isOrder : tk => !isOrder(tk));
        if (st.filter === 'mine') list = list.filter(tk => tk.assigned_admin_id === user.id);
        else if (st.filter !== 'all') list = list.filter(tk => tk.status === st.filter);
        if (st.search) {
            const q = st.search.toLowerCase();
            list = list.filter(tk =>
                (tk.subject || '').toLowerCase().includes(q) ||
                (tk.user_username || '').toLowerCase().includes(q) ||
                String(tk.id).includes(q)
            );
        }
        return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    function renderList(scope) {
        const listEl = document.getElementById(`${scope}-list`);
        const emptyEl = document.getElementById(`${scope}-empty`);
        if (!listEl) return;

        const list = filteredTickets(scope);
        listEl.innerHTML = '';

        if (list.length === 0) {
            emptyEl.style.display = '';
            listEl.style.display = 'none';
            return;
        }
        emptyEl.style.display = 'none';
        listEl.style.display = '';
        list.forEach(tk => listEl.appendChild(makeRow(tk, false)));
    }

    function makeRow(tk, showKind) {
        const row = document.createElement('button');
        row.className = 'adm-row';
        if (currentTicket && currentTicket.id === tk.id) row.classList.add('row-active');

        const kindBadge = showKind
            ? `<span class="badge ${isOrder(tk) ? 'kind-order' : 'kind-ticket'}">${isOrder(tk) ? t('acc_kind_order') : t('acc_kind_ticket')}</span>`
            : '';

        row.innerHTML = `
            <span class="adm-row-id">#${tk.id}</span>
            <span class="adm-row-main">
                <span class="adm-row-subject">${escapeHtml(tk.subject)}</span>
                <span class="adm-row-meta">
                    ${kindBadge}
                    <span>${escapeHtml(tk.user_username || '')}</span>
                </span>
            </span>
            <span><span class="badge status-${tk.status}">${statusLabel(tk.status)}</span></span>
            <span class="priority-dot">
                <span class="dot" style="background:${prioColor[tk.priority] || prioColor.normal}"></span>
                ${escapeHtml((tk.priority || 'normal').toUpperCase())}
            </span>
            <span class="adm-row-assigned">${tk.assigned_admin_username ? escapeHtml(tk.assigned_admin_username) : '—'}</span>
            <span class="adm-row-date">${fmtDate(tk.created_at)}</span>
        `;
        row.addEventListener('click', () => openTicket(tk.id));
        return row;
    }

    // ── Ticket panel ─────────────────────────
    async function openTicket(ticketId) {
        const panel   = document.getElementById('adm-panel');
        const overlay = document.getElementById('adm-panel-overlay');
        const body    = document.getElementById('adm-panel-body');

        panel.classList.add('open');
        overlay.classList.add('active');
        body.innerHTML = `<div class="adm-loading" style="display:flex;"><div class="loading-spinner"></div></div>`;

        document.querySelectorAll('.adm-row').forEach(r => {
            const id = r.querySelector('.adm-row-id');
            r.classList.toggle('row-active', !!id && id.textContent === `#${ticketId}`);
        });

        try {
            const data = await API.getTicket(ticketId);
            if (!data || !data.ticket) throw new Error(t('tickets_load_error'));
            currentTicket = data.ticket;
            renderPanelHeader(currentTicket);
            renderPanelBody(currentTicket, data.messages || []);
        } catch (err) {
            body.innerHTML = `<div class="adm-empty"><div class="adm-empty-title" style="color:var(--accent-urgent);">${t('tickets_load_error')}: ${escapeHtml(err.message)}</div></div>`;
        }
    }

    function renderPanelHeader(ticket) {
        document.getElementById('adm-panel-subject').textContent = ticket.subject;

        const meta = document.getElementById('adm-panel-meta');
        meta.innerHTML = '';

        const idS = document.createElement('span');
        idS.textContent = `#${ticket.id}`;

        const st = document.createElement('span');
        st.className = `badge status-${ticket.status}`;
        st.textContent = statusLabel(ticket.status);

        const pr = document.createElement('span');
        pr.className = `badge priority-${ticket.priority}`;
        pr.textContent = (ticket.priority || 'normal').toUpperCase();

        meta.appendChild(idS);
        meta.appendChild(st);
        meta.appendChild(pr);
    }

    function renderPanelBody(ticket, messages) {
        const body = document.getElementById('adm-panel-body');
        body.innerHTML = '';

        // ── Сводка заказа
        if (isOrder(ticket)) body.appendChild(makeOrderSummary(ticket.order_config));

        // ── Описание задачи (для заказов)
        const cfg = ticket.order_config || {};
        if (cfg.shortDescription || cfg.detailedDescription) {
            const descBlock = document.createElement('div');
            if (cfg.shortDescription) {
                descBlock.innerHTML += `<div class="adm-block-title">${t('adm_task_short')}</div>
                    <div class="adm-desc-text" style="margin-bottom:var(--sp-3);">${escapeHtml(cfg.shortDescription)}</div>`;
            }
            if (cfg.detailedDescription) {
                descBlock.innerHTML += `<div class="adm-block-title">${t('adm_task_details')}</div>
                    <div class="adm-desc-text">${escapeHtml(cfg.detailedDescription)}</div>`;
            }
            body.appendChild(descBlock);
        }

        // ── Детали
        const details = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'adm-details-grid';
        [
            [t('admin_field_user'),    ticket.user_username || '—'],
            [t('admin_field_created'), fmtDate(ticket.created_at, true)],
            [t('admin_field_assigned'), ticket.assigned_admin_username || '—']
        ].forEach(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'adm-detail-item';
            item.innerHTML = `<span class="adm-detail-label">${label}</span><span class="adm-detail-value">${escapeHtml(String(value))}</span>`;
            grid.appendChild(item);
        });
        details.appendChild(grid);
        body.appendChild(details);

        // ── Действия
        const actions = document.createElement('div');
        actions.className = 'adm-actions';

        actions.appendChild(makeActionGroup(t('admin_action_status'), [
            { label: t('status_open'),     key: 'status', val: 'open',        active: ticket.status === 'open' },
            { label: t('status_progress'), key: 'status', val: 'in_progress', active: ticket.status === 'in_progress' },
            { label: t('status_closed'),   key: 'status', val: 'closed',      active: ticket.status === 'closed' }
        ]));

        actions.appendChild(makeActionGroup(t('admin_action_priority'), [
            { label: t('cfg_prio_normal_live'), key: 'priority', val: 'normal', active: ticket.priority === 'normal' },
            { label: t('cfg_prio_high_live'),   key: 'priority', val: 'high',   active: ticket.priority === 'high' },
            { label: t('cfg_prio_urgent_live'), key: 'priority', val: 'urgent', active: ticket.priority === 'urgent' }
        ]));

        const assignBtn = document.createElement('button');
        assignBtn.className = 'adm-assign-btn' + (ticket.assigned_admin_id === user.id ? ' assigned' : '');
        assignBtn.id = 'adm-assign-btn';
        assignBtn.textContent = ticket.assigned_admin_id === user.id ? t('admin_btn_unassign') : t('admin_btn_assign');
        assignBtn.addEventListener('click', toggleAssign);
        actions.appendChild(assignBtn);

        body.appendChild(actions);

        // ── Переписка
        const msgsBlock = document.createElement('div');
        msgsBlock.innerHTML = `<div class="adm-block-title">${t('admin_messages')}</div>`;

        const msgsList = document.createElement('div');
        msgsList.className = 'adm-messages-list';
        msgsList.id = 'adm-messages-list';
        messages.forEach(msg => msgsList.appendChild(makeMessageEl(msg)));
        msgsBlock.appendChild(msgsList);
        body.appendChild(msgsBlock);

        // ── Ответ
        if (ticket.status !== 'closed') {
            const replyForm = document.createElement('div');
            replyForm.className = 'adm-reply-form';

            const ta = document.createElement('textarea');
            ta.className = 'adm-reply-textarea';
            ta.id = 'adm-reply-content';
            ta.placeholder = t('admin_reply_ph');
            ta.maxLength = 5000;

            const sendBtn = document.createElement('button');
            sendBtn.className = 'btn btn-primary adm-btn-full';
            sendBtn.textContent = t('admin_reply_btn');

            sendBtn.addEventListener('click', async () => {
                const content = ta.value.trim();
                if (!content) return;
                sendBtn.disabled = true;
                sendBtn.textContent = t('btn_sending');
                try {
                    const res = await API.replyToTicket(currentTicket.id, content);
                    ta.value = '';
                    if (res && res.message) appendMessageToPanel({ ...res.message, username: user.username });
                } catch (err) {
                    showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
                } finally {
                    sendBtn.disabled = false;
                    sendBtn.textContent = t('admin_reply_btn');
                }
            });

            ta.addEventListener('keydown', e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendBtn.click();
            });

            replyForm.appendChild(ta);
            replyForm.appendChild(sendBtn);
            body.appendChild(replyForm);
        }

        setTimeout(() => {
            const list = document.getElementById('adm-messages-list');
            if (list) list.scrollTop = list.scrollHeight;
        }, 50);
    }

    function makeOrderSummary(cfg) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div class="adm-block-title">${t('adm_summary_title')}</div>`;

        const grid = document.createElement('div');
        grid.className = 'adm-summary';

        const platformKey = { telegram: 'cfg_platform_tg_name', discord: 'cfg_platform_dc_name', both: 'cfg_platform_both_name' }[cfg.platform];
        const hostingKey  = { free: 'cfg_hosting_free', paid: 'cfg_hosting_paid', none: 'cfg_hosting_none' }[cfg.hosting && cfg.hosting.type];
        const benefitKey  = { free_mini: 'cfg_promo_free_mini_name', percent_10: 'cfg_promo_pct_name' }[cfg.chosenBenefit];

        let hostingVal = hostingKey ? t(hostingKey) : '—';
        if (cfg.hosting && cfg.hosting.extraStorage > 0) hostingVal += ' ' + t('cfg_hosting_extra_storage').replace('{n}', cfg.hosting.extraStorage);
        if (cfg.hosting && cfg.hosting.extraBandwidth > 0) hostingVal += ' ' + t('cfg_hosting_extra_bw').replace('{n}', cfg.hosting.extraBandwidth);

        const items = [
            [t('cfg_sum_platform'), platformKey ? t(platformKey) : '—'],
            [t('cfg_live_package'), cfg.package ? cfg.package.toUpperCase() : '—'],
            [t('cfg_live_lang'),    cfg.language ? cfg.language.toUpperCase() : '—'],
            [t('cfg_live_hosting'), hostingVal],
            [t('cfg_live_priority'), t(`cfg_prio_${cfg.priority || 'normal'}_live`)],
            [t('cfg_price_label'),  cfg.totalPrice !== undefined && cfg.totalPrice !== null ? `$${cfg.totalPrice}` : '—', 'mono']
        ];
        if (cfg.promoCode) {
            items.push([t('cfg_live_promo'), `${cfg.promoCode}${benefitKey ? ' · ' + t(benefitKey) : ''}`, 'full']);
        }

        items.forEach(([label, value, cls]) => {
            const item = document.createElement('div');
            item.className = 'adm-summary-item' + (cls === 'full' ? ' full' : '');
            item.innerHTML = `<span class="adm-summary-label">${label}</span><span class="adm-summary-value${cls === 'mono' ? ' mono' : ''}">${escapeHtml(String(value))}</span>`;
            grid.appendChild(item);
        });

        wrap.appendChild(grid);
        return wrap;
    }

    function makeActionGroup(labelText, buttons) {
        const group = document.createElement('div');

        const label = document.createElement('div');
        label.className = 'adm-action-label';
        label.textContent = labelText;

        const btns = document.createElement('div');
        btns.className = 'adm-action-btns';

        buttons.forEach(({ label: btnLabel, key, val, active }) => {
            const btn = document.createElement('button');
            btn.className = `adm-action-btn${active ? ' btn-active' : ''}`;
            btn.dataset[key === 'status' ? 'status' : 'priority'] = val;
            btn.textContent = btnLabel;
            btn.addEventListener('click', () => updateTicketField(key, val, btn));
            btns.appendChild(btn);
        });

        group.appendChild(label);
        group.appendChild(btns);
        return group;
    }

    function makeMessageEl(msg) {
        const wrap = document.createElement('div');
        wrap.className = `adm-message ${msg.is_admin_reply ? 'admin-reply' : 'user-message'}`;
        if (msg.id) wrap.dataset.msgId = msg.id;

        wrap.innerHTML = `
            <div class="adm-msg-meta">
                <span class="adm-msg-author">${escapeHtml(msg.username || '—')}</span>
                <span>${fmtDate(msg.created_at, true)}</span>
            </div>
            <div class="adm-msg-body">${escapeHtml(msg.content)}</div>
        `;
        return wrap;
    }

    function appendMessageToPanel(msg) {
        const list = document.getElementById('adm-messages-list');
        if (!list) return;
        // Защита от дублей (SSE + оптимистичная вставка)
        if (msg.id && list.querySelector(`[data-msg-id="${msg.id}"]`)) return;
        list.appendChild(makeMessageEl(msg));
        list.scrollTop = list.scrollHeight;
    }

    function refreshPanelMeta() {
        if (!currentTicket) return;
        renderPanelHeader(currentTicket);
        document.querySelectorAll('[data-status]').forEach(btn =>
            btn.classList.toggle('btn-active', btn.dataset.status === currentTicket.status));
        document.querySelectorAll('[data-priority]').forEach(btn =>
            btn.classList.toggle('btn-active', btn.dataset.priority === currentTicket.priority));
        const ab = document.getElementById('adm-assign-btn');
        if (ab) {
            const mine = currentTicket.assigned_admin_id === user.id;
            ab.textContent = mine ? t('admin_btn_unassign') : t('admin_btn_assign');
            ab.classList.toggle('assigned', mine);
        }
    }

    async function updateTicketField(field, value, clickedBtn) {
        if (!currentTicket || currentTicket[field] === value) return;

        const prevValue = currentTicket[field];
        const selector = field === 'status' ? '[data-status]' : '[data-priority]';
        document.querySelectorAll(selector).forEach(b => b.classList.remove('btn-active'));
        clickedBtn.classList.add('btn-active');
        currentTicket[field] = value;

        try {
            await API.updateTicket(currentTicket.id, { [field]: value });
            renderPanelHeader(currentTicket);
            renderAll();
        } catch (err) {
            currentTicket[field] = prevValue;
            refreshPanelMeta();
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    async function toggleAssign() {
        if (!currentTicket) return;
        const isAssigned = currentTicket.assigned_admin_id === user.id;
        try {
            await API.updateTicket(currentTicket.id, { assignedAdminId: isAssigned ? null : user.id });
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function closePanel() {
        document.getElementById('adm-panel').classList.remove('open');
        document.getElementById('adm-panel-overlay').classList.remove('active');
        document.querySelectorAll('.adm-row').forEach(r => r.classList.remove('row-active'));
        currentTicket = null;
    }

    // ── SSE ──────────────────────────────────
    function initSSE() {
        if (!inMemoryAccessToken) return;
        if (sse) { sse.close(); sse = null; }
        sse = new EventSource(`${API_URL}/events`, { withCredentials: true });

        sse.addEventListener('admin:ticket:new', e => {
            const ticket = JSON.parse(e.data);
            if (!allTickets.some(x => x.id === ticket.id)) allTickets.unshift(ticket);
            renderAll();
            loadStats();
            showToastMsg(t('admin_sse_new').replace('{id}', ticket.id), 'success');
            pulseStat('stat-open');
        });

        sse.addEventListener('admin:ticket:updated', e => {
            const updated = JSON.parse(e.data);
            const idx = allTickets.findIndex(x => x.id === updated.id);
            if (idx !== -1) allTickets[idx] = { ...allTickets[idx], ...updated };
            renderAll();
            if (currentTicket && currentTicket.id === updated.id) {
                currentTicket = { ...currentTicket, ...updated };
                refreshPanelMeta();
            }
            loadStats();
        });

        sse.addEventListener('admin:message:new', e => {
            const { ticketId, message } = JSON.parse(e.data);
            if (currentTicket && currentTicket.id === ticketId) appendMessageToPanel(message);
            showToastMsg(t('admin_sse_msg').replace('{id}', ticketId), 'success');
        });

        sse.onerror = () => {};
    }

    // ── Sections / filters / search ──────────
    function switchSection(section) {
        currentSection = section;
        document.querySelectorAll('[data-section]').forEach(l =>
            l.classList.toggle('active', l.dataset.section === section));
        document.querySelectorAll('.adm-section').forEach(s =>
            s.classList.toggle('active', s.id === `section-${section}`));

        if (section === 'promo') loadPromoCodes();
        if (section === 'portfolio') loadPortfolio();
    }

    function setupNav() {
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                switchSection(link.dataset.section);
            });
        });
        document.querySelectorAll('[data-goto]').forEach(btn => {
            btn.addEventListener('click', () => switchSection(btn.dataset.goto));
        });
    }

    function setupTabsAndSearch() {
        document.querySelectorAll('.adm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const scope = tab.closest('.adm-tabs').dataset.scope;
                tab.closest('.adm-tabs').querySelectorAll('.adm-tab').forEach(x => x.classList.remove('active'));
                tab.classList.add('active');
                listState[scope].filter = tab.dataset.filter;
                renderList(scope);
            });
        });

        document.querySelectorAll('.adm-search').forEach(box => {
            let timer;
            box.addEventListener('input', e => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const scope = box.dataset.scope;
                    listState[scope].search = e.target.value.trim();
                    renderList(scope);
                }, 200);
            });
        });
    }

    // ── Promo codes ──────────────────────────
    let promoEditId = null;

    async function loadPromoCodes() {
        const tbody = document.getElementById('promo-tbody');
        const empty = document.getElementById('promo-empty');
        if (!tbody) return;
        empty.style.display = 'none';
        tbody.innerHTML = '';

        try {
            const data = await API.adminListPromoCodes();
            if (!data || !Array.isArray(data.promoCodes)) throw new Error('Invalid response');

            if (data.promoCodes.length === 0) {
                empty.style.display = '';
                return;
            }

            data.promoCodes.forEach(pc => {
                const tr = document.createElement('tr');
                const limit = pc.max_uses !== null && pc.max_uses !== undefined ? pc.max_uses : '∞';
                tr.innerHTML = `
                    <td class="td-code">${escapeHtml(pc.code)}</td>
                    <td>${escapeHtml(pc.description || '—')}</td>
                    <td>${pc.use_count || 0}</td>
                    <td>${limit}</td>
                    <td><span class="badge ${pc.is_active ? 'status-in_progress' : 'status-closed'}">${pc.is_active ? t('promo_yes') : t('promo_no')}</span></td>
                    <td>
                        <div style="display:flex;gap:var(--sp-2);">
                            <button class="btn btn-ghost adm-btn-small promo-edit-btn" data-id="${pc.id}">${t('promo_btn_save')}</button>
                            <button class="btn btn-ghost adm-btn-small adm-btn-danger promo-delete-btn" data-id="${pc.id}">${pc.use_count > 0 ? t('promo_btn_deactivate') : t('promo_btn_delete')}</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.promo-edit-btn').forEach(btn =>
                btn.addEventListener('click', () => openPromoEdit(parseInt(btn.dataset.id))));
            tbody.querySelectorAll('.promo-delete-btn').forEach(btn =>
                btn.addEventListener('click', () => deletePromoCode(parseInt(btn.dataset.id))));
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function resetPromoForm() {
        promoEditId = null;
        document.getElementById('promo-edit-id').value = '';
        document.getElementById('promo-form-code').value = '';
        document.getElementById('promo-form-code').disabled = false;
        document.getElementById('promo-form-desc').value = '';
        document.getElementById('promo-form-discount').value = '10';
        document.getElementById('promo-form-free-mini').checked = false;
        document.getElementById('promo-form-max-uses').value = '';
        document.getElementById('promo-form-active').checked = true;
        document.getElementById('promo-modal-title').textContent = t('promo_create_title');
        document.getElementById('promo-form-submit').textContent = t('promo_btn_create');
    }

    function openPromoEdit(id) {
        API.adminGetPromoCode(id).then(data => {
            if (!data || !data.promoCode) throw new Error('Not found');
            const pc = data.promoCode;
            promoEditId = id;
            document.getElementById('promo-edit-id').value = pc.id;
            document.getElementById('promo-form-code').value = pc.code;
            document.getElementById('promo-form-code').disabled = true;
            document.getElementById('promo-form-desc').value = pc.description || '';
            document.getElementById('promo-form-discount').value = pc.discount_percent;
            document.getElementById('promo-form-free-mini').checked = pc.is_free_mini;
            document.getElementById('promo-form-max-uses').value = pc.max_uses !== null ? pc.max_uses : '';
            document.getElementById('promo-form-active').checked = pc.is_active;
            document.getElementById('promo-modal-title').textContent = t('promo_edit_title');
            document.getElementById('promo-form-submit').textContent = t('promo_btn_save');
            document.getElementById('promo-modal').classList.add('active');
        }).catch(err => showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error'));
    }

    async function deletePromoCode(id) {
        if (!confirm(t('promo_confirm_delete'))) return;
        try {
            await API.adminDeletePromoCode(id);
            showToastMsg(t('promo_deleted'), 'success');
            await loadPromoCodes();
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function setupPromo() {
        document.getElementById('promo-new-btn').addEventListener('click', () => {
            resetPromoForm();
            document.getElementById('promo-modal').classList.add('active');
        });

        const close = () => {
            document.getElementById('promo-modal').classList.remove('active');
            resetPromoForm();
        };
        document.getElementById('promo-modal-close').addEventListener('click', close);
        document.getElementById('promo-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('promo-modal')) close();
        });

        document.getElementById('promo-form').addEventListener('submit', async e => {
            e.preventDefault();
            const code = document.getElementById('promo-form-code').value.trim();
            if (!code) { showToastMsg(t('promo_form_code') + ' — ' + t('val_min3'), 'error'); return; }

            const desc = document.getElementById('promo-form-desc').value.trim() || undefined;
            const maxUses = document.getElementById('promo-form-max-uses').value
                ? parseInt(document.getElementById('promo-form-max-uses').value) : null;

            try {
                if (promoEditId) {
                    await API.adminUpdatePromoCode(promoEditId, {
                        description: desc,
                        isActive: document.getElementById('promo-form-active').checked,
                        maxUses
                    });
                    showToastMsg(t('promo_updated'), 'success');
                } else {
                    await API.adminCreatePromoCode({
                        code,
                        description: desc,
                        discountPercent: parseFloat(document.getElementById('promo-form-discount').value) || 10,
                        isFreeMini: document.getElementById('promo-form-free-mini').checked,
                        maxUses
                    });
                    showToastMsg(t('promo_created'), 'success');
                }
                close();
                await loadPromoCodes();
            } catch (err) {
                showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
            }
        });
    }

    // ── Portfolio ────────────────────────────
    let pfEditId = null;

    async function loadPortfolio() {
        const tbody = document.getElementById('pf-tbody');
        const empty = document.getElementById('pf-empty');
        if (!tbody) return;
        empty.style.display = 'none';
        tbody.innerHTML = '';

        try {
            const data = await API.adminListPortfolio();
            if (!data || !Array.isArray(data.projects)) throw new Error('Invalid response');

            if (data.projects.length === 0) {
                empty.style.display = '';
                return;
            }

            data.projects.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(p.title)}</td>
                    <td>${escapeHtml(p.platform || '—')}</td>
                    <td>${escapeHtml((p.plan || '—').toUpperCase())}</td>
                    <td>${escapeHtml(p.price || '—')}</td>
                    <td><span class="badge ${p.is_visible ? 'status-in_progress' : 'status-closed'}">${p.is_visible ? t('promo_yes') : t('promo_no')}</span></td>
                    <td>${p.sort_order ?? 0}</td>
                    <td>
                        <div style="display:flex;gap:var(--sp-2);">
                            <button class="btn btn-ghost adm-btn-small pf-edit-btn" data-id="${p.id}">${t('promo_btn_save')}</button>
                            <button class="btn btn-ghost adm-btn-small adm-btn-danger pf-delete-btn" data-id="${p.id}">${t('promo_btn_delete')}</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.pf-edit-btn').forEach(btn =>
                btn.addEventListener('click', () => openPfEdit(parseInt(btn.dataset.id))));
            tbody.querySelectorAll('.pf-delete-btn').forEach(btn =>
                btn.addEventListener('click', () => deletePf(parseInt(btn.dataset.id))));
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function resetPfForm() {
        pfEditId = null;
        document.getElementById('pf-edit-id').value = '';
        document.getElementById('pf-form-title').value = '';
        document.getElementById('pf-form-platform').value = 'telegram';
        document.getElementById('pf-form-plan').value = 'mini';
        document.getElementById('pf-form-price').value = '';
        document.getElementById('pf-form-term').value = '';
        document.getElementById('pf-form-lang').value = '';
        document.getElementById('pf-form-sort').value = '0';
        document.getElementById('pf-form-desc-ru').value = '';
        document.getElementById('pf-form-desc-pl').value = '';
        document.getElementById('pf-form-desc-en').value = '';
        document.getElementById('pf-form-bot-url').value = '';
        document.getElementById('pf-form-source-url').value = '';
        document.getElementById('pf-form-screenshots').value = '';
        document.getElementById('pf-form-visible').checked = true;
        document.getElementById('pf-modal-title').textContent = t('admin_portfolio_modal_create');
        document.getElementById('pf-form-submit').textContent = t('admin_portfolio_btn_create');
    }

    function openPfEdit(id) {
        API.adminGetPortfolioProject(id).then(data => {
            if (!data || !data.project) throw new Error('Not found');
            const p = data.project;
            pfEditId = id;
            document.getElementById('pf-edit-id').value = p.id;
            document.getElementById('pf-form-title').value = p.title || '';
            document.getElementById('pf-form-platform').value = p.platform || 'telegram';
            document.getElementById('pf-form-plan').value = p.plan || 'mini';
            document.getElementById('pf-form-price').value = p.price || '';
            document.getElementById('pf-form-term').value = p.term || '';
            document.getElementById('pf-form-lang').value = p.lang || '';
            document.getElementById('pf-form-sort').value = p.sort_order ?? 0;
            document.getElementById('pf-form-desc-ru').value = p.description_ru || '';
            document.getElementById('pf-form-desc-pl').value = p.description_pl || '';
            document.getElementById('pf-form-desc-en').value = p.description_en || '';
            document.getElementById('pf-form-bot-url').value = p.bot_url || '';
            document.getElementById('pf-form-source-url').value = p.source_url || '';
            document.getElementById('pf-form-screenshots').value = Array.isArray(p.screenshots) ? p.screenshots.join('\n') : '';
            document.getElementById('pf-form-visible').checked = !!p.is_visible;
            document.getElementById('pf-modal-title').textContent = t('admin_portfolio_modal_edit');
            document.getElementById('pf-form-submit').textContent = t('promo_btn_save');
            document.getElementById('pf-modal').classList.add('active');
        }).catch(err => showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error'));
    }

    async function deletePf(id) {
        if (!confirm(t('admin_portfolio_confirm_delete'))) return;
        try {
            await API.adminDeletePortfolioProject(id);
            showToastMsg(t('admin_portfolio_deleted'), 'success');
            await loadPortfolio();
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function setupPortfolio() {
        document.getElementById('pf-new-btn').addEventListener('click', () => {
            resetPfForm();
            document.getElementById('pf-modal').classList.add('active');
        });

        const close = () => {
            document.getElementById('pf-modal').classList.remove('active');
            resetPfForm();
        };
        document.getElementById('pf-modal-close').addEventListener('click', close);
        document.getElementById('pf-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('pf-modal')) close();
        });

        document.getElementById('pf-form').addEventListener('submit', async e => {
            e.preventDefault();

            const payload = {
                title:         document.getElementById('pf-form-title').value.trim(),
                platform:      document.getElementById('pf-form-platform').value,
                plan:          document.getElementById('pf-form-plan').value,
                price:         document.getElementById('pf-form-price').value.trim() || undefined,
                term:          document.getElementById('pf-form-term').value.trim() || undefined,
                lang:          document.getElementById('pf-form-lang').value.trim() || undefined,
                sortOrder:     parseInt(document.getElementById('pf-form-sort').value) || 0,
                descriptionRu: document.getElementById('pf-form-desc-ru').value.trim(),
                descriptionPl: document.getElementById('pf-form-desc-pl').value.trim(),
                descriptionEn: document.getElementById('pf-form-desc-en').value.trim(),
                botUrl:        document.getElementById('pf-form-bot-url').value.trim() || undefined,
                sourceUrl:     document.getElementById('pf-form-source-url').value.trim() || undefined,
                screenshots:   document.getElementById('pf-form-screenshots').value
                    .split('\n').map(s => s.trim()).filter(Boolean),
                isVisible:     document.getElementById('pf-form-visible').checked
            };

            if (!payload.title) { showToastMsg(t('admin_portfolio_col_title') + ' — ?', 'error'); return; }

            try {
                if (pfEditId) {
                    await API.adminUpdatePortfolioProject(pfEditId, payload);
                    showToastMsg(t('admin_portfolio_updated'), 'success');
                } else {
                    await API.adminCreatePortfolioProject(payload);
                    showToastMsg(t('admin_portfolio_created'), 'success');
                }
                close();
                await loadPortfolio();
            } catch (err) {
                showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
            }
        });
    }

    // ── Init ─────────────────────────────────
    async function init() {
        try {
            user = await checkAuth();
            if (!user) { window.location.href = '../auth.html'; return; }
            if (!user.isAdmin) { window.location.href = '../account.html'; return; }

            setText('admin-username', user.username || 'Admin');

            await Promise.all([loadStats(), loadTickets()]);
            initSSE();
            setupNav();
            setupTabsAndSearch();
            setupPromo();
            setupPortfolio();

            document.getElementById('logout-btn').addEventListener('click', async () => {
                try { await API.logout(); } catch (_) {}
                logout();
            });

            document.getElementById('adm-panel-close').addEventListener('click', closePanel);
            document.getElementById('adm-panel-overlay').addEventListener('click', closePanel);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && document.getElementById('adm-panel').classList.contains('open')) closePanel();
            });

            // Смена языка — перерисовка динамики
            document.addEventListener('langchange', () => {
                renderAll();
                if (currentTicket) {
                    const id = currentTicket.id;
                    openTicket(id);
                }
                if (currentSection === 'promo') loadPromoCodes();
                if (currentSection === 'portfolio') loadPortfolio();
            });
        } catch (err) {
            console.error('Init error:', err);
        }
    }

    return { init, openTicket, closeModal: closePanel };
})();

Dashboard.init();
window.closeModal = Dashboard.closeModal;
