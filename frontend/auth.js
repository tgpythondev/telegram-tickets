// ── View switching ─────────────────────────
document.querySelectorAll('.auth-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.show;
        document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        document.querySelectorAll('.error-message').forEach(el => { el.textContent = ''; });
    });
});

// ── Password strength checklist ────────────
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

// ── Login ──────────────────────────────────
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

// ── Register ───────────────────────────────
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

// ── Helpers ────────────────────────────────
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

// ── Auto-redirect if already logged in ─────
(async () => {
    try {
        const user = await checkAuth();
        if (user) {
            window.location.href = user.isAdmin ? 'admin/dashboard.html' : 'tickets.html';
        }
    } catch (_) { /* not logged in */ }
})();
