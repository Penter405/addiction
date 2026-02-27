const { getSession, clearSession } = require('../lib/session');
const { connectDB, AuditLog } = require('../lib/db');
const { handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);

    if (userId) {
        try {
            await connectDB();
            await AuditLog.create({
                userId,
                action: 'logout',
                ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
                status: 'success',
            });
        } catch (err) {
            console.error('Logout audit log error:', err);
        }
    }

    clearSession(res);
    res.status(200).json({ success: true });
};
