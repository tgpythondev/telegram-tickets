(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────────────────
    function escapeHtml(t) {
        if (!t) return '';
        return String(t).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    function getCurrentLang() {
        if (typeof I18n !== 'undefined' && typeof I18n.getLang === 'function') {
            return I18n.getLang();
        }
        // fallback: read from localStorage directly
        var STORAGE_KEY = 'kaliang_lang';
        var saved = localStorage.getItem(STORAGE_KEY);
        return (saved && ['ru','pl','en'].indexOf(saved) !== -1) ? saved : 'ru';
    }

    function isSafeUrl(url) {
        if (!url) return false;
        try {
            var u = new URL(url);
            return u.protocol === 'https:' || u.protocol === 'http:';
        } catch (_) { return false; }
    }

    function _t(key) {
        return (typeof window.t === 'function') ? window.t(key) : key;
    }

    var planLabels = {
        mini:     'Mini',
        miniplus: 'Mini+',
        standard: 'Standard',
        max:      'Max',
        custom:   'Custom'
    };

    // ── State ─────────────────────────────────────────────────────────────────
    var allItems        = [];   // raw from API
    var currentPlan     = 'all';
    var currentPlatform = 'all';
    var isLoading       = false;

    // ── Normalize API row → internal item ────────────────────────────────────
    function normalize(row) {
        var screenshots = [];
        if (Array.isArray(row.screenshots)) {
            screenshots = row.screenshots.map(function (s) {
                if (typeof s === 'string') return { src: s, alt: row.title };
                return { src: s.src || '', alt: s.alt || row.title };
            });
        }

        // Pick description by current language
        var lang = getCurrentLang();
        var desc = row['description_' + lang] || row.description_ru || row.description_pl || row.description_en || '';

        return {
            id:          row.id,
            title:       row.title         || '',
            desc:        desc,
            descRu:      row.description_ru || '',
            descPl:      row.description_pl || '',
            descEn:      row.description_en || '',
            platform:    row.platform       || 'telegram',
            plan:        row.plan           || 'mini',
            lang:        row.lang           || null,
            price:       row.price          || null,
            term:        row.term           || null,
            botUrl:      row.bot_url        || null,
            sourcesUrl:  row.source_url     || null,
            screenshots: screenshots
        };
    }

    // ── Filter ────────────────────────────────────────────────────────────────
    function getItems(plan, platform) {
        return allItems.filter(function (item) {
            var planOk     = (plan     === 'all' || item.plan     === plan);
            var platformOk = (platform === 'all' || item.platform === platform);
            return planOk && platformOk;
        });
    }

    // ── Loading state helpers ─────────────────────────────────────────────────
    function showListLoading() {
        var list = document.getElementById('pf-list');
        if (!list) return;
        list.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'pf-loading';
        wrap.innerHTML = '<div class="pf-loading-spinner"></div>';
        list.appendChild(wrap);
    }

    function showListError(msg) {
        var list = document.getElementById('pf-list');
        if (!list) return;
        list.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'pf-empty';
        wrap.innerHTML =
            '<div class="pf-empty-icon">⚠</div>' +
            '<div class="pf-empty-title">' + escapeHtml(msg) + '</div>';
        list.appendChild(wrap);
    }

    // ── Render list ───────────────────────────────────────────────────────────
    function render(plan, platform) {
        var list = document.getElementById('pf-list');
        if (!list) return;
        list.innerHTML = '';

        var items = getItems(plan, platform);

        if (items.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'pf-empty';

            var emptyIcon = document.createElement('div');
            emptyIcon.className = 'pf-empty-icon';
            emptyIcon.textContent = '⬡';

            var emptyTitle = document.createElement('div');
            emptyTitle.className = 'pf-empty-title';
            emptyTitle.textContent = _t('pf_empty_title');

            var emptySub = document.createElement('div');
            emptySub.className = 'pf-empty-sub';
            emptySub.textContent = _t('pf_empty_sub');

            empty.appendChild(emptyIcon);
            empty.appendChild(emptyTitle);
            empty.appendChild(emptySub);
            list.appendChild(empty);
            return;
        }

        var grid = document.createElement('div');
        grid.className = 'pf-grid';
        list.appendChild(grid);

        items.forEach(function (item, idx) {
            var card = document.createElement('article');
            card.className = 'pf-card pf-card--' + (item.platform || 'telegram');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', 'Open ' + item.title + ' details');
            card.style.setProperty('--pf-delay', (idx % 9) * 60 + 'ms');

            // ── Preview (screenshot or fallback) ──
            var media = document.createElement('div');
            media.className = 'pf-card-media';

            var cover = (item.screenshots && item.screenshots.length && isSafeUrl(item.screenshots[0].src))
                ? item.screenshots[0].src : '';

            if (cover) {
                var img = document.createElement('img');
                img.className = 'pf-card-img';
                img.src = cover;
                img.alt = item.title;
                img.loading = 'lazy';
                img.onerror = function () {
                    media.classList.add('pf-card-media--empty');
                    img.remove();
                };
                media.appendChild(img);
            } else {
                media.classList.add('pf-card-media--empty');
                media.innerHTML = '<span class="pf-card-media-mark">&#9187;</span>';
            }

            // shots count badge
            if (item.screenshots && item.screenshots.length > 1) {
                var shots = document.createElement('span');
                shots.className = 'pf-card-shots';
                shots.textContent = '\uD83D\uDDBC ' + item.screenshots.length;
                media.appendChild(shots);
            }

            // platform badge (top-left over media)
            var plat = document.createElement('span');
            plat.className = 'pf-card-platform pf-card-platform--' + (item.platform || 'telegram');
            plat.textContent = (item.platform === 'discord') ? 'Discord' : 'Telegram';
            media.appendChild(plat);

            // hover overlay
            var overlay = document.createElement('span');
            overlay.className = 'pf-card-overlay';
            overlay.innerHTML = '<span class="pf-card-overlay-btn">' + escapeHtml(_t('pf_card_view') || 'View') + ' &rarr;</span>';
            media.appendChild(overlay);

            // ── Body ──
            var bodyEl = document.createElement('div');
            bodyEl.className = 'pf-card-body';

            var head = document.createElement('div');
            head.className = 'pf-card-head';
            head.innerHTML =
                '<span class="badge priority-normal pf-card-plan">' + escapeHtml(planLabels[item.plan] || item.plan) + '</span>' +
                (item.lang ? '<span class="pf-card-lang">' + escapeHtml(item.lang) + '</span>' : '');

            var titleEl = document.createElement('h3');
            titleEl.className = 'pf-card-title';
            titleEl.textContent = item.title;

            var desc = document.createElement('p');
            desc.className = 'pf-card-desc';
            desc.textContent = item.desc;

            var foot = document.createElement('div');
            foot.className = 'pf-card-foot';
            foot.innerHTML =
                '<span class="pf-card-foot-item"><span class="pf-card-foot-key">' + escapeHtml(_t('pf_modal_term') || 'Term') + '</span><span class="pf-card-foot-val">' + escapeHtml(item.term || '—') + '</span></span>' +
                '<span class="pf-card-price">' + escapeHtml(item.price || '—') + '</span>';

            bodyEl.appendChild(head);
            bodyEl.appendChild(titleEl);
            bodyEl.appendChild(desc);
            bodyEl.appendChild(foot);

            card.appendChild(media);
            card.appendChild(bodyEl);

            card.addEventListener('click', function () { openModal(item); });
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(item);
                }
            });

            grid.appendChild(card);
        });
    }

    // ── Modal ─────────────────────────────────────────────────────────────────
    function openModal(item) {
        var modal   = document.getElementById('pf-modal');
        var content = document.getElementById('pf-modal-content');
        if (!modal || !content) return;

        var closeBtn = document.getElementById('pf-modal-close');
        content.innerHTML = '';
        content.appendChild(closeBtn);

        // Header
        var header = document.createElement('div');
        header.className = 'pf-modal-header';
        header.innerHTML = '<h2 class="pf-modal-title">' + escapeHtml(item.title) + '</h2>';

        var meta = document.createElement('div');
        meta.className = 'pf-modal-meta';
        [
            [_t('pf_modal_package'), planLabels[item.plan] || item.plan],
            [_t('pf_modal_lang'),    item.lang],
            [_t('pf_modal_term'),    item.term],
            [_t('pf_modal_price'),   item.price]
        ].forEach(function (pair) {
            if (!pair[1]) return;
            var div = document.createElement('div');
            div.className = 'pmm-item';
            div.innerHTML =
                '<span class="pmm-label">' + escapeHtml(pair[0]) + '</span>' +
                '<span class="pmm-value">' + escapeHtml(pair[1]) + '</span>';
            meta.appendChild(div);
        });

        header.appendChild(meta);
        content.appendChild(header);

        // Body
        var body    = document.createElement('div');
        body.className = 'pf-modal-body';
        var rightCol = document.createElement('div');
        rightCol.className = 'pf-modal-right';

        // ── Screenshot gallery ──
        var shots = (item.screenshots || []).filter(function (s) { return isSafeUrl(s.src); });
        if (shots.length) {
            var gallery = document.createElement('div');
            gallery.className = 'pf-modal-screenshots';
            var ul = document.createElement('ul');
            ul.className = 'pms-list';
            shots.forEach(function (s, i) {
                var li = document.createElement('li');
                li.className = 'pms-item' + (i === 0 ? ' active' : '');
                var im = document.createElement('img');
                im.src = s.src;
                im.alt = s.alt || item.title;
                im.loading = 'lazy';
                li.appendChild(im);
                ul.appendChild(li);
            });
            gallery.appendChild(ul);
            if (shots.length > 1) {
                var cur = 0;
                var indicator = document.createElement('div');
                indicator.className = 'pms-indicator';
                indicator.textContent = '1 / ' + shots.length;
                var nav = document.createElement('div');
                nav.className = 'pms-nav';
                var prev = document.createElement('button');
                prev.className = 'pms-btn';
                prev.type = 'button';
                prev.innerHTML = '&larr;';
                var next = document.createElement('button');
                next.className = 'pms-btn';
                next.type = 'button';
                next.innerHTML = '&rarr;';
                var showShot = function (idx) {
                    var lis = ul.querySelectorAll('.pms-item');
                    cur = (idx + shots.length) % shots.length;
                    lis.forEach(function (el, i) { el.classList.toggle('active', i === cur); });
                    indicator.textContent = (cur + 1) + ' / ' + shots.length;
                };
                prev.addEventListener('click', function () { showShot(cur - 1); });
                next.addEventListener('click', function () { showShot(cur + 1); });
                nav.appendChild(prev);
                nav.appendChild(indicator);
                nav.appendChild(next);
                gallery.appendChild(nav);
            }
            rightCol.appendChild(gallery);
        }

        // Description
        var descDiv = document.createElement('div');
        descDiv.className = 'pf-modal-desc';
        var dTitle = document.createElement('h4');
        dTitle.textContent = _t('pf_modal_desc');
        descDiv.appendChild(dTitle);

        // Рендерим каждую строку как отдельный <p> чтобы сохранить форматирование
        var descText = item.desc || '';
        descText.split('\n').forEach(function (line) {
            var p = document.createElement('p');
            p.textContent = line;
            if (!line.trim()) {
                p.style.marginTop = '0.4em';
            }
            descDiv.appendChild(p);
        });

        // Action buttons
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'pf-modal-actions';

        if (isSafeUrl(item.botUrl)) {
            var btnBot = document.createElement('a');
            btnBot.className = 'btn btn-primary';
            btnBot.href      = item.botUrl;
            btnBot.target    = '_blank';
            btnBot.rel       = 'noopener noreferrer';
            btnBot.textContent = _t('pf_btn_go_bot');
            actionsDiv.appendChild(btnBot);
        }

        if (isSafeUrl(item.sourcesUrl)) {
            var btnDownload = document.createElement('a');
            btnDownload.className  = 'btn btn-ghost';
            btnDownload.href       = item.sourcesUrl;
            btnDownload.target     = '_blank';
            btnDownload.rel        = 'noopener noreferrer';
            btnDownload.textContent = _t('pf_btn_download');
            actionsDiv.appendChild(btnDownload);
        }

        rightCol.appendChild(descDiv);
        rightCol.appendChild(actionsDiv);

        body.appendChild(rightCol);
        content.appendChild(body);

        modal.classList.add('active');
        if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
        var modal = document.getElementById('pf-modal');
        if (modal) modal.classList.remove('active');
    }

    // ── Load from API ─────────────────────────────────────────────────────────
    function loadProjects() {
        if (isLoading) return;
        isLoading = true;
        showListLoading();

        // API.getPortfolioProjects is defined in api.js
        var promise;
        if (typeof API !== 'undefined' && typeof API.getPortfolioProjects === 'function') {
            promise = API.getPortfolioProjects();
        } else {
            promise = Promise.reject(new Error('API not available'));
        }

        promise
            .then(function (data) {
                isLoading = false;
                if (!data || !Array.isArray(data.projects)) throw new Error('Invalid response');
                allItems = data.projects.map(normalize);
                render(currentPlan, currentPlatform);
            })
            .catch(function (err) {
                isLoading = false;
                console.error('[Portfolio] load error:', err);
                showListError(_t('pf_empty_title'));
            });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        loadProjects();

        // Platform picker
        document.querySelectorAll('.pf-platform-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.pf-platform-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentPlatform = btn.dataset.platform;
                render(currentPlan, currentPlatform);
            });
        });

        // Plan filters
        document.querySelectorAll('.pf-filter-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.pf-filter-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentPlan = btn.dataset.plan;
                render(currentPlan, currentPlatform);
            });
        });

        // Close modal
        var closeBtn = document.getElementById('pf-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        var modal = document.getElementById('pf-modal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });

        // Re-render on language change — пересчитываем описание по новому языку
        window.addEventListener('langchange', function () {
            var lang = getCurrentLang();
            allItems = allItems.map(function (item) {
                item.desc = item['desc' + lang.charAt(0).toUpperCase() + lang.slice(1)]
                         || item.descRu || item.descPl || item.descEn || '';
                return item;
            });
            render(currentPlan, currentPlatform);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
