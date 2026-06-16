// CSRF защита middleware
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// CSRF protection для форм и API
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
});

module.exports = csrfProtection;
