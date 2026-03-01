const { google } = require('googleapis');
const { connectDB, User } = require('./lib/db');
const { decrypt } = require('./lib/crypto');
const { getSession } = require('./lib/session');
const { handleCors } = require('./lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const userId = getSession(req);
    if (!userId) return res.status(401).json({ error: '未登入' });

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

        // List .json files (not trashed)
        const result = await drive.files.list({
            q: "mimeType='application/json' and trashed=false",
            fields: 'files(id, name, modifiedTime, size)',
            orderBy: 'modifiedTime desc',
            pageSize: 30,
        });

        const files = (result.data.files || []).map(f => ({
            id: f.id,
            name: f.name,
            modifiedTime: f.modifiedTime,
            size: f.size,
        }));

        res.status(200).json({ success: true, files });
    } catch (err) {
        console.error('List drive files error:', err);
        res.status(500).json({ error: '讀取檔案列表失敗', detail: err.message });
    }
};
