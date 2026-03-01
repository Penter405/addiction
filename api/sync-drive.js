const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { encrypt, decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    if (!userId) {
        return res.status(401).json({ error: '未登入' });
    }

    const { treeData, triggerAction, syncTimestamp } = req.body || {};
    if (!treeData) {
        return res.status(400).json({ error: '缺少 treeData' });
    }

    // ===== 結構驗證：treeData 必須符合預期格式 =====
    if (typeof treeData.name !== 'string' || !Array.isArray(treeData.children)) {
        return res.status(400).json({ error: 'treeData 格式無效：需要 name (string) 和 children (array)' });
    }

    // ===== 大小限制：防止濫用（最大 5MB）=====
    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 5 * 1024 * 1024) {
        return res.status(413).json({ error: '資料過大，上限為 5MB' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.driveFileId) {
            return res.status(400).json({ error: '尚未設定同步檔案，請先選擇 Google Drive 檔案' });
        }

        if (!user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: '缺少 OAuth token，請重新登入' });
        }

        // 解密 tokens
        let accessToken = decrypt(user.encryptedAccessToken);
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

        // 準備要寫入的 JSON 內容
        const fileContent = JSON.stringify({
            syncTimestamp: syncTimestamp || new Date().toISOString(),
            triggerAction: triggerAction || 'unknown',
            treeData,
        }, null, 2);

        // 呼叫 Google Drive API 更新檔案
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        await drive.files.update({
            fileId: user.driveFileId,
            media: {
                mimeType: 'application/json',
                body: fileContent,
            },
        });

        // 記錄 audit log
        await AuditLog.create({
            userId,
            action: 'sync_drive',
            fileId: user.driveFileId,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Sync drive error:', err);

        // 記錄失敗 audit log
        try {
            await AuditLog.create({
                userId,
                action: 'sync_drive',
                ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
                status: 'error',
                errorMessage: err.message,
            });
        } catch (logErr) {
            console.error('Audit log error:', logErr);
        }

        res.status(500).json({ error: 'Drive 同步失敗', detail: err.message });
    }
};
