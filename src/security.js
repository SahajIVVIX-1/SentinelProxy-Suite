/**
 * Security Module - Authentication, Sessions, and Cryptography
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { exec } = require('child_process');
const config = require('./config');
require('dotenv').config();

const SALT_ROUNDS = 12;
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const ALLOWLIST_TTL_MS = parseInt(config.ALLOWLIST_TTL_MS || '120000', 10); // 2 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // Max requests per window

// In-memory session store (for simple implementation)
// In production, use Redis or similar
const sessions = new Map();

// In-memory allowlist for access control
const allowlist = new Map();

// Rate limiting store
const rateLimitStore = new Map();

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate a secure session ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a secure random token
 */
function generateToken() {
    return crypto.randomBytes(48).toString('base64url');
}

/**
 * Create a new session
 */
function createSession(username, role, clientIp = null) {
    const sessionId = generateSessionId();
    const session = {
        id: sessionId,
        username,
        role,
        clientIp: normalizeIp(clientIp),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + SESSION_EXPIRY
    };
    sessions.set(sessionId, session);
    return session;
}

/**
 * Get user by IP address
 */
function getUserByIp(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp || normalizedIp === 'unknown') return null;

    const allowEntry = getAllowlistEntry(normalizedIp);
    if (allowEntry) return allowEntry.username;

    // Find the most recent active session for this IP
    let latestSession = null;
    const now = Date.now();

    for (const session of sessions.values()) {
        if (session.clientIp === normalizedIp && session.expiresAt > now) {
            if (!latestSession || session.lastActivity > latestSession.lastActivity) {
                latestSession = session;
            }
        }
    }

    return latestSession ? latestSession.username : null;
}

/**
 * Get a session by ID
 */
function getSession(sessionId) {
    if (!sessionId) return null;

    const session = sessions.get(sessionId);
    if (!session) return null;

    // Check if session expired
    if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId);
        return null;
    }

    // Update last activity
    session.lastActivity = Date.now();
    return session;
}

/**
 * Destroy a session
 */
function destroySession(sessionId) {
    return sessions.delete(sessionId);
}

/**
 * Clean up expired sessions (periodic cleanup)
 */
function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(id);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

/**
 * Check rate limit for an IP address
 */
