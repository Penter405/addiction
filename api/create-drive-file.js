const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./lib/db');
const { encrypt, decrypt } = require('./lib/crypto');
const { getSession } = require('./lib/session');
const { handleCors } = require('./lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    if (!userId) {
        return res.status(401).json({ error: '未登入' });
    }

    const { fileName } = req.body || {};
    if (!fileName) {
        return res.status(400).json({ error: '缺少 fileName' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: '缺少 OAuth token，請重新登入' });
        }

        // 解密 tokens
        const accessToken = decrypt(user.encryptedAccessToken);
        const refreshToken = decrypt(user.encryptedRefreshToken);

        // 設定 OAuth client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        // 監聽 token 刷新事件
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

        // 在 Google Drive 建立新的空 JSON 檔案
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
        };

        const media = {
            mimeType: 'application/json',
            body: JSON.stringify({
                syncTimestamp: new Date().toISOString(),
                triggerAction: 'create',
                treeData: null,
            }, null, 2),
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name',
        });

        const fileId = file.data.id;

        // 儲存 fileId 和 fileName 到 User
        await User.findOneAndUpdate(
            { googleId: userId },
            { $set: { driveFileId: fileId, driveFileName: fileName, updatedAt: new Date() } }
        );

        // 記錄 audit log
        await AuditLog.create({
            userId,
            action: 'create_drive_file',
            fileId,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        res.status(200).json({ success: true, fileId, fileName });
    } catch (err) {
        console.error('Create drive file error:', err);
        res.status(500).json({ error: '建立 Drive 檔案失敗', detail: err.message });
    }
};
