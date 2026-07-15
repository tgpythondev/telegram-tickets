require('dotenv').config();

const config = {
  token: process.env.DISCORD_TOKEN,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID,
  autoRoleId: process.env.AUTO_ROLE_ID,
  guildId: process.env.GUILD_ID || null,
  welcomeText: process.env.WELCOME_TEXT || 'Добро пожаловать на сервер, {user}! 🎉',
};

// Validate required config
const required = ['token', 'welcomeChannelId', 'autoRoleId'];
for (const key of required) {
  if (!config[key] || config[key].startsWith('your_')) {
    console.error(`[ОШИБКА] Переменная ${key.toUpperCase()} не настроена в .env`);
    process.exit(1);
  }
}

module.exports = config;