document.addEventListener('DOMContentLoaded', () => {
    // ── Auth check: refresh cookie, update UI ──
    let loggedInUser = null;

    async function checkAuthOnIndex() {
        try {
            const user = await checkAuth();
            if (user && user.username) {
                loggedInUser = user;
                updateUIforLoggedInUser();
                return;
            }
        } catch (_) {
            // Not logged in
        }
        // Not logged in — leave default state
        const authBtn = document.getElementById('nav-auth-btn');
        const usernameEl = document.getElementById('nav-username');
        if (authBtn) {
            authBtn.textContent = typeof t === 'function' ? t('nav_login') : 'Войти';
            authBtn.href = 'auth.html';
            authBtn.classList.remove('nav-ticket-btn');
            authBtn.classList.add('nav-cta');
        }
        if (usernameEl) {
            usernameEl.style.display = 'none';
        }
    }

    function updateUIforLoggedInUser() {
        if (!loggedInUser) return;
        const authBtn = document.getElementById('nav-auth-btn');
        const usernameEl = document.getElementById('nav-username');
        if (authBtn) {
            authBtn.textContent = typeof t === 'function' ? t('nav_create_ticket') : 'Создать тикет';
            authBtn.href = 'tickets.html';
            authBtn.classList.remove('nav-cta');
            authBtn.classList.add('nav-ticket-btn');
        }
        if (usernameEl) {
            usernameEl.textContent = loggedInUser.username;
            usernameEl.style.display = 'inline';
        }
    }

    // Listen for language changes to re-apply auth UI
    window.addEventListener('langchange', () => {
        if (loggedInUser) {
            updateUIforLoggedInUser();
        } else {
            const authBtn = document.getElementById('nav-auth-btn');
            const usernameEl = document.getElementById('nav-username');
            if (authBtn) {
                authBtn.textContent = typeof t === 'function' ? t('nav_login') : 'Войти';
                authBtn.href = 'auth.html';
                authBtn.classList.remove('nav-ticket-btn');
                authBtn.classList.add('nav-cta');
            }
            if (usernameEl) {
                usernameEl.style.display = 'none';
            }
        }
    });

    checkAuthOnIndex();

    // ── Header scroll state ─────────────────
    const header = document.getElementById('site-header');
    if (header) {
        const onScroll = () => {
            header.classList.toggle('scrolled', window.scrollY > 20);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // ── Mobile menu toggle ──────────────────
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks   = document.getElementById('nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            const open = navLinks.classList.toggle('active');
            menuToggle.classList.toggle('active', open);
            menuToggle.setAttribute('aria-expanded', String(open));
            menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
            document.body.style.overflow = open ? 'hidden' : '';
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.setAttribute('aria-label', 'Открыть меню');
                document.body.style.overflow = '';
            });
        });

        document.addEventListener('click', e => {
            if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.setAttribute('aria-label', t ? t('nav_open_menu') : 'Открыть меню');
                document.body.style.overflow = '';
            }
        });
    }

    // ── Smooth scroll for anchor links ──────
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});