const { connectDB, User } = require('../_lib/db');
const { getSession, clearSession } = require('../_lib/session');
const { handleCors } = require('../_lib/cors');
const { protectEndpoint } = require('../_lib/security');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (!['GET', 'DELETE', 'PATCH'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'auth_me',
        userId,
        shortLimit: 30,
        longLimit: 200,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) {
        return res.status(200).json({ loggedIn: false });
    }

    try {
        await connectDB();

        if (req.method === 'DELETE') {
            // Delete all user data — tokens, Drive metadata, everything
            await User.deleteOne({ googleId: userId });
            clearSession(res);
            return res.status(200).json({ success: true, message: 'Account and data deleted' });
        }

        if (req.method === 'PATCH') {
            const { tosAccepted } = req.body || {};
            if (typeof tosAccepted !== 'boolean') {
                return res.status(400).json({ error: 'invalid_tos_status' });
            }
            await User.findOneAndUpdate(
                { googleId: userId },
                { $set: { tosAccepted, tosAcceptedAt: new Date(), updatedAt: new Date() } }
            );
            return res.status(200).json({ success: true });
        }

        const user = await User.findOne({ googleId: userId });

        if (!user) {
            return res.status(200).json({ loggedIn: false });
        }

        const isV2 = req.query?.v === '2' || (req.url || '').includes('v=2');
        res.status(200).json({
            loggedIn: true,
            user: {
                name: user.name,
                email: user.email,
                picture: user.picture,
                hasDriveFile: isV2 ? !!user.driveFileIdV2 : !!user.driveFileId,
                driveFolderName: isV2 ? (user.driveFolderNameV2 || null) : (user.driveFolderName || null),
                driveFolderId: isV2 ? (user.driveFolderIdV2 || null) : (user.driveFolderId || null),
                importFolderName: isV2 ? (user.importFolderNameV2 || null) : (user.importFolderName || null),
                importFolderId: isV2 ? (user.importFolderIdV2 || null) : (user.importFolderId || null),
                tosAccepted: !!user.tosAccepted,
            },
        });
    } catch (err) {
        console.error('Auth me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};
