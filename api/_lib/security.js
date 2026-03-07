const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectDB } = require('./db');

const rateGuardSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        scope: { type: String, required: true },
        ip: { type: String, required: true },
        userId: { type: String, default: null },
        shortWindowStart: { type: Date, required: true },
        shortCount: { type: Number, default: 0 },
        longWindowStart: { type: Date, required: true },
        longCount: { type: Number, default: 0 },
        suspicionScore: { type: Number, default: 0 },
        blockedUntil: { type: Date, default: null },
        challengeVerifiedUntil: { type: Date, default: null },
        challengeFailures: { type: Number, default: 0 },
        lastUserAgentHash: { type: String, default: null },
        lastSeenAt: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

rateGuardSchema.index({ key: 1 }, { unique: true });
rateGuardSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

const RateGuardState =
    mongoose.models.RateGuardState || mongoose.model('RateGuardState', rateGuardSchema);

const warmBurstCache = new Map();

function nowMs() {
    return Date.now();
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (Array.isArray(raw)) return raw[0] || 'unknown';
    return String(raw).split(',')[0].trim() || 'unknown';
}

function hashUserAgent(req) {
    const ua = req.headers['user-agent'] || '';
    return crypto.createHash('sha1').update(String(ua)).digest('hex');
}

function readChallengeToken(req) {
    const headerToken =
        req.headers['x-captcha-token'] || req.headers['x-bot-token'] || req.headers['x-turnstile-token'];
    if (headerToken) return String(headerToken);
    if (req.body && typeof req.body === 'object') {
        return req.body.captchaToken || req.body.botToken || req.body.turnstileToken || null;
    }
    return null;
}

