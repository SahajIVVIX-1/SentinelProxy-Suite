const fs = require('fs');
const dgram = require('dgram');
const { createServer: createDnsServer, Packet } = require('dns2');
const { PATHS, DNS_PORT, HOST, DASHBOARD_HOSTNAME, REVERSE_DNS_HOSTNAME } = require('./config');
const { dnsLogger } = require('./utils/logger');
const security = require('./security');
const configStore = require('./utils/config-store');
const policyManager = require('./utils/policy-manager');
const adaptiveBlocklist = require('./utils/adaptive-blocklist');
const privacyShield = require('./utils/privacy-shield');
const { getLanIp } = require('./utils/network');
const serverIp = getLanIp();
let blocklist = null;

let dnsConfig = {
    enabled: true,
    selectedUpstreams: ['185.228.168.10', '185.228.169.11'],
    customUpstreams: [],
    loadBalancing: 'smart',
    globalSafeSearch: true  // Enable SafeSearch globally by default
};

let dnsStats = {
    totalQueries: 0,
    blockedQueries: 0,
    allowedQueries: 0,
    policyBlocked: 0,
    nxdomainQueries: 0,
    startTime: Date.now(),
    recentQueries: []
};

let csvNameservers = [];
let csvLoaded = false;
let dnsServer = null;
let io = null;
let healthTimer = null;
const upstreamHealth = new Map();

const SAFESEARCH_TTL = 300;
const SAFESEARCH_HOSTS = {};

function ipToPtrName(ip) {
    if (!ip || typeof ip !== 'string') return null;
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    if (parts.some(p => Number.isNaN(parseInt(p, 10)))) return null;
    return `${parts.reverse().join('.')}\.in-addr.arpa`;
}

function getSafeSearchTarget(domain) {
    const trimmed = domain.startsWith('www.') ? domain.slice(4) : domain;

    if (trimmed === 'google.com' || trimmed.startsWith('google.')) return SAFESEARCH_HOSTS.google;
    if (trimmed === 'bing.com') return SAFESEARCH_HOSTS.bing;
    if (trimmed === 'duckduckgo.com') return SAFESEARCH_HOSTS.duckduckgo;
    if (trimmed === 'youtube.com' || trimmed === 'm.youtube.com' || trimmed === 'youtu.be') return SAFESEARCH_HOSTS.youtube;

    return null;
}

function init(socketIo, injectedBlocklist) {
    io = socketIo;
    blocklist = injectedBlocklist;
}

function loadDnsConfig() {
    try {
        if (fs.existsSync(PATHS.DNS_CONFIG)) {
            dnsConfig = JSON.parse(fs.readFileSync(PATHS.DNS_CONFIG, 'utf8'));
        }
        // Ensure globalSafeSearch defaults to true if not set
        if (dnsConfig.globalSafeSearch === undefined) {
            dnsConfig.globalSafeSearch = true;
        }
        // Sync custom upstreams from file
        if (fs.existsSync(PATHS.DNS_CUSTOM_UPSTREAMS)) {
            const lines = fs.readFileSync(PATHS.DNS_CUSTOM_UPSTREAMS, 'utf8').split('\n');
            dnsConfig.customUpstreams = lines
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#') && /^\d{1,3}(\.\d{1,3}){3}$/.test(l));
        }
        if (!dnsConfig.loadBalancing) dnsConfig.loadBalancing = 'smart';
    } catch (e) { console.error('Error loading DNS config:', e); }
}

function saveDnsConfig() {
    const result = configStore.writeJsonWithRollback(PATHS.DNS_CONFIG, dnsConfig);
    if (!result.ok) {
        console.error('Error saving DNS config:', result.error);
    }
}

function getActiveUpstreams() {
    const all = [...dnsConfig.selectedUpstreams, ...dnsConfig.customUpstreams];
    return all.map(addr => ({ address: addr, port: 53, type: 'udp' }));
}

function getUpstreamHealthSnapshot() {
    const snapshot = {};
    for (const [ip, data] of upstreamHealth.entries()) {
        snapshot[ip] = { ...data };
    }
    return snapshot;
}

