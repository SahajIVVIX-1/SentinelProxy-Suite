const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Server } = require('socket.io');

const {
    PORT,
    HOST,
    DASHBOARD_HOSTNAME,
    PATHS,
    DASHBOARD_HTTPS,
    DASHBOARD_HTTPS_PORT,
    DASHBOARD_ALLOWED_HOSTS,
    ALLOW_PRIVATE_IP_DASHBOARD
} = require('./config');
const { generateCertificate } = require('./certs');
const Blocklist = require('./blocklist');
const db = require('./database');
const { auditLogger } = require('./utils/logger');
const security = require('./security');

// Initialize separate blocklists (now backed by SQLite)
const proxyBlocklist = new Blocklist('Proxy', 'proxy');
const dnsBlocklist = new Blocklist('DNS', 'dns');

const dnsServer = require('./dns_server');
const proxyServer = require('./proxy_server');
const dnsManager = require('./utils/dns-manager');
const proxyManager = require('./utils/proxy-manager');
const { enableKillSwitch, disableKillSwitch } = require('./utils/firewall-manager');
const policyManager = require('./utils/policy-manager');
const adaptiveBlocklist = require('./utils/adaptive-blocklist');
const healthMonitor = require('./utils/health-monitor');
const privacyShield = require('./utils/privacy-shield');

healthMonitor.startHealthMonitor();


async function handleLocalRequest(req, res) {
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const parsedUrl = new URL(req.url, baseUrl);
    const pathName = parsedUrl.pathname;
    const clientIp = security.getClientIp(req);

    const isPublicAsset = pathName.startsWith('/assets/') || pathName === '/favicon.ico';
    const publicEndpoints = new Set([
        '/login',
        '/login.html',
        '/api/login',
        '/api/client-info',
        '/api/session/heartbeat',
        '/api/session/close',
        '/api/logout'
    ]);

    if (!security.isAllowlistedIp(clientIp)) {
        if (pathName.startsWith('/api/') && !publicEndpoints.has(pathName)) {
            return sendUnauthorized(res);
        }
        if (!publicEndpoints.has(pathName) && !isPublicAsset) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return true;
        }
    }

    if (pathName.startsWith('/socket.io/')) return true;

    if (await handleApiRoutes(req, res, pathName)) return true;
    serveDashboard(req, res, pathName);
    return true;
}

const allowedDashboardHosts = new Set((DASHBOARD_ALLOWED_HOSTS || []).map((host) => host.toLowerCase()));

const server = http.createServer((req, res) => {
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const parsedUrl = new URL(req.url, baseUrl);
    const pathName = parsedUrl.pathname;
    const requestHost = req.headers.host ? req.headers.host.split(':')[0] : '';
    const clientIp = security.getClientIp(req);

    const isProxyRequest = req.url.startsWith('http://') || req.url.startsWith('https://');

    if (pathName.startsWith('/socket.io/')) return;

    // Direct access to dashboard/API (not via proxy)
    const isDashboardHost = allowedDashboardHosts.has(requestHost.toLowerCase()) ||
        (ALLOW_PRIVATE_IP_DASHBOARD && security.isPrivateIp(requestHost));
    if (!isProxyRequest && isDashboardHost) {
        (async () => {
            try {
                await handleLocalRequest(req, res);
            } catch (err) {
                console.error('Local request error:', err);
                if (!res.writableEnded) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            }
        })();
        return;
    }

    const isDashboardHostCheck = allowedDashboardHosts.has(requestHost.toLowerCase()) ||
        (ALLOW_PRIVATE_IP_DASHBOARD && security.isPrivateIp(requestHost));
    if (!security.isAllowlistedIp(clientIp) && !isDashboardHostCheck) {
        proxyServer.logProxyRequest('AUTH', req.url, requestHost, io, clientIp);
        proxyServer.serveErrorPage(res, { code: 'AUTH_REQUIRED', message: 'Authentication required' }, requestHost);
        return;
    }

    // Proxy Traffic - check blocklists separately so DNS-only blocks don't bleed into proxy
    const isProxyBlocked = proxyBlocklist.isBlocked(requestHost);
    const isDnsOnlyBlocked = !isProxyBlocked && dnsBlocklist.isBlocked(requestHost);

    if (isDnsOnlyBlocked) {
        // DNS blocklist only — show a DNS-specific block page
        const category = 'DNS Blocklist';
        const rule = 'DNS blocklist';
        const evidence = 'Matched DNS blocklist entry';
        proxyServer.logProxyRequest('BLOCK', req.url, requestHost, io, security.getClientIp(req), { category, rule, evidence });
        proxyServer.serveErrorPage(res, { code: 'DNS_BLOCKED', message: 'Domain blocked by DNS', category, rule, evidence }, requestHost);
        return;
    }

    if (isProxyBlocked) {
        // Proxy blocklist — show normal block page
        const category = 'Proxy Blocklist';
        const rule = 'Proxy blocklist';
        const evidence = 'Matched proxy blocklist entry';
        proxyServer.logProxyRequest('BLOCK', req.url, requestHost, io, security.getClientIp(req), { category, rule, evidence });
        proxyServer.serveErrorPage(res, { code: 'BLOCKED', message: 'Domain is in blocklist', category, rule, evidence }, requestHost);
        return;
    }

    proxyServer.logProxyRequest(req.method, req.url, requestHost, io, security.getClientIp(req));
    proxyServer.handleProxyRequest(req, res);
});

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
dnsServer.init(io, dnsBlocklist);
if (dnsServer.getConfig().enabled) dnsServer.startDnsServer(); // Start now that io is ready
proxyServer.init(server, io, proxyBlocklist, dnsBlocklist, handleLocalRequest);

