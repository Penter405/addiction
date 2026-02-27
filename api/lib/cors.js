/**
 * 處理 CORS preflight (OPTIONS) 請求的工具函數
 * 因為 vercel.json 的 headers 設定不會讓函式自動回 OPTIONS，
 * 所以每個被跨域呼叫的 API 都需要在函式內部處理 OPTIONS。
 */
function handleCors(req, res) {
    const origin = req.headers.origin;
    const allowed = process.env.FRONTEND_URL || 'https://penter405.github.io';

    // 允許指定 origin 或任何 localhost
    if (origin && (origin === allowed || origin.startsWith('http://localhost'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', allowed);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 若是 OPTIONS preflight，直接回 200 結束
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true; // 表示已處理，呼叫方應直接 return
    }
    return false;
}

module.exports = { handleCors };
