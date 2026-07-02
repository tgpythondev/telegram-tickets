// Переключение табов
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        document.querySelectorAll('.auth-form').forEach(form => form.classList.add('hidden'));
        document.getElementById(`${tab}-form`).classList.remove('hidden');

        // Очистить ошибки
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    });
});

// Обработка входа
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const button = e.target.querySelector('button[type="submit"]');

    errorEl.textContent = '';

    // Валидация на клиенте
    if (password.length < 8) {
        errorEl.textContent = 'Пароль должен быть не менее 8 символов';
        return;
    }

    button.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    button.innerHTML = '';
    button.appendChild(spinner);
    button.appendChild(document.createTextNode(' Вход...'));

    try {
        const data = await API.login(username, password);

        if (!data) {
            throw new Error('Ошибка подключения к серверу');
        }

        // Проверяем наличие необходимых данных
        if (!data.accessToken || !data.user) {
            throw new Error('Неверный формат ответа сервера');
        }

        // Сохраняем токен в память (не в localStorage)
        inMemoryAccessToken = data.accessToken;
        localStorage.setItem('user', JSON.stringify(data.user));

        // Перенаправляем в соответствующую панель
        if (data.user && data.user.isAdmin) {
            window.location.href = 'admin/dashboard.html';
        } else {
            window.location.href = 'tickets.html';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorEl.textContent = error.message || 'Ошибка входа. Проверьте логин и пароль.';
        button.disabled = false;
        button.textContent = 'Войти';
    }
});

// Обработка регистрации
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const errorEl = document.getElementById('register-error');
    const button = e.target.querySelector('button[type="submit"]');

    errorEl.textContent = '';

    if (username.length < 3) {
        errorEl.textContent = 'Логин должен быть не менее 3 символов';
        return;
    }

    if (password.length < 8) {
        errorEl.textContent = 'Пароль должен быть не менее 8 символов';
        return;
    }

    // Проверка сложности пароля
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

    if (!hasLetter || !hasNumber || password.length < 8) {
        errorEl.textContent = 'Пароль должен быть минимум 8 символов, содержать буквы и цифры';
        return;
    }

    if (!hasSpecial) {
        errorEl.textContent = 'Пароль должен содержать хотя бы один спецсимвол (!@#$%^&*()_+-=[]{}|;:,.<>?)';
        return;
    }

    if (password !== passwordConfirm) {
        errorEl.textContent = 'Пароли не совпадают';
        return;
    }

    button.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';
    button.innerHTML = '';
    button.appendChild(spinner);
    button.appendChild(document.createTextNode(' Регистрация...'));

    try {
        const data = await API.register(username, password);

        if (!data) {
            throw new Error('Ошибка подключения к серверу');
        }

        // Проверяем наличие необходимых данных
        if (!data.accessToken || !data.user) {
            throw new Error('Неверный формат ответа сервера');
        }

        inMemoryAccessToken = data.accessToken;
        localStorage.setItem('user', JSON.stringify(data.user));

        window.location.href = 'tickets.html';
    } catch (error) {
        console.error('Registration error:', error);
        errorEl.textContent = error.message || 'Ошибка регистрации';
        button.disabled = false;
        button.textContent = 'Зарегистрироваться';
    }
});

// Проверка, если уже залогинен
(async () => {
    try {
        const user = await checkAuth();
        if (user) {
            if (user.isAdmin) {
                window.location.href = 'admin/dashboard.html';
            } else {
                window.location.href = 'tickets.html';
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        // Пользователь не авторизован, остаемся на странице логина
    }
})();
