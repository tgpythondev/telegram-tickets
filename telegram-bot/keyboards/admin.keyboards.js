// Клавиатуры для администраторов

// Главное меню админа
function getAdminMenuKeyboard() {
    const appUrl = process.env.APP_URL || 'http://localhost:8080';
    return {
        inline_keyboard: [
            [
                { text: '🟢 Открытые', callback_data: 'admin_tickets_open' },
                { text: '🟡 В работе', callback_data: 'admin_tickets_in_progress' }
            ],
            [
                { text: '⚫ Закрытые', callback_data: 'admin_tickets_closed' },
                { text: '📊 Все тикеты', callback_data: 'admin_tickets_all' }
            ],
            [
                { text: '👤 Мои тикеты', callback_data: 'admin_tickets_mine' }
            ],
            [
                { text: '📈 Статистика', callback_data: 'admin_stats' }
            ],
            [
                { text: '🌐 Веб-панель', url: `${appUrl}/admin/dashboard.html` }
            ]
        ]
    };
}

// Клавиатура для списка тикетов админа
function getAdminTicketsListKeyboard(currentFilter = 'all') {
    return {
        inline_keyboard: [
            [
                { text: '🟢 Открытые', callback_data: 'admin_tickets_open' },
                { text: '🟡 В работе', callback_data: 'admin_tickets_in_progress' }
            ],
            [
                { text: '← Назад в меню', callback_data: 'admin_menu' }
            ]
        ]
    };
}

// Клавиатура для управления тикетом (админ)
function getTicketAdminKeyboard(ticketId, currentStatus) {
    const buttons = [];

    // Кнопка ответить
    if (currentStatus !== 'closed') {
        buttons.push([
            { text: '💬 Ответить', callback_data: `admin_reply_${ticketId}` }
        ]);
    }

    // Кнопки изменения статуса
    const statusButtons = [];
    if (currentStatus !== 'open') {
        statusButtons.push({ text: '🟢 Открыть', callback_data: `admin_status_${ticketId}_open` });
    }
    if (currentStatus !== 'in_progress') {
        statusButtons.push({ text: '🟡 В работу', callback_data: `admin_status_${ticketId}_in_progress` });
    }
    if (currentStatus !== 'closed') {
        statusButtons.push({ text: '⚫ Закрыть', callback_data: `admin_status_${ticketId}_closed` });
    }

    if (statusButtons.length > 0) {
        // Разбить на строки по 2 кнопки
        for (let i = 0; i < statusButtons.length; i += 2) {
            buttons.push(statusButtons.slice(i, i + 2));
        }
    }

    // Кнопка назначить себе
    buttons.push([
        { text: '👤 Назначить себе', callback_data: `admin_assign_${ticketId}` }
    ]);

    // Кнопки навигации
    buttons.push([
        { text: '🔄 Обновить', callback_data: `admin_ticket_view_${ticketId}` }
    ]);
    buttons.push([
        { text: '← К списку тикетов', callback_data: 'admin_tickets_all' }
    ]);

    return { inline_keyboard: buttons };
}

// Клавиатура для изменения приоритета тикета
function getPriorityAdminKeyboard(ticketId) {
    return {
        inline_keyboard: [
            [
                { text: '🔵 Обычный', callback_data: `admin_priority_${ticketId}_normal` },
                { text: '🟠 Высокий', callback_data: `admin_priority_${ticketId}_high` }
            ],
            [
                { text: '🔴 Срочный', callback_data: `admin_priority_${ticketId}_urgent` }
            ],
            [
                { text: '← Назад', callback_data: `admin_ticket_view_${ticketId}` }
            ]
        ]
    };
}

// Клавиатура отмены для админа
function getAdminCancelKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '❌ Отмена', callback_data: 'admin_menu' }
            ]
        ]
    };
}

module.exports = {
    getAdminMenuKeyboard,
    getAdminTicketsListKeyboard,
    getTicketAdminKeyboard,
    getPriorityAdminKeyboard,
    getAdminCancelKeyboard
};