function selectUpstream() {
    const upstreams = getActiveUpstreams();
    if (upstreams.length === 0) return null;

    if (dnsConfig.loadBalancing !== 'smart') {
        return upstreams[Math.floor(Math.random() * upstreams.length)];
    }

    const healthy = upstreams
        .map(u => ({
            upstream: u,
            health: upstreamHealth.get(u.address) || { healthy: true, latencyMs: 9999 }
        }))
        .filter(u => u.health.healthy !== false);

    if (healthy.length === 0) return upstreams[Math.floor(Math.random() * upstreams.length)];

    healthy.sort((a, b) => (a.health.latencyMs || 9999) - (b.health.latencyMs || 9999));
    return healthy[0].upstream;
}

function loadCsvNameservers() {
    if (csvLoaded || !fs.existsSync(PATHS.NAMESERVERS_CSV)) return;
    try {
        const content = fs.readFileSync(PATHS.NAMESERVERS_CSV, 'utf8');
        const lines = content.split('\n').slice(1);
        csvNameservers = lines.slice(0, 5000).map(line => {
            const parts = line.split(',');
            if (parts.length < 11) return null;
            const reliability = parseFloat(parts[9]) || 0;
            const error = parts[7] || '';
            if (reliability < 0.5 || error) return null;
            return {
                ip: parts[0],
                name: parts[1] || '',
                org: parts[3] || '',
                country: parts[4] || '',
                dnssec: parts[8] === 'true',
                reliability: reliability
            };
        }).filter(Boolean);
        csvLoaded = true;
        console.log(`📋 Loaded ${csvNameservers.length} reliable nameservers from CSV`);
    } catch (e) { console.error('Error loading CSV:', e); }
}

async function forwardDnsQuery(name, type) {
    return new Promise((resolve, reject) => {
        const upstream = selectUpstream();
        if (!upstream) return reject(new Error('No upstreams'));
        const query = new Packet();
        query.header.id = Math.floor(Math.random() * 65535);
        query.header.rd = 1;
        query.questions.push({ name, type, class: Packet.CLASS.IN });

        const client = dgram.createSocket('udp4');
        const startTime = Date.now();
        const timeout = setTimeout(() => { client.close(); reject(new Error('Timeout')); }, 3000);

        client.on('message', (msg) => {
            clearTimeout(timeout);
            client.close();
            try {
                const parsed = Packet.parse(msg);
                const latencyMs = Date.now() - startTime;
                upstreamHealth.set(upstream.address, {
                    healthy: true,
                    latencyMs,
                    lastChecked: new Date().toISOString()
                });
                resolve({ answers: parsed.answers || [], rcode: parsed.header?.rcode || 0 });
            } catch (e) { reject(e); }
        });

        client.on('error', (err) => { clearTimeout(timeout); client.close(); reject(err); });
        client.send(query.toBuffer(), upstream.port, upstream.address);
    });
}

async function probeUpstream(upstream) {
    return new Promise((resolve) => {
        const query = new Packet();
        query.header.id = Math.floor(Math.random() * 65535);
        query.header.rd = 1;
        query.questions.push({ name: 'example.com', type: Packet.TYPE.A, class: Packet.CLASS.IN });

        const client = dgram.createSocket('udp4');
        const startTime = Date.now();
        const timeout = setTimeout(() => {
            client.close();
            upstreamHealth.set(upstream.address, {
                healthy: false,
                latencyMs: 9999,
                lastChecked: new Date().toISOString()
            });
            resolve();
        }, 2000);

        client.on('message', () => {
            clearTimeout(timeout);
            client.close();
            upstreamHealth.set(upstream.address, {
                healthy: true,
                latencyMs: Date.now() - startTime,
                lastChecked: new Date().toISOString()
            });
            resolve();
        });

        client.on('error', () => {
            clearTimeout(timeout);
            client.close();
            upstreamHealth.set(upstream.address, {
                healthy: false,
                latencyMs: 9999,
                lastChecked: new Date().toISOString()
            });
            resolve();
        });

        client.send(query.toBuffer(), upstream.port, upstream.address);
    });
}

async function refreshUpstreamHealth() {
    const upstreams = getActiveUpstreams();
    await Promise.all(upstreams.map(probeUpstream));
}

