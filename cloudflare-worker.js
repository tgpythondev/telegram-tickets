// Cloudflare Worker для проксирования API запросов
// Разместите этот файл на telegram-tickets.tgpythondev.workers.dev

const BACKEND_URL = 'https://telegram-bots-backend.onrender.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Проксируем все /api/* запросы на backend
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, url);
    }

    // Для остальных запросов возвращаем статические файлы
    // (если используете Cloudflare Pages)
    return env.ASSETS.fetch(request);
  }
};

async function handleApiRequest(request, url) {
  // Формируем URL для backend
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  // Копируем все headers из оригинального запроса
  const headers = new Headers(request.headers);

  // Устанавливаем правильный Origin для CORS
  headers.set('Origin', new URL(BACKEND_URL).origin);

  // Создаем новый запрос к backend
  const backendRequest = new Request(backendUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
  });

  try {
    // Отправляем запрос на backend
    const response = await fetch(backendRequest);

    // Копируем response
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });

    // Добавляем CORS headers для фронтенда
    newResponse.headers.set('Access-Control-Allow-Origin', url.origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');

    return newResponse;

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Backend connection failed',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }
}
