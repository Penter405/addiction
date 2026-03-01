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

    const { fileName, folderName } = req.body || {};
    if (!fileName) {
        return res.status(400).json({ error: '缺少 fileName' });
    }

    // ===== 檔名驗證：只允許 .json，長度 ≤ 100 =====
    if (typeof fileName !== 'string' || fileName.length > 100) {
        return res.status(400).json({ error: '檔案名稱過長（上限 100 字元）' });
    }
    if (!fileName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: '只允許建立 .json 檔案' });
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

        // If folderName provided, find or create the folder
        let parentFolderId = null;
        if (folderName && typeof folderName === 'string' && folderName.trim()) {
            const trimmedFolder = folderName.trim();
            // Search for existing folder
            const folderSearch = await drive.files.list({
                q: `name='${trimmedFolder.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive',
            });
            if (folderSearch.data.files && folderSearch.data.files.length > 0) {
                parentFolderId = folderSearch.data.files[0].id;
            } else {
                // Create the folder
                const folderMeta = await drive.files.create({
                    resource: {
                        name: trimmedFolder,
                        mimeType: 'application/vnd.google-apps.folder',
                    },
                    fields: 'id',
                });
                parentFolderId = folderMeta.data.id;
            }
        }

        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
        };
        if (parentFolderId) {
            fileMetadata.parents = [parentFolderId];
        }

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

        // 儲存 fileId, fileName, folderName 到 User
        const updateFields = { driveFileId: fileId, driveFileName: fileName, updatedAt: new Date() };
        if (folderName && folderName.trim()) {
            updateFields.driveFolderName = folderName.trim();
        }
        await User.findOneAndUpdate(
            { googleId: userId },
            { $set: updateFields }
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
