const { google } = require('googleapis');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.Client_secret,
        process.env.GOOGLE_REDIRECT_URI
    );

    // 生成 CSRF 防護 state
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // 強制每次都取得 refresh_token
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.file',
        ],
        state,
    });

    // 將 state 存在 cookie 裡，callback 時比對
    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'None' : 'Lax';
    const stateCookie = `oauth_state=${state}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=600`;
    res.setHeader('Set-Cookie', isProduction ? `${stateCookie}; Secure` : stateCookie);

    res.redirect(302, authUrl);
};
