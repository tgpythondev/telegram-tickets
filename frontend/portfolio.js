(function () {
    'use strict';

    function escapeHtml(t) {
        if (!t) return '';
        return String(t).replace(/[&<>"']/g, m =>
            ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    var planLabels = {
        mini:     'Mini',
        miniplus: 'Mini+',
        standard: 'Standard',
        max:      'Max',
        custom:   'Custom'
    };

    var mockData = {
        mini: [],
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
            emptyTitle.textContent = 'Проекты скоро появятся';

            var emptySub = document.createElement('div');
            emptySub.className = 'pf-empty-sub';
            emptySub.textContent = 'Раздел пополняется по мере завершения новых работ';

            empty.appendChild(emptyIcon);
            empty.appendChild(emptyTitle);
            empty.appendChild(emptySub);
            list.appendChild(empty);
            return;
        }

        items.forEach(function (item, idx) {
            var row = document.createElement('div');
            row.className = 'pf-case-row';

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

            var metaLang = makeMeta('Язык', item.lang);
            var metaTerm = makeMeta('Срок',  item.term);
            var metaPrice = makeMeta('Цена', item.price);
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

        // Clear old content (keep close button)
        var closeBtn = document.getElementById('pf-modal-close');
        content.innerHTML = '';
        content.appendChild(closeBtn);

        // Header
        var header = document.createElement('div');
        header.className = 'pf-modal-header';
        header.innerHTML = `<h2 class="pf-modal-title">${escapeHtml(item.title)}</h2>`;

        var meta = document.createElement('div');
        meta.className = 'pf-modal-meta';
        [['Пакет', planLabels[item.plan]], ['Язык', item.lang], ['Срок', item.term], ['Цена', item.price]].forEach(function (pair) {
            var div = document.createElement('div');
            div.className = 'pmm-item';
            div.innerHTML = `<span class="pmm-label">${escapeHtml(pair[0])}</span><span class="pmm-value">${escapeHtml(pair[1])}</span>`;
            meta.appendChild(div);
        });

        header.appendChild(meta);
        content.appendChild(header);

        // Body
        var body = document.createElement('div');
        body.className = 'pf-modal-body';

        var features = document.createElement('div');
        features.className = 'pf-modal-features';
        var fTitle = document.createElement('h4');
        fTitle.textContent = 'Возможности';
        var ul = document.createElement('ul');
        (item.features || []).forEach(function (f) {
            var li = document.createElement('li');
            li.textContent = f;
            ul.appendChild(li);
        });
        features.appendChild(fTitle);
        features.appendChild(ul);

        var descDiv = document.createElement('div');
        descDiv.className = 'pf-modal-desc';
        var dTitle = document.createElement('h4');
        dTitle.textContent = 'Описание';
        var dP = document.createElement('p');
        dP.textContent = item.desc;
        descDiv.appendChild(dTitle);
        descDiv.appendChild(dP);

        body.appendChild(features);
        body.appendChild(descDiv);
        content.appendChild(body);

        modal.classList.add('active');
    }

    function closeModal() {
        var modal = document.getElementById('pf-modal');
        if (modal) modal.classList.remove('active');
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
