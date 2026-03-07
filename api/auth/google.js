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

    const state = crypto.randomBytes(16).toString('hex');

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
    const stateCookie = `oauth_state=${state}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=600`;
    res.setHeader('Set-Cookie', isProduction ? `${stateCookie}; Secure` : stateCookie);

    res.redirect(302, authUrl);
};
