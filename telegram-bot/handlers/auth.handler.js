const api = require('../services/api.service');
const session = require('../utils/session');
const { getStartKeyboard, getMainMenuKeyboard } = require('../keyboards/user.keyboards');
const { getAdminMenuKeyboard } = require('../keyboards/admin.keyboards');
const path = require('path');
const fs = require('fs');

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
        // Путь к баннеру
        const bannerPath = path.join(__dirname, '../images/banner.png');

        const welcomeMessage = `Привет, ${firstName}! 👋\n\n` +
            `Добро пожаловать в систему поддержки Kaliang.\n\n` +
            `Здесь вы можете:\n` +
            `• Создавать тикеты с вопросами\n` +
            `• Отслеживать статус своих обращений\n` +
            `• Получать уведомления об ответах\n\n` +
            `Для начала работы войдите в аккаунт или зарегистрируйтесь.`;

        // Попытаться отправить баннер
        if (fs.existsSync(bannerPath)) {
            try {
                // Проверить размер файла
                const stats = fs.statSync(bannerPath);
                const fileSizeInMB = stats.size / (1024 * 1024);

                if (fileSizeInMB > 10) {
                    console.warn(`⚠️ Banner file too large: ${fileSizeInMB.toFixed(2)} MB`);
                    // Fallback на текстовое сообщение
                    await bot.sendMessage(chatId, welcomeMessage, {
                        reply_markup: getStartKeyboard()
                    });
                } else {
                    await bot.sendPhoto(chatId, bannerPath, {
                        caption: welcomeMessage,
                        reply_markup: getStartKeyboard()
                    });
                }
            } catch (error) {
                console.error('Failed to send banner:', error.message);
                // Fallback на текстовое сообщение
                await bot.sendMessage(chatId, welcomeMessage, {
                    reply_markup: getStartKeyboard()
                });
            }
        } else {
            console.warn('⚠️ Banner file not found:', bannerPath);
            // Fallback на текстовое сообщение
            await bot.sendMessage(chatId, welcomeMessage, {
                reply_markup: getStartKeyboard()
            });
        }
    }
}

// Обработка входа
async function handleLogin(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // ВАЖНО: Немедленно удаляем сообщение с паролем из чата
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (error) {
        console.error('Failed to delete message:', error.message);
    }

    // Формат: /login username password
    const parts = text.split(' ').filter(p => p.length > 0);

    if (parts.length !== 3) {
        await bot.sendMessage(chatId,
            `❌ Неверный формат команды.\n\n` +
            `⚠️ ВНИМАНИЕ: Для безопасности используйте веб-интерфейс для входа!\n\n` +
            `Если все же хотите войти через бот:\n` +
            `\`/login username password\`\n\n` +
            `⚠️ Сообщение с паролем будет автоматически удалено.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const [, username, password] = parts;

    // Валидация username
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        await bot.sendMessage(chatId,
            `❌ Некорректный логин. Используйте только буквы, цифры, _ и -`
        );
        return;
    }

    // Валидация пароля
    if (password.length < 8) {
        await bot.sendMessage(chatId, '❌ Пароль должен содержать минимум 8 символов.');
        return;
    }

    await bot.sendMessage(chatId, '🔄 Вход в систему...');

    const result = await api.login(username, password);

    if (!result.success) {
        // Добавить фиксированную задержку для предотвращения timing attacks
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

        await bot.sendMessage(chatId,
            `❌ Неверный логин или пароль.\n\n` +
            `Попробуйте снова или зарегистрируйте новый аккаунт.`
        );

        console.warn(`Failed login attempt for chat ${chatId}`);
        return;
    }

    // Проверка структуры ответа
    if (!result.data || !result.data.user || !result.data.accessToken) {
        console.error('Invalid login response structure:', JSON.stringify(result));
        await bot.sendMessage(chatId, '❌ Ошибка сервера при входе. Попробуйте позже.');
        return;
    }

    const { user, accessToken } = result.data;

    // Привязать Telegram к аккаунту
    const linkResult = await api.linkTelegram(accessToken, chatId);

    if (!linkResult.success) {
        console.error('Failed to link Telegram:', linkResult.error);
        // Уведомляем пользователя, но не блокируем вход
        await bot.sendMessage(chatId,
            `⚠️ Предупреждение: Не удалось привязать Telegram аккаунт.\n` +
            `Уведомления могут не работать.`
        );
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

    // ВАЖНО: Немедленно удаляем сообщение с паролем из чата
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (error) {
        console.error('Failed to delete message:', error.message);
    }

    // Формат: /register username password
    const parts = text.split(' ').filter(p => p.length > 0);

    if (parts.length !== 3) {
        await bot.sendMessage(chatId,
            `❌ Неверный формат команды.\n\n` +
            `⚠️ ВНИМАНИЕ: Для безопасности используйте веб-интерфейс для регистрации!\n\n` +
            `Если все же хотите зарегистрироваться через бот:\n` +
            `\`/register username password\`\n\n` +
            `Требования:\n` +
            `• Логин: 3-20 символов (буквы, цифры, _ и -)\n` +
            `• Пароль: минимум 8 символов, буквы и цифры\n\n` +
            `⚠️ Сообщение с паролем будет автоматически удалено.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const [, username, password] = parts;

    // Валидация username
    if (username.length < 3 || username.length > 20) {
        await bot.sendMessage(chatId, '❌ Логин должен содержать от 3 до 20 символов.');
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        await bot.sendMessage(chatId, '❌ Логин может содержать только буквы, цифры, _ и -');
        return;
    }

    // Усиленная валидация пароля
    if (password.length < 8) {
        await bot.sendMessage(chatId, '❌ Пароль должен содержать минимум 8 символов.');
        return;
    }

    if (!/[a-zA-Z]/.test(password)) {
        await bot.sendMessage(chatId, '❌ Пароль должен содержать хотя бы одну букву.');
        return;
    }

    if (!/[0-9]/.test(password)) {
        await bot.sendMessage(chatId, '❌ Пароль должен содержать хотя бы одну цифру.');
        return;
    }

    await bot.sendMessage(chatId, '🔄 Создание аккаунта...');

    const result = await api.register(username, password);

    if (!result.success) {
        // Добавить задержку для предотвращения timing attacks
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

        await bot.sendMessage(chatId,
            `❌ Не удалось создать аккаунт.\n\n` +
            `Возможно, такой логин уже занят или не соответствует требованиям.`
        );

        console.warn(`Failed registration attempt for chat ${chatId}`);
        return;
    }

    // Проверка структуры ответа
    if (!result.data || !result.data.user || !result.data.accessToken) {
        console.error('Invalid register response structure:', JSON.stringify(result));
        await bot.sendMessage(chatId, '❌ Ошибка сервера при регистрации. Попробуйте позже.');
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