async function handleDnsQuery(request, send, rinfo) {
    const response = new Packet(request);
    response.header.qr = 1;
    response.header.aa = 1;
    const clientIp = rinfo ? security.normalizeIp(rinfo.address) : null;
    const allowlisted = security.isAllowlistedIp(clientIp);
    const allowEntry = allowlisted ? security.getAllowlistEntry(clientIp) : null;
    const policy = allowEntry?.mac ? policyManager.getPolicyForMac(allowEntry.mac) : null;
    const privacyShielded = policy?.privacyShield || privacyShield.isShieldedByIp(clientIp);
    // SafeSearch is now enabled globally by default unless explicitly disabled
    // If there's a policy, respect its setting (if it explicitly disables it)
    // Otherwise use the global setting
    const safeSearchEnabled = dnsConfig.globalSafeSearch !== false && (policy?.settings?.safeSearch !== false);

    for (const question of request.questions) {
        let domain = question.name.toLowerCase();
        if (domain.endsWith('.')) domain = domain.slice(0, -1);
        const queryType = question.type === 1 ? 'A' : question.type === 28 ? 'AAAA' : question.type === 12 ? 'PTR' : 'OTHER';
        dnsStats.totalQueries++;

        const serverPtr = ipToPtrName(serverIp);
        if (question.type === 12 && (domain === '1.0.0.127.in-addr.arpa' || (serverPtr && domain === serverPtr))) {
            response.answers.push({
                name: question.name,
                type: Packet.TYPE.PTR,
                class: Packet.CLASS.IN,
                ttl: 300,
                domain: REVERSE_DNS_HOSTNAME
            });
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'LOCAL', clientIp, user: null };
            dnsStats.recentQueries.unshift(log);
            if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
            if (io) io.emit('dns_query', log);
            dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            continue;
        }

        if (domain === DASHBOARD_HOSTNAME || domain === 'server.chakhdi.local') {
            const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
            if (question.type === 1) {
                response.answers.push({
                    name: question.name,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: 300,
                    address: responseIp
                });
            }
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'LOCAL', clientIp, user: null };
            dnsStats.recentQueries.unshift(log);
            if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
            if (io) io.emit('dns_query', log);
            dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            continue;
        }

        if (safeSearchEnabled) {
            const safeTarget = getSafeSearchTarget(domain);
            if (safeTarget) {
                dnsStats.allowedQueries++;
                response.answers.push({
                    name: question.name,
                    type: Packet.TYPE.CNAME,
                    class: Packet.CLASS.IN,
                    ttl: SAFESEARCH_TTL,
                    domain: safeTarget
                });
                if (question.type === 1 || question.type === 28) {
                    try {
                        const answers = await forwardDnsQuery(safeTarget, question.type);
                        answers.forEach(a => response.answers.push(a));
                    } catch (err) { }
                }
                const user = clientIp ? security.getUserByIp(clientIp) : null;
                const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'SAFESEARCH', clientIp, user };
                if (!privacyShielded) {
                    dnsStats.recentQueries.unshift(log);
                    if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                    if (io) io.emit('dns_query', log);
                    dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
                }
                continue;
            }
        }

        if (allowlisted && policy && !policy.scheduleActive && policyManager.getPolicies().enforcement.outOfSchedule === 'block') {
            dnsStats.blockedQueries++;
            dnsStats.policyBlocked++;
            const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
            if (question.type === 1) {
                response.answers.push({
                    name: question.name,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: 300,
                    address: responseIp
                });
            }
            policyManager.recordPolicyBlock(clientIp, domain, {
                category: 'Policy',
                rule: `${policy.mode} schedule`,
                evidence: 'Outside allowed schedule'
            });
            const user = clientIp ? security.getUserByIp(clientIp) : null;
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'POLICY_SCHEDULE', clientIp, user };
            if (!privacyShielded) {
                dnsStats.recentQueries.unshift(log);
                if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                if (io) io.emit('dns_query', log);
                dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            }
            continue;
        }

        if (allowlisted && policy) {
            const indicators = adaptiveBlocklist.getIndicators(domain);
            if (policy.settings?.blockSuspiciousTlds && indicators.suspiciousTld) {
                dnsStats.blockedQueries++;
                dnsStats.policyBlocked++;
                const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
                if (question.type === 1) {
                    response.answers.push({
                        name: question.name,
                        type: Packet.TYPE.A,
                        class: Packet.CLASS.IN,
                        ttl: 300,
                        address: responseIp
                    });
                }
                policyManager.recordPolicyBlock(clientIp, domain, {
                    category: 'Policy',
                    rule: 'Suspicious TLD',
                    evidence: indicators.suspiciousTld
                });
                const user = clientIp ? security.getUserByIp(clientIp) : null;
                const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'POLICY_BLOCKED', clientIp, user };
                if (!privacyShielded) {
                    dnsStats.recentQueries.unshift(log);
                    if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                    if (io) io.emit('dns_query', log);
                    dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
                }
                continue;
            }
            if (policy.settings?.blockTrackers && indicators.trackerPattern) {
                dnsStats.blockedQueries++;
                dnsStats.policyBlocked++;
                const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
                if (question.type === 1) {
                    response.answers.push({
                        name: question.name,
                        type: Packet.TYPE.A,
                        class: Packet.CLASS.IN,
                        ttl: 300,
                        address: responseIp
                    });
                }
                policyManager.recordPolicyBlock(clientIp, domain, {
                    category: 'Policy',
                    rule: 'Tracker pattern',
                    evidence: indicators.trackerPattern
                });
                const user = clientIp ? security.getUserByIp(clientIp) : null;
                const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'POLICY_BLOCKED', clientIp, user };
                if (!privacyShielded) {
                    dnsStats.recentQueries.unshift(log);
                    if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                    if (io) io.emit('dns_query', log);
                    dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
                }
                continue;
            }
        }

        if (!allowlisted) {
            dnsStats.blockedQueries++;
            const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
            if (question.type === 1) {
                response.answers.push({
                    name: question.name,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: 300,
                    address: responseIp
                });
            }
            const user = clientIp ? security.getUserByIp(clientIp) : null;
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'AUTH_REQUIRED', clientIp, user };
            if (!privacyShielded) {
                dnsStats.recentQueries.unshift(log);
                if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                if (io) io.emit('dns_query', log);
                dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            }
        } else if (blocklist && blocklist.isBlocked(domain)) {
            dnsStats.blockedQueries++;
            const responseIp = (clientIp === '127.0.0.1' || clientIp === '::1') ? '127.0.0.1' : serverIp;
            if (question.type === 1) {
                // Return proxy server IP so browser shows error.html via proxy
                response.answers.push({
                    name: question.name,
                    type: Packet.TYPE.A,
                    class: Packet.CLASS.IN,
                    ttl: 300,
                    address: responseIp
                });
            }
            const user = clientIp ? security.getUserByIp(clientIp) : null;
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status: 'BLOCKED', clientIp, user };
            if (!privacyShielded) {
                dnsStats.recentQueries.unshift(log);
                if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                if (io) io.emit('dns_query', log);
                dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            }
        } else {
            dnsStats.allowedQueries++;
            let status = 'ALLOWED';
            try {
                const forwarded = await forwardDnsQuery(question.name, question.type);
                forwarded.answers.forEach(a => response.answers.push(a));
                if (forwarded.rcode === 3) {
                    dnsStats.nxdomainQueries++;
                    adaptiveBlocklist.recordNxDomain(domain);
                    status = 'NXDOMAIN';
                }
                adaptiveBlocklist.recordIndicators(domain);
            } catch (err) { }
            const user = clientIp ? security.getUserByIp(clientIp) : null;
            const log = { timestamp: new Date().toISOString(), domain, recordType: queryType, status, clientIp, user };
            if (!privacyShielded) {
                dnsStats.recentQueries.unshift(log);
                if (dnsStats.recentQueries.length > 100) dnsStats.recentQueries.pop();
                if (io) io.emit('dns_query', log);
                dnsLogger.log(log).catch(err => console.error('DNS log error:', err));
            }
        }
    }
    try {
        if (dnsServer) send(response);
    } catch (e) {
        console.warn('[DNS-SERVER] Failed to send response (socket closed?):', e.message);
    }
}

function startDnsServer() {
    if (dnsServer) return;
    try {
        dnsServer = createDnsServer({ udp: true, handle: handleDnsQuery });
        dnsServer.listen({ udp: { port: DNS_PORT, address: '0.0.0.0' } });
        dnsConfig.enabled = true;
        refreshUpstreamHealth();
        if (!healthTimer) {
            healthTimer = setInterval(refreshUpstreamHealth, 30000);
        }
        console.log(`🌐 DNS Server running on port ${DNS_PORT}`);
    } catch (err) {
        console.error(`❌ DNS Server failed: ${err.message}`);
        dnsConfig.enabled = false;
    }
}

function stopDnsServer() {
    if (dnsServer) {
        dnsServer.close();
        dnsServer = null;
        dnsConfig.enabled = false;
        if (healthTimer) {
            clearInterval(healthTimer);
            healthTimer = null;
        }
        console.log('🌐 DNS Server stopped');
    }
}

// Initial initialization
loadDnsConfig();
setTimeout(loadCsvNameservers, 2000);
// Auto-start removed to allow index.js to init io first


module.exports = {
    init,
    startDnsServer,
    stopDnsServer,
    getStats: () => ({
        ...dnsStats,
        enabled: !!dnsServer,
        blockRate: dnsStats.totalQueries > 0 ? ((dnsStats.blockedQueries / dnsStats.totalQueries) * 100).toFixed(1) : 0,
        uptime: Math.floor((Date.now() - dnsStats.startTime) / 1000)
    }),
    getConfig: () => ({
        ...dnsConfig,
        csvLoaded,
        csvCount: csvNameservers.length,
        activeUpstreams: getActiveUpstreams().map(u => u.address),
        upstreamHealth: getUpstreamHealthSnapshot()
    }),
    getUpstreams: (query) => {
        loadCsvNameservers();
        console.log(`🔍 [DNS] getUpstreams called. Search: "${query.search || ''}", Country: "${query.country || ''}", Found: ${csvNameservers.length}`);
        const search = (query.search || '').toLowerCase();
        const country = query.country || '';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 50;

        let filtered = csvNameservers;
        if (search) filtered = filtered.filter(n => n.ip.includes(search) || n.name.toLowerCase().includes(search) || n.org.toLowerCase().includes(search));
        if (country) filtered = filtered.filter(n => n.country === country);

        const total = filtered.length;
        const countries = [...new Set(csvNameservers.map(n => n.country).filter(Boolean))].sort();
        return {
            items: filtered.slice((page - 1) * limit, page * limit).map(item => ({
                ...item,
                health: upstreamHealth.get(item.ip) || null
            })),
            total, page, totalPages: Math.ceil(total / limit), countries, selected: dnsConfig.selectedUpstreams
        };
    },
    toggleUpstream: (ip, selected) => {
        if (selected) { if (!dnsConfig.selectedUpstreams.includes(ip)) dnsConfig.selectedUpstreams.push(ip); }
        else dnsConfig.selectedUpstreams = dnsConfig.selectedUpstreams.filter(i => i !== ip);
        saveDnsConfig();
    },
    addCustomUpstream: (ip) => {
        if (!dnsConfig.customUpstreams.includes(ip)) {
            dnsConfig.customUpstreams.push(ip);
            fs.appendFileSync(PATHS.DNS_CUSTOM_UPSTREAMS, ip + '\n');
            saveDnsConfig();
        }
    },
    removeCustomUpstream: (ip) => {
        dnsConfig.customUpstreams = dnsConfig.customUpstreams.filter(i => i !== ip);
        dnsConfig.selectedUpstreams = dnsConfig.selectedUpstreams.filter(i => i !== ip);
        const content = '# Custom DNS Upstreams\n' + dnsConfig.customUpstreams.join('\n') + '\n';
        fs.writeFileSync(PATHS.DNS_CUSTOM_UPSTREAMS, content);
        saveDnsConfig();
    },
    setSafeSearchGlobal: (enabled) => {
        dnsConfig.globalSafeSearch = enabled;
        saveDnsConfig();
        console.log(`✅ Global SafeSearch ${enabled ? 'enabled' : 'disabled'}`);
    }
};
