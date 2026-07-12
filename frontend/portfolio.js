(function () {
    'use strict';

    function escapeHtml(t) {
        if (!t) return '';
        return String(t).replace(/[&<>"']/g, m =>
            ({'&':'&','<':'<','>':'>','"':'"',"'":'&#039;'}[m]));
    }

    function _t(key, params) {
        var fn = (typeof window.t === 'function') ? window.t : function(k) { return k; };
        return fn(key, params);
    }

    var planLabels = {
        mini:     'Mini',
        miniplus: 'Mini+',
        standard: 'Standard',
        max:      'Max',
        custom:   'Custom'
    };

    // ============================================
    // PROJECT DATA
    // ============================================
    var mockData = {
        mini: [
            {
                id: 'mini-review',
                title: 'Mini-review',
                desc: 'Mini review — бот, созданный нашей командой для демонстрации работы в ценовой категории Mini.',
                features: [
                    'Мультиязычность: переключение языков (RU, PL, ENG)',
                    'Рандомайзер сайтов: случайный подбор веб-ресурсов',
                    'Генератор фраз: создание случайных предложений из заданного набора слов',
                    'Интеграция: быстрый переход на наш официальный сайт'
                ],
                lang: 'RU/PL/ENG',
                term: '20 минут',
                price: '$1–2',
                botUrl: 'https://t.me/@Mini_review_bot',
                sourcesUrl: 'https://example.com/mini-review-sources.zip', // TODO: replace with real link
                screenshots: [
                    { src: 'images/Mini-review/1.png', alt: 'Mini-review bot screenshot 1' },
                    { src: 'images/Mini-review/2.png', alt: 'Mini-review bot screenshot 2' },
                    { src: 'images/Mini-review/3.png', alt: 'Mini-review bot screenshot 3' },
                    { src: 'images/Mini-review/4.png', alt: 'Mini-review bot screenshot 4' },
                    { src: 'images/Mini-review/5.png', alt: 'Mini-review bot screenshot 5' },
                    { src: 'images/Mini-review/6.png', alt: 'Mini-review bot screenshot 6' },
                    { src: 'images/Mini-review/7.png', alt: 'Mini-review bot screenshot 7' }
                ]
            }
        ],
        miniplus: [],
        standard: [],
        max: [],
        custom: []
    };

    var allItems = (function () {
        var res = [];
        Object.keys(mockData).forEach(function (plan) {
            mockData[plan].forEach(function (item) {
                res.push(Object.assign({}, item, { plan: plan }));
            });
        });
        return res;
    })();

    var currentPlan = 'all';
    var currentModalItem = null;

    function getItems(plan) {
        if (plan === 'all') return allItems;
        return mockData[plan] ? mockData[plan].map(function (i) {
            return Object.assign({}, i, { plan: plan });
        }) : [];
    }

    function render(plan) {
        var list = document.getElementById('pf-list');
        if (!list) return;
        list.innerHTML = '';

        var items = getItems(plan);

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
            left.innerHTML = `
                <span class="pcr-num">${String(idx + 1).padStart(2, '0')}</span>
                <span class="badge priority-normal">${escapeHtml(planLabels[item.plan] || item.plan)}</span>
            `;

            // Center
            var center = document.createElement('div');
            center.className = 'pcr-center';
            var title = document.createElement('span');
            title.className = 'pcr-title';
            title.textContent = item.title;
            var desc = document.createElement('span');
            desc.className = 'pcr-desc';
            desc.textContent = item.desc;
            center.appendChild(title);
            center.appendChild(desc);

            // Right
            var right = document.createElement('div');
            right.className = 'pcr-right';

            var metaLang = makeMeta(_t('pf_modal_lang'), item.lang);
            var metaTerm = makeMeta(_t('pf_modal_term'), item.term);
            var metaPrice = makeMeta(_t('pf_modal_price'), item.price);
            var arrow = document.createElement('span');
            arrow.className = 'pcr-arrow';
            arrow.textContent = '→';

            right.appendChild(metaLang);
            right.appendChild(metaTerm);
            right.appendChild(metaPrice);
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

    function makeMeta(key, val) {
        var div = document.createElement('div');
        div.className = 'pcr-meta';
        div.innerHTML = `<span class="pcr-meta-key">${escapeHtml(key)}</span><span class="pcr-meta-val">${escapeHtml(val)}</span>`;
        return div;
    }

    function openModal(item) {
        var modal   = document.getElementById('pf-modal');
        var content = document.getElementById('pf-modal-content');
        if (!modal || !content) return;

        currentModalItem = item;

        // Clear old content (keep close button)
        var closeBtn = document.getElementById('pf-modal-close');
        content.innerHTML = '';
        content.appendChild(closeBtn);

        // Header
        var header = document.createElement('div');
        header.className = 'pf-modal-header';
        header.innerHTML = '<h2 class="pf-modal-title">' + escapeHtml(item.title) + '</h2>';

        var meta = document.createElement('div');
        meta.className = 'pf-modal-meta';
        var metaPairs = [
            [_t('pf_modal_package'), planLabels[item.plan]],
            [_t('pf_modal_lang'), item.lang],
            [_t('pf_modal_term'), item.term],
            [_t('pf_modal_price'), item.price]
        ];
        metaPairs.forEach(function (pair) {
            var div = document.createElement('div');
            div.className = 'pmm-item';
            div.innerHTML = '<span class="pmm-label">' + escapeHtml(pair[0]) + '</span><span class="pmm-value">' + escapeHtml(pair[1]) + '</span>';
            meta.appendChild(div);
        });

        header.appendChild(meta);
        content.appendChild(header);

        // Body
        var body = document.createElement('div');
        body.className = 'pf-modal-body';

        // Right column: description, features, screenshots, actions (all in one column)
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
        var features = document.createElement('div');
        features.className = 'pf-modal-features';
        var fTitle = document.createElement('h4');
        fTitle.textContent = _t('pf_modal_features');
        var ul = document.createElement('ul');
        (item.features || []).forEach(function (f) {
            var li = document.createElement('li');
            li.textContent = f;
            ul.appendChild(li);
        });
        features.appendChild(fTitle);
        features.appendChild(ul);

        // Screenshots
        var screenshotsDiv = document.createElement('div');
        screenshotsDiv.className = 'pf-modal-screenshots';
        var screenshotList = document.createElement('ul');
        screenshotList.className = 'pms-list';

        if (item.screenshots && item.screenshots.length > 0) {
            item.screenshots.forEach(function (s, idx) {
                var li = document.createElement('li');
                li.className = 'pms-item' + (idx === 0 ? ' active' : '');
                li.innerHTML = '<img src="' + escapeHtml(s.src) + '" alt="' + escapeHtml(s.alt) + '">';
                screenshotList.appendChild(li);
            });

            // Navigation buttons
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

            // Current indicator
            var indicator = document.createElement('div');
            indicator.className = 'pms-indicator';
            indicator.textContent = '1 / ' + item.screenshots.length;

            screenshotsDiv.appendChild(screenshotList);
            screenshotsDiv.appendChild(navDiv);
            screenshotsDiv.appendChild(indicator);

            // Add slider navigation logic
            var currentIdx = 0;
            function updateSlider() {
                var items = screenshotList.querySelectorAll('.pms-item');
                items.forEach(function(li, i) {
                    li.classList.toggle('active', i === currentIdx);
                });
                indicator.textContent = (currentIdx + 1) + ' / ' + items.length;
            }

            prevBtn.addEventListener('click', function() {
                var total = screenshotList.querySelectorAll('.pms-item').length;
                currentIdx = (currentIdx - 1 + total) % total;
                updateSlider();
            });

            nextBtn.addEventListener('click', function() {
                var total = screenshotList.querySelectorAll('.pms-item').length;
                currentIdx = (currentIdx + 1) % total;
                updateSlider();
            });
        }

        // Action buttons
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'pf-modal-actions';

        var btnBot = document.createElement('a');
        btnBot.className = 'btn btn-primary';
        btnBot.href = item.botUrl;
        btnBot.target = '_blank';
        btnBot.textContent = '→ Go to bot';

        var btnDownload = document.createElement('a');
        btnDownload.className = 'btn btn-ghost';
        btnDownload.href = item.sourcesUrl || '#';
        btnDownload.target = '_blank';
        btnDownload.textContent = 'Download source code';

        if (item.sourcesUrl === 'https://example.com/mini-review-sources.zip') {
            btnDownload.title = 'Placeholder - sources link will be added later';
        }

        actionsDiv.appendChild(btnBot);
        actionsDiv.appendChild(btnDownload);

        // Append all to right column in correct order
        rightCol.appendChild(descDiv);
        rightCol.appendChild(features);
        rightCol.appendChild(screenshotsDiv);
        rightCol.appendChild(actionsDiv);

        body.appendChild(rightCol);
        content.appendChild(body);

        modal.classList.add('active');
        closeBtn.focus();
    }

    function closeModal() {
        var modal = document.getElementById('pf-modal');
        if (modal) {
            modal.classList.remove('active');
            currentModalItem = null;
        }
    }

    function reRender() {
        render(currentPlan);
    }

    function init() {
        render('all');

        // Filters
        document.querySelectorAll('.pf-filter-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.pf-filter-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentPlan = btn.dataset.plan;
                render(currentPlan);
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

        // Re-render on language change
        window.addEventListener('langchange', reRender);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
