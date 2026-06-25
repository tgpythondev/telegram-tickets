// Определение API URL в зависимости от домена
function getApiUrl() {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }

    // Для нового домена telegram-bots.pl используем тот же backend
    if (hostname === 'telegram-bots.pl' || hostname === 'www.telegram-bots.pl') {
        return 'https://telegram-bots-backend.onrender.com/api';
    }

    // Fallback на старый backend
    return 'https://telegram-bots-backend.onrender.com/api';
}

const API_URL = getApiUrl();

// In-memory token storage (более безопасно чем localStorage для XSS)
let inMemoryAccessToken = null;

// CSRF token management
let csrfToken = null;

/**
 * Централизованная функция показа ошибок пользователю
 * @param {string} message - Сообщение об ошибке
 * @param {number} duration - Длительность показа в мс (по умолчанию 5000)
 */
function showError(message, duration = 5000) {
    showToast(message, 'error', duration);
}

/**
 * Централизованная функция показа успешных уведомлений
 * @param {string} message - Сообщение об успехе
 * @param {number} duration - Длительность показа в мс (по умолчанию 3000)
 */
function showSuccess(message, duration = 3000) {
    showToast(message, 'success', duration);
}

/**
 * Универсальная функция показа toast уведомлений
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'error' или 'success'
 * @param {number} duration - Длительность показа в мс
 */
function showToast(message, type = 'error', duration = 5000) {
    const toastId = type === 'error' ? 'error-toast' : 'success-toast';
    let toast = document.getElementById(toastId);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        const bgColor = type === 'error' ? '#ff4444' : '#22c55e';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: ${bgColor};
            color: white;
            padding: 16px 24px;
            border-radius: 4px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(toast);

        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(400px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.animation = 'slideIn 0.3s ease-out';
        }, 300);
    }, duration);
}

/**
 * Получить понятное сообщение об ошибке на основе HTTP кода
 * @param {number} status - HTTP статус код
 * @param {string} defaultMessage - Дефолтное сообщение
 */
function getErrorMessage(status, defaultMessage) {
    const errorMessages = {
        400: 'Некорректные данные запроса',
        401: 'Требуется авторизация',
        403: 'Доступ запрещён',
        404: 'Ресурс не найден',
        409: 'Конфликт данных',
        423: 'Аккаунт временно заблокирован',
        429: 'Слишком много запросов, попробуйте позже',
        500: 'Ошибка сервера, попробуйте позже',
        502: 'Сервер временно недоступен',
        503: 'Сервис временно недоступен'
    };

    return errorMessages[status] || defaultMessage;
}

async function getCsrfToken() {
    if (!csrfToken) {
        try {
            const response = await fetch(`${API_URL}/auth/csrf`, { credentials: 'include' });
            if (!response.ok) {
                throw new Error('Failed to fetch CSRF token');
            }
            const data = await response.json();
            if (data && data.csrfToken) {
                csrfToken = data.csrfToken;
            } else {
                throw new Error('Invalid CSRF token response');
            }
        } catch (error) {
            console.error('Failed to get CSRF token:', error);
            showError('Ошибка получения CSRF токена. Перезагрузите страницу.');
            return null;
        }
    }
    return csrfToken;
}