function checkRateLimit(ip, endpoint = 'global') {
    const key = `${ip}:${endpoint}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record) {
        record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
        rateLimitStore.set(key, record);
    }

    // Reset if window expired
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + RATE_LIMIT_WINDOW;
    }

    record.count++;

    return {
        allowed: record.count <= RATE_LIMIT_MAX,
        remaining: Math.max(0, RATE_LIMIT_MAX - record.count),
        resetAt: record.resetAt
    };
}

/**
 * Clean up rate limit store periodically
 */
function cleanupRateLimitStore() {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetAt + RATE_LIMIT_WINDOW) {
            rateLimitStore.delete(key);
        }
    }
}

// Cleanup rate limit store every 30 minutes
setInterval(cleanupRateLimitStore, 30 * 60 * 1000);

/**
 * Validate input to prevent injection attacks
 */
function sanitizeInput(input, maxLength = 255) {
    if (typeof input !== 'string') return '';

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

    // Trim and limit length
    sanitized = sanitized.trim().substring(0, maxLength);

    return sanitized;
}

/**
 * Validate username format
 */
function validateUsername(username) {
    const sanitized = sanitizeInput(username, 100);
    if (!sanitized) return null;

    // Allow the configured admin username as-is
    if (sanitized === process.env.ADMIN_INITIAL_USERNAME || sanitized === 'Chakhdi') {
        return sanitized;
    }

    // All other users must end with @Chakhdi.local
    const suffix = '@Chakhdi.local';
    if (!sanitized.endsWith(suffix)) return null;

    const localPart = sanitized.slice(0, -suffix.length);
    if (localPart.length < 1) return null;

    return sanitized;
}

/**
 * Validate password strength
 */
function validatePassword(password) {
    if (typeof password !== 'string') return { valid: false, message: 'Password must be a string' };

    if (password.length < 4) {
        return { valid: false, message: 'Password must be at least 4 characters' };
    }

    if (password.length > 128) {
        return { valid: false, message: 'Password must be less than 128 characters' };
    }

    return { valid: true };
}

/**
 * Generate security headers for HTTP responses
 */
function getSecurityHeaders() {
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
}

/**
 * Safe JSON parse with error handling
 */
function safeJsonParse(jsonString, defaultValue = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('JSON parse error:', error.message);
        return defaultValue;
    }
}

/**
 * Extract client IP from request
 */
function getClientIp(req) {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.socket.remoteAddress ||
        'unknown';
    return normalizeIp(rawIp);
}

function normalizeIp(ip) {
    if (!ip || typeof ip !== 'string') return ip;
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
}

/**
 * Check if an IP address is private/local network
 * Includes: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, ::1
 */
function isPrivateIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    const normalizedIp = normalizeIp(ip);
    
    // IPv6 loopback
    if (normalizedIp === '::1') return true;
    
    // IPv4 addresses
    const parts = normalizedIp.split('.');
    if (parts.length !== 4) return false;
    
    const [first, second] = parts.map(p => parseInt(p, 10));
    
    // 10.0.0.0/8
    if (first === 10) return true;
    
    // 172.16.0.0/12
    if (first === 172 && second >= 16 && second <= 31) return true;
    
    // 192.168.0.0/16
    if (first === 192 && second === 168) return true;
    
    // 127.0.0.0/8 (loopback)
    if (first === 127) return true;
    
    return false;
}

function getAllowlistEntry(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return null;
    const entry = allowlist.get(normalizedIp);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        allowlist.delete(normalizedIp);
        return null;
    }
    return entry;
}

function isAllowlistedIp(ip) {
    return !!getAllowlistEntry(ip);
}

function refreshAllowlistEntry(ip, sessionId = null, username = null) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return null;
    const existing = getAllowlistEntry(normalizedIp);
    const now = Date.now();
    const entry = {
        ip: normalizedIp,
        mac: existing?.mac || null,
        username: username || existing?.username || 'unknown',
        sessionId: sessionId || existing?.sessionId || 'unknown',
        lastHeartbeat: now,
        expiresAt: now + ALLOWLIST_TTL_MS
    };
    allowlist.set(normalizedIp, entry);
    return entry;
}

async function lookupMacForIp(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return null;

    const cmd = process.platform === 'win32'
        ? 'arp -a'
        : (process.platform === 'darwin' ? 'arp -a' : 'ip neigh');

    return new Promise((resolve) => {
        exec(cmd, { windowsHide: true, timeout: 2000 }, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            const mac = parseMacFromArp(stdout, normalizedIp);
            resolve(mac || null);
        });
    });
}

function parseMacFromArp(output, ip) {
    const lines = output.split(/\r?\n/);
    const lowerIp = ip.toLowerCase();
    for (const line of lines) {
        const text = line.trim();
        if (!text || !text.toLowerCase().includes(lowerIp)) continue;

        const winMatch = text.match(/([0-9a-f]{2}-){5}[0-9a-f]{2}/i);
        if (winMatch) return winMatch[0].toLowerCase().replace(/-/g, ':');

        const macMatch = text.match(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
        if (macMatch) return macMatch[0].toLowerCase();

        const shortMatch = text.match(/\bat\s+([0-9a-f]{1,2}(:[0-9a-f]{1,2}){5})\b/i);
        if (shortMatch) {
            return shortMatch[1]
                .split(':')
                .map(part => part.padStart(2, '0'))
                .join(':')
                .toLowerCase();
        }
    }
    return null;
}

async function allowlistAdd(username, sessionId, clientIp, macAddress = null) {
    const normalizedIp = normalizeIp(clientIp);
    if (!normalizedIp) return null;
    const mac = macAddress || await lookupMacForIp(normalizedIp);
    const now = Date.now();
    const entry = {
        ip: normalizedIp,
        mac: mac || null,
        username,
        sessionId,
        lastHeartbeat: now,
        expiresAt: now + ALLOWLIST_TTL_MS
    };
    allowlist.set(normalizedIp, entry);
    return entry;
}

function allowlistRemoveByIp(ip) {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return false;
    return allowlist.delete(normalizedIp);
}

function allowlistRemoveBySessionId(sessionId) {
    if (!sessionId) return 0;
    let removed = 0;
    for (const [ip, entry] of allowlist.entries()) {
        if (entry.sessionId === sessionId) {
            allowlist.delete(ip);
            removed++;
        }
    }
    return removed;
}

function cleanupAllowlist() {
    const now = Date.now();
    for (const [ip, entry] of allowlist.entries()) {
        if (now > entry.expiresAt) {
            allowlist.delete(ip);
        }
    }
}

setInterval(cleanupAllowlist, 30 * 1000);

/**
 * Extract session from request
 */
function getSessionFromRequest(req) {
    const sessionId = req.headers['x-session-id'] ||
        req.headers['cookie']?.split('sessionId=')[1]?.split(';')[0];
    return sessionId ? getSession(sessionId) : null;
}

/**
 * Validate that request has admin role
 * Returns session object if valid admin, null otherwise
 */
function validateAdminRequest(req) {
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
        return null;
    }
    return session;
}

/**
 * Validate that request has valid session
 * Returns session object if valid, null otherwise
 */
function validateSessionRequest(req) {
    return getSessionFromRequest(req);
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateSessionId,
    generateToken,
    createSession,
    getUserByIp,
    getSession,
    destroySession,
    cleanupExpiredSessions,
    checkRateLimit,
    sanitizeInput,
    validateUsername,
    validatePassword,
    getSecurityHeaders,
    safeJsonParse,
    getClientIp,
    normalizeIp,
    isPrivateIp,
    getSessionFromRequest,
    validateAdminRequest,
    validateSessionRequest,
    isAllowlistedIp,
    getAllowlistEntry,
    refreshAllowlistEntry,
    allowlistAdd,
    allowlistRemoveByIp,
    allowlistRemoveBySessionId,
    lookupMacForIp
};
