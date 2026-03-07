const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('../../_lib/db');
const { encrypt } = require('../../_lib/crypto');
const { createSession } = require('../../_lib/session');
const { protectEndpoint, parseIp } = require('../../_lib/security');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const guard = await protectEndpoint(req, res, {
        scope: 'auth_google_callback',
        shortLimit: 20,
        longLimit: 80,
    });
    if (!guard || guard.ok !== true) return;

    const { code, state } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Missing OAuth code' });
    }

    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c) => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
        })
    );
    const savedState = cookies.oauth_state;
    if (!state || state !== savedState) {
        return res.status(403).json({ error: 'State validation failed' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const { id: googleId, email, name, picture } = userInfo.data;

        const encryptedAccessToken = encrypt(tokens.access_token);
        const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;

        await connectDB();

        const updateData = {
            email,
            name,
            picture,
            encryptedAccessToken,
            updatedAt: new Date(),
        };

        if (encryptedRefreshToken) {
            updateData.encryptedRefreshToken = encryptedRefreshToken;
        }

        await User.findOneAndUpdate(
            { googleId },
            { $set: updateData, $setOnInsert: { createdAt: new Date() } },
            { upsert: true, new: true }
        );

        await AuditLog.create({
            userId: googleId,
            action: 'login',
            ip: parseIp(req),
            status: 'success',
        });

        const token = createSession(res, googleId);

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

        const frontendUrl = process.env.FRONTEND_URL || 'https://penter405.github.io/addiction/';
        res.redirect(302, `${frontendUrl}?token=${encodeURIComponent(token)}`);
    } catch (err) {
        console.error('OAuth callback error:', err);
        res.status(500).json({ error: 'OAuth processing failed', detail: err.message });
    }
};