async function verifyChallengeToken(token, ip) {
    const provider = (process.env.BOT_CHALLENGE_PROVIDER || '').toLowerCase().trim();
    if (!provider || !token) return false;

    let secret;
    let endpoint;
    if (provider === 'turnstile') {
        secret = process.env.TURNSTILE_SECRET_KEY;
        endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    } else if (provider === 'recaptcha') {
        secret = process.env.RECAPTCHA_SECRET_KEY;
        endpoint = 'https://www.google.com/recaptcha/api/siteverify';
    } else if (provider === 'hcaptcha') {
        secret = process.env.HCAPTCHA_SECRET_KEY;
        endpoint = 'https://hcaptcha.com/siteverify';
    } else {
        return false;
    }

    if (!secret) return false;

    try {
        const body = new URLSearchParams({
            secret,
            response: token,
            remoteip: ip,
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok) return false;
        const data = await response.json();
        return !!data.success;
    } catch {
        return false;
    }
}

function checkWarmBurstLimit(key, shortWindowMs, warmBurstLimit) {
    const now = nowMs();
    const bucket = warmBurstCache.get(key) || [];
    const filtered = bucket.filter((t) => now - t <= shortWindowMs);
    filtered.push(now);
    warmBurstCache.set(key, filtered);

    if (warmBurstCache.size > 3000) {
        for (const [k, arr] of warmBurstCache.entries()) {
            if (!arr.length || now - arr[arr.length - 1] > shortWindowMs * 2) {
                warmBurstCache.delete(k);
            }
        }
    }

    return filtered.length <= warmBurstLimit;
}

function setRateHeaders(res, longLimit, longCount, shortWindowMs) {
    const remaining = Math.max(0, longLimit - longCount);
    res.setHeader('X-RateLimit-Limit', String(longLimit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Window-Ms', String(shortWindowMs));
}

function challengeEnabled() {
    const provider = (process.env.BOT_CHALLENGE_PROVIDER || '').toLowerCase().trim();
    return ['turnstile', 'recaptcha', 'hcaptcha'].includes(provider);
}

async function protectEndpoint(req, res, options = {}) {
    const shortWindowMs = parsePositiveInt(process.env.RATE_SHORT_WINDOW_MS, 10_000);
    const longWindowMs = parsePositiveInt(process.env.RATE_LONG_WINDOW_MS, 10 * 60_000);
    const shortLimit = options.shortLimit || parsePositiveInt(process.env.RATE_SHORT_LIMIT, 20);
    const longLimit = options.longLimit || parsePositiveInt(process.env.RATE_LONG_LIMIT, 120);
    const blockMs = options.blockMs || parsePositiveInt(process.env.RATE_BLOCK_MS, 15 * 60_000);
    const challengeScore = options.challengeScore || 4;
    const blockScore = options.blockScore || 9;
    const warmBurstLimit = options.warmBurstLimit || shortLimit + 8;

    const ip = parseIp(req);
    const userId = options.userId || null;
    const scope = options.scope || 'default';
    const key = `${scope}:${ip}:${userId || 'anon'}`;

    if (!checkWarmBurstLimit(key, shortWindowMs, warmBurstLimit)) {
        res.setHeader('Retry-After', String(Math.ceil(shortWindowMs / 1000)));
        return res.status(429).json({
            error: 'rate_limited',
            message: 'Too many requests. Please retry shortly.',
        });
    }

    await connectDB();

    const now = new Date();
    let state = await RateGuardState.findOne({ key });
    if (!state) {
        state = await RateGuardState.create({
            key,
            scope,
            ip,
            userId,
            shortWindowStart: now,
            longWindowStart: now,
            shortCount: 0,
            longCount: 0,
            suspicionScore: 0,
            blockedUntil: null,
            challengeVerifiedUntil: null,
            challengeFailures: 0,
            lastSeenAt: now,
            lastUserAgentHash: hashUserAgent(req),
        });
    }

    if (state.blockedUntil && state.blockedUntil.getTime() > now.getTime()) {
        const retryAfterSec = Math.ceil((state.blockedUntil.getTime() - now.getTime()) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            error: 'temporarily_blocked',
            message: 'Request traffic was flagged as abusive. Please retry later.',
            retryAfterSec,
        });
    }

    const shortElapsed = now.getTime() - state.shortWindowStart.getTime();
    const longElapsed = now.getTime() - state.longWindowStart.getTime();
    if (shortElapsed >= shortWindowMs) {
        state.shortWindowStart = now;
        state.shortCount = 0;
    }
    if (longElapsed >= longWindowMs) {
        state.longWindowStart = now;
        state.longCount = 0;
    }

    state.shortCount += 1;
    state.longCount += 1;

    const currentUaHash = hashUserAgent(req);
    const userAgentChanged = !!state.lastUserAgentHash && state.lastUserAgentHash !== currentUaHash;
    state.lastUserAgentHash = currentUaHash;

    const burstViolation = state.shortCount > shortLimit;
    const sustainedViolation = state.longCount > longLimit;
    if (burstViolation) state.suspicionScore += 2;
    if (sustainedViolation) state.suspicionScore += 3;
    if (userAgentChanged && shortElapsed < 20_000) state.suspicionScore += 1;

    if (!burstViolation && !sustainedViolation && state.suspicionScore > 0) {
        state.suspicionScore = Math.max(0, state.suspicionScore - 0.5);
    }

    const suspicious = state.suspicionScore >= challengeScore;
    const shouldBlock = state.suspicionScore >= blockScore || sustainedViolation;

    if (shouldBlock) {
        state.blockedUntil = new Date(now.getTime() + blockMs);
        state.lastSeenAt = now;
        await state.save();
        res.setHeader('Retry-After', String(Math.ceil(blockMs / 1000)));
        return res.status(429).json({
            error: 'temporarily_blocked',
            message: 'Request traffic was flagged as abusive. Please retry later.',
        });
    }

    const challengeActive =
        challengeEnabled() && suspicious && (!state.challengeVerifiedUntil || state.challengeVerifiedUntil < now);

    if (challengeActive) {
        const challengeToken = readChallengeToken(req);
        if (!challengeToken) {
            state.lastSeenAt = now;
            await state.save();
            setRateHeaders(res, longLimit, state.longCount, shortWindowMs);
            return res.status(403).json({
                error: 'challenge_required',
                challengeProvider: process.env.BOT_CHALLENGE_PROVIDER,
                message: 'Bot challenge is required for this request.',
            });
        }

        const verified = await verifyChallengeToken(challengeToken, ip);
        if (!verified) {
            state.challengeFailures += 1;
            state.suspicionScore += 2;
            state.lastSeenAt = now;
            await state.save();
            return res.status(403).json({
                error: 'challenge_failed',
                message: 'Bot challenge verification failed.',
            });
        }

        state.challengeVerifiedUntil = new Date(now.getTime() + 15 * 60_000);
        state.suspicionScore = Math.max(0, state.suspicionScore - 3);
    }

    if (burstViolation) {
        state.lastSeenAt = now;
        await state.save();
        setRateHeaders(res, longLimit, state.longCount, shortWindowMs);
        res.setHeader('Retry-After', String(Math.ceil(shortWindowMs / 1000)));
        return res.status(429).json({
            error: 'rate_limited',
            message: 'Too many requests. Please retry shortly.',
        });
    }

    state.lastSeenAt = now;
    await state.save();
    setRateHeaders(res, longLimit, state.longCount, shortWindowMs);
    return { ok: true };
}

module.exports = { protectEndpoint, parseIp };
