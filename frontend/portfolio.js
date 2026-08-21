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
            // relative paths resolve against the page URL (same origin = safe)
            var u = new URL(url, window.location.href);
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
    
    // ── Featured projects (hardcoded showcase) ──────────────────────────────
    // Portfolio is a static showcase: admin-panel CRUD was removed.
    // Edit titles, descriptions and source links right here.
    var FEATURED_PROJECTS = [
        {
            id: 1,
            title: 'Max — Telegram AI Chat Bot',
            platform: 'telegram',
            plan: 'max',
            lang: 'Python',
            price: '$30',
            term: '3d',
            bot_url: null,
            source_url: 'https://github.com/ysiu555-alt/Max-',
            mockup: 'ai-chat',
            screenshots: ['images/portfolio/max-ai-chat.svg'],
            description_ru: 'Max — AI-собеседник в Telegram: бот проксирует диалог в любой OpenAI-совместимый API (Omniroute).\nКлючевые функции\nАккаунты с регистрацией и PBKDF2-хешированием паролей.\nТекстовые и графические модели: выбор и переключение прямо в чате.\nВеб-поиск DuckDuckGo со ссылками на источники и кэшем результатов.\n11 языков интерфейса и админ-панель для управления моделями.\nСтриминг с живым обновлением сообщений, трейсинг запросов и подробные логи.',
            description_pl: 'Max — rozmówca AI w Telegramie: bot przekazuje dialog do dowolnego API zgodnego z OpenAI (Omniroute).\nKluczowe funkcje\nKonta z rejestracją i hashowaniem haseł PBKDF2.\nModele tekstowe i graficzne: wybór i przełączanie bezpośrednio na czacie.\nWyszukiwarka DuckDuckGo z linkami do źródeł i pamięcią podręczną.\n11 języków interfejsu oraz panel administracyjny do zarządzania modelami.\nStreaming z żywą edycją wiadomości, tracing zapytań i szczegółowe logi.',
            description_en: 'Max — AI companion in Telegram: the bot proxies chat to any OpenAI-compatible API (Omniroute).\nKey features\nAccounts with registration and PBKDF2 password hashing.\nText and image models: pick and switch right in the chat.\nDuckDuckGo web search with source links and result cache.\n11 UI languages and an admin panel for managing models.\nStreaming with live message edits, per-request tracing and detailed logs.'
        },
        {
            id: 2,
            title: 'Mini — Feedback Bot',
            platform: 'telegram',
            plan: 'mini',
            lang: 'Python',
            price: '$3',
            term: '1d',
            bot_url: null,
            source_url: 'https://github.com/ysiu555-alt/Mini-telegram',
            mockup: 'feedback',
            screenshots: ['images/portfolio/mini-feedback.svg'],
            description_ru: 'Mini — личный ящик обратной связи: пользователи пишут боту, владелец читает и отвечает напрямую.\nКлючевые функции\nКаждое сообщение из личного чата мгновенно пересылается администратору.\nОтвет на пересланное сообщение уходит исходному пользователю.\nСервисные сообщения (входы, закрепления, видеочаты) удаляются автоматически.\nПростой запуск: один .env с токеном бота и ID администратора.',
            description_pl: 'Mini — prywatna skrzynka kontaktu: użytkownicy piszą do bota, właściciel czyta i odpowiada bezpośrednio.\nKluczowe funkcje\nKażda wiadomość z prywatnego czatu jest natychmiast przekazywana administratorowi.\nOdpowiedź na przekazaną wiadomość trafia do pierwotnego użytkownika.\nKomunikaty serwisowe (dołączenia, przypięcia, czaty wideo) są usuwane automatycznie.\nProsty start: jeden plik .env z tokenem bota i ID administratora.',
            description_en: 'Mini — private feedback inbox: users write to the bot, the owner reads and replies directly.\nKey features\nEvery private chat message is instantly forwarded to the admin.\nA reply to the forwarded message goes back to the original user.\nService messages (joins, pins, video chats) are deleted automatically.\nSimple setup: a single .env with the bot token and admin ID.'
        },
        {
            id: 3,
            title: 'Mini — Discord Welcome Bot',
            platform: 'discord',
            plan: 'mini',
            lang: 'JavaScript',
            price: '$3',
            term: '1d',
            bot_url: null,
            source_url: 'https://github.com/ysiu555-alt/Mini-Discord',
            mockup: 'discord',
            screenshots: ['images/portfolio/mini-discord-welcome.svg'],
            description_ru: 'Mini — приветственный бот для Discord: встречает новичков и автоматически выдаёт роль.\nКлючевые функции\nПриветствие в заданном канале при входе участника.\nАвтоматическая выдача настроенной роли каждому новичку.\nОпциональная работа только на одном сервере.\nСвой текст приветствия с плейсхолдерами {user}, {username} и {guild}.',
            description_pl: 'Mini — bot powitalny dla Discorda: wita nowych uczestników i automatycznie przydziela rolę.\nKluczowe funkcje\nPowitanie na wybranym kanale, gdy uczestnik dołącza.\nAutomatyczne przydzielanie ustawionej roli każdemu nowemu członkowi.\nOpcjonalne działanie tylko na jednym serwerze.\nWłasny tekst powitania z placeholderami {user}, {username} i {guild}.',
            description_en: 'Mini — Discord welcome bot: greets newcomers and assigns a role automatically.\nKey features\nWelcome message in a chosen channel when a member joins.\nAutomatic assignment of a configured role to every newcomer.\nOptional single-server operation.\nCustom welcome text with {user}, {username} and {guild} placeholders.'
        },
        {
            id: 4,
            title: 'Mini+ — Appointment Reminder Bot',
            platform: 'telegram',
            plan: 'miniplus',
            lang: 'Python',
            price: '$4',
            term: '1d',
            bot_url: null,
            source_url: 'https://github.com/ysiu555-alt/Mini-',
            // NOTE: images/Mini-review/*.png are stale shots of a different bot — do NOT use.
            mockup: 'appointments',
            screenshots: ['images/portfolio/miniplus-reminders.svg'],
            description_ru: 'Mini+ — бот-напоминатель о встречах: следит за расписанием и не даёт ничего пропустить.\nКлючевые функции\nДобавление встреч: дата, время и описание через удобное меню.\nСписок всех предстоящих встреч и отмена любой из них.\nНапоминания каждые 20 минут, начиная за 2 часа до события.\nПоддержка русского и английского языков.\nSQLite с хранением всех дат и времени в UTC.',
            description_pl: 'Mini+ — bot przypominający o spotkaniach: pilnuje harmonogramu i nie pozwala niczego przegapić.\nKluczowe funkcje\nDodawanie spotkań: data, godzina i opis przez wygodne menu.\nLista wszystkich nadchodzących spotkań i anulowanie dowolnego z nich.\nPrzypomnienia co 20 minut, zaczynając 2 godziny przed wydarzeniem.\nObsługa języka rosyjskiego i angielskiego.\nSQLite z przechowywaniem dat i czasu w UTC.',
            description_en: 'Mini+ — appointment reminder bot: watches your schedule and makes sure you never miss anything.\nKey features\nAdd appointments with date, time and description via a handy menu.\nList all upcoming appointments and cancel any of them.\nReminders every 20 minutes starting 2 hours before the event.\nRussian and English support.\nSQLite with all datetimes stored in UTC.'
        }
    ];
    
    var ICON_EXTERNAL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    var ICON_CODE     = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

    // ── CSS pseudo-screenshots (mockups) ────────────────────────────────────
    // Cards have no real screenshots; each bot gets an interface mockup
    // drawn purely with HTML/CSS. Text is language-neutral on purpose.
    var MOCKUP_TEMPLATES = {
        'ai-chat': {
            theme: 'telegram',
            title: 'Max · AI',
            messages: [
                { dir: 'out', text: 'Prompt → GPT-4o?' },
                { dir: 'in',  text: '✓ Omniroute · streaming' },
                { dir: 'in',  bars: [92, 74, 55] }
            ]
        },
        'feedback': {
            theme: 'telegram',
            title: 'Mini · Feedback',
            messages: [
                { dir: 'out', text: 'Hello! I need a fix…' },
                { dir: 'sys', text: '→ forwarded to admin' },
                { dir: 'in',  text: 'Admin: on it, thanks!' }
            ]
        },
        'discord': {
            theme: 'discord',
            title: '#welcome',
            messages: [
                { dir: 'in', user: 'Mini Bot', role: 'BOT', text: 'Welcome, @alex — role “member” added' },
                { dir: 'in', bars: [88, 60] }
            ]
        },
        'appointments': {
            theme: 'telegram',
            title: 'Mini+ · Reminders',
            messages: [
                { dir: 'out', text: '+ 22.08 · 14:00' },
                { dir: 'in',  text: '✓ Saved · UTC' },
                { dir: 'in',  text: '⏰ 2h before · every 20 min' }
            ]
        }
    };

    function mockBar(width) {
        var b = document.createElement('span');
        b.className = 'pfm-bar';
        b.style.width = width + '%';
        return b;
    }

    function buildMockup(key) {
        var tpl = MOCKUP_TEMPLATES[key];
        var root = document.createElement('div');
        root.className = 'pf-mockup pfm--' + (tpl ? tpl.theme : 'telegram');
        if (!tpl) return root;
        root.setAttribute('aria-hidden', 'true');

        // window bar
        var bar = document.createElement('div');
        bar.className = 'pfm-bar-row';
        var dots = document.createElement('span');
        dots.className = 'pfm-dots';
        dots.innerHTML = '<i></i><i></i><i></i>';
        var title = document.createElement('span');
        title.className = 'pfm-title';
        title.textContent = tpl.title;
        bar.appendChild(dots);
        bar.appendChild(title);
        root.appendChild(bar);

        // chat area
        var chat = document.createElement('div');
        chat.className = 'pfm-chat';
        tpl.messages.forEach(function (m) {
            if (m.dir === 'sys') {
                var sys = document.createElement('div');
                sys.className = 'pfm-sys';
                sys.textContent = m.text || '';
                chat.appendChild(sys);
                return;
            }
            var bubble = document.createElement('div');
            bubble.className = 'pfm-bubble pfm-bubble--' + m.dir;
            if (m.user) {
                var head = document.createElement('span');
                head.className = 'pfm-user';
                head.textContent = m.user;
                if (m.role) {
                    var badge = document.createElement('i');
                    badge.className = 'pfm-role';
                    badge.textContent = m.role;
                    head.appendChild(badge);
                }
                bubble.appendChild(head);
            }
            if (m.bars) {
                m.bars.forEach(function (w) { bubble.appendChild(mockBar(w)); });
            } else {
                var tx = document.createElement('span');
                tx.className = 'pfm-text';
                tx.textContent = m.text || '';
                bubble.appendChild(tx);
            }
            chat.appendChild(bubble);
        });
        root.appendChild(chat);

        // input row
        var input = document.createElement('div');
        input.className = 'pfm-input';
        input.innerHTML = '<span class="pfm-input-field"></span><span class="pfm-input-send">➤</span>';
        root.appendChild(input);

        return root;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    var allItems        = [];   // normalized featured projects
    var currentPlan     = 'all';
    var currentPlatform = 'all';

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
            screenshots: screenshots,
            mockup:      row.mockup         || ''
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
            card.setAttribute('aria-label', item.title);
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
                    img.remove();
                    if (item.mockup && MOCKUP_TEMPLATES[item.mockup]) {
                        media.appendChild(buildMockup(item.mockup));
                    } else {
                        media.classList.add('pf-card-media--empty');
                    }
                };
                media.appendChild(img);
            } else if (item.mockup && MOCKUP_TEMPLATES[item.mockup]) {
                // CSS pseudo-screenshot: interface mockup drawn with HTML/CSS
                media.appendChild(buildMockup(item.mockup));
            } else {
                media.classList.add('pf-card-media--empty');
                media.innerHTML = '<span class="pf-card-media-mark">&#9187;</span>';
            }

            // shots count badge
            if (item.screenshots && item.screenshots.length > 1) {
                var shots = document.createElement('span');
                shots.className = 'pf-card-shots';
                shots.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' +
                    escapeHtml(String(item.screenshots.length));
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

        // Header: badges row + title + meta
        var header = document.createElement('div');
        header.className = 'pf-modal-header';

        var badges = document.createElement('div');
        badges.className = 'pf-modal-badges';
        badges.innerHTML =
            '<span class="pf-modal-badge pf-modal-badge--' + (item.platform === 'discord' ? 'discord' : 'telegram') + '">' +
                (item.platform === 'discord' ? 'Discord' : 'Telegram') + '</span>' +
            '<span class="pf-modal-badge pf-modal-badge--plan">' + escapeHtml(planLabels[item.plan] || item.plan) + '</span>' +
            (item.lang ? '<span class="pf-modal-badge pf-modal-badge--lang">' + escapeHtml(item.lang) + '</span>' : '');
        header.appendChild(badges);

        var titleEl = document.createElement('h2');
        titleEl.className = 'pf-modal-title';
        titleEl.textContent = item.title;
        header.appendChild(titleEl);

        var meta = document.createElement('div');
        meta.className = 'pf-modal-meta';
        [
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
        if (meta.children.length) header.appendChild(meta);
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
        } else if (item.mockup && MOCKUP_TEMPLATES[item.mockup]) {
            // No real screenshots - show the large CSS mockup instead
            var mockWrap = document.createElement('div');
            mockWrap.className = 'pf-modal-screenshots';
            var mock = buildMockup(item.mockup);
            mock.classList.add('pf-mockup--lg');
            mockWrap.appendChild(mock);
            rightCol.appendChild(mockWrap);
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

        // Action buttons live in a separate footer bar
        var footer = document.createElement('div');
        footer.className = 'pf-modal-footer';

        if (isSafeUrl(item.botUrl)) {
            var btnBot = document.createElement('a');
            btnBot.className = 'btn btn-primary';
            btnBot.href      = item.botUrl;
            btnBot.target    = '_blank';
            btnBot.rel       = 'noopener noreferrer';
            btnBot.innerHTML = ICON_EXTERNAL + '<span>' + escapeHtml(_t('pf_btn_go_bot')) + '</span>';
            footer.appendChild(btnBot);
        }

        if (isSafeUrl(item.sourcesUrl)) {
            var btnDownload = document.createElement('a');
            btnDownload.className  = 'btn btn-ghost';
            btnDownload.href       = item.sourcesUrl;
            btnDownload.target     = '_blank';
            btnDownload.rel        = 'noopener noreferrer';
            btnDownload.innerHTML  = ICON_CODE + '<span>' + escapeHtml(_t('pf_btn_download')) + '</span>';
            footer.appendChild(btnDownload);
        }

        rightCol.appendChild(descDiv);
        body.appendChild(rightCol);
        content.appendChild(body);
        if (footer.children.length) content.appendChild(footer);

        modal.classList.add('active');
        if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
        var modal = document.getElementById('pf-modal');
        if (modal) modal.classList.remove('active');
    }

    // ── Load projects ──────────────────────────────────────────────────────────
    // Portfolio is a static showcase now (admin CRUD removed):
    // render the hardcoded featured list directly.
    function loadProjects() {
        allItems = FEATURED_PROJECTS.map(normalize);
        render(currentPlan, currentPlatform);
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
