const API_URL = 'http://localhost:3000/api';

// Wrapper для fetch с автоматическим обновлением токенов
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    };

    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
        defaultOptions.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = { ...defaultOptions, ...options };
    if (options.headers) {
        config.headers = { ...defaultOptions.headers, ...options.headers };
    }

    let response = await fetch(`${API_URL}${endpoint}`, config);

    // Если токен истек, попробовать обновить
    if (response.status === 403) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Повторить запрос с новым токеном
            const newAccessToken = localStorage.getItem('accessToken');
            config.headers['Authorization'] = `Bearer ${newAccessToken}`;
            response = await fetch(`${API_URL}${endpoint}`, config);
        } else {
            // Не удалось обновить токен, перенаправить на вход
            logout();
            return null;
        }
    }

    if (!response.ok && response.status !== 403) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

// Обновить access token через refresh token
async function refreshAccessToken() {
    try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        localStorage.setItem('accessToken', data.accessToken);
        return true;
    } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
    }
}

// Выход
function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}

// Проверка авторизации
async function checkAuth() {
    const accessToken = localStorage.getItem('accessToken');

    if (!accessToken) {
        // Попробовать получить новый токен через refresh
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

    createTicket: (subject, initialMessage, priority = 'normal') =>
        apiRequest('/tickets', {
            method: 'POST',
            body: JSON.stringify({ subject, initialMessage, priority })
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
