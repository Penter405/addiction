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
        return res.status(401).json({ error: '?™Áôª?? });
    }

    const { treeData, triggerAction, syncTimestamp } = req.body || {};
    if (!treeData) {
        return res.status(400).json({ error: 'Áº∫Â? treeData' });
    }

    // ===== ÁµêÊ?È©óË?ÔºötreeData ÂøÖÈ?Á¨¶Â??êÊ??ºÂ? =====
    if (typeof treeData.name !== 'string' || !Array.isArray(treeData.children)) {
        return res.status(400).json({ error: 'treeData ?ºÂ??°Ê?ÔºöÈ?Ë¶?name (string) ??children (array)' });
    }

    // ===== Â§ßÂ??êÂà∂ÔºöÈò≤Ê≠¢Êø´?®Ô??ÄÂ§?5MBÔº?====
    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 5 * 1024 * 1024) {
        return res.status(413).json({ error: 'Ë≥áÊ??éÂ§ßÔºå‰??êÁÇ∫ 5MB' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.driveFileId) {
            return res.status(400).json({ error: 'Â∞öÊú™Ë®≠Â??åÊ≠•Ê™îÊ?ÔºåË??àÈÅ∏??Google Drive Ê™îÊ?' });
        }

        if (!user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: 'Áº∫Â? OAuth tokenÔºåË??çÊñ∞?ªÂÖ•' });
        }

        // Ëß?? tokens
        let accessToken = decrypt(user.encryptedAccessToken);
        const refreshToken = decrypt(user.encryptedRefreshToken);

        // Ë®≠Â? OAuth client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        // ??ÅΩ token ?∑Êñ∞‰∫ã‰ª∂
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

        // Ê∫ñÂ?Ë¶ÅÂØ´?•Á? JSON ?ßÂÆπ
        const fileContent = JSON.stringify({
            syncTimestamp: syncTimestamp || new Date().toISOString(),
            triggerAction: triggerAction || 'unknown',
            treeData,
        }, null, 2);

        // ?ºÂè´ Google Drive API ?¥Êñ∞Ê™îÊ?
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        await drive.files.update({
            fileId: user.driveFileId,
            media: {
                mimeType: 'application/json',
                body: fileContent,
            },
        });

        // Ë®òÈ? audit log
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

        // Ë®òÈ?Â§±Ê? audit log
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

        res.status(500).json({ error: 'Drive ?åÊ≠•Â§±Ê?', detail: err.message });
    }
};
