#!/usr/bin/env node

/**
 * Скрипт для тестирования refresh token endpoint
 * Проверяет cookie настройки и CORS headers
 */

const API_URL = process.env.API_URL || 'https://telegram-bots-backend.onrender.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://telegram-tickets.tgpythondev.workers.dev';

console.log('🔍 Тестирование refresh token endpoint\n');
console.log(`Backend: ${API_URL}`);
console.log(`Frontend: ${FRONTEND_URL}\n`);

async function testRefreshEndpoint() {
    try {
        // Тест 1: Проверка OPTIONS preflight для CORS
        console.log('📋 Тест 1: OPTIONS preflight request');
        const optionsResponse = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'OPTIONS',
            headers: {
                'Origin': FRONTEND_URL,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type'
            }
        });

        console.log(`  Статус: ${optionsResponse.status}`);
        console.log(`  Access-Control-Allow-Origin: ${optionsResponse.headers.get('access-control-allow-origin')}`);
        console.log(`  Access-Control-Allow-Credentials: ${optionsResponse.headers.get('access-control-allow-credentials')}`);
        console.log(`  Access-Control-Allow-Methods: ${optionsResponse.headers.get('access-control-allow-methods')}`);

        if (optionsResponse.headers.get('access-control-allow-origin') !== FRONTEND_URL) {
            console.log('  ❌ CORS не настроен правильно для вашего фронтенда!');
            console.log(`  Ожидалось: ${FRONTEND_URL}`);
            console.log(`  Получено: ${optionsResponse.headers.get('access-control-allow-origin')}`);
        } else {
            console.log('  ✅ CORS preflight OK');
        }

        console.log('');

        // Тест 2: Проверка POST без refresh token
        console.log('📋 Тест 2: POST /api/auth/refresh без refresh token');
        const noTokenResponse = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Origin': FRONTEND_URL,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        console.log(`  Статус: ${noTokenResponse.status}`);
        const noTokenData = await noTokenResponse.json();
        console.log(`  Response:`, noTokenData);

        if (noTokenResponse.status === 401) {
            console.log('  ✅ Правильно возвращает 401 без токена');
        } else if (noTokenResponse.status === 403) {
            console.log('  ⚠️  Возвращает 403 вместо 401 - возможно проблема с CSRF или CORS');
        }

        console.log('');

        // Тест 3: Проверка health endpoint
        console.log('📋 Тест 3: Health check');
        const healthResponse = await fetch(`${API_URL}/health`);
        const healthData = await healthResponse.json();
        console.log(`  Статус: ${healthResponse.status}`);
        console.log(`  Database: ${healthData.database}`);

        if (healthData.database === 'connected') {
            console.log('  ✅ База данных подключена');
        } else {
            console.log('  ❌ База данных НЕ подключена - проверьте DATABASE_URL');
        }

        console.log('');

        // Тест 4: Проверка CSRF endpoint
        console.log('📋 Тест 4: CSRF token endpoint');
        const csrfResponse = await fetch(`${API_URL}/api/auth/csrf`, {
            headers: {
                'Origin': FRONTEND_URL
            },
            credentials: 'include'
        });

        console.log(`  Статус: ${csrfResponse.status}`);
        const csrfData = await csrfResponse.json();
        console.log(`  CSRF token получен: ${csrfData.csrfToken ? 'Да' : 'Нет'}`);

        if (csrfResponse.status === 200 && csrfData.csrfToken) {
            console.log('  ✅ CSRF endpoint работает');
        } else {
            console.log('  ❌ Проблема с CSRF endpoint');
        }

        console.log('');

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
        if (error.cause) {
            console.error('  Причина:', error.cause);
        }
    }
}

// Рекомендации
console.log('📝 РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ:\n');
console.log('1. Убедитесь, что на Render.com установлены environment variables:');
console.log(`   FRONTEND_URL=${FRONTEND_URL}`);
console.log('   NODE_ENV=production\n');

console.log('2. Проверьте, что backend задеплоен с последними изменениями:');
console.log('   - sameSite: "none" в production');
console.log('   - secure: true в production\n');

console.log('3. В Render.com Dashboard → Logs найдите строки:');
console.log('   [AUTH] Refresh token request received');
console.log('   [AUTH] Has refresh token cookie: ...\n');

console.log('Запускаю тесты...\n');
console.log('━'.repeat(60));
console.log('');

testRefreshEndpoint();
