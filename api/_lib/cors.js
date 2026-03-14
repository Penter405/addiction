/**
 * 處理 CORS preflight (OPTIONS) 請求的工具函數
 * 因為 vercel.json 的 headers 設定不會讓函式自動回 OPTIONS，
 * 所以每個被跨域呼叫的 API 都需要在函式內部處理 OPTIONS。
 */
function handleCors(req, res) {
    const origin = req.headers.origin;
    // 瀏覽器 Origin header 永遠不含路徑，所以從 FRONTEND_URL 取出純 origin 部分
    const frontendUrl = process.env.FRONTEND_URL || 'https://penter405.github.io/addiction/';
    let allowed;
    try {
        allowed = new URL(frontendUrl).origin; // e.g. "https://penter405.github.io"
    } catch {
        allowed = 'https://penter405.github.io';
    }

    // 允許指定 origin 或任何 localhost
    if (origin && (origin === allowed || origin.startsWith('http://localhost') || origin.startsWith('https://localhost'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // 回收機制：如果 Origin 為空（例如某些測試工具）或不匹配，則回傳預設允許的 Origin
        res.setHeader('Access-Control-Allow-Origin', allowed);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // 防止 Vercel edge cache 快取 CORS 回應（不同 Origin 需要不同回應）
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store, no-cache');

    // 若是 OPTIONS preflight，直接回 200 結束
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

module.exports = { handleCors };
