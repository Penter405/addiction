const { connectDB, User } = require('../../lib/db');
const { getSession } = require('../../lib/session');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
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
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
