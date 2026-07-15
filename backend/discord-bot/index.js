const { Client, GatewayIntentBits, Events, PermissionsBitField } = require('discord.js');
const config = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Хранилище для антидубль защиты (user_id -> set of guild_ids)
const recentJoins = new Map();

/**
 * Форматирует приветственный текст, заменяя плейсхолдеры
 */
function formatWelcomeText(template, member) {
  return template
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{guild}/g, member.guild.name);
}

/**
 * Логирование в консоль с временной меткой
 */
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${timestamp}] [${type}] ${message}`);
}

client.once(Events.ClientReady, () => {
  log(`Бот запущен как ${client.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // --- Ограничение на один сервер (GUILD_ID) ---
    if (config.guildId && member.guild.id !== config.guildId) {
      return;
    }

    // --- Антидубль: защита от повторных событий ---
    const joinKey = `${member.id}-${member.guild.id}`;
    if (recentJoins.has(joinKey)) {
      log(`Пропущен повторный join: ${member.user.tag} на ${member.guild.name}`, 'SKIP');
      return;
    }
    recentJoins.set(joinKey, Date.now());
    // Очистка устаревших записей через 10 секунд
    setTimeout(() => recentJoins.delete(joinKey), 10_000);

    // --- Приветственное сообщение ---
    const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!welcomeChannel) {
      log(`Канал приветствий (ID: ${config.welcomeChannelId}) не найден на сервере ${member.guild.name}`, 'ERROR');
      return;
    }

    const welcomeMessage = formatWelcomeText(config.welcomeText, member);
    await welcomeChannel.send(welcomeMessage);
    log(`Отправлено приветствие для ${member.user.tag} в #${welcomeChannel.name}`);

    // --- Автовыдача роли ---
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (!role) {
      log(`Роль (ID: ${config.autoRoleId}) не найдена на сервере ${member.guild.name}`, 'ERROR');
      return;
    }

    // Проверка прав бота
    const botMember = member.guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      log(`Нет права Manage Roles на сервере ${member.guild.name}`, 'ERROR');
      return;
    }

    // Проверка иерархии ролей
    if (role.position >= botMember.roles.highest.position) {
      log(`Роль "${role.name}" (${role.id}) выше или равна высшей роли бота на сервере ${member.guild.name}. Выдача невозможна.`, 'ERROR');
      return;
    }

    await member.roles.add(role);
    log(`Выдана роль "${role.name}" пользователю ${member.user.tag}`);
  } catch (error) {
    log(`Ошибка при обработке входа ${member.user.tag}: ${error.message}`, 'ERROR');
    // Дополнительный вывод в консоль для отладки
    console.error(error);
  }
});

client.login(config.token);