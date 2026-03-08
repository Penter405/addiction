const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { encrypt, decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');
const { protectEndpoint, parseIp } = require('./_lib/security');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'drive_sync',
        userId,
        shortLimit: 10,
        longLimit: 40,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { treeData, triggerAction, syncTimestamp } = req.body || {};
    if (!treeData) {
        return res.status(400).json({ error: 'Missing treeData' });
    }

    if (typeof treeData.name !== 'string' || !Array.isArray(treeData.children)) {
        return res.status(400).json({ error: 'Invalid treeData format' });
    }

    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 5 * 1024 * 1024) {
        return res.status(413).json({ error: 'Payload too large (max 5MB)' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.driveFileId) {
            return res.status(400).json({ error: 'No Drive file selected' });
        }

        if (!user.tosAccepted) {
            return res.status(403).json({ error: 'tos_not_accepted', message: 'Please accept terms first' });
        }

        if (!user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: 'Missing OAuth token. Please log in again.' });
        }

        const accessToken = decrypt(user.encryptedAccessToken);
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

        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const updateData = {
                    encryptedAccessToken: encrypt(newTokens.access_token),
                    updatedAt: new Date(),
                };
                if (newTokens.refresh_token) {
                    updateData.encryptedRefreshToken = encrypt(newTokens.refresh_token);
                }
                await User.findOneAndUpdate({ googleId: userId }, { $set: updateData });
            } catch (err) {
                console.error('Token refresh save error:', err);
            }
        });

        const fileContent = JSON.stringify(
            {
                syncTimestamp: syncTimestamp || new Date().toISOString(),
                triggerAction: triggerAction || 'unknown',
                treeData,
            },
            null,
            2
        );

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        await drive.files.update({
            fileId: user.driveFileId,
            media: {
                mimeType: 'application/json',
                body: fileContent,
            },
        });

        await AuditLog.create({
            userInternalId: user.internalId,
            action: 'sync_drive',
            fileId: user.driveFileId,
            ip: parseIp(req),
            status: 'success',
        });

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Sync drive error:', err);

        try {
            await AuditLog.create({
                userInternalId: user ? user.internalId : 0,
                action: 'sync_drive',
                ip: parseIp(req),
                status: 'error',
                errorMessage: err.message,
            });
        } catch (logErr) {
            console.error('Audit log error:', logErr);
        }

        res.status(500).json({ error: 'Drive sync failed', detail: err.message });
    }
};