server.on('upgrade', (req, socket, head) => {
    const pathName = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    void pathName;
});

let httpsDashboardServer = null;
function startDashboardHttps() {
    if (!DASHBOARD_HTTPS) return;
    try {
        const certData = generateCertificate(DASHBOARD_HOSTNAME);
        httpsDashboardServer = https.createServer({
            key: certData.key,
            cert: certData.cert
        }, (req, res) => handleLocalRequest(req, res));

        if (io) io.attach(httpsDashboardServer);

        httpsDashboardServer.listen(DASHBOARD_HTTPS_PORT, HOST, () => {
            console.log(`🔒 Dashboard HTTPS running at https://${DASHBOARD_HOSTNAME}:${DASHBOARD_HTTPS_PORT}`);
        });
    } catch (err) {
        console.error(`❌ Dashboard HTTPS failed: ${err.message}`);
    }
}

startDashboardHttps();

// Helper: Add security headers to response
function addSecurityHeaders(res) {
    const headers = security.getSecurityHeaders();
    for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
    }
}

// Helper: Send forbidden response (logged in but insufficient role)
function sendForbidden(res) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required' }));
    return true;
}

// Helper: Send unauthorized response (not logged in or session expired)
function sendUnauthorized(res) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Unauthorized: Session expired or invalid' }));
    return true;
}

function sendReadOnly(res) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Read-only safe mode enabled' }));
    return true;
}

// Helper: Check if endpoint requires authentication
function requiresAuth(pathName) {
    const publicEndpoints = ['/api/login', '/api/client-info', '/login.html'];
    return !publicEndpoints.includes(pathName) && !pathName.startsWith('/assets/');
}

// Helper: Validate session from cookie or header
function getSessionFromRequest(req) {
    const sessionId = req.headers['x-session-id'] || req.headers['cookie']?.split('sessionId=')[1]?.split(';')[0];
    return sessionId ? security.getSession(sessionId) : null;
}

// Helper: Get request body with safe JSON parsing
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            const parsed = security.safeJsonParse(body, {});
            resolve(parsed);
        });
        req.on('error', reject);
    });
}

function logAudit(req, action, details) {
    const user = req.headers['x-user'] || 'Unknown';
    const sessionId = req.headers['x-session-id'] || 'unknown';
    const ipAddress = req.headers['x-forwarded-for'] || (req.socket ? req.socket.remoteAddress : null) || null;
    const userAgent = req.headers['user-agent'] || null;
    if (privacyShield.isShieldedByIp(ipAddress)) return;
    auditLogger.log({ sessionId, user, action, details, ipAddress, userAgent }).catch(err => console.error('Audit log error:', err));
}

