document.querySelectorAll('.auth-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.show;
        document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        document.querySelectorAll('.error-message').forEach(el => { el.textContent = ''; });
    });
});

const pwdInput = document.getElementById('register-password');
if (pwdInput) {
    pwdInput.addEventListener('input', () => {
        const val = pwdInput.value;
        toggle('pwd-len', val.length >= 8);
        toggle('pwd-let', /[a-zA-Z]/.test(val) && /[0-9]/.test(val));
        toggle('pwd-spc', /[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(val));
    });
}

function toggle(id, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    if (ok) el.classList.add('ok'); else el.classList.remove('ok');
}

document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');

    errorEl.textContent = '';

    if (username.length < 3) {
        document.getElementById('login-username-error').textContent = t('val_min3');
        return;
    }
    if (password.length < 8) {
        document.getElementById('login-password-error').textContent = t('val_min8');
        return;
    }

    setLoading(btn, true, t('loading_login'));

    try {
        const data = await API.login(username, password);

        if (!data || !data.accessToken || !data.user) {
            throw new Error('Неверный формат ответа сервера');
        }

        inMemoryAccessToken = data.accessToken;
        sessionStorage.setItem('user', JSON.stringify(data.user));

        window.location.href = data.user.isAdmin ? 'admin/dashboard.html' : 'tickets.html';
    } catch (err) {
        console.error('Login error:', err);
        errorEl.textContent = err.message || t('err_login');
        setLoading(btn, false, t('login_btn'));
    }
});

document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();

    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm  = document.getElementById('register-password-confirm').value;
    const errorEl  = document.getElementById('register-error');
    const btn      = document.getElementById('register-btn');

    errorEl.textContent = '';
    clearFieldErrors();

    if (username.length < 3) {
        document.getElementById('register-username-error').textContent = t('val_min3');
        return;
    }
    if (password.length < 8) {
        document.getElementById('register-password-error').textContent = t('val_min8');
        return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        document.getElementById('register-password-error').textContent = t('val_letters_digits');
        return;
    }
    if (!/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(password)) {
        document.getElementById('register-password-error').textContent = t('val_special');
        return;
    }
    if (password !== confirm) {
        document.getElementById('register-password-confirm-error').textContent = t('val_passwords_match');
        return;
    }

    setLoading(btn, true, t('loading_register'));

    try {
        const data = await API.register(username, password);

        if (!data || !data.accessToken || !data.user) {
            throw new Error('Неверный формат ответа сервера');
        }

        inMemoryAccessToken = data.accessToken;
        sessionStorage.setItem('user', JSON.stringify(data.user));

        window.location.href = 'tickets.html';
    } catch (err) {
        console.error('Register error:', err);
        errorEl.textContent = err.message || t('err_register');
        setLoading(btn, false, t('register_btn'));
    }
});

function setLoading(btn, loading, label) {
    btn.disabled = loading;
    if (loading) {
        btn.innerHTML = `<span class="btn-spinner"></span>${label}`;
    } else {
        btn.textContent = label;
    }
}

function clearFieldErrors() {
    document.querySelectorAll('.error-message').forEach(el => { el.textContent = ''; });
}

// ── OAuth (Discord / Google / GitHub) ──────────────────────────────────────

// Завершение OAuth-флоу после редиректа с backend (?oauth=success).
// Без молчаливого глотания ошибок: либо переходим в кабинет,
// либо показываем пользователю понятное сообщение.
async function handleOAuthReturn() {
    // Чистим URL сразу, чтобы F5 не перезапускал флоу
    window.history.replaceState({}, '', window.location.pathname);

    const errorEl = document.getElementById('login-error');
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById('login-view').classList.add('active');
    if (errorEl) errorEl.textContent = 'Вход через провайдера завершён, проверяем сессию...';

    try {
        const user = await checkAuth();
        if (user) {
            window.location.href = user.isAdmin ? 'admin/dashboard.html' : 'tickets.html';
            return;
        }

        // refresh не вернул сессию — сообщаем вместо «зависания»
        console.error('OAuth: backend вернул oauth=success, но /auth/refresh не восстановил сессию');
        if (errorEl) errorEl.textContent = 'Сессия не была создана. Попробуйте войти ещё раз.';
    } catch (err) {
        console.error('OAuth session check failed:', err);
        if (errorEl) errorEl.textContent = 'Ошибка проверки сессии. Попробуйте войти ещё раз.';
    }
}

function initOAuth() {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    const oauthSuccess = params.get('oauth') === 'success';

    if (oauthSuccess) {
        // Успешный возврат от провайдера — завершаем логин явно,
        // не полагаясь на молчаливый checkAuth ниже
        handleOAuthReturn();
        return;
    }

    // Чистим URL после редиректа от backend
    if (oauthError) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (oauthError) {
        const errorKeys = {
            access_denied: 'oauth_err_access_denied',
            invalid_state: 'oauth_err_invalid_state',
            provider_disabled: 'oauth_err_provider_disabled',
            email_required: 'oauth_err_email_required',
            internal: 'oauth_err_internal'
        };

        // Показываем ошибку на активной view логина
        document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
        document.getElementById('login-view').classList.add('active');
        document.getElementById('login-error').textContent = t(errorKeys[oauthError] || 'oauth_err_internal');
    }

    // Клик по кнопке — редирект на backend, дальше на провайдера
    document.querySelectorAll('.oauth-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = `${API_URL}/auth/oauth/${btn.dataset.oauth}`;
        });
    });

    // Скрываем кнопки провайдеров, которые не настроены на backend
    fetch(`${API_URL}/auth/oauth/providers`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (!data || !data.providers) return;
            let visible = 0;
            document.querySelectorAll('.oauth-btn').forEach(btn => {
                const enabled = !!data.providers[btn.dataset.oauth];
                btn.classList.toggle('is-hidden', !enabled);
                if (enabled) visible++;
            });
            if (visible === 0) {
                document.querySelectorAll('.oauth-divider').forEach(d => d.classList.add('is-hidden'));
            }
        })
        .catch(() => { /* backend недоступен — оставляем кнопки как есть */ });
}

initOAuth();


(async () => {
    try {
        const user = await checkAuth();
        if (user) {
            window.location.href = user.isAdmin ? 'admin/dashboard.html' : 'tickets.html';
        }
    } catch (err) {
        // Не глотаем молча: ошибки CORS/сети должны быть видны при отладке
        console.warn('Auth check on page load failed:', err);
    }
})();
