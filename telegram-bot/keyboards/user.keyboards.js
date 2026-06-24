// Клавиатуры для пользователей

// Клавиатура при /start (неавторизован)
function getStartKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: 'Войти', callback_data: 'auth_login' },
                { text: 'Регистрация', callback_data: 'auth_register' }
            ],
            [
                { text: '❓ Справка', callback_data: 'help' }
            ]
        ]
    };
}

// Главное меню пользователя
function getMainMenuKeyboard(notificationsEnabled = true) {
    const notifyIcon = notificationsEnabled ? '🔔' : '🔕';
    const notifyText = notificationsEnabled ? 'Уведомления: ВКЛ' : 'Уведомления: ВЫКЛ';

    return {
        inline_keyboard: [
            [
                { text: '📋 Мои тикеты', callback_data: 'tickets_list' },
                { text: '➕ Создать тикет', callback_data: 'tickets_create' }
            ],
            [
                { text: `${notifyIcon} ${notifyText}`, callback_data: 'toggle_notifications' }
            ],
            [
                { text: '🚪 Выход', callback_data: 'auth_logout' }
            ]
        ]
    };
}

// Клавиатура для списка тикетов (кнопка назад)
function getTicketsListKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '➕ Создать тикет', callback_data: 'tickets_create' }
            ],
            [
                { text: '← Назад в меню', callback_data: 'main_menu' }
            ]
        ]
    };
}

// Клавиатура для конкретного тикета (пользователь)
function getTicketKeyboard(ticketId, status) {
    const buttons = [];

    if (status !== 'closed') {
        buttons.push([
            { text: '💬 Написать сообщение', callback_data: `ticket_reply_${ticketId}` }
        ]);
        buttons.push([
            { text: '✅ Закрыть тикет', callback_data: `ticket_close_${ticketId}` }
        ]);
    }

    buttons.push([
        { text: '🔄 Обновить', callback_data: `ticket_view_${ticketId}` }
    ]);
    buttons.push([
        { text: '← Назад к списку', callback_data: 'tickets_list' }
    ]);

    return { inline_keyboard: buttons };
}

// Клавиатура отмены создания тикета
function getCancelKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '❌ Отмена', callback_data: 'main_menu' }
            ]
        ]
    };
}

// Клавиатура выбора приоритета при создании тикета
function getPriorityKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '🔵 Обычный', callback_data: 'priority_normal' },
                { text: '🟠 Высокий', callback_data: 'priority_high' }
            ],
            [
                { text: '🔴 Срочный', callback_data: 'priority_urgent' }
            ],
            [
                { text: '❌ Отмена', callback_data: 'main_menu' }
            ]
        ]
    };
}

module.exports = {
    getStartKeyboard,
    getMainMenuKeyboard,
    getTicketsListKeyboard,
    getTicketKeyboard,
    getCancelKeyboard,
    getPriorityKeyboard
};
