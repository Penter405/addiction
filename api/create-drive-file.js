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
        return res.status(401).json({ error: '?ªç™»?? });
    }

    const { fileName, folderName } = req.body || {};
    if (!fileName) {
        return res.status(400).json({ error: 'ç¼ºå? fileName' });
    }

    // ===== æª”å?é©—è?ï¼šåª?è¨± .jsonï¼Œé•·åº???100 =====
    if (typeof fileName !== 'string' || fileName.length > 100) {
        return res.status(400).json({ error: 'æª”æ??ç¨±?Žé•·ï¼ˆä???100 å­—å?ï¼? });
    }
    if (!fileName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: '?ªå?è¨±å»ºç«?.json æª”æ?' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: 'ç¼ºå? OAuth tokenï¼Œè??æ–°?»å…¥' });
        }

        // è§?? tokens
        const accessToken = decrypt(user.encryptedAccessToken);
        const refreshToken = decrypt(user.encryptedRefreshToken);

        // è¨­å? OAuth client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        // ??½ token ?·æ–°äº‹ä»¶
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

        // ??Google Drive å»ºç??°ç?ç©?JSON æª”æ?
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

        // ?²å? fileId, fileName, folderName ??User
        const updateFields = { driveFileId: fileId, driveFileName: fileName, updatedAt: new Date() };
        if (folderName && folderName.trim()) {
            updateFields.driveFolderName = folderName.trim();
        }
        await User.findOneAndUpdate(
            { googleId: userId },
            { $set: updateFields }
        );

        // è¨˜é? audit log
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
        res.status(500).json({ error: 'å»ºç? Drive æª”æ?å¤±æ?', detail: err.message });
    }
};