async function handleApiRoutes(req, res, pathName) {
    // Determine which blocklist to use based on URL
    let currentBlocklist = null;
    let servicePrefix = '';

    if (pathName.startsWith('/api/proxy/blocklist')) {
        currentBlocklist = proxyBlocklist;
        servicePrefix = '/api/proxy/blocklist';
    } else if (pathName.startsWith('/api/dns/blocklist')) {
        currentBlocklist = dnsBlocklist;
        servicePrefix = '/api/dns/blocklist';
    }

    if (currentBlocklist) {
        // Generic Blocklist API for the identified service
        if (pathName === servicePrefix) {
            if (req.method === 'GET') {
                const baseUrl = `http://${req.headers.host || 'localhost'}`;
                const parsedUrl = new URL(req.url, baseUrl);
                const query = Object.fromEntries(parsedUrl.searchParams);
                const page = parseInt(query.page) || 1;
                const limit = parseInt(query.limit) || 100;
                const search = (query.search || '').toLowerCase();
                let filtered = currentBlocklist.getBlockedDomains();
                if (search) filtered = filtered.filter(d => d.toLowerCase().includes(search));
                const total = filtered.length;
                const domains = filtered.slice((page - 1) * limit, page * limit);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ domains, page, limit, total, totalPages: Math.ceil(total / limit), files: await currentBlocklist.getSources() }));
                return true;
            }
            if (req.method === 'POST') {
                const session = getSessionFromRequest(req);
                if (!session) return sendUnauthorized(res);
                if (session.role !== 'admin') return sendForbidden(res);
                if (healthMonitor.isReadOnly()) return sendReadOnly(res);

                let body = ''; req.on('data', c => body += c); req.on('end', async () => {
                    const { domains } = JSON.parse(body);
                    for (const d of domains) await currentBlocklist.saveManualDomain(d);
                    const count = domains.length;
                    const domainList = count <= 3 ? domains.join(', ') : `${domains.slice(0, 3).join(', ')}... (+${count - 3} more)`;
                    logAudit(req, 'BLOCKLIST_ADD', `${currentBlocklist.name}: Added ${count} domain${count !== 1 ? 's' : ''} - ${domainList}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
                });
                return true;
            }
            if (req.method === 'DELETE') {
                const session = getSessionFromRequest(req);
                if (!session) return sendUnauthorized(res);
                if (session.role !== 'admin') return sendForbidden(res);
                if (healthMonitor.isReadOnly()) return sendReadOnly(res);

                let body = ''; req.on('data', c => body += c); req.on('end', async () => {
                    const parsed = JSON.parse(body || '{}');
                    const domains = Array.isArray(parsed.domains) ? parsed.domains : null;
                    const search = (parsed.search || '').toString();

                    if (domains && domains.length > 0) {
                        const removed = await currentBlocklist.removeDomains(domains);
                        logAudit(req, 'BLOCKLIST_DEL_BULK', `${currentBlocklist.name}: ${removed} domains`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, removed }));
                        return;
                    }

                    if (search) {
                        const removed = await currentBlocklist.removeBySearch(search);
                        logAudit(req, 'BLOCKLIST_DEL_SEARCH', `${currentBlocklist.name}: ${removed} domains matching "${search}"`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, removed }));
                        return;
                    }

                    const domain = parsed.domain;
                    const success = await currentBlocklist.removeManualDomain(domain);
                    logAudit(req, 'BLOCKLIST_DEL', `${currentBlocklist.name}: ${domain}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success }));
                });
                return true;
            }
        }

        // Files API (now returns sources from database)
        if (pathName === `${servicePrefix}/files`) {
            const sources = await currentBlocklist.getSources();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ files: sources }));
            return true;
        }

        if (pathName.startsWith(`${servicePrefix}/files/`) && req.method === 'DELETE') {
            const session = getSessionFromRequest(req);
            if (!session) return sendUnauthorized(res);
            if (session.role !== 'admin') return sendForbidden(res);
            if (healthMonitor.isReadOnly()) return sendReadOnly(res);

            const sourceName = decodeURIComponent(pathName.replace(`${servicePrefix}/files/`, ''));
            // Try file: prefix first, then try as-is (for manual)
            let success = await currentBlocklist.deleteSource(`file:${sourceName}`);
            if (!success) {
                success = await currentBlocklist.deleteSource(sourceName);
            }
            logAudit(req, 'SOURCE_DELETE', `${currentBlocklist.name}: ${sourceName}`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
            return true;
        }

        if (pathName === `${servicePrefix}/import` && req.method === 'POST') {
            const session = getSessionFromRequest(req);
            if (!session) return sendUnauthorized(res);
            if (session.role !== 'admin') return sendForbidden(res);
            if (healthMonitor.isReadOnly()) return sendReadOnly(res);

            let body = ''; req.on('data', c => body += c); req.on('end', async () => {
                const { filename, content } = JSON.parse(body);
                const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const added = await currentBlocklist.importFile(safeName, content);
                logAudit(req, 'FILE_IMPORT', `${currentBlocklist.name}: ${filename} (${added} domains)`);
                res.writeHead(200); res.end(JSON.stringify({ success: true, added }));
            });
            return true;
        }

        if (pathName === `${servicePrefix}/reload` && req.method === 'POST') {
            const session = getSessionFromRequest(req);
            if (!session) return sendUnauthorized(res);
            if (session.role !== 'admin') return sendForbidden(res);

            await currentBlocklist.loadBlocklist();
            logAudit(req, 'BLOCKLIST_RELOAD', `${currentBlocklist.name} reloaded manually`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
            return true;
        }
    }

    // DNS APIs
    if (pathName === '/api/dns/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dnsServer.getStats()));
        return true;
    }
    if (pathName === '/api/dns/toggle') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);

        const stats = dnsServer.getStats();
        const newState = !stats.enabled;
        if (stats.enabled) dnsServer.stopDnsServer(); else dnsServer.startDnsServer();
        logAudit(req, 'DNS_TOGGLE', `DNS server ${newState ? 'enabled' : 'disabled'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ enabled: newState }));
        return true;
    }

    if (pathName === '/api/dns/safesearch' && req.method === 'GET') {
        const config = dnsServer.getConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ safeSearch: config.globalSafeSearch !== false }));
        return true;
    }

    if (pathName === '/api/dns/safesearch' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const newState = body.safeSearch !== false;
        dnsServer.setSafeSearchGlobal(newState);
        logAudit(req, 'DNS_SAFESEARCH_TOGGLE', `Global SafeSearch ${newState ? 'enabled' : 'disabled'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ safeSearch: newState }));
        return true;
    }
    if (pathName === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(proxyServer.getStats()));
        return true;
    }

    if (pathName === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthMonitor.getState()));
        return true;
    }

    if (pathName === '/api/self-audit') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [dnsBlocked, proxyBlocked, topDnsBlocked, topProxyBlocked, auditTimeline] = await Promise.all([
            db.trafficLogGet(
                "SELECT COUNT(*) as count FROM traffic_logs WHERE log_type = 'dns' AND status = 'BLOCKED' AND timestamp >= ?",
                [since]
            ),
            db.trafficLogGet(
                "SELECT COUNT(*) as count FROM traffic_logs WHERE log_type = 'proxy' AND method = 'BLOCK' AND timestamp >= ?",
                [since]
            ),
            db.trafficLogAll(
                "SELECT domain, COUNT(*) as count FROM traffic_logs WHERE log_type = 'dns' AND status = 'BLOCKED' AND timestamp >= ? GROUP BY domain ORDER BY count DESC LIMIT 8",
                [since]
            ),
            db.trafficLogAll(
                "SELECT host, COUNT(*) as count FROM traffic_logs WHERE log_type = 'proxy' AND method = 'BLOCK' AND timestamp >= ? GROUP BY host ORDER BY count DESC LIMIT 8",
                [since]
            ),
            db.auditLogAll(
                "SELECT * FROM audit_logs WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 20",
                [since]
            )
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            window: '24h',
            blocked: {
                dns: dnsBlocked?.count || 0,
                proxy: proxyBlocked?.count || 0
            },
            topBlocked: {
                dns: topDnsBlocked || [],
                proxy: topProxyBlocked || []
            },
            auditTimeline: auditTimeline || [],
            adaptiveSuggestions: adaptiveBlocklist.getSuggestions().slice(0, 10),
            health: healthMonitor.getState()
        }));
        return true;
    }

    if (pathName === '/api/dns/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dnsServer.getConfig()));
        return true;
    }
    if (pathName === '/api/dns/upstreams') {
        const baseUrl = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseUrl);
        const query = Object.fromEntries(parsedUrl.searchParams);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dnsServer.getUpstreams(query)));
        return true;
    }
    if (pathName === '/api/dns/upstreams/select' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            const { ip, selected } = JSON.parse(body);
            dnsServer.toggleUpstream(ip, selected);
            logAudit(req, 'DNS_UPSTREAM_TOGGLE', `${selected ? 'Selected' : 'Deselected'} DNS upstream: ${ip}`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
        });
        return true;
    }
    if (pathName === '/api/dns/upstreams/add' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            const { ip } = JSON.parse(body); dnsServer.addCustomUpstream(ip);
            logAudit(req, 'DNS_UPSTREAM_ADD', `Added custom DNS upstream: ${ip}`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
        });
        return true;
    }
    if (pathName === '/api/dns/upstreams/remove' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            const { ip } = JSON.parse(body); dnsServer.removeCustomUpstream(ip);
            logAudit(req, 'DNS_UPSTREAM_REMOVE', `Removed custom DNS upstream: ${ip}`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
        });
        return true;
    }

    if (pathName === '/api/dns/policies' && req.method === 'GET') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(policyManager.getPolicies()));
        return true;
    }

    if (pathName === '/api/dns/policies' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const result = policyManager.setPolicies(body);
        if (!result.ok) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: result.error || 'Policy save failed' }));
            return true;
        }

        logAudit(req, 'DNS_POLICY_UPDATE', 'Updated DNS client policies');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    if (pathName === '/api/dns/adaptive/suggestions' && req.method === 'GET') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            suggestions: adaptiveBlocklist.getSuggestions(),
            settings: adaptiveBlocklist.getSettings()
        }));
        return true;
    }

    if (pathName === '/api/dns/adaptive/accept' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const domain = (body.domain || '').toString().trim();
        if (!domain) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Domain required' }));
            return true;
        }

        await dnsBlocklist.saveManualDomain(domain);
        adaptiveBlocklist.acceptSuggestion(domain);
        logAudit(req, 'ADAPTIVE_ACCEPT', `Accepted adaptive suggestion: ${domain}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    if (pathName === '/api/dns/adaptive/dismiss' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const domain = (body.domain || '').toString().trim();
        if (!domain) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Domain required' }));
            return true;
        }

        adaptiveBlocklist.dismissSuggestion(domain, body.reason || 'dismissed');
        logAudit(req, 'ADAPTIVE_DISMISS', `Dismissed adaptive suggestion: ${domain}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // Users API
    if (pathName === '/api/login' && req.method === 'POST') {
        const clientIp = security.getClientIp(req);

        // Check rate limit
        const rateLimit = security.checkRateLimit(clientIp, 'login');
        if (!rateLimit.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000) });
            res.end(JSON.stringify({ success: false, error: 'Too many login attempts. Please try again later.' }));
            return true;
        }

        const body = await getRequestBody(req);
        const username = security.sanitizeInput(body.username, 50);
        const password = body.password;

        if (!username || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Username and password required' }));
            return true;
        }

        try {
            const user = await db.userFindByUsername(username);

            if (!user) {
                logAudit({ headers: { 'x-user': username, 'user-agent': req.headers['user-agent'] }, socket: req.socket }, 'LOGIN_FAILED', 'User not found');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }));
                return true;
            }

            let passwordValid = false;
            let needsMigration = false;

            // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, $2y$)
            if (user.password.startsWith('$2')) {
                // Already hashed - verify normally
                passwordValid = await security.verifyPassword(password, user.password);
            } else {
                // Plaintext password (legacy) - direct comparison and migrate
                if (user.password === password) {
                    passwordValid = true;
                    needsMigration = true;
                }
            }

            if (!passwordValid) {
                logAudit({ headers: { 'x-user': username, 'user-agent': req.headers['user-agent'] }, socket: req.socket }, 'LOGIN_FAILED', 'Invalid password');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }));
                return true;
            }

            // Migrate plaintext password to hashed
            if (needsMigration) {
                try {
                    await db.userUpdatePassword(username, password);
                    console.log(`✅ Migrated password for user: ${username}`);
                } catch (err) {
                    console.error('Password migration error:', err);
                }
            }

            // Check MAC address allowlist (skip for admin role)
            if (user.role !== 'admin') {
                const clientMac = await security.lookupMacForIp(clientIp);
                if (clientMac) {
                    // Check if this MAC is allowed for this user
                    const macAllowed = await db.macAllowlistCheck(username, clientMac);
                    if (!macAllowed) {
                        // Check if user has any MAC restrictions
                        const userMacs = await db.macAllowlistGetByUsername(username);
                        if (userMacs && userMacs.length > 0) {
                            // User has MAC restrictions but this MAC is not allowed
                            logAudit({ headers: { 'x-user': username, 'user-agent': req.headers['user-agent'] }, socket: req.socket }, 'LOGIN_FAILED', `MAC address ${clientMac} not allowed for user`);
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                error: `You are not allowed to access from this device. Your device MAC address (${clientMac}) is not registered. Please contact the administrator.`
                            }));
                            return true;
                        }
                        // User has no MAC restrictions, allow login
                    }
                }
            }

            // Create secure session
            const session = security.createSession(user.username, user.role, clientIp);

            let allowEntry = null;
            try {
                allowEntry = await security.allowlistAdd(user.username, session.id, clientIp);
            } catch (err) {
                console.error('Allowlist add error:', err);
            }

            await disableKillSwitch();

            if (allowEntry) {
                const macInfo = allowEntry.mac ? ` MAC ${allowEntry.mac}` : ' MAC unknown';
                logAudit({ headers: { 'x-user': username, 'x-session-id': session.id, 'user-agent': req.headers['user-agent'] }, socket: req.socket }, 'ALLOWLIST_ADD', `IP ${allowEntry.ip}${macInfo}`);
            }

            logAudit({ headers: { 'x-user': username, 'x-session-id': session.id, 'user-agent': req.headers['user-agent'] }, socket: req.socket }, 'LOGIN_SUCCESS', 'User logged in successfully');

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': `sessionId=${session.id}; HttpOnly; SameSite=Strict; Path=/`
            });
            res.end(JSON.stringify({
                success: true,
                user: { username: user.username, role: user.role },
                sessionId: session.id
            }));
        } catch (error) {
            console.error('Login error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
        }

        return true;
    }

    if (pathName === '/api/logout' && req.method === 'POST') {
        const body = await getRequestBody(req);
        const sessionId = body.sessionId || req.headers['x-session-id'];
        const clientIp = security.getClientIp(req);

        if (sessionId) {
            security.destroySession(sessionId);
            security.allowlistRemoveBySessionId(sessionId);
        }

        if (clientIp && clientIp !== 'unknown') {
            security.allowlistRemoveByIp(clientIp);
        }

        await enableKillSwitch();

        logAudit(req, 'LOGOUT', 'User logged out');
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'sessionId=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // Get client IP and MAC address (public endpoint)
    if (pathName === '/api/client-info' && req.method === 'GET') {
        const clientIp = security.getClientIp(req);
        const macAddress = await security.lookupMacForIp(clientIp);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            ip: clientIp,
            mac: macAddress || 'unknown'
        }));
        return true;
    }

    // MAC Allowlist Management (Admin only)
    if (pathName === '/api/mac-allowlist' && req.method === 'GET') {
        const session = security.validateAdminRequest(req);
        if (!session) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Admin access required' }));
            return true;
        }

        try {
            const allMacs = await db.macAllowlistGetAll();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, macs: allMacs }));
        } catch (error) {
            console.error('Error fetching MAC allowlist:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
        }
        return true;
    }

    if (pathName === '/api/mac-allowlist/add' && req.method === 'POST') {
        const session = security.validateAdminRequest(req);
        if (!session) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Admin access required' }));
            return true;
        }

        const body = await getRequestBody(req);
        const { username, macAddress, description } = body;

        if (!username || !macAddress) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Username and MAC address required' }));
            return true;
        }

        // Validate MAC address format
        const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
        if (!macRegex.test(macAddress)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid MAC address format. Use format: aa:bb:cc:dd:ee:ff' }));
            return true;
        }

        try {
            // Check if user exists
            const user = await db.userFindByUsername(username);
            if (!user) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'User not found' }));
                return true;
            }

            const result = await db.macAllowlistAdd(username, macAddress, description || '', session.username);

            if (result.changes > 0) {
                logAudit(req, 'MAC_ALLOWLIST_ADD', `Added MAC ${macAddress} for user ${username}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'MAC address added to allowlist' }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'MAC address already in allowlist' }));
            }
        } catch (error) {
            console.error('Error adding MAC to allowlist:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
        }
        return true;
    }

    if (pathName === '/api/mac-allowlist/remove' && req.method === 'POST') {
        const session = security.validateAdminRequest(req);
        if (!session) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Admin access required' }));
            return true;
        }

        const body = await getRequestBody(req);
        const { username, macAddress } = body;

        if (!username || !macAddress) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Username and MAC address required' }));
            return true;
        }

        try {
            const result = await db.macAllowlistRemove(username, macAddress);
            logAudit(req, 'MAC_ALLOWLIST_REMOVE', `Removed MAC ${macAddress} for user ${username}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: result.changes > 0 ? 'MAC address removed from allowlist' : 'MAC address not found'
            }));
        } catch (error) {
            console.error('Error removing MAC from allowlist:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
        }
        return true;
    }

    if (pathName === '/api/session/close' && req.method === 'POST') {
        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
            try {
                // Try to get user/session from body (for sendBeacon) or headers (for fetch)
                let user = req.headers['x-user'];
                let sessionId = req.headers['x-session-id'];
                let userAgent = req.headers['user-agent'];

                if (body) {
                    try {
                        const parsed = JSON.parse(body);
                        user = parsed.user || user;
                        sessionId = parsed.sessionId || sessionId;
                        userAgent = parsed.userAgent || userAgent;
                    } catch (e) { }
                }

                // Create a mock request object with the correct headers
                const mockReq = {
                    headers: {
                        'x-user': user || 'Unknown',
                        'x-session-id': sessionId || 'unknown',
                        'user-agent': userAgent
                    },
                    socket: req.socket
                };

                logAudit(mockReq, 'SESSION_CLOSE', 'Session closed');
                if (sessionId) {
                    security.destroySession(sessionId);
                    security.allowlistRemoveBySessionId(sessionId);
                }
                const clientIp = security.getClientIp(req);
                if (clientIp && clientIp !== 'unknown') {
                    security.allowlistRemoveByIp(clientIp);
                }

                await enableKillSwitch();
            } catch (err) {
                console.error('Session close error:', err);
            }
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
        });
        return true;
    }

    if (pathName === '/api/session/heartbeat' && req.method === 'POST') {
        const session = security.getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);

        const clientIp = security.getClientIp(req);
        if (!clientIp || clientIp === 'unknown') return sendUnauthorized(res);

        if (security.isAllowlistedIp(clientIp)) {
            security.refreshAllowlistEntry(clientIp, session.id, session.username);
        } else {
            try {
                await security.allowlistAdd(session.username, session.id, clientIp);
            } catch (err) {
                console.error('Allowlist refresh error:', err);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    if (pathName === '/api/audit/page-view' && req.method === 'POST') {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
            const { page } = JSON.parse(body);
            logAudit(req, 'PAGE_VIEW', `Visited ${page}`);
            res.writeHead(200); res.end(JSON.stringify({ success: true }));
        });
        return true;
    }

    // User Management API
    if (pathName === '/api/users' && req.method === 'GET') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);

        const users = await db.usersAll('SELECT username, role FROM users');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(users));
        return true;
    }

    if (pathName === '/api/users' && req.method === 'POST') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const username = security.validateUsername(body.username);
        const password = body.password;
        const role = security.sanitizeInput(body.role || 'user', 20);

        if (!username) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Username must be more than 5 characters' }));
            return true;
        }

        const passwordValidation = security.validatePassword(password);
        if (!passwordValidation.valid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: passwordValidation.message }));
            return true;
        }

        try {
            await db.userCreate(username, password, role);
            logAudit(req, 'USER_ADD', `Added user: ${username} (${role})`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'User already exists or invalid data' }));
        }
        return true;
    }

    if (pathName.startsWith('/api/users/') && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);
        const username = decodeURIComponent(pathName.replace('/api/users/', ''));
        await db.usersRun('DELETE FROM users WHERE username = ?', [username]);
        logAudit(req, 'USER_DELETE', `Deleted user: ${username}`);
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
        return true;
    }

    // User Update API (with password verification)
    if (pathName.startsWith('/api/users/') && req.method === 'PUT') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const targetUsername = security.sanitizeInput(decodeURIComponent(pathName.replace('/api/users/', '')), 50);
        const { oldPassword, newPassword, newUsername, newRole } = body;

        const user = await db.userFindByUsername(targetUsername);

        if (!user) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'User not found' }));
            return true;
        }

        // Verify old password with hash
        const passwordValid = await security.verifyPassword(oldPassword, user.password);
        if (!passwordValid) {
            logAudit(req, 'USER_EDIT_FAIL', `Failed password verification for: ${targetUsername}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid password' }));
            return true;
        }

        try {
            const updates = [];
            const params = [];

            if (newUsername) {
                const validatedUsername = security.validateUsername(newUsername);
                if (!validatedUsername) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid username format' }));
                    return true;
                }
                updates.push('username = ?');
                params.push(validatedUsername);
            }

            if (newRole) {
                updates.push('role = ?');
                params.push(security.sanitizeInput(newRole, 20));
            }

            if (newPassword) {
                const passwordValidation = security.validatePassword(newPassword);
                if (!passwordValidation.valid) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: passwordValidation.message }));
                    return true;
                }
                const hashedPassword = await security.hashPassword(newPassword);
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            params.push(targetUsername);

            if (updates.length > 0) {
                await db.usersRun(`UPDATE users SET ${updates.join(', ')} WHERE username = ?`, params);
            }

            logAudit(req, 'USER_EDIT', `Updated user: ${targetUsername} -> ${newUsername || targetUsername}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('User update error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Update failed' }));
        }

        return true;
    }

    // Proxy Logs API (Database-backed)
    if (pathName === '/api/proxy/logs' && req.method === 'GET') {
        const baseUrl = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseUrl);
        const query = Object.fromEntries(parsedUrl.searchParams);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 100;
        const search = query.search || '';
        const method = query.method || '';

        const offset = (page - 1) * limit;
        const logs = await db.proxyLogGetAll(limit, offset, search, method);
        const total = await db.proxyLogCount(search, method);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            logs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }));
        return true;
    }

    if (pathName === '/api/proxy/logs' && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const { logId, startTime, endTime } = body;

        if (logId) {
            await db.proxyLogDeleteById(logId);
            logAudit(req, 'LOG_DELETE', `Deleted proxy log ID: ${logId}`);
        } else if (startTime && endTime) {
            await db.proxyLogDeleteByTimeRange(startTime, endTime);
            logAudit(req, 'LOG_DELETE', `Deleted proxy logs from ${startTime} to ${endTime}`);
        } else {
            await db.proxyLogDeleteAll();
            logAudit(req, 'LOG_DELETE', 'Cleared all proxy logs');
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // DNS Logs API (Database-backed)
    if (pathName === '/api/dns/logs' && req.method === 'GET') {
        const baseUrl = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseUrl);
        const query = Object.fromEntries(parsedUrl.searchParams);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 100;
        const search = query.search || '';
        const status = query.status || '';

        const offset = (page - 1) * limit;
        const logs = await db.dnsLogGetAll(limit, offset, search, status);
        const total = await db.dnsLogCount(search, status);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            logs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }));
        return true;
    }

    if (pathName === '/api/dns/logs' && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const { logId, startTime, endTime } = body;

        if (logId) {
            await db.dnsLogDeleteById(logId);
            logAudit(req, 'LOG_DELETE', `Deleted DNS log ID: ${logId}`);
        } else if (startTime && endTime) {
            await db.dnsLogDeleteByTimeRange(startTime, endTime);
            logAudit(req, 'LOG_DELETE', `Deleted DNS logs from ${startTime} to ${endTime}`);
        } else {
            await db.dnsLogDeleteAll();
            logAudit(req, 'LOG_DELETE', 'Cleared all DNS logs');
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // Unified Traffic Logs API (Both DNS + Proxy)
    if (pathName === '/api/traffic/logs' && req.method === 'GET') {
        const session = getSessionFromRequest(req);
        const baseUrl = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseUrl);
        const query = Object.fromEntries(parsedUrl.searchParams);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 1000;
        const search = query.search || '';
        const logType = query.type || '';  // 'proxy', 'dns', or empty for all
        let userFilter = '';

        // RBAC: Strictly restrict traffic logs to admins only
        if (!session || session.role !== 'admin') {
            return sendForbidden(res);
        }

        const offset = (page - 1) * limit;
        const logs = await db.trafficLogGetAll(limit, offset, search, logType, userFilter);
        const total = await db.trafficLogCount(search, logType, userFilter);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            logs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }));
        return true;
    }

    if (pathName === '/api/traffic/logs' && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        const body = await getRequestBody(req);
        const { logId, startTime, endTime, logType } = body;

        if (logId) {
            await db.trafficLogDeleteById(logId);
            logAudit(req, 'LOG_DELETE', `Deleted traffic log ID: ${logId}`);
        } else if (startTime && endTime) {
            await db.trafficLogDeleteByTimeRange(startTime, endTime, logType || '');
            logAudit(req, 'LOG_DELETE', `Deleted ${logType || 'all'} traffic logs from ${startTime} to ${endTime}`);
        } else {
            await db.trafficLogDeleteAll(logType || '');
            logAudit(req, 'LOG_DELETE', `Cleared all ${logType || 'all'} traffic logs`);
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // Audit Logs API (Database-backed with session support)
    if (pathName === '/api/audit/logs' && req.method === 'GET') {
        const session = security.validateSessionRequest(req);
        const baseUrl = `http://${req.headers.host || 'localhost'}`;
        const parsedUrl = new URL(req.url, baseUrl);
        const query = Object.fromEntries(parsedUrl.searchParams);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 100;
        let user = query.user || '';
        const action = query.action || '';
        const sessionId = query.session_id || '';

        // RBAC: Non-admins can only see their own logs
        if (session && session.role !== 'admin') {
            user = session.username;
        }

        const offset = (page - 1) * limit;
        const logs = await db.auditLogGetAll(limit, offset, user, action, sessionId);
        const total = await db.auditLogCount(user, action, sessionId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            logs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }));
        return true;
    }

    if (pathName === '/api/audit/sessions' && req.method === 'GET') {
        const session = security.validateSessionRequest(req);
        let sessionsRes = [];

        if (session && session.role === 'admin') {
            sessionsRes = await db.auditLogGetSessions();
        } else if (session) {
            // Non-admins only see their own sessions
            const allSessions = await db.auditLogGetSessions();
            sessionsRes = allSessions.filter(s => s.user === session.username);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessions: sessionsRes }));
        return true;
    }

    if (pathName === '/api/audit/logs' && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
            const { logId, sessionId } = JSON.parse(body);

            if (logId) {
                // Delete single log entry
                await db.auditLogDelete(logId);
                logAudit(req, 'AUDIT_LOG_DELETE', `Deleted audit log entry ID: ${logId}`);
            } else if (sessionId) {
                // Delete entire session
                await db.auditLogDeleteSession(sessionId);
                logAudit(req, 'AUDIT_SESSION_DELETE', `Deleted audit session: ${sessionId}`);
            } else {
                // Delete all logs
                await db.auditLogDeleteAll();
                logAudit(req, 'AUDIT_LOG_DELETE_ALL', 'Cleared all audit logs');
            }

            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        });
        return true;
    }

    // Certificate Logs API
    if (pathName === '/api/cert/logs' && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const search = url.searchParams.get('search') || '';
        const offset = (page - 1) * limit;

        const logs = await db.certLogGetAll(limit, offset, search);
        const total = await db.certLogCount(search);
        const totalPages = Math.ceil(total / limit);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs, total, totalPages, currentPage: page }));
        return true;
    }

    if (pathName === '/api/cert/logs' && req.method === 'DELETE') {
        const session = getSessionFromRequest(req);
        if (!session) return sendUnauthorized(res);
        if (session.role !== 'admin') return sendForbidden(res);
        if (healthMonitor.isReadOnly()) return sendReadOnly(res);

        let body = ''; req.on('data', c => body += c); req.on('end', async () => {
            const { logId } = JSON.parse(body);

            if (logId) {
                await db.certLogDeleteById(logId);
                logAudit(req, 'CERT_LOG_DELETE', `Deleted certificate log entry ID: ${logId}`);
            } else {
                await db.certLogDeleteAll();
                logAudit(req, 'CERT_LOG_DELETE_ALL', 'Cleared all certificate logs');
            }

            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        });
        return true;
    }

    return false;
}

