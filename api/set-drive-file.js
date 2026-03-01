const { connectDB, User, AuditLog } = require('./_lib/db');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');

const FILE_ID_REGEX = /^[a-zA-Z0-9_-]{10,80}$/;

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    if (!userId) {
        return res.status(401).json({ error: '未登入' });
    }

    const { fileId } = req.body || {};

    if (!fileId || !FILE_ID_REGEX.test(fileId)) {
        return res.status(400).json({ error: 'fileId 格式無效' });
    }

    try {
        await connectDB();

        await User.findOneAndUpdate(
            { googleId: userId },
            { $set: { driveFileId: fileId, updatedAt: new Date() } }
        );

        await AuditLog.create({
            userId,
            action: 'set_file',
            fileId,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            status: 'success',
        });

        res.status(200).json({ success: true, fileId });
    } catch (err) {
        console.error('Set drive file error:', err);
        res.status(500).json({ error: '設定失敗' });
    }
};
