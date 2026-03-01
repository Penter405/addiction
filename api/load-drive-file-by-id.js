const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./lib/db');
const { decrypt } = require('./lib/crypto');
const { getSession } = require('./lib/session');
const { handleCors } = require('./lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const userId = getSession(req);
    if (!userId) return res.status(401).json({ error: '未登入' });

    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ error: '缺少 fileId' });

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

        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
        });

        await AuditLog.create({
            userId,
            action: 'load_drive_by_id',
            fileId,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        res.status(200).json({ success: true, data: response.data });
    } catch (err) {
        console.error('Load drive file by id error:', err);
        res.status(500).json({ error: '讀取檔案失敗', detail: err.message });
    }
};
