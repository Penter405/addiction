const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { encrypt, decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    if (!userId) {
        return res.status(401).json({ error: '?ªç™»?? });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.driveFileId) {
            return res.status(400).json({ error: 'å°šæœªè¨­å??Œæ­¥æª”æ?' });
        }

        if (!user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: 'ç¼ºå? OAuth tokenï¼Œè??æ–°?»å…¥' });
        }

        // è§?? tokens
        let accessToken = decrypt(user.encryptedAccessToken);
        const refreshToken = decrypt(user.encryptedRefreshToken);

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        // ??½ token ?·æ–°
        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const updateData = {
                    encryptedAccessToken: encrypt(newTokens.access_token),
                    updatedAt: new Date(),
                };
                if (newTokens.refresh_token) {
                    updateData.encryptedRefreshToken = encrypt(newTokens.refresh_token);
                }
                await User.findOneAndUpdate(
                    { googleId: userId },
                    { $set: updateData }
                );
            } catch (err) {
                console.error('Token refresh save error:', err);
            }
        });

        // å¾?Drive è®€?–æ?æ¡?
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const response = await drive.files.get({
            fileId: user.driveFileId,
            alt: 'media',
        });

        // è¨˜é? audit log
        await AuditLog.create({
            userId,
            action: 'load_drive',
            fileId: user.driveFileId,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        res.status(200).json({ success: true, data: response.data });
    } catch (err) {
        console.error('Load from drive error:', err);
        res.status(500).json({ error: 'è®€??Drive å¤±æ?', detail: err.message });
    }
};
