const { connectDB, User } = require('../_lib/db');
const { getSession } = require('../_lib/session');
const { handleCors } = require('../_lib/cors');
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (!['GET', 'DELETE'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    console.log('[auth/me] Authorization header:', req.headers.authorization ? 'present' : 'missing');
    console.log('[auth/me] userId from session:', userId ? userId.substring(0, 8) + '...' : null);
    if (!userId) {
        return res.status(200).json({ loggedIn: false });
    }

    try {
        await connectDB();

        if (req.method === 'DELETE') {
            if (userId) {
                await User.deleteOne({ googleId: userId });
            }
            // Clear session cookie
            res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
            return res.status(200).json({ success: true, message: 'Account and data deleted' });
        }

        const user = await User.findOne({ googleId: userId });

        if (!user) {
            return res.status(200).json({ loggedIn: false });
        }

        res.status(200).json({
            loggedIn: true,
            user: {
                name: user.name,
                email: user.email,
                picture: user.picture,
                hasDriveFile: !!user.driveFileId,
            },
        });
    } catch (err) {
        console.error('Auth me error:', err);
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
