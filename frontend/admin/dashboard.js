const Dashboard = (() => {
    let user = null;
    let tickets = [];
    let currentTicket = null;
    let filters = {};
    let sse = null;

    // ── SSE ────────────────────────────────
    function initSSE() {
        if (!inMemoryAccessToken) return;
        if (sse) { sse.close(); sse = null; }
        sse = new EventSource(`${API_URL}/events`, { withCredentials: true });

        sse.addEventListener('admin:ticket:new', e => {
            const ticket = JSON.parse(e.data);
            tickets.unshift(ticket);
            renderTickets();
            loadStats();
            showToastMsg(t('admin_sse_new').replace('{id}', ticket.id), 'success');
            pulseStat('stat-open');
        });

        sse.addEventListener('admin:ticket:updated', e => {
            const updated = JSON.parse(e.data);
            const idx = tickets.findIndex(t => t.id === updated.id);
            if (idx !== -1) { tickets[idx] = updated; renderTickets(); }
            if (currentTicket && currentTicket.id === updated.id) {
                currentTicket = updated;
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

    function pulseStat(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('pulse-anim');
        setTimeout(() => el.classList.remove('pulse-anim'), 450);
    }

    // ── Stats ──────────────────────────────
    async function loadStats() {
        try {
            const data = await API.getStats();
            if (!data || !data.stats) throw new Error('no stats');
            const s = data.stats;
            setText('stat-open',     s.open_tickets     || 0);
            setText('stat-progress', s.in_progress_tickets || 0);
            setText('stat-closed',   s.closed_tickets   || 0);
            setText('stat-total',    s.total_tickets    || 0);
        } catch (_) {
            ['stat-open','stat-progress','stat-closed','stat-total'].forEach(id => setText(id, '—'));
        }
    }

    // ── Load tickets ───────────────────────
    async function loadTickets() {
        const loading = document.getElementById('loading');
        const tbody   = document.getElementById('tickets-tbody');
        const cards   = document.getElementById('tickets-cards');

        if (loading) loading.style.display = 'flex';
        if (tbody)  tbody.innerHTML = '';
        if (cards)  cards.innerHTML = '';

        try {
            const data = await API.getAllTickets(filters);
            if (!data || !Array.isArray(data.tickets)) throw new Error(t('tickets_load_error'));
            tickets = data.tickets;
            renderTickets();
        } catch (err) {
            const msg = `${t('tickets_load_error')}: ${escapeHtml(err.message)}`;
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:3rem;text-align:center;color:rgba(255,255,255,.3)">${msg}</td></tr>`;
            if (cards) cards.innerHTML = `<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.3)">${msg}</div>`;
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    function renderTickets() {
        const tbody  = document.getElementById('tickets-tbody');
        const cards  = document.getElementById('tickets-cards');
        const statusLabels = {
            open: t('status_open'),
            in_progress: t('status_progress'),
            closed: t('status_closed')
        };
        const priorityDot  = { normal: 'rgba(255,255,255,0.5)', high: '#FFD700', urgent: '#FF3333' };

        if (tbody) {
            tbody.innerHTML = '';
            if (tickets.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="padding:3rem;text-align:center;color:rgba(255,255,255,.3)">${t('admin_no_tickets')}</td></tr>`;
            } else {
                tickets.forEach(t => {
                    const tr = document.createElement('tr');
                    if (currentTicket && currentTicket.id === t.id) tr.classList.add('row-active');
                    const date = new Date(t.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
                    tr.innerHTML = `
                        <td class="td-id">#${t.id}</td>
                        <td class="td-subject">${escapeHtml(t.subject)}</td>
                        <td class="td-user">${escapeHtml(t.user_username)}</td>
                        <td><span class="badge status-${t.status}">${statusLabels[t.status]}</span></td>
                        <td>
                            <span class="priority-dot">
                                <span class="status-dot" style="background:${priorityDot[t.priority]}"></span>
                                ${t.priority.toUpperCase()}
                            </span>
                        </td>
                        <td class="td-assigned">${escapeHtml(t.assigned_admin_username) || '—'}</td>
                        <td class="td-date">${date}</td>
                    `;
                    tr.addEventListener('click', () => openTicket(t.id));
                    tbody.appendChild(tr);
                });
            }
        }

        if (cards) {
            cards.innerHTML = '';
            if (tickets.length === 0) {
                cards.innerHTML = `<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.3)">${t('admin_no_tickets')}</div>`;
            } else {
                tickets.forEach(t => {
                    const card = document.createElement('div');
                    card.className = 'adm-ticket-card';
                    card.innerHTML = `
                        <div class="atc-header">
                            <span class="atc-id">#${t.id}</span>
                            <div class="atc-badges">
                                <span class="badge status-${t.status}">${statusLabels[t.status]}</span>
                                <span class="badge priority-${t.priority}">${t.priority.toUpperCase()}</span>
                            </div>
                        </div>
                        <div class="atc-subject">${escapeHtml(t.subject)}</div>
                        <div class="atc-meta">
                            <span>${escapeHtml(t.user_username)}</span>
                            <span>${new Date(t.created_at).toLocaleDateString('ru-RU')}</span>
                            ${t.assigned_admin_username ? `<span>${escapeHtml(t.assigned_admin_username)}</span>` : ''}
                        </div>
                    `;
                    card.addEventListener('click', () => openTicket(t.id));
                    cards.appendChild(card);
                });
            }
        }
    }

    // ── Open ticket panel ──────────────────
    async function openTicket(ticketId) {
        const panel   = document.getElementById('adm-panel');
        const overlay = document.getElementById('adm-panel-overlay');
        const body    = document.getElementById('admin-modal-body');

        panel.classList.add('open');
        overlay.classList.add('active');
        body.innerHTML = `<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.3)">${t('panel_loading')}</div>`;

        // Mark active row
        document.querySelectorAll('#tickets-tbody tr').forEach(r => {
            r.classList.toggle('row-active', r.querySelector('.td-id') && r.querySelector('.td-id').textContent === `#${ticketId}`);
        });

        try {
            const data = await API.getTicket(ticketId);
            if (!data || !data.ticket) throw new Error(t('tickets_load_error'));
            currentTicket = data.ticket;
            renderPanelHeader(currentTicket);
            renderPanelBody(currentTicket, data.messages || []);
        } catch (err) {
            body.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--accent-urgent);">${t('tickets_load_error')}: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderPanelHeader(ticket) {
        const statusLabels = {
            open: t('status_open'),
            in_progress: t('status_progress'),
            closed: t('status_closed')
        };
        document.getElementById('adm-panel-subject').textContent = ticket.subject;

        const meta = document.getElementById('adm-panel-meta');
        meta.innerHTML = '';

        const idS = document.createElement('span');
        idS.style.fontFamily = 'var(--font-mono)';
        idS.textContent = `#${ticket.id}`;

        const st = document.createElement('span');
        st.className = `badge status-${ticket.status}`;
        st.textContent = statusLabels[ticket.status];

        const pr = document.createElement('span');
        pr.className = `badge priority-${ticket.priority}`;
        pr.textContent = ticket.priority.toUpperCase();

        meta.appendChild(idS);
        meta.appendChild(st);
        meta.appendChild(pr);
    }

    function renderPanelBody(ticket, messages) {
        const body = document.getElementById('admin-modal-body');
        body.innerHTML = '';

        // ── Details section
        const details = document.createElement('div');
        details.className = 'adm-ticket-details';

        const grid = document.createElement('div');
        grid.className = 'adm-details-grid';

        const fields = [
            [t('admin_field_user'),     ticket.user_username || '—'],
            [t('admin_field_created'),  new Date(ticket.created_at).toLocaleString('ru-RU')],
            [t('admin_field_assigned'), ticket.assigned_admin_username || '—']
        ];

        fields.forEach(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'adm-detail-item';
            item.innerHTML = `<span class="adm-detail-label">${label}</span><span class="adm-detail-value">${escapeHtml(String(value))}</span>`;
            grid.appendChild(item);
        });

        // ── Actions
        const actions = document.createElement('div');
        actions.className = 'adm-actions';

        // Status
        const statusGroup = makeActionGroup(t('admin_action_status'), [
            { label: t('status_open'),     key: 'status', val: 'open',        active: ticket.status === 'open' },
            { label: t('status_progress'), key: 'status', val: 'in_progress', active: ticket.status === 'in_progress' },
            { label: t('status_closed'),   key: 'status', val: 'closed',      active: ticket.status === 'closed' }
        ]);

        // Priority
        const priorityGroup = makeActionGroup(t('admin_action_priority'), [
            { label: '● ' + t('cfg_prio_normal'), key: 'priority', val: 'normal',  active: ticket.priority === 'normal',  attr: 'data-priority=normal' },
            { label: '● ' + t('cfg_prio_high'),   key: 'priority', val: 'high',    active: ticket.priority === 'high',    attr: 'data-priority=high' },
            { label: '● ' + t('cfg_prio_urgent'), key: 'priority', val: 'urgent',  active: ticket.priority === 'urgent',  attr: 'data-priority=urgent' }
        ]);

        // Assign
        const assignBtn = document.createElement('button');
        assignBtn.className = 'adm-assign-btn';
        assignBtn.id = 'adm-assign-btn';
        assignBtn.textContent = ticket.assigned_admin_id === user.id ? t('admin_btn_unassign') : t('admin_btn_assign');
        assignBtn.addEventListener('click', toggleAssign);

        actions.appendChild(statusGroup);
        actions.appendChild(priorityGroup);
        actions.appendChild(assignBtn);

        details.appendChild(grid);
        details.appendChild(actions);
        body.appendChild(details);

        // ── Messages
        const msgsSection = document.createElement('div');
        msgsSection.className = 'adm-messages-section';

        const msgsLabel = document.createElement('div');
        msgsLabel.className = 'adm-messages-label';
        msgsLabel.textContent = t('admin_messages');

        const msgsList = document.createElement('div');
        msgsList.className = 'adm-messages-list';
        msgsList.id = 'adm-messages-list';

        messages.forEach(msg => msgsList.appendChild(makeMessageEl(msg)));

        msgsSection.appendChild(msgsLabel);
        msgsSection.appendChild(msgsList);
        body.appendChild(msgsSection);

        // ── Reply form
        if (ticket.status !== 'closed') {
            const replyForm = document.createElement('div');
            replyForm.className = 'adm-reply-form';

            const ta = document.createElement('textarea');
            ta.className = 'adm-reply-textarea';
            ta.id = 'adm-reply-content';
            ta.placeholder = t('admin_reply_ph');
            ta.maxLength = 5000;

            const sendBtn = document.createElement('button');
            sendBtn.className = 'btn btn-primary';
            sendBtn.style.cssText = 'width:100%;justify-content:center;';
            sendBtn.textContent = t('admin_reply_btn');

            sendBtn.addEventListener('click', async () => {
                const content = ta.value.trim();
                if (!content) return;
                if (content.length > 5000) { showToastMsg(t('ticket_max_chars'), 'error'); return; }
                sendBtn.disabled = true;
                sendBtn.textContent = t('btn_sending');
                try {
                    await API.replyToTicket(currentTicket.id, content);
                    ta.value = '';
                    const data = await API.getTicket(currentTicket.id);
                    if (data && data.messages) {
                        const list = document.getElementById('adm-messages-list');
                        if (list) {
                            list.innerHTML = '';
                            data.messages.forEach(m => list.appendChild(makeMessageEl(m)));
                            list.scrollTop = list.scrollHeight;
                        }
                    }
                } catch (err) {
                    showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
                } finally {
                    sendBtn.disabled = false;
                    sendBtn.textContent = t('admin_reply_btn');
                }
            });

            replyForm.appendChild(ta);
            replyForm.appendChild(sendBtn);
            body.appendChild(replyForm);
        }

        // Scroll messages to bottom
        setTimeout(() => {
            const list = document.getElementById('adm-messages-list');
            if (list) list.scrollTop = list.scrollHeight;
        }, 50);
    }

    function makeActionGroup(labelText, buttons) {
        const group = document.createElement('div');
        group.className = 'adm-action-group';

        const label = document.createElement('div');
        label.className = 'adm-action-label';
        label.textContent = labelText;

        const btns = document.createElement('div');
        btns.className = 'adm-action-btns';

        buttons.forEach(({ label: btnLabel, key, val, active, attr }) => {
            const btn = document.createElement('button');
            btn.className = `adm-action-btn${active ? ' btn-active' : ''}`;
            btn.dataset[key === 'status' ? 'status' : 'priority'] = val;
            btn.textContent = btnLabel;
            if (attr) {
                const [k, v] = attr.split('=');
                btn.setAttribute(k, v);
            }
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

        const meta = document.createElement('div');
        meta.className = 'adm-msg-meta';

        const author = document.createElement('span');
        author.className = 'adm-msg-author';
        author.textContent = msg.username || '—';

        const time = document.createElement('span');
        time.textContent = new Date(msg.created_at).toLocaleString('ru-RU');

        meta.appendChild(author);
        meta.appendChild(time);

        const body = document.createElement('div');
        body.className = 'adm-msg-body';
        body.textContent = msg.content;

        wrap.appendChild(meta);
        wrap.appendChild(body);
        return wrap;
    }

    function appendMessageToPanel(msg) {
        const list = document.getElementById('adm-messages-list');
        if (!list) return;
        list.appendChild(makeMessageEl(msg));
        list.scrollTop = list.scrollHeight;
    }

    function refreshPanelMeta() {
        if (!currentTicket) return;
        renderPanelHeader(currentTicket);
        // Update active buttons
        document.querySelectorAll('[data-status]').forEach(btn => {
            btn.classList.toggle('btn-active', btn.dataset.status === currentTicket.status);
        });
        document.querySelectorAll('[data-priority]').forEach(btn => {
            btn.classList.toggle('btn-active', btn.dataset.priority === currentTicket.priority);
        });
        const ab = document.getElementById('adm-assign-btn');
        if (ab) ab.textContent = currentTicket.assigned_admin_id === user.id ? t('admin_btn_unassign') : t('admin_btn_assign');
    }

    async function updateTicketField(field, value, clickedBtn) {
        if (!currentTicket) return;
        if (currentTicket[field] === value) return;

        const prevValue = currentTicket[field];

        // Optimistic UI
        const selector = field === 'status' ? '[data-status]' : '[data-priority]';
        document.querySelectorAll(selector).forEach(b => b.classList.remove('btn-active'));
        clickedBtn.classList.add('btn-active');
        currentTicket[field] = value;

        try {
            await API.updateTicket(currentTicket.id, { [field]: value });
            renderPanelHeader(currentTicket);
            renderTickets();
        } catch (err) {
            // Rollback
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

    // ── Close panel ────────────────────────
    function closePanel() {
        document.getElementById('adm-panel').classList.remove('open');
        document.getElementById('adm-panel-overlay').classList.remove('active');
        document.querySelectorAll('#tickets-tbody tr').forEach(r => r.classList.remove('row-active'));
        currentTicket = null;
    }

    // ── Filters ────────────────────────────
    function setupFilters() {
        document.querySelectorAll('.adm-filter-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                document.querySelectorAll('.adm-filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const f = tab.dataset.filter;
                filters = f === 'all' ? {} : f === 'mine' ? { assigned_to_me: true } : { status: f };
                await loadTickets();
            });
        });
    }

    // ── Search ─────────────────────────────
    function setupSearch() {
        let timer;
        const box = document.getElementById('search-box');
        if (!box) return;
        box.addEventListener('input', e => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const q = e.target.value.toLowerCase();
                document.querySelectorAll('#tickets-tbody tr').forEach(r => {
                    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
                });
                document.querySelectorAll('.adm-ticket-card').forEach(c => {
                    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
                });
            }, 250);
        });
    }

    // ── Toast ──────────────────────────────
    function showToastMsg(msg, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const t = document.createElement('div');
        t.className = 'adm-toast';
        t.textContent = msg;
        if (type === 'error') t.style.borderColor = 'rgba(255,51,51,0.3)';
        container.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 350);
        }, 3500);
    }

    // Override global toast for admin page
    window.showSuccess = msg => showToastMsg(msg, 'success');
    window.showError   = msg => showToastMsg(msg, 'error');

    // ── Helpers ────────────────────────────
    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── Section switching ──────────────────
    let currentSection = 'tickets';

    function setupSectionSwitching() {
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const section = link.dataset.section;
                switchSection(section);
            });
        });
    }

    function switchSection(section) {
        currentSection = section;
        document.querySelectorAll('[data-section]').forEach(l => l.classList.toggle('active', l.dataset.section === section));

        // Tickets section
        const isTickets = section === 'tickets';
        document.querySelector('.stats-bar').style.display = isTickets ? '' : 'none';
        document.querySelector('.admin-controls').style.display = isTickets ? '' : 'none';
        document.querySelector('.adm-table-wrap').style.display = isTickets ? '' : 'none';
        document.querySelector('.tickets-cards').style.display = isTickets ? '' : 'none';
        document.getElementById('loading').style.display = isTickets ? 'none' : 'none';

        // Promo section
        document.getElementById('promo-section').style.display = section === 'promo' ? '' : 'none';

        if (section === 'promo') {
            loadPromoCodes();
        }
    }

    // ── Promo codes ────────────────────────
    let currentPromoTbody = null;
    let promoEditId = null;

    async function loadPromoCodes() {
        const tbody = document.getElementById('promo-tbody');
        const empty = document.getElementById('promo-empty');
        if (!tbody) return;
        if (empty) empty.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="6" style="padding:2rem;text-align:center;color:rgba(255,255,255,.3)">Ładowanie…</td></tr>';

        try {
            const data = await API.adminListPromoCodes();
            if (!data || !Array.isArray(data.promoCodes)) throw new Error('Invalid response');

            tbody.innerHTML = '';
            if (data.promoCodes.length === 0) {
                if (empty) empty.style.display = '';
                return;
            }

            data.promoCodes.forEach(pc => {
                const tr = document.createElement('tr');
                const isActive = pc.is_active;
                const uses = pc.use_count || 0;
                const limit = pc.max_uses !== null ? pc.max_uses : '∞';

                tr.innerHTML = `
                    <td class="td-id" style="font-family:var(--font-mono);font-weight:600;">${escapeHtml(pc.code)}</td>
                    <td>${escapeHtml(pc.description || '—')}</td>
                    <td>${uses}</td>
                    <td>${limit}</td>
                    <td><span class="badge ${isActive ? 'status-open' : 'status-closed'}">${isActive ? t('promo_yes') : t('promo_no')}</span></td>
                    <td>
                        <div style="display:flex;gap:var(--sp-2);">
                            <button class="btn btn-ghost promo-edit-btn" data-id="${pc.id}" style="padding:var(--sp-1) var(--sp-3);font-size:var(--text-xs);">${t('promo_btn_save')}</button>
                            <button class="btn btn-ghost promo-delete-btn" data-id="${pc.id}" style="padding:var(--sp-1) var(--sp-3);font-size:var(--text-xs);color:var(--accent-urgent);">${pc.use_count > 0 ? t('promo_btn_deactivate') : t('promo_btn_delete')}</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Attach event listeners
            tbody.querySelectorAll('.promo-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => openPromoEdit(parseInt(btn.dataset.id)));
            });
            tbody.querySelectorAll('.promo-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deletePromoCode(parseInt(btn.dataset.id)));
            });

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--accent-urgent);">${t('tickets_load_error')}: ${escapeHtml(err.message)}</td></tr>`;
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
        promoEditId = id;
        // Fetch promo data
        API.adminGetPromoCode(id).then(data => {
            if (!data || !data.promoCode) throw new Error('Not found');
            const pc = data.promoCode;
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
        }).catch(err => {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        });
    }

    async function deletePromoCode(id) {
        if (!confirm(t('promo_confirm_delete'))) return;
        try {
            const data = await API.adminDeletePromoCode(id);
            if (data && data.deactivated) {
                showToastMsg(t('promo_deleted'), 'success');
            } else {
                showToastMsg(t('promo_deleted'), 'success');
            }
            await loadPromoCodes();
        } catch (err) {
            showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
        }
    }

    function setupPromoForm() {
        document.getElementById('promo-form').addEventListener('submit', async e => {
            e.preventDefault();

            const code = document.getElementById('promo-form-code').value.trim();
            if (!code) { showToastMsg(t('promo_form_code') + ' ' + t('val_min3'), 'error'); return; }

            const editId = document.getElementById('promo-edit-id').value;

            try {
                if (editId) {
                    // Update
                    await API.adminUpdatePromoCode(parseInt(editId), {
                        description: document.getElementById('promo-form-desc').value.trim() || undefined,
                        isActive: document.getElementById('promo-form-active').checked,
                        maxUses: document.getElementById('promo-form-max-uses').value ? parseInt(document.getElementById('promo-form-max-uses').value) : null
                    });
                    showToastMsg(t('promo_updated'), 'success');
                } else {
                    // Create
                    await API.adminCreatePromoCode({
                        code: code,
                        description: document.getElementById('promo-form-desc').value.trim() || undefined,
                        discountPercent: parseFloat(document.getElementById('promo-form-discount').value) || 10,
                        isFreeMini: document.getElementById('promo-form-free-mini').checked,
                        maxUses: document.getElementById('promo-form-max-uses').value ? parseInt(document.getElementById('promo-form-max-uses').value) : null
                    });
                    showToastMsg(t('promo_created'), 'success');
                }

                document.getElementById('promo-modal').classList.remove('active');
                resetPromoForm();
                await loadPromoCodes();
            } catch (err) {
                showToastMsg(t('tickets_load_error') + ': ' + err.message, 'error');
            }
        });
    }

    function setupPromoModal() {
        // New promo button
        document.getElementById('promo-new-btn').addEventListener('click', () => {
            resetPromoForm();
            document.getElementById('promo-modal').classList.add('active');
        });

        // Close modal
        document.getElementById('promo-modal-close').addEventListener('click', () => {
            document.getElementById('promo-modal').classList.remove('active');
            resetPromoForm();
        });

        document.getElementById('promo-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('promo-modal')) {
                document.getElementById('promo-modal').classList.remove('active');
                resetPromoForm();
            }
        });
    }

    // ── Init ───────────────────────────────
    async function init() {
        try {
            user = await checkAuth();
            if (!user) { window.location.href = '../auth.html'; return; }
            if (!user.isAdmin) { window.location.href = '../tickets.html'; return; }

            setText('admin-username', user.username || 'Admin');

            await loadStats();
            await loadTickets();
            initSSE();
            setupFilters();
            setupSearch();
            setupSectionSwitching();
            setupPromoForm();
            setupPromoModal();

            // Logout
            document.getElementById('logout-btn').addEventListener('click', async () => {
                try { await API.logout(); } catch (_) {}
                logout();
            });

            // Panel close
            document.getElementById('adm-panel-close').addEventListener('click', closePanel);
            document.getElementById('adm-panel-overlay').addEventListener('click', closePanel);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && document.getElementById('adm-panel').classList.contains('open')) closePanel();
            });

        } catch (err) {
            console.error('Init error:', err);
        }
    }

    return { init, openTicket, closeModal: closePanel };
})();

Dashboard.init();
window.closeModal = Dashboard.closeModal;
