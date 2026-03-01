const { connectDB, User } = require('../_lib/db');
const { getSession } = require('../_lib/session');
const { handleCors } = require('../_lib/cors');
module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
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
        res.status(500).json({ error: 'ä¼ºæ??¨éŒ¯èª? });
    }
};
