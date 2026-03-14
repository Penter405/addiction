const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { encrypt, decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');
const { protectEndpoint, parseIp } = require('./_lib/security');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'drive_load',
        userId,
        shortLimit: 20,
        longLimit: 100,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        const isV2 = req.query?.v === '2' || (req.url || '').includes('v=2');
        const targetFileId = isV2 ? user.driveFileIdV2 : user.driveFileId;

        if (!user || !targetFileId) {
            return res.status(400).json({ error: 'No Drive file selected' });
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

        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const response = await drive.files.get({
            fileId: targetFileId,
            alt: 'media',
        });

        await AuditLog.create({
            userInternalId: user.internalId || 0,
            action: 'load_drive',
            fileId: targetFileId,
            ip: parseIp(req),
            status: 'success',
        });

        res.status(200).json({ success: true, data: response.data });
    } catch (err) {
        console.error('Load from drive error:', err);
        res.status(500).json({ error: 'Failed to load from Drive', detail: err.message });
    }
};