function serveDashboard(req, res, pathName) {
    // Add security headers to all dashboard responses
    addSecurityHeaders(res);

    // RBAC: Restrict specific pages to admins
    const adminPages = ['/users', '/logs-history', '/self-audit'];
    const session = getSessionFromRequest(req);

    if (adminPages.includes(pathName)) {
        if (!session || session.role !== 'admin') {
            // Redirect to dashboard or login
            res.writeHead(302, { 'Location': session ? '/dashboard' : '/login' });
            res.end();
            return;
        }
    }

    let filePath = path.join(PATHS.PUBLIC,
        pathName === '/' || pathName === '/dashboard' ? 'index.html' :
            pathName === '/proxy' ? 'proxy.html' :
                pathName === '/login' ? 'login.html' :
                    pathName === '/users' ? 'users.html' :
                        pathName === '/logs-history' ? 'logs-history.html' :
                            pathName === '/audit-history' ? 'audit-history.html' :
                                pathName === '/cert-logs' ? 'cert-logs.html' :
                                    pathName === '/self-audit' ? 'self-audit.html' :
                                        pathName === '/blocklist' ? 'blocklist.html' :
                                            pathName === '/dns' ? 'dns.html' : pathName);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) filePath = path.join(PATHS.PUBLIC, 'index.html');
        const ext = path.extname(filePath).toLowerCase();
        const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
        fs.readFile(filePath, (e, d) => {
            if (e) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return;
            }
            res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
            res.end(d);
        });
    });
}