// Wrapper для fetch с автоматическим обновлением токенов
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    };

    // Используем in-memory токен вместо localStorage
    if (inMemoryAccessToken) {
        defaultOptions.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }

    // Добавляем CSRF токен для мутирующих запросов
    if (options.method && options.method !== 'GET') {
        const token = await getCsrfToken();
        if (token) {
            defaultOptions.headers['X-CSRF-Token'] = token;
        }
    }

    const config = { ...defaultOptions, ...options };
    if (options.headers) {
        config.headers = { ...defaultOptions.headers, ...options.headers };
    }

    let response = await fetch(`${API_URL}${endpoint}`, config);

    // Если токен истек, попробовать обновить (НО НЕ для самого /auth/refresh)
    if ((response.status === 403 || response.status === 401) && endpoint !== '/auth/refresh') {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Повторить запрос с новым токеном
            config.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
            response = await fetch(`${API_URL}${endpoint}`, config);
        } else {
            // Не удалось обновить токен, перенаправить на вход
            logout();
            return null;
        }
    }

    if (!response.ok && response.status !== 403 && response.status !== 401) {
        let errorMessage = 'Request failed';
        try {
            const error = await response.json();
            errorMessage = error.error || getErrorMessage(response.status, errorMessage);
        } catch (parseError) {
            // Если не удалось распарсить JSON, используем понятное сообщение по статусу
            errorMessage = getErrorMessage(response.status, errorMessage);
            console.error('Failed to parse error response:', parseError);
        }

        // Показываем ошибку пользователю
        showError(errorMessage);
        throw new Error(errorMessage);
    }

    // Проверяем что response существует перед вызовом json()
    if (!response) {
        throw new Error('No response received');
    }

    try {
        return await response.json();
    } catch (error) {
        console.error('Failed to parse response JSON:', error);
        throw new Error('Invalid response format');
    }
}

// Флаг для предотвращения race condition при refresh
let isRefreshing = false;
let refreshPromise = null;

// Обновить access token через refresh token
async function refreshAccessToken() {
    // Предотвращаем множественные одновременные refresh запросы
    if (isRefreshing) {
        return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            if (data && data.accessToken) {
                inMemoryAccessToken = data.accessToken;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

// Выход
function logout() {
    inMemoryAccessToken = null;
    csrfToken = null;
    localStorage.removeItem('user');
    window.location.href = '/auth.html';
}

// Проверка авторизации
async function checkAuth() {
    // Сначала проверяем in-memory токен
    if (!inMemoryAccessToken) {
        // Попробовать получить новый токен через refresh cookie
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            return null;
        }
    }

    try {
        const data = await apiRequest('/auth/me');
        if (data && data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            return data.user;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }

    return null;
}

// API методы
const API = {
    // Auth
    register: (username, password) =>
        apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        }),

    login: (username, password) =>
        apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        }),

    logout: () =>
        apiRequest('/auth/logout', { method: 'POST' }),

    // Tickets
    getTickets: (status = null) => {
        const query = status ? `?status=${status}` : '';
        return apiRequest(`/tickets${query}`);
    },

    getTicket: (id) =>
        apiRequest(`/tickets/${id}`),

    createTicket: (subject, initialMessage, priority = 'normal', orderConfig = null) =>
        apiRequest('/tickets', {
            method: 'POST',
            body: JSON.stringify({ subject, initialMessage, priority, orderConfig })
        }),

    addMessage: (ticketId, content) =>
        apiRequest(`/tickets/${ticketId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        }),

    closeTicket: (ticketId) =>
        apiRequest(`/tickets/${ticketId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'closed' })
        }),

    // Admin
    getAllTickets: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.assigned_to_me) params.append('assigned_to_me', 'true');
        const query = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/admin/tickets${query}`);
    },

    updateTicket: (ticketId, updates) =>
        apiRequest(`/admin/tickets/${ticketId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        }),

    replyToTicket: (ticketId, content) =>
        apiRequest(`/admin/tickets/${ticketId}/reply`, {
            method: 'POST',
            body: JSON.stringify({ content })
        }),

    getStats: () =>
        apiRequest('/admin/stats'),

    // Telegram
    getTelegramStatus: () =>
        apiRequest('/auth/telegram/status'),

    toggleTelegramNotifications: (enabled) =>
        apiRequest('/auth/telegram/notifications', {
            method: 'POST',
            body: JSON.stringify({ enabled })
        }).then(data => ({ enabled: data.notificationsEnabled })),

    unlinkTelegram: () =>
        apiRequest('/auth/telegram/unlink', {
            method: 'POST'
        })
};
