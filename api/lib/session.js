const crypto = require('crypto');

const COOKIE_NAME = 'brain_session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

function getSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET 環境變數未設定');
    return secret;
}

/**
 * 用 HMAC-SHA256 簽章 payload
 */
function sign(payload) {
    const secret = getSecret();
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64url');
    return `${data}.${signature}`;
}

/**
 * 驗證並解析簽章 cookie
 */
function verify(token) {
    const secret = getSecret();
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;

    const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64url');

    if (signature !== expectedSig) return null;

    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        // 檢查是否過期
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * 建立 session cookie
 */
function createSession(res, userId) {
    const payload = {
        userId,
        exp: Date.now() + MAX_AGE * 1000,
    };
    const token = sign(payload);

    // 設定 httpOnly cookie (SameSite=None 允許跨域 GitHub Pages → Vercel)
    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'None' : 'Lax';
    const cookieValue = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${MAX_AGE}`;
    const finalCookie = isProduction ? `${cookieValue}; Secure` : cookieValue;

    res.setHeader('Set-Cookie', finalCookie);
}

/**
 * 從 request 解析 session，回傳 userId 或 null
 */
function getSession(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
        })
    );

    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const payload = verify(token);
    return payload ? payload.userId : null;
}

/**
 * 清除 session cookie
 */
function clearSession(res) {
    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'None' : 'Lax';
    const cookieValue = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0`;
    const finalCookie = isProduction ? `${cookieValue}; Secure` : cookieValue;
    res.setHeader('Set-Cookie', finalCookie);
}

module.exports = { createSession, getSession, clearSession };
