#!/usr/bin/env node

/**
 * Скрипт для тестирования полного flow login + refresh
 */

const API_URL = 'https://telegram-bots-backend.onrender.com';
const FRONTEND_URL = 'https://telegram-tickets.tgpythondev.workers.dev';

console.log('🔐 Тестирование полного auth flow\n');

async function testFullAuthFlow() {
    try {
        // Генерируем уникальное имя пользователя для теста
        const testUsername = `test_${Date.now()}`;
        const testPassword = 'TestPass123';

        console.log(`📝 Тест пользователь: ${testUsername}\n`);

        // Шаг 1: Получаем CSRF токен
        console.log('1️⃣  Получаем CSRF токен...');
        const csrfResponse = await fetch(`${API_URL}/api/auth/csrf`, {
            headers: { 'Origin': FRONTEND_URL },
            credentials: 'include'
        });
        const { csrfToken } = await csrfResponse.json();
        console.log(`   ✅ CSRF токен: ${csrfToken.substring(0, 16)}...\n`);

        // Шаг 2: Регистрация
        console.log('2️⃣  Регистрация...');
        const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': FRONTEND_URL,
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ username: testUsername, password: testPassword })
        });

        if (!registerResponse.ok) {
            const error = await registerResponse.json();
            console.log(`   ❌ Ошибка регистрации: ${error.error}`);
            return;
        }

        const registerData = await registerResponse.json();
        console.log(`   ✅ Пользователь создан: ${registerData.user.username}`);
        console.log(`   ✅ Access token: ${registerData.accessToken.substring(0, 20)}...`);

        // Проверяем Set-Cookie header
        const setCookie = registerResponse.headers.get('set-cookie');
        console.log(`   Set-Cookie header: ${setCookie ? 'Есть' : 'Отсутствует'}`);

        if (setCookie) {
            console.log(`   Cookie details: ${setCookie.substring(0, 100)}...`);

            // Проверяем флаги
            const hasHttpOnly = setCookie.includes('HttpOnly');
            const hasSecure = setCookie.includes('Secure');
            const hasSameSite = setCookie.includes('SameSite');
            const sameSiteValue = setCookie.match(/SameSite=(\w+)/)?.[1];

            console.log(`   - HttpOnly: ${hasHttpOnly ? '✅' : '❌'}`);
            console.log(`   - Secure: ${hasSecure ? '✅' : '❌'}`);
            console.log(`   - SameSite: ${hasSameSite ? `✅ (${sameSiteValue})` : '❌'}`);

            if (sameSiteValue !== 'None') {
                console.log(`   ⚠️  ПРОБЛЕМА: SameSite должен быть 'None' для cross-origin!`);
                console.log(`   Текущее значение: ${sameSiteValue}`);
            }
        } else {
            console.log(`   ❌ ПРОБЛЕМА: Cookie не установлен!`);
        }

        console.log('');

        // Шаг 3: Симулируем refresh (через 1 секунду)
        console.log('3️⃣  Ждем 1 секунду перед refresh...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('4️⃣  Пытаемся обновить access token...');
        const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Origin': FRONTEND_URL,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        console.log(`   Статус: ${refreshResponse.status}`);

        if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            console.log(`   ✅ Новый access token: ${refreshData.accessToken.substring(0, 20)}...`);
        } else {
            const errorData = await refreshResponse.json();
            console.log(`   ❌ Ошибка: ${errorData.error}`);
            console.log(`
   ДИАГНОСТИКА:
   - Если ошибка "Refresh token required" - cookie не был отправлен браузером
   - Если ошибка "Invalid or expired refresh token" - проблема с JWT или БД
   - Если статус 403 - возможна проблема с CORS или CSRF middleware
            `);
        }

        console.log('');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error.message);
    }
}

console.log('━'.repeat(60));
console.log('');
testFullAuthFlow();
