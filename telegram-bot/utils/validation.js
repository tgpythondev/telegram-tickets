// Утилиты валидации для телеграм бота

// Валидация ticketId из callback_data
function validateTicketId(ticketId) {
    if (!ticketId || typeof ticketId !== 'string') {
        return { valid: false, error: 'Invalid ticket ID format' };
    }

    if (!/^\d+$/.test(ticketId)) {
        return { valid: false, error: 'Ticket ID must contain only digits' };
    }

    const id = parseInt(ticketId);
    if (id <= 0 || id > 999999999) {
        return { valid: false, error: 'Ticket ID out of range' };
    }

    return { valid: true, value: id };
}

// Валидация статуса
function validateStatus(status) {
    const allowedStatuses = ['open', 'in_progress', 'closed'];
    if (!status || !allowedStatuses.includes(status)) {
        return { valid: false, error: 'Invalid status' };
    }
    return { valid: true, value: status };
}

// Валидация приоритета
function validatePriority(priority) {
    const allowedPriorities = ['normal', 'high', 'urgent'];
    if (!priority || !allowedPriorities.includes(priority)) {
        return { valid: false, error: 'Invalid priority' };
    }
    return { valid: true, value: priority };
}

// Валидация фильтра
function validateFilter(filter) {
    const allowedFilters = ['all', 'open', 'in_progress', 'closed', 'mine'];
    if (!filter || !allowedFilters.includes(filter)) {
        return { valid: false, error: 'Invalid filter' };
    }
    return { valid: true, value: filter };
}

// Валидация chatId
function validateChatId(chatId) {
    if (!chatId) {
        return { valid: false, error: 'Chat ID is required' };
    }

    const id = typeof chatId === 'string' ? parseInt(chatId) : chatId;

    if (!Number.isInteger(id)) {
        return { valid: false, error: 'Chat ID must be an integer' };
    }

    if (Math.abs(id) > 9999999999999) {
        return { valid: false, error: 'Chat ID out of range' };
    }

    return { valid: true, value: id };
}

// Валидация callback_data
function validateCallbackData(data) {
    if (!data || typeof data !== 'string') {
        return { valid: false, error: 'Invalid callback data' };
    }

    if (data.length > 64) {
        return { valid: false, error: 'Callback data too long' };
    }

    return { valid: true };
}

// Санитизация Markdown для предотвращения XSS
function sanitizeMarkdown(text) {
    if (!text) return '';

    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/`/g, '\\`')
        .replace(/~/g, '\\~')
        .replace(/\|/g, '\\|')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

// Санитизация для отображения (ограничение длины и экранирование)
function sanitizeForDisplay(text) {
    if (!text) return '';

    // Экранировать специальные символы Markdown
    let sanitized = String(text)
        .replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');

    // Ограничить длину (Telegram limit 4096 символов на сообщение)
    if (sanitized.length > 4000) {
        sanitized = sanitized.substring(0, 4000) + '...';
    }

    return sanitized;
}

module.exports = {
    validateTicketId,
    validateStatus,
    validatePriority,
    validateFilter,
    validateChatId,
    validateCallbackData,
    sanitizeMarkdown,
    sanitizeForDisplay
};
