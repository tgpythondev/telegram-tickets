const crypto = require('crypto');
const db = require('../models/db');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/audit');
const { getCookieOptions } = require('./auth.controller');

// ============ КОНФИГУРАЦИЯ ПРОВАЙДЕРОВ ============

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://telegram-bots.pl').replace(/\/$/, '');

// Конфигурация провайдера читается из env при каждом запросе,
// чтобы ключи можно было добавить без изменения кода
function getProviderConfig(provider) {
    switch (provider) {
        case 'discord': {
            const clientId = process.env.DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET;
            return {
                provider,
                enabled: !!(clientId && clientSecret),
                clientId,
                clientSecret,
                authorizeUrl: 'https://discord.com/oauth2/authorize',
                tokenUrl: 'https://discord.com/api/oauth2/token',
                scope: 'identify email',
                redirectUri: process.env.DISCORD_REDIRECT_URI || `${BACKEND_URL}/api/auth/oauth/discord/callback`
            };
        }
        case 'google': {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            return {
                provider,
                enabled: !!(clientId && clientSecret),
                clientId,
                clientSecret,
                authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                scope: 'openid email profile',
                redirectUri: process.env.GOOGLE_REDIRECT_URI || `${BACKEND_URL}/api/auth/oauth/google/callback`,
                extraAuthorizeParams: { prompt: 'select_account' }
            };
        }
        case 'github': {
            const clientId = process.env.GITHUB_CLIENT_ID;
            const clientSecret = process.env.GITHUB_CLIENT_SECRET;
            return {
                provider,
                enabled: !!(clientId && clientSecret),
                clientId,
                clientSecret,
                authorizeUrl: 'https://github.com/login/oauth/authorize',
                tokenUrl: 'https://github.com/login/oauth/access_token',
                scope: 'read:user user:email',
                redirectUri: process.env.GITHUB_REDIRECT_URI || `${BACKEND_URL}/api/auth/oauth/github/callback`
            };
        }
        default:
            return null;
    }
}

// ============ OAUTH STATE (анти-CSRF) ============

// state -> { provider, expiresAt }
const oauthStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 минут

function cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, data] of oauthStates) {
        if (data.expiresAt < now) oauthStates.delete(state);
    }
}

function createState(provider) {
    cleanupExpiredStates();
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { provider, expiresAt: Date.now() + STATE_TTL_MS });
    return state;
}

function consumeState(state, provider) {
    const data = oauthStates.get(state);
    if (!data) return false;
    oauthStates.delete(state); // одноразовый
    return data.provider === provider && data.expiresAt > Date.now();
}

// ============ HTTP-обмен с провайдерами ============

async function exchangeCodeForToken(cfg, code) {
    const body = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirectUri
    });

    const res = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'telegram-bots-pl-backend'
        },
        body: body.toString()
    });

    if (!res.ok) {
        throw new Error(`Token exchange failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.access_token) {
        throw new Error('Token exchange failed: no access_token in response');
    }
    return data.access_token;
}

// Discord: GET /users/@me
async function fetchDiscordProfile(cfg, code) {
    const accessToken = await exchangeCodeForToken(cfg, code);

    const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Discord user fetch failed: HTTP ${res.status}`);

    const u = await res.json();
    return {
        providerUserId: String(u.id),
        email: u.email || null,
        emailVerified: !!u.verified,
        displayName: u.global_name || u.username || ''
    };
}

