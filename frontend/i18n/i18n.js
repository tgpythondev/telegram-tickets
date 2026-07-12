/**
 * i18n.js — minimal translation engine for Kaliang
 *
 * Usage:
 *   t('key')            → translated string
 *   t('key', {n: 5})    → string with {n} substituted
 *   I18n.setLang('en')  → switch language, re-render page
 *   I18n.getLang()      → current locale ('pl' | 'en')
 *
 * Languages are loaded by including the language JS files
 * BEFORE this script:
 *   <script src="../i18n/pl.js"></script>
 *   <script src="../i18n/en.js"></script>
 *   <script src="../i18n/i18n.js"></script>
 */

(function (window) {
    'use strict';

    var STORAGE_KEY = 'kaliang_lang';
    var SUPPORTED   = ['ru', 'pl', 'en'];
    var DEFAULT     = 'ru';

    /* ── Detect initial language ─────────────── */
    function detectLang() {
        // 1. Saved preference
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED.includes(saved)) return saved;

        // 2. Browser language (first match)
        var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        for (var i = 0; i < SUPPORTED.length; i++) {
            if (nav.startsWith(SUPPORTED[i])) return SUPPORTED[i];
        }

        return DEFAULT;
    }

    var currentLang = detectLang();

    /* ── Get translation map ─────────────────── */
    function getMap() {
        if (currentLang === 'ru' && window.LANG_RU) return window.LANG_RU;
        if (currentLang === 'en' && window.LANG_EN) return window.LANG_EN;
        if (currentLang === 'pl' && window.LANG_PL) return window.LANG_PL;
        // Fallback to RU
        return window.LANG_RU || {};
    }

    /* ── Core translation function ───────────── */
    function t(key, params) {
        var map = getMap();
        var str = map[key];

        if (str === undefined || str === null) {
            // Soft fallback: try other languages, then return key
            var fallbacks = [window.LANG_EN, window.LANG_PL, window.LANG_RU];
            for (var i = 0; i < fallbacks.length; i++) {
                if (fallbacks[i] && fallbacks[i][key] !== undefined) {
                    str = fallbacks[i][key];
                    break;
                }
            }
            if (str === undefined || str === null) str = key;
        }

        if (params && typeof params === 'object') {
            Object.keys(params).forEach(function (k) {
                str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
            });
        }

        return str;
    }

    /* ── Pluralisation helper ─────────────────── */
    // Returns a translated string for ticket count with correct plural form
    function ticketCount(n) {
        if (currentLang === 'ru') {
            // Russian plural rules
            if (n % 10 === 1 && n % 100 !== 11) return t('tickets_count_one', { n: n });
            if ([2,3,4].indexOf(n % 10) >= 0 && [12,13,14].indexOf(n % 100) < 0) return t('tickets_count_few', { n: n });
            return t('tickets_count_many', { n: n });
        } else if (currentLang === 'pl') {
            // Polish plural rules
            if (n === 1) return t('tickets_count_one', { n: n });
            var mod10  = n % 10;
            var mod100 = n % 100;
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
                return t('tickets_count_few', { n: n });
            }
            return t('tickets_count_many', { n: n });
        } else {
            // English
            return n === 1 ? t('tickets_count_one', { n: n }) : t('tickets_count_many', { n: n });
        }
    }

    /* ── Date formatting ─────────────────────── */
    function formatDate(iso, full) {
        if (!iso) return '';
        var d = new Date(iso);
        var localeMap = { ru: 'ru-RU', pl: 'pl-PL', en: 'en-GB' };
        var locale = localeMap[currentLang] || 'en-GB';
        if (full) return d.toLocaleString(locale);
        return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) +
               ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }

    /* ── DOM rendering ───────────────────────── */
    /**
     * Apply translations to DOM elements with data-i18n attributes.
     * data-i18n="key"           → sets textContent
     * data-i18n-html="key"      → sets innerHTML (use sparingly)
     * data-i18n-ph="key"        → sets placeholder attribute
     * data-i18n-title="key"     → sets title attribute
     * data-i18n-aria="key"      → sets aria-label attribute
     * data-i18n-alt="key"       → sets alt attribute
     */
    function applyDOM(root) {
        root = root || document;

        root.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });

        root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });

        root.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
        });

        root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
        });

        root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
        });

        root.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
            el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
        });
    }

    /* ── Update <html lang> ──────────────────── */
    function updateHtmlLang() {
        document.documentElement.setAttribute('lang', currentLang);
    }

    /* ── Update page <title> ─────────────────── */
    function updatePageTitle() {
        var titleKey = document.documentElement.getAttribute('data-title-key');
        if (titleKey) document.title = t(titleKey);
    }

    /* ── Switch language ─────────────────────── */
    function setLang(lang) {
        if (!SUPPORTED.includes(lang)) return;
        if (lang === currentLang) return;

        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);

        updateHtmlLang();
        updatePageTitle();
        applyDOM();
        updateSwitcher();

        // Emit custom event so JS modules can re-render dynamic content
        window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
    }

    function getLang() {
        return currentLang;
    }

    /* ── Language switcher widget ────────────── */
    function createSwitcher() {
        var existing = document.getElementById('lang-switcher');
        if (existing) return existing;

        var wrap = document.createElement('div');
        wrap.id = 'lang-switcher';
        wrap.className = 'lang-switcher';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', t('lang_switcher_label'));

        SUPPORTED.forEach(function (lang) {
            var btn = document.createElement('button');
            btn.className = 'lang-btn' + (lang === currentLang ? ' active' : '');
            btn.setAttribute('data-lang', lang);
            btn.textContent = lang.toUpperCase();
            btn.setAttribute('aria-pressed', String(lang === currentLang));
            btn.addEventListener('click', function () { setLang(lang); });
            wrap.appendChild(btn);
        });

        return wrap;
    }

    function updateSwitcher() {
        var wrap = document.getElementById('lang-switcher');
        if (!wrap) return;
        wrap.querySelectorAll('.lang-btn').forEach(function (btn) {
            var active = btn.getAttribute('data-lang') === currentLang;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        wrap.setAttribute('aria-label', t('lang_switcher_label'));
    }

    function injectSwitcherIntoNav() {
        var nav = document.querySelector('header nav') || document.querySelector('header');
        if (!nav) return;
        var switcher = createSwitcher();
        nav.appendChild(switcher);
    }

    /* ── Bootstrap ───────────────────────────── */
    function init() {
        updateHtmlLang();
        updatePageTitle();
        applyDOM();
        injectSwitcherIntoNav();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ── Public API ──────────────────────────── */
    window.t          = t;
    window.I18n       = {
        t:           t,
        setLang:     setLang,
        getLang:     getLang,
        applyDOM:    applyDOM,
        formatDate:  formatDate,
        ticketCount: ticketCount,
        SUPPORTED:   SUPPORTED,
    };

}(window));
