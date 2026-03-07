const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');
const { protectEndpoint, parseIp } = require('./_lib/security');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'drive_browse',
        userId,
        shortLimit: 25,
        longLimit: 140,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const action = req.query?.action || req.body?.action;
    if (!action) return res.status(400).json({ error: 'Missing action' });

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });
        if (!user || !user.encryptedAccessToken) {
            return res.status(400).json({ error: 'Missing OAuth token' });
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({
            access_token: decrypt(user.encryptedAccessToken),
            refresh_token: decrypt(user.encryptedRefreshToken),
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        if (action === 'folders') {
            const result = await drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 50,
            });
            const folders = (result.data.files || []).map((f) => ({
                id: f.id,
                name: f.name,
                modifiedTime: f.modifiedTime,
            }));
            return res.status(200).json({
                success: true,
                folders,
                currentFolder: user.driveFolderName || null,
            });
        }

        if (action === 'files') {
            const result = await drive.files.list({
                q: "mimeType='application/json' and trashed=false",
                fields: 'files(id, name, modifiedTime, size)',
                orderBy: 'modifiedTime desc',
                pageSize: 30,
            });
            const files = (result.data.files || []).map((f) => ({
                id: f.id,
                name: f.name,
                modifiedTime: f.modifiedTime,
                size: f.size,
            }));
            return res.status(200).json({ success: true, files });
        }

        if (action === 'load') {
            const fileId = req.body?.fileId;
            if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

            const response = await drive.files.get({ fileId, alt: 'media' });

            await AuditLog.create({
                userId,
                action: 'load_drive_by_id',
                fileId,
                ip: parseIp(req),
                status: 'success',
            });

            return res.status(200).json({ success: true, data: response.data });
        }

        return res.status(400).json({ error: `Unsupported action: ${action}` });
    } catch (err) {
        console.error('Browse drive error:', err);
        res.status(500).json({ error: 'Browse Drive failed', detail: err.message });
    }
};