// Google: userinfo endpoint
async function fetchGoogleProfile(cfg, code) {
    const accessToken = await exchangeCodeForToken(cfg, code);

    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Google userinfo fetch failed: HTTP ${res.status}`);

    const u = await res.json();
    return {
        providerUserId: String(u.sub),
        email: u.email || null,
        emailVerified: !!u.email_verified,
        displayName: u.name || ''
    };
}

// GitHub: /user + /user/emails (email может быть скрыт)
async function fetchGithubProfile(cfg, code) {
    const accessToken = await exchangeCodeForToken(cfg, code);
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'telegram-bots-pl-backend'
    };

    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) throw new Error(`GitHub user fetch failed: HTTP ${userRes.status}`);
    const u = await userRes.json();

    let email = u.email || null;
    let emailVerified = !!u.email;

    if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsRes.ok) {
            const emails = await emailsRes.json();
            const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified);
            if (primary) {
                email = primary.email;
                emailVerified = true;
            }
        }
    }

    return {
        providerUserId: String(u.id),
        email,
        emailVerified,
        displayName: u.name || u.login || ''
    };
}

const profileFetchers = {
    discord: fetchDiscordProfile,
    google: fetchGoogleProfile,
    github: fetchGithubProfile
};

// ============ СОЗДАНИЕ/ПОИСК ПОЛЬЗОВАТЕЛЯ ============

function sanitizeUsername(name) {
    return (name || '')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 20);
}

async function generateUniqueUsername(profile, provider) {
    const base = sanitizeUsername(profile.displayName) || provider;
    let candidate = base.length >= 3 ? base : `${base}${crypto.randomBytes(2).toString('hex')}`;

    for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await db.findUserByUsername(candidate);
        if (!existing) return candidate;
        candidate = `${base.slice(0, 13)}_${crypto.randomBytes(3).toString('hex')}`;
    }
    throw new Error('Unable to generate unique username');
}

// Возвращает { user, isNewUser }
async function findOrCreateOAuthUser(provider, profile) {
    // 1. Уже привязанный OAuth-аккаунт
    const oauthAccount = await db.findOAuthAccount(provider, profile.providerUserId);
    if (oauthAccount) {
        const user = await db.findUserById(oauthAccount.user_id);
        if (user) {
            await db.touchOAuthAccount(provider, profile.providerUserId);
            return { user, isNewUser: false };
        }
    }

    // 2. Существующий аккаунт с тем же email — привязываем к нему
    if (profile.email && profile.emailVerified) {
        const existingUser = await db.findUserByEmail(profile.email.toLowerCase());
        if (existingUser) {
            await db.linkOAuthAccount(existingUser.id, provider, profile.providerUserId, profile.email.toLowerCase());
            return { user: existingUser, isNewUser: false };
        }
    }

    // 3. Новый пользователь
    const username = await generateUniqueUsername(profile, provider);
    const email = profile.email && profile.emailVerified ? profile.email.toLowerCase() : null;
    const user = await db.createUserOAuth(username, email);
    await db.linkOAuthAccount(user.id, provider, profile.providerUserId, email);
    return { user, isNewUser: true };
}

// ============ СЕССИЯ ============

async function issueSession(user, req, res) {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 30);

    await db.updateLastLogin(user.id);
    await db.deleteUserRefreshTokens(user.id);
    await db.saveRefreshToken(user.id, refreshToken, refreshExpiry);

    res.cookie('refreshToken', refreshToken, getCookieOptions());
    return accessToken;
}

function redirectToFrontend(res, params) {
    const url = new URL('/auth.html', FRONTEND_URL);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return res.redirect(url.toString());
}

// ============ HANDLERS ============

// GET /api/auth/oauth/providers — какие провайдеры настроены
async function getProvidersStatus(req, res) {
    res.json({
        providers: {
            discord: getProviderConfig('discord').enabled,
            google: getProviderConfig('google').enabled,
            github: getProviderConfig('github').enabled
        }
    });
}

// GET /api/auth/oauth/:provider — редирект на страницу авторизации провайдера
async function redirectToProvider(req, res) {
    const cfg = getProviderConfig(req.params.provider);

    if (!cfg) {
        return res.status(404).json({ error: 'Unknown OAuth provider' });
    }
    if (!cfg.enabled) {
        return redirectToFrontend(res, { oauth_error: 'provider_disabled', provider: cfg.provider });
    }

    const state = createState(cfg.provider);

    const url = new URL(cfg.authorizeUrl);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', cfg.scope);
    url.searchParams.set('state', state);
    if (cfg.extraAuthorizeParams) {
        for (const [key, value] of Object.entries(cfg.extraAuthorizeParams)) {
            url.searchParams.set(key, value);
        }
    }

    res.redirect(url.toString());
}

// GET /api/auth/oauth/:provider/callback — обработка кода от провайдера
async function handleCallback(req, res) {
    const provider = req.params.provider;
    const cfg = getProviderConfig(provider);

    console.log(`[OAuth:${provider}] callback hit`);

    if (!cfg) {
        return res.status(404).json({ error: 'Unknown OAuth provider' });
    }

    // Пользователь нажал "Отмена" на стороне провайдера
    if (req.query.error) {
        console.warn(`[OAuth:${provider}] provider returned error: ${req.query.error}`);
        return redirectToFrontend(res, { oauth_error: 'access_denied', provider });
    }

    const { code, state } = req.query;
    if (!code || !state) {
        console.warn(`[OAuth:${provider}] missing code/state in query`);
        return redirectToFrontend(res, { oauth_error: 'invalid_state', provider });
    }
    if (!consumeState(state, provider)) {
        // Типичные причины: рестарт инстанса между authorize и callback,
        // повторное использование state, или >10 минут на авторизацию
        console.warn(`[OAuth:${provider}] invalid/expired/reused state`);
        return redirectToFrontend(res, { oauth_error: 'invalid_state', provider });
    }

    try {
        const profile = await profileFetchers[provider](cfg, code);
        console.log(`[OAuth:${provider}] profile fetched: providerUserId=${profile.providerUserId}, emailVerified=${profile.emailVerified}`);

        if (!profile.email || !profile.emailVerified) {
            return redirectToFrontend(res, { oauth_error: 'email_required', provider });
        }

        const { user, isNewUser } = await findOrCreateOAuthUser(provider, profile);
        console.log(`[OAuth:${provider}] user ready: id=${user.id}, username=${user.username}, isNew=${isNewUser}`);

        // Сессия: все записи в БД await-ятся ДО редиректа, кука ставится
        // синхронно в заголовки этого же ответа — race condition невозможен
        await issueSession(user, req, res);

        // Контрольный лог: убеждаемся, что Set-Cookie реально попал в ответ
        const setCookie = res.getHeader('Set-Cookie');
        console.log(`[OAuth:${provider}] session issued, Set-Cookie: ${setCookie ? setCookie.replace(/refreshToken=[^;]+/, 'refreshToken=<hidden>') : 'MISSING!'}`);

        // Audit log: fire-and-forget
        logAuditEvent(user.id, AUDIT_ACTIONS.OAUTH_LOGIN, req, { provider, isNewUser });

        console.log(`[OAuth:${provider}] redirecting to frontend with oauth=success`);
        return redirectToFrontend(res, { oauth: 'success' });
    } catch (error) {
        console.error(`[OAuth:${provider}] callback error:`, error.message);
        return redirectToFrontend(res, { oauth_error: 'internal', provider });
    }
}

module.exports = {
    getProvidersStatus,
    redirectToProvider,
    handleCallback
};
