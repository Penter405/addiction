const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('../../_lib/db');
const { encrypt } = require('../../_lib/crypto');
const { createSession } = require('../../_lib/session');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { code, state } = req.query;

    if (!code) {
        return res.status(400).json({ error: '缺少授權碼' });
    }

    // 驗證 CSRF state
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
        })
    );
    const savedState = cookies['oauth_state'];
    if (!state || state !== savedState) {
        return res.status(403).json({ error: 'State 驗證失敗，可能是 CSRF 攻擊' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        // 用授權碼換取 tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 取得使用者資訊
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const { id: googleId, email, name, picture } = userInfo.data;

        // 加密 tokens
        const encryptedAccessToken = encrypt(tokens.access_token);
        const encryptedRefreshToken = tokens.refresh_token
            ? encrypt(tokens.refresh_token)
            : undefined;

        // 存入 MongoDB
        await connectDB();

        const updateData = {
            email,
            name,
            picture,
            encryptedAccessToken,
            updatedAt: new Date(),
        };

        // 只在有 refresh_token 時才更新（避免覆蓋掉舊的）
        if (encryptedRefreshToken) {
            updateData.encryptedRefreshToken = encryptedRefreshToken;
        }

        await User.findOneAndUpdate(
            { googleId },
            { $set: updateData, $setOnInsert: { createdAt: new Date() } },
            { upsert: true, new: true }
        );

        // 記錄 audit log
        await AuditLog.create({
            userId: googleId,
            action: 'login',
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        // 建立 session（token 同時會設在 cookie，也回傳供 URL 傳遞）
        const token = createSession(res, googleId);

        // 清除 oauth_state cookie
        const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
        const clearSameSite = isProduction ? 'None' : 'Lax';
        let clearState = `oauth_state=; Path=/; HttpOnly; SameSite=${clearSameSite}; Max-Age=0`;
        if (isProduction) clearState += '; Secure';
        const existingCookies = res.getHeader('Set-Cookie');
        if (Array.isArray(existingCookies)) {
            res.setHeader('Set-Cookie', [...existingCookies, clearState]);
        } else if (existingCookies) {
            res.setHeader('Set-Cookie', [existingCookies, clearState]);
        } else {
            res.setHeader('Set-Cookie', clearState);
        }

        // 轉導回前端首頁 (GitHub Pages)，並附帶 token 讓前端存入 localStorage
        const frontendUrl = process.env.FRONTEND_URL || 'https://penter405.github.io/addiction/';
        res.redirect(302, `${frontendUrl}?token=${encodeURIComponent(token)}`);

    } catch (err) {
        console.error('OAuth callback error:', err);
        res.status(500).json({ error: 'OAuth 登入失敗', detail: err.message });
    }
};
