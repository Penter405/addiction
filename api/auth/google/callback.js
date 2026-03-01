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
        return res.status(400).json({ error: 'ç¼ºå??ˆæ?ç¢? });
    }

    // é©—è? CSRF state
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
        })
    );
    const savedState = cookies['oauth_state'];
    if (!state || state !== savedState) {
        return res.status(403).json({ error: 'State é©—è?å¤±æ?ï¼Œå¯?½æ˜¯ CSRF ?»æ?' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        // ?¨æ?æ¬Šç¢¼?›å? tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // ?–å?ä½¿ç”¨?…è?è¨?
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const { id: googleId, email, name, picture } = userInfo.data;

        // ? å? tokens
        const encryptedAccessToken = encrypt(tokens.access_token);
        const encryptedRefreshToken = tokens.refresh_token
            ? encrypt(tokens.refresh_token)
            : undefined;

        // å­˜å…¥ MongoDB
        await connectDB();

        const updateData = {
            email,
            name,
            picture,
            encryptedAccessToken,
            updatedAt: new Date(),
        };

        // ?ªåœ¨??refresh_token ?‚æ??´æ–°ï¼ˆé¿?è??‹æ??Šç?ï¼?
        if (encryptedRefreshToken) {
            updateData.encryptedRefreshToken = encryptedRefreshToken;
        }

        await User.findOneAndUpdate(
            { googleId },
            { $set: updateData, $setOnInsert: { createdAt: new Date() } },
            { upsert: true, new: true }
        );

        // è¨˜é? audit log
        await AuditLog.create({
            userId: googleId,
            action: 'login',
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        // å»ºç? sessionï¼ˆtoken ?Œæ??ƒè¨­??cookieï¼Œä??å‚³ä¾?URL ?³é?ï¼?
        const token = createSession(res, googleId);

        // æ¸…é™¤ oauth_state cookie
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

        // è½‰å??å?ç«¯é???(GitHub Pages)ï¼Œä¸¦?„å¸¶ token è®“å?ç«¯å???localStorage
        const frontendUrl = process.env.FRONTEND_URL || 'https://penter405.github.io/addiction/';
        res.redirect(302, `${frontendUrl}?token=${encodeURIComponent(token)}`);

    } catch (err) {
        console.error('OAuth callback error:', err);
        res.status(500).json({ error: 'OAuth ?»å…¥å¤±æ?', detail: err.message });
    }
};
