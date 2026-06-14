const api = require('../services/api.service');
const session = require('../utils/session');
const { getStartKeyboard, getMainMenuKeyboard } = require('../keyboards/user.keyboards');
const { getAdminMenuKeyboard } = require('../keyboards/admin.keyboards');

// Команда /start
async function handleStart(bot, msg) {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Пользователь';

    // Проверить, авторизован ли пользователь
    if (session.isAuthenticated(chatId)) {
        const sess = session.getSession(chatId);

        if (sess.isAdmin) {
            await bot.sendMessage(chatId,
                `Привет, ${firstName}! 👋\n\nВы вошли как администратор.\nВыберите действие:`,
                { reply_markup: getAdminMenuKeyboard() }
            );
        } else {
            await bot.sendMessage(chatId,
                `Привет, ${firstName}! 👋\n\nВы уже авторизованы.\nВыберите действие:`,
                { reply_markup: getMainMenuKeyboard(sess.notificationsEnabled) }
            );
        }
    } else {
        await bot.sendMessage(chatId,
            `Привет, ${firstName}! 👋\n\n` +
            `Добро пожаловать в систему поддержки Kaliang.\n\n` +
            `Здесь вы можете:\n` +
            `• Создавать тикеты с вопросами\n` +
            `• Отслеживать статус своих обращений\n` +
            `• Получать уведомления об ответах\n\n` +
            `Для начала работы войдите в аккаунт или зарегистрируйтесь.`,
            { reply_markup: getStartKeyboard() }
        );
    }
}

// Обработка входа
async function handleLogin(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Формат: /login username password
    const parts = text.split(' ').filter(p => p.length > 0);

    if (parts.length !== 3) {
        await bot.sendMessage(chatId,
            `❌ Неверный формат команды.\n\n` +
            `Используйте: \`/login username password\`\n\n` +
            `Пример: \`/login myuser mypass123\``,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const [, username, password] = parts;

    await bot.sendMessage(chatId, '🔄 Вход в систему...');

    const result = await api.login(username, password);

    if (!result.success) {
        await bot.sendMessage(chatId,
            `❌ Ошибка входа: ${result.error}\n\n` +
            `Проверьте логин и пароль и попробуйте снова.`
        );
        return;
    }

    const { user, accessToken } = result.data;

    // Привязать Telegram к аккаунту
    const linkResult = await api.linkTelegram(accessToken, chatId);

    if (!linkResult.success) {
        console.error('Failed to link Telegram:', linkResult.error);
    }

    // Сохранить сессию
    session.setSession(chatId, {
        userId: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        accessToken: accessToken,
        notificationsEnabled: false,
        state: 'idle'
    });

    if (user.isAdmin) {
        await bot.sendMessage(chatId,
            `✅ Успешный вход как администратор!\n\n` +
            `Добро пожаловать, ${user.username}.`,
            { reply_markup: getAdminMenuKeyboard() }
        );
    } else {
        await bot.sendMessage(chatId,
            `✅ Вы успешно вошли в систему!\n\n` +
            `Добро пожаловать, ${user.username}.\n` +
            `Теперь вы можете создавать тикеты и получать уведомления.`,
            { reply_markup: getMainMenuKeyboard(false) }
        );
    }
}

// Обработка регистрации
async function handleRegister(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Формат: /register username password
    const parts = text.split(' ').filter(p => p.length > 0);

    if (parts.length !== 3) {
        await bot.sendMessage(chatId,
            `❌ Неверный формат команды.\n\n` +
            `Используйте: \`/register username password\`\n\n` +
            `Требования:\n` +
            `• Логин: минимум 3 символа\n` +
            `• Пароль: минимум 6 символов\n\n` +
            `Пример: \`/register myuser mypass123\``,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const [, username, password] = parts;

    if (username.length < 3) {
        await bot.sendMessage(chatId, '❌ Логин должен содержать минимум 3 символа.');
        return;
    }

    if (password.length < 6) {
        await bot.sendMessage(chatId, '❌ Пароль должен содержать минимум 6 символов.');
        return;
    }

    await bot.sendMessage(chatId, '🔄 Создание аккаунта...');

    const result = await api.register(username, password);

    if (!result.success) {
        await bot.sendMessage(chatId,
            `❌ Ошибка регистрации: ${result.error}\n\n` +
            `Возможно, такой логин уже занят.`
        );
        return;
    }

    const { user, accessToken } = result.data;

    // Привязать Telegram к аккаунту
    await api.linkTelegram(accessToken, chatId);

    // Сохранить сессию
    session.setSession(chatId, {
        userId: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        accessToken: accessToken,
        notificationsEnabled: false,
        state: 'idle'
    });

    await bot.sendMessage(chatId,
        `✅ Аккаунт успешно создан!\n\n` +
        `Добро пожаловать, ${user.username}!\n` +
        `Теперь вы можете создавать тикеты и получать уведомления.`,
        { reply_markup: getMainMenuKeyboard(false) }
    );
}

// Обработка выхода
async function handleLogout(bot, chatId) {
    session.clearSession(chatId);

    await bot.sendMessage(chatId,
        `👋 Вы вышли из системы.\n\n` +
        `Для повторного входа используйте /start`,
        { reply_markup: getStartKeyboard() }
    );
}

// Команда /help
async function handleHelp(bot, msg) {
    const chatId = msg.chat.id;
    const isAuth = session.isAuthenticated(chatId);
    const isAdm = session.isAdmin(chatId);

    let helpText = `📖 *Справка*\n\n`;

    if (!isAuth) {
        helpText +=
            `*Авторизация:*\n` +
            `/login username password - Вход в аккаунт\n` +
            `/register username password - Регистрация\n\n` +
            `*Общие:*\n` +
            `/start - Главное меню\n` +
            `/help - Эта справка`;
    } else if (isAdm) {
        helpText +=
            `*Админские команды:*\n` +
            `/tickets - Все тикеты\n` +
            `/stats - Статистика\n` +
            `/menu - Главное меню\n\n` +
            `*Общие:*\n` +
            `/logout - Выход\n` +
            `/help - Эта справка\n\n` +
            `Большинство функций доступны через кнопки меню.`;
    } else {
        helpText +=
            `*Пользовательские команды:*\n` +
            `/create - Создать тикет\n` +
            `/list - Мои тикеты\n` +
            `/menu - Главное меню\n` +
            `/notify - Уведомления вкл/выкл\n\n` +
            `*Общие:*\n` +
            `/logout - Выход\n` +
            `/help - Эта справка\n\n` +
            `Большинство функций доступны через кнопки меню.`;
    }

    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

module.exports = {
    handleStart,
    handleLogin,
    handleRegister,
    handleLogout,
    handleHelp
};
