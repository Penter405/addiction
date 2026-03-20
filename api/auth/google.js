const { google } = require('googleapis');
const crypto = require('crypto');
const { protectEndpoint } = require('../_lib/security');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const guard = await protectEndpoint(req, res, {
        scope: 'auth_google_start',
        shortLimit: 20,
        longLimit: 80,
    });
    if (!guard || guard.ok !== true) return;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.Client_secret,
        process.env.GOOGLE_REDIRECT_URI
    );

    const nonce = crypto.randomBytes(16).toString('hex');

    // Store redirect page if provided (e.g. 'old.html')
    const redirectPage = req.query.redirect || '';

    // Encode redirect into state so it survives the full OAuth redirect chain
    // (cross-site cookies with SameSite=None can be blocked by some browsers)
    const state = JSON.stringify({ nonce, redirect: redirectPage });

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.file',
        ],
        state,
    });

    const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'None' : 'Lax';
    const nonceCookie = `oauth_state=${nonce}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=600`;
    const redirectCookie = `oauth_redirect=${encodeURIComponent(redirectPage)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=600`;
    const cookies = [isProduction ? `${nonceCookie}; Secure` : nonceCookie, isProduction ? `${redirectCookie}; Secure` : redirectCookie];
    res.setHeader('Set-Cookie', cookies);

    res.redirect(302, authUrl);
};