server.listen(PORT, HOST, async () => {
    console.log(`🚀 Proxy Server running at http://${HOST}:${PORT}`);

    // Phase 2: Automate System DNS & Proxy
    if (process.platform === 'win32') {
        await dnsManager.setSelfAsDns();
        await proxyManager.setSystemProxy(PORT, '127.0.0.1');

        // Open dashboard only for interactive sessions (skip services)
        const isInteractive = !!process.stdout.isTTY && process.env.SERVICE_MODE !== 'true';
        if (isInteractive) {
            const scheme = DASHBOARD_HTTPS ? 'https' : 'http';
            const dashboardPort = DASHBOARD_HTTPS ? DASHBOARD_HTTPS_PORT : PORT;
            const dashboardUrl = (DASHBOARD_HTTPS && dashboardPort === 443)
                ? `${scheme}://${DASHBOARD_HOSTNAME}`
                : `${scheme}://${DASHBOARD_HOSTNAME}:${dashboardPort}`;
            console.log(`🌐 Opening dashboard: ${dashboardUrl}`);
            exec(`start ${dashboardUrl}`);
        }
    }
});

// Handle graceful shutdown to revert settings
async function handleShutdown() {
    console.log('\n🛑 Shutting down...');
    if (process.platform === 'win32') {
        await dnsManager.restoreOriginalDns();
        await proxyManager.restoreSystemProxy();
    }
    process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
