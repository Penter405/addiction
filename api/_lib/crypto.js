const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error('ENCRYPTION_KEY 必須是 64 個 hex 字元（32 bytes）');
    }
    return Buffer.from(hex, 'hex');
}

/**
 * AES-256-GCM 加密
 * @param {string} text - 要加密的明文
 * @returns {{ iv: string, authTag: string, encrypted: string }}
 */
function encrypt(text) {
    const key = getKey();
    const iv = crypto.randomBytes(12); // GCM 建議 12 bytes IV
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        authTag,
        encrypted,
    };
}

/**
 * AES-256-GCM 解密
 * @param {{ iv: string, authTag: string, encrypted: string }} data
 * @returns {string} 解密後的明文
 */
function decrypt(data) {
    const key = getKey();
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports = { encrypt, decrypt };
