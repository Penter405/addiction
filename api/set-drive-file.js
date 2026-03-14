const { connectDB, User, AuditLog } = require('./_lib/db');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');
const { protectEndpoint, parseIp } = require('./_lib/security');

const FILE_ID_REGEX = /^[a-zA-Z0-9_-]{10,80}$/;

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'drive_set_file',
        userId,
        shortLimit: 15,
        longLimit: 80,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { fileId } = req.body || {};

    if (!fileId || !FILE_ID_REGEX.test(fileId)) {
        return res.status(400).json({ error: 'Invalid fileId format' });
    }

    try {
        await connectDB();

        const isV2 = req.body.version === 2;
        await User.findOneAndUpdate(
            { googleId: userId },
            { $set: { [isV2 ? 'driveFileIdV2' : 'driveFileId']: fileId, updatedAt: new Date() } }
        );

        const user = await User.findOne({ googleId: userId }, 'internalId');

        await AuditLog.create({
            userInternalId: user ? (user.internalId || 0) : 0,
            action: 'set_file',
            fileId,
            ip: parseIp(req),
            status: 'success',
        });

        res.status(200).json({ success: true, fileId });
    } catch (err) {
        console.error('Set drive file error:', err);
        res.status(500).json({ error: 'Failed to update file setting' });
    }
};
