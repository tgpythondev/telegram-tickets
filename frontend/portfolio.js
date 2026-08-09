(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────────────────
    function escapeHtml(t) {
        if (!t) return '';
        return String(t).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
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
    // DB columns: id, title, description, platform, plan, lang, price, term,
    //             bot_url, source_url, screenshots (JSONB), features (JSONB)
    function normalize(row) {
        var screenshots = [];
        if (Array.isArray(row.screenshots)) {
            screenshots = row.screenshots.map(function (s) {
                if (typeof s === 'string') return { src: s, alt: row.title };
                return { src: s.src || '', alt: s.alt || row.title };
            });
        }

        var features = Array.isArray(row.features) ? row.features : [];

        return {
            id:          row.id,
            title:       row.title       || '',
            desc:        row.description || '',
            platform:    row.platform    || 'telegram',
            plan:        row.plan        || 'mini',
            lang:        row.lang        || null,
            price:       row.price       || null,
            term:        row.term        || null,
            botUrl:      row.bot_url     || null,
            sourcesUrl:  row.source_url  || null,
            features:    features,
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

        items.forEach(function (item, idx) {
            var row = document.createElement('div');
            row.className = 'pf-case-row';
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-label', 'Open ' + item.title + ' details');

            // Left
            var left = document.createElement('div');
            left.className = 'pcr-left';
            left.innerHTML =
                '<span class="pcr-num">' + String(idx + 1).padStart(2, '0') + '</span>' +
                '<span class="badge priority-normal">' + escapeHtml(planLabels[item.plan] || item.plan) + '</span>';

            // Center
            var center = document.createElement('div');
            center.className = 'pcr-center';

            var titleEl = document.createElement('span');
            titleEl.className = 'pcr-title';
            titleEl.textContent = item.title;

            var desc = document.createElement('span');
            desc.className = 'pcr-desc';
            desc.textContent = item.desc;

            center.appendChild(titleEl);
            center.appendChild(desc);

            // Right
            var right = document.createElement('div');
            right.className = 'pcr-right';
            right.appendChild(makeMeta(_t('pf_modal_lang'),  item.lang));
            right.appendChild(makeMeta(_t('pf_modal_term'),  item.term));
            right.appendChild(makeMeta(_t('pf_modal_price'), item.price));

            var arrow = document.createElement('span');
            arrow.className = 'pcr-arrow';
            arrow.textContent = '→';
            right.appendChild(arrow);

            row.appendChild(left);
            row.appendChild(center);
            row.appendChild(right);

            row.addEventListener('click', function () { openModal(item); });
            row.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(item);
                }
            });

            list.appendChild(row);
        });
    }

    function makeMeta(label, val) {
        var div = document.createElement('div');
        div.className = 'pcr-meta';
        div.innerHTML =
            '<span class="pcr-meta-key">'  + escapeHtml(label)       + '</span>' +
            '<span class="pcr-meta-val">'  + escapeHtml(val || '—')  + '</span>';
        return div;
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

        // Description
        var descDiv = document.createElement('div');
        descDiv.className = 'pf-modal-desc';
        var dTitle = document.createElement('h4');
        dTitle.textContent = _t('pf_modal_desc');
        var dP = document.createElement('p');
        dP.textContent = item.desc;
        descDiv.appendChild(dTitle);
        descDiv.appendChild(dP);

        // Features
        var featuresDiv = document.createElement('div');
        featuresDiv.className = 'pf-modal-features';
        if (item.features && item.features.length > 0) {
            var fTitle = document.createElement('h4');
            fTitle.textContent = _t('pf_modal_features');
            var ul = document.createElement('ul');
            item.features.forEach(function (f) {
                var li = document.createElement('li');
                li.textContent = f;
                ul.appendChild(li);
            });
            featuresDiv.appendChild(fTitle);
            featuresDiv.appendChild(ul);
        }

        // Screenshots
        var screenshotsDiv = document.createElement('div');
        screenshotsDiv.className = 'pf-modal-screenshots';

        if (item.screenshots && item.screenshots.length > 0) {
            var screenshotList = document.createElement('ul');
            screenshotList.className = 'pms-list';

            item.screenshots.forEach(function (s, i) {
                var li = document.createElement('li');
                li.className = 'pms-item' + (i === 0 ? ' active' : '');
                li.innerHTML = '<img src="' + escapeHtml(s.src) + '" alt="' + escapeHtml(s.alt || item.title) + '">';
                screenshotList.appendChild(li);
            });

            var navDiv = document.createElement('div');
            navDiv.className = 'pms-nav';

            var prevBtn = document.createElement('button');
            prevBtn.className = 'pms-btn pms-prev';
            prevBtn.innerHTML = '←';
            prevBtn.setAttribute('aria-label', 'Previous screenshot');

            var nextBtn = document.createElement('button');
            nextBtn.className = 'pms-btn pms-next';
            nextBtn.innerHTML = '→';
            nextBtn.setAttribute('aria-label', 'Next screenshot');

            navDiv.appendChild(prevBtn);
            navDiv.appendChild(nextBtn);

            var indicator = document.createElement('div');
            indicator.className = 'pms-indicator';
            indicator.textContent = '1 / ' + item.screenshots.length;

            screenshotsDiv.appendChild(screenshotList);
            screenshotsDiv.appendChild(navDiv);
            screenshotsDiv.appendChild(indicator);

            var currentIdx = 0;
            function updateSlider() {
                var slides = screenshotList.querySelectorAll('.pms-item');
                slides.forEach(function (slide, i) {
                    slide.classList.toggle('active', i === currentIdx);
                });
                indicator.textContent = (currentIdx + 1) + ' / ' + slides.length;
            }

            prevBtn.addEventListener('click', function () {
                currentIdx = (currentIdx - 1 + item.screenshots.length) % item.screenshots.length;
                updateSlider();
            });
            nextBtn.addEventListener('click', function () {
                currentIdx = (currentIdx + 1) % item.screenshots.length;
                updateSlider();
            });
        }

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
        rightCol.appendChild(featuresDiv);
        rightCol.appendChild(screenshotsDiv);
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
            // Fallback: direct fetch (no auth needed for public endpoint)
            var apiUrl = (typeof API_URL !== 'undefined') ? API_URL : 'http://localhost:3000/api';
            promise = fetch(apiUrl + '/portfolio')
                .then(function (r) { return r.json(); });
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

        // Re-render on language change (no reload needed — data is language-agnostic)
        window.addEventListener('langchange', function () {
            render(currentPlan, currentPlatform);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
