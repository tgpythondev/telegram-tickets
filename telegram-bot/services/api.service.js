const axios = require('axios');

const API_BASE_URL = process.env.BACKEND_API_URL || 'http://localhost:3000/api';

// Проверка HTTPS в production
if (process.env.NODE_ENV === 'production' && !API_BASE_URL.startsWith('https://')) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: В production необходимо использовать HTTPS!');
    console.error(`Текущий URL: ${API_BASE_URL}`);
    process.exit(1);
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000,
    maxRedirects: 0,
    validateStatus: (status) => status < 500,
    maxContentLength: 10 * 1024 * 1024, // 10MB max
    maxBodyLength: 10 * 1024 * 1024
});

// Interceptor для sanitization токенов из ошибок
api.interceptors.response.use(
    response => response,
    error => {
        // Удалить токен из конфига запроса перед логированием
        if (error.config?.headers?.Authorization) {
            error.config.headers.Authorization = 'Bearer [REDACTED]';
        }
        return Promise.reject(error);
    }
);

// ========== AUTH ==========

async function register(username, password) {
    try {
        const response = await api.post('/auth/register', { username, password });
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Registration failed'
        };
    }
}

async function login(username, password) {
    try {
        const response = await api.post('/auth/login', { username, password });
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Login failed'
        };
    }
}

async function linkTelegram(accessToken, telegramChatId) {
    try {
        const response = await api.post('/auth/telegram/link',
            { telegramChatId },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to link Telegram'
        };
    }
}

async function toggleNotifications(accessToken, enabled) {
    try {
        const response = await api.post('/auth/telegram/notifications',
            { enabled },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to toggle notifications'
        };
    }
}

// ========== TICKETS ==========

async function getTickets(accessToken, status = null) {
    try {
        const params = status ? { status } : {};
        const response = await api.get('/tickets', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params
        });
        return { success: true, data: response.data.tickets };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to get tickets'
        };
    }
}

async function getTicket(accessToken, ticketId) {
    try {
        const response = await api.get(`/tickets/${ticketId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to get ticket'
        };
    }
}

async function createTicket(accessToken, subject, initialMessage, priority = 'normal') {
    try {
        const response = await api.post('/tickets',
            { subject, initialMessage, priority },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data.ticket };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to create ticket'
        };
    }
}

async function addMessage(accessToken, ticketId, content) {
    try {
        const response = await api.post(`/tickets/${ticketId}/messages`,
            { content },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data.message };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to add message'
        };
    }
}

async function closeTicket(accessToken, ticketId) {
    try {
        const response = await api.patch(`/tickets/${ticketId}/status`,
            { status: 'closed' },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data.ticket };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to close ticket'
        };
    }
}

// ========== ADMIN ==========

async function getAllTickets(accessToken, filters = {}) {
    try {
        const response = await api.get('/admin/tickets', {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: filters
        });
        return { success: true, data: response.data.tickets };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to get tickets'
        };
    }
}

async function updateTicket(accessToken, ticketId, updates) {
    try {
        const response = await api.patch(`/admin/tickets/${ticketId}`,
            updates,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data.ticket };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to update ticket'
        };
    }
}

async function replyToTicket(accessToken, ticketId, content) {
    try {
        const response = await api.post(`/admin/tickets/${ticketId}/reply`,
            { content },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return { success: true, data: response.data.message };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to reply'
        };
    }
}

async function getStats(accessToken) {
    try {
        const response = await api.get('/admin/stats', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return { success: true, data: response.data.stats };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to get stats'
        };
    }
}

module.exports = {
    register,
    login,
    linkTelegram,
    toggleNotifications,
    getTickets,
    getTicket,
    createTicket,
    addMessage,
    closeTicket,
    getAllTickets,
    updateTicket,
    replyToTicket,
    getStats
};
