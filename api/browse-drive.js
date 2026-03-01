const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./lib/db');
const { decrypt } = require('./lib/crypto');
const { getSession } = require('./lib/session');
const { handleCors } = require('./lib/cors');

// Consolidated endpoint: handles listing folders, listing files, and loading a file by ID
// Usage:
//   GET  /api/browse-drive?action=folders        → list folders
//   GET  /api/browse-drive?action=files           → list .json files
//   POST /api/browse-drive  { action: 'load', fileId: '...' }  → load file by ID

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    const userId = getSession(req);
    if (!userId) return res.status(401).json({ error: '未登入' });

    // Get action from query (GET) or body (POST)
    const action = req.query?.action || req.body?.action;
    if (!action) return res.status(400).json({ error: '缺少 action 參數' });

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });
        if (!user || !user.encryptedAccessToken) {
            return res.status(400).json({ error: '缺少 OAuth token' });
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

        // ===== Action: list folders =====
        if (action === 'folders') {
            const result = await drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 50,
            });
            const folders = (result.data.files || []).map(f => ({
                id: f.id, name: f.name, modifiedTime: f.modifiedTime,
            }));
            return res.status(200).json({
                success: true, folders,
                currentFolder: user.driveFolderName || null,
            });
        }

        // ===== Action: list .json files =====
        if (action === 'files') {
            const result = await drive.files.list({
                q: "mimeType='application/json' and trashed=false",
                fields: 'files(id, name, modifiedTime, size)',
                orderBy: 'modifiedTime desc',
                pageSize: 30,
            });
            const files = (result.data.files || []).map(f => ({
                id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size,
            }));
            return res.status(200).json({ success: true, files });
        }

        // ===== Action: load file by ID =====
        if (action === 'load') {
            const fileId = req.body?.fileId;
            if (!fileId) return res.status(400).json({ error: '缺少 fileId' });

            const response = await drive.files.get({ fileId, alt: 'media' });

            await AuditLog.create({
                userId, action: 'load_drive_by_id', fileId,
                ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
                status: 'success',
            });

            return res.status(200).json({ success: true, data: response.data });
        }

        return res.status(400).json({ error: '未知的 action: ' + action });
    } catch (err) {
        console.error('Browse drive error:', err);
        res.status(500).json({ error: '操作失敗', detail: err.message });
    }
};
