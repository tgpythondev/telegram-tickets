function getApiUrl() {
    const hostname = window.location.hostname;

    // Локальная разработка: любой localhost/127.0.0.1 порт → локальный backend
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }

    return 'https://telegram-bots-backend.onrender.com/api';
}

const API_URL = getApiUrl();

let inMemoryAccessToken = null;

let csrfToken = null;

/**
 * Show error message to user
 * @param {string} message - Error message
 * @param {number} duration - Display duration in ms (default 5000)
 */
function showError(message, duration = 5000) {
    showToast(message, 'error', duration);
}

/**
 * Show success notification to user
 * @param {string} message - Success message
 * @param {number} duration - Display duration in ms (default 3000)
 */
function showSuccess(message, duration = 3000) {
    showToast(message, 'success', duration);
}

/**
 * Universal toast notification function
 * @param {string} message - Message text
 * @param {string} type - Type: 'error' or 'success'
 * @param {number} duration - Display duration in ms
 */
function showToast(message, type = 'error', duration = 5000) {
    const toastId = type === 'error' ? 'error-toast' : 'success-toast';
    let toast = document.getElementById(toastId);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'app-toast ' + (type === 'error' ? 'app-toast--error' : 'app-toast--success');
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-out';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.animation = 'toastIn 0.3s ease-out';
        }, 300);
    }, duration);
}

/**
 * Get user-friendly error message based on HTTP status code
 * @param {number} status - HTTP status code
 * @param {string} defaultMessage - Default fallback message
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

async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    };

    if (inMemoryAccessToken) {
        defaultOptions.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }

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

    if ((response.status === 403 || response.status === 401) && endpoint !== '/auth/refresh') {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            config.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
            response = await fetch(`${API_URL}${endpoint}`, config);
        } else {
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
            errorMessage = getErrorMessage(response.status, errorMessage);
            console.error('Failed to parse error response:', parseError);
        }

        showError(errorMessage);
        throw new Error(errorMessage);
    }

    try {
        return await response.json();
    } catch (error) {
        console.error('Failed to parse response JSON:', error);
        throw new Error('Invalid response format');
    }
}

let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
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
                // Диагностика «логин не наступает»: 401 = кука не дошла до бэкенда,
                // 403 = токен невалиден/отсутствует в БД, 429 = rate limit
                console.warn(`Token refresh failed: HTTP ${response.status}`);
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
    sessionStorage.removeItem('user');
    window.location.href = '/auth.html';
}

async function checkAuth() {
    if (!inMemoryAccessToken) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            return null;
        }
    }

    try {
        const data = await apiRequest('/auth/me');
        if (data && data.user) {
            sessionStorage.setItem('user', JSON.stringify(data.user));
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

    createTicket: (subject, initialMessage, priority = 'normal', orderConfig = null, promoCode = null, chosenBenefit = null) =>
        apiRequest('/tickets', {
            method: 'POST',
            body: JSON.stringify({ subject, initialMessage, priority, orderConfig, promoCode, chosenBenefit })
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

    // Promo codes
    validatePromo: (code) =>
        apiRequest('/promo/validate', {
            method: 'POST',
            body: JSON.stringify({ code })
        }),

    // Admin — promo codes
    adminListPromoCodes: () =>
        apiRequest('/promo/admin'),

    adminCreatePromoCode: (data) =>
        apiRequest('/promo/admin', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    adminUpdatePromoCode: (id, data) =>
        apiRequest(`/promo/admin/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    adminDeletePromoCode: (id) =>
        apiRequest(`/promo/admin/${id}`, {
            method: 'DELETE'
        }),

    adminGetPromoCode: (id) =>
        apiRequest(`/promo/admin/${id}`),

    // Portfolio (public)
    getPortfolioProjects: (platform, plan) => {
        const params = new URLSearchParams();
        if (platform && platform !== 'all') params.append('platform', platform);
        if (plan     && plan     !== 'all') params.append('plan',     plan);
        const query = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/portfolio${query}`);
    },

    // Portfolio (admin)
    adminListPortfolio: (platform, plan) => {
        const params = new URLSearchParams();
        if (platform && platform !== 'all') params.append('platform', platform);
        if (plan     && plan     !== 'all') params.append('plan',     plan);
        const query = params.toString() ? `?${params.toString()}` : '';
        return apiRequest(`/portfolio/admin${query}`);
    },

    adminGetPortfolioProject: (id) =>
        apiRequest(`/portfolio/admin/${id}`),

    adminCreatePortfolioProject: (data) =>
        apiRequest('/portfolio/admin', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    adminUpdatePortfolioProject: (id, data) =>
        apiRequest(`/portfolio/admin/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        }),

    adminDeletePortfolioProject: (id) =>
        apiRequest(`/portfolio/admin/${id}`, {
            method: 'DELETE'
        }),

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
