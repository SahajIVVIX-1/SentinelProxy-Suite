const db = require('../database');
const security = require('../security');
const healthMonitor = require('./health-monitor');
const privacyShield = require('./privacy-shield');

class DatabaseLogger {
    constructor(type) {
        this.type = type; // 'proxy', 'dns', or 'audit'
    }

    async log(data) {
        try {
            if (healthMonitor.isReadOnly()) return;
            if (this.type === 'proxy') {
                if (privacyShield.isShieldedByIp(data.clientIp)) return;
                await db.trafficLogInsert('proxy', {
                    method: data.method,
                    host: data.host,
                    url: data.url,
                    clientIp: data.clientIp || null,
                    user: data.clientIp ? security.getUserByIp(data.clientIp) : null
                });
            } else if (this.type === 'dns') {
                if (privacyShield.isShieldedByIp(data.clientIp)) return;
                await db.trafficLogInsert('dns', {
                    domain: data.domain,
                    recordType: data.recordType || data.type,
                    status: data.status,
                    clientIp: data.clientIp || null,
                    user: data.clientIp ? security.getUserByIp(data.clientIp) : null
                });
            } else if (this.type === 'audit') {
                if (privacyShield.isShieldedByIp(data.ipAddress)) return;
                await db.auditLogInsert(
                    data.sessionId || 'unknown',
                    data.user,
                    data.action,
                    data.details || '',
                    data.ipAddress || null,
                    data.userAgent || null
                );
            }
        } catch (err) {
            console.error(`[${this.type.toUpperCase()} Logger] Error:`, err.message);
        }
    }

    // Legacy compatibility method
    write(line, dataObject) {
        const timestamp = new Date().toISOString();
        this.log(dataObject).catch(err => console.error('Log write error:', err));
        return { ...dataObject, timestamp };
    }
}

// Global instances for the app
const proxyLogger = new DatabaseLogger('proxy');
const dnsLogger = new DatabaseLogger('dns');
const auditLogger = new DatabaseLogger('audit');

module.exports = {
    proxyLogger,
    dnsLogger,
    auditLogger
};
