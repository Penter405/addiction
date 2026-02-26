const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('../lib/db');
const { encrypt, decrypt } = require('../lib/crypto');
const { getSession } = require('../lib/session');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    if (!userId) {
        return res.status(401).json({ error: '未登入' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.driveFileId) {
            return res.status(400).json({ error: '尚未設定同步檔案' });
        }

        if (!user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: '缺少 OAuth token，請重新登入' });
        }

        // 解密 tokens
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

        // 監聽 token 刷新
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

        // 從 Drive 讀取檔案
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const response = await drive.files.get({
            fileId: user.driveFileId,
            alt: 'media',
        });

        // 記錄 audit log
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
        res.status(500).json({ error: '讀取 Drive 失敗', detail: err.message });
    }
};
