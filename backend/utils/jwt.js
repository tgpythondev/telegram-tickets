const jwt = require('jsonwebtoken');

// Access token (короткий срок жизни - 15 минут)
function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            isAdmin: user.is_admin
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
}

// Refresh token (долгий срок жизни - 30 дней)
function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
    );
}

// Верификация access token
function verifyAccessToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
            algorithms: ['HS256']
        });
    } catch (error) {
        throw new Error('Invalid or expired access token');
    }
}

// Верификация refresh token
function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
            algorithms: ['HS256']
        });
    } catch (error) {
        throw new Error('Invalid or expired refresh token');
    }
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
};
