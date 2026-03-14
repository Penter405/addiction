const { getSession, clearSession } = require('../_lib/session');
const { connectDB, User, AuditLog } = require('../_lib/db');
const { handleCors } = require('../_lib/cors');
const { protectEndpoint, parseIp } = require('../_lib/security');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'auth_logout',
        userId,
        shortLimit: 20,
        longLimit: 100,
    });
    if (!guard || guard.ok !== true) return;

    if (userId) {
        try {
            await connectDB();
            const user = await User.findOne({ googleId: userId }, 'internalId');
            if (user) {
                await AuditLog.create({
                    userInternalId: user.internalId || 0,
                    action: 'logout',
                    ip: parseIp(req),
                    status: 'success',
                });
            }
        } catch (err) {
            console.error('Logout audit log error:', err);
        }
    }

    clearSession(res);
    res.status(200).json({ success: true });
};
