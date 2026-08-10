/**
 * Process Manager — запускает дочерние процессы (Discord-бот, TG-бот)
 * рядом с основным Node.js сервером.
 *
 * Особенности:
 * - stdout/stderr дочерних процессов пробрасываются в основной лог
 * - При аварийном завершении процесс перезапускается с экспоненциальной
 *   задержкой (1s → 2s → 4s … max 60s), чтобы не долбить Render при
 *   систематической ошибке (неверный токен и т.п.)
 * - При graceful shutdown (SIGTERM/SIGINT) все дочерние процессы убиваются
 *   корректно через kill('SIGTERM')
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Конфигурация процессов
// command  — исполняемый файл (ищется в PATH)
// args     — аргументы
// cwd      — рабочая директория относительно корня backend
// env      — дополнительные переменные окружения (мержатся с process.env)
// enabled  — функция, возвращающая true если процесс надо запускать
const PROCESSES = [
    {
        name: 'discord-bot',
        command: 'node',
        args: ['index.js'],
        cwd: path.join(ROOT, 'discord-bot'),
        enabled: () => !!process.env.DISCORD_TOKEN
    },
    {
        name: 'tg-bot',
        // Запускаем через изолированный venv созданный в build.sh (tg-bot/.venv).
        // Это гарантирует совместимую версию Python независимо от системного дефолта.
        command: path.join(ROOT, 'tg-bot', '.venv', 'bin', 'python'),
        args: ['bot.py'],
        cwd: path.join(ROOT, 'tg-bot'),
        enabled: () => !!process.env.BOT_TOKEN
    }
];

const MAX_RESTART_DELAY_MS = 60_000;  // максимальная задержка перезапуска
const BASE_RESTART_DELAY_MS = 1_000;  // начальная задержка

// Хранилище живых процессов для graceful shutdown
const activeProcesses = new Map(); // name → ChildProcess

/**
 * Запускает один процесс с авторестартом.
 * @param {object} cfg — конфигурация из PROCESSES
 * @param {number} restartDelay — текущая задержка перезапуска (мс)
 */
function spawnProcess(cfg, restartDelay = BASE_RESTART_DELAY_MS) {
    if (!cfg.enabled()) {
        console.log(`[process-manager] ${cfg.name}: пропущен (переменная окружения не задана)`);
        return;
    }

    console.log(`[process-manager] Запуск ${cfg.name}: ${cfg.command} ${cfg.args.join(' ')}`);

    const child = spawn(cfg.command, cfg.args, {
        cwd: cfg.cwd,
        env: { ...process.env, ...(cfg.env || {}) },
        // pipe позволяет нам самим форматировать вывод с префиксом имени процесса
        stdio: ['ignore', 'pipe', 'pipe']
    });

    activeProcesses.set(cfg.name, child);

    // Пробрасываем stdout с префиксом
    child.stdout.on('data', (data) => {
        process.stdout.write(`[${cfg.name}] ${data}`);
    });

    // stderr тоже пробрасываем — aiogram пишет логи в stderr
    child.stderr.on('data', (data) => {
        process.stderr.write(`[${cfg.name}] ${data}`);
    });

    child.on('error', (err) => {
        // Обычно означает "команда не найдена" (python3 не установлен и т.п.)
        console.error(`[process-manager] ${cfg.name} ошибка запуска: ${err.message}`);
        activeProcesses.delete(cfg.name);
        scheduleRestart(cfg, restartDelay);
    });

    child.on('exit', (code, signal) => {
        activeProcesses.delete(cfg.name);

        // Нормальное завершение при shutdown — не перезапускаем
        if (signal === 'SIGTERM' || signal === 'SIGINT') {
            console.log(`[process-manager] ${cfg.name} завершён (${signal})`);
            return;
        }

        console.warn(`[process-manager] ${cfg.name} завершился с кодом ${code ?? signal}, перезапуск через ${restartDelay / 1000}s`);
        scheduleRestart(cfg, restartDelay);
    });
}

/**
 * Планирует перезапуск с экспоненциальной задержкой.
 */
function scheduleRestart(cfg, currentDelay) {
    setTimeout(() => {
        // Экспоненциальный backoff: 1s, 2s, 4s, 8s ... 60s
        const nextDelay = Math.min(currentDelay * 2, MAX_RESTART_DELAY_MS);
        spawnProcess(cfg, nextDelay);
    }, currentDelay);
}

/**
 * Запускает все настроенные процессы.
 * Вызывать один раз при старте сервера.
 */
function startAll() {
    for (const cfg of PROCESSES) {
        spawnProcess(cfg);
    }
}

/**
 * Корректно завершает все дочерние процессы.
 * Вызывать в gracefulShutdown сервера.
 */
function stopAll() {
    for (const [name, child] of activeProcesses) {
        console.log(`[process-manager] Останавливаем ${name}...`);
        child.kill('SIGTERM');
    }
    activeProcesses.clear();
}

module.exports = { startAll, stopAll };
