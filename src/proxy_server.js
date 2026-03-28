const http = require('http');
const net = require('net');
const https = require('https');
const tls = require('tls');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const { PATHS, DASHBOARD_HOSTNAME } = require('./config');
const { proxyLogger } = require('./utils/logger');
const { generateCertificate } = require('./certs');
const security = require('./security');
const policyManager = require('./utils/policy-manager');
const privacyShield = require('./utils/privacy-shield');

let proxyBlocklist = null;
let dnsBlocklist = null;
let socketIo = null;

const SAFESEARCH_REDIRECTS = {
    'google.com': 'https://forcesafesearch.google.com',
    'www.google.com': 'https://forcesafesearch.google.com',
    'bing.com': 'https://strict.bing.com',
    'www.bing.com': 'https://strict.bing.com',
    'duckduckgo.com': 'https://safe.duckduckgo.com',
    'www.duckduckgo.com': 'https://safe.duckduckgo.com',
    'youtube.com': 'https://restrict.youtube.com',
    'www.youtube.com': 'https://restrict.youtube.com',
    'm.youtube.com': 'https://restrict.youtube.com',
    'youtu.be': 'https://restrict.youtube.com'
};

function getSafeSearchRedirect(hostname) {
    if (!hostname) return null;
    if (SAFESEARCH_REDIRECTS[hostname]) return SAFESEARCH_REDIRECTS[hostname];

    if (hostname.startsWith('www.')) {
        const base = hostname.slice(4);
        if (SAFESEARCH_REDIRECTS[base]) return SAFESEARCH_REDIRECTS[base];
    }

    if (hostname.startsWith('google.') && !hostname.includes('.google.')) {
        return SAFESEARCH_REDIRECTS['google.com'];
    }

    return null;
}

const proxy = httpProxy.createProxyServer({ secure: false, changeOrigin: true });

let proxyStats = {
    totalRequests: 0,
    blockedRequests: 0,
    getRequests: 0,
    connectRequests: 0
};

function logProxyRequest(method, url, host, io, clientIp = null, meta = null) {
    proxyStats.totalRequests++;
    if (method === 'BLOCK') proxyStats.blockedRequests++;
    else if (method === 'GET') proxyStats.getRequests++;
    else if (method === 'CONNECT') proxyStats.connectRequests++;

    if (privacyShield.isShieldedByIp(clientIp)) return;

    const user = clientIp ? security.getUserByIp(clientIp) : null;
    const logData = { method, url, host, clientIp, user, meta };
    proxyLogger.log(logData).then(() => {
        if (io) io.emit('logs', [{ ...logData, timestamp: new Date().toISOString() }]);
    }).catch(err => console.error('Proxy log error:', err));
}

function getStats() { return proxyStats; }

function serveErrorPage(res, error, hostname, socket = null) {
    fs.readFile(path.join(PATHS.PUBLIC, 'error.html'), 'utf8', (err, data) => {
        let html = data || `<h1>${error.message || 'Error'}</h1>`;
        let statusCode = 502;
        let statusText = 'Bad Gateway';
        let errorType = 'CONNECTION_ERROR';
        let errorReason = error.message || 'Connection failed';
        let errorDetails = 'Unable to establish connection to the target server';

        // Ensure hostname is never undefined or empty
        const domain = hostname || error.hostname || 'unknown';

        // Determine error type and status code
        if (error.code === 'AUTH_REQUIRED') {
            statusCode = 403;
            statusText = 'Forbidden';
            errorType = 'AUTH_REQUIRED';
            errorReason = 'Authentication required';
            errorDetails = 'Please log in to access the internet through this gateway';
        } else if (error.code === 'BLOCKED' || error.message === 'Domain is in blocklist') {
            statusCode = 403;
            statusText = 'Forbidden';
            errorType = 'BLOCKED';
            errorReason = 'Domain blocked by administrator';
            errorDetails = 'This domain is in the blocklist and access is restricted';
        } else if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')) {
            statusCode = 502;
            statusText = 'Bad Gateway';
            errorType = 'DNS_ERROR';
            errorReason = 'DNS resolution failed';
            errorDetails = `Cannot resolve domain name: ${domain}`;
        } else if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
            statusCode = 502;
            statusText = 'Bad Gateway';
            errorType = 'CONNECTION_REFUSED';
            errorReason = 'Connection refused by target server';
            errorDetails = `Server at ${domain} refused the connection`;
        } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
            statusCode = 504;
            statusText = 'Gateway Timeout';
            errorType = 'TIMEOUT';
            errorReason = 'Connection timeout';
            errorDetails = `Server at ${domain} took too long to respond`;
        } else if (error.code === 'ECONNRESET' || error.message?.includes('socket hang up')) {
            statusCode = 502;
            statusText = 'Bad Gateway';
            errorType = '502';
            errorReason = 'Connection reset by server';
            errorDetails = 'The upstream server closed the connection unexpectedly';
        } else if (statusCode === 404 || error.statusCode === 404) {
            statusCode = 404;
            statusText = 'Not Found';
            errorType = '404';
            errorReason = 'Resource not found';
            errorDetails = 'The requested URL was not found on the server';
        } else if (statusCode === 500 || error.statusCode === 500) {
            statusCode = 500;
            statusText = 'Internal Server Error';
            errorType = '500';
            errorReason = 'Server error';
            errorDetails = 'The target server encountered an internal error';
        } else if (statusCode === 503 || error.statusCode === 503) {
            statusCode = 503;
            statusText = 'Service Unavailable';
            errorType = '503';
            errorReason = 'Service unavailable';
            errorDetails = 'The target server is temporarily unavailable';
        }

        // Inject error data into HTML
        if (data) {
            const errorData = {
                code: statusCode,
                type: errorType,
                domain: domain,
                reason: errorReason,
                details: errorDetails,
                category: error.category || null,
                rule: error.rule || null,
                evidence: error.evidence || null
            };

            // Inject error data as meta tag for JavaScript to parse
            const metaTag = `<meta name="error-data" content="${encodeURIComponent(JSON.stringify(errorData))}">`;
            html = data.replace('</head>', `${metaTag}</head>`);
        }

        if (res) {
            res.writeHead(statusCode, {
                'Content-Type': 'text/html',
                'Content-Length': Buffer.byteLength(html)
            });
            res.end(html);
        } else if (socket) {
            try {
                socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(html)}\r\nConnection: close\r\n\r\n${html}`);
                socket.end();
            } catch (e) { }
        }
    });
}

function handleProxyRequest(req, res) {
    try {
        const urlStr = req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`;
        const parsedUrl = new URL(urlStr);
        const hostname = parsedUrl.hostname;
        const clientIp = security.normalizeIp(req.socket?.remoteAddress);

        if (hostname === DASHBOARD_HOSTNAME || hostname === 'server.chakhdi.local') {
            if (localRequestHandler) {
                localRequestHandler(req, res);
                return;
            }
        }

        if (!security.isAllowlistedIp(clientIp)) {
            logProxyRequest('AUTH', `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`, hostname, socketIo, clientIp);
            serveErrorPage(res, { code: 'AUTH_REQUIRED', message: 'Authentication required' }, hostname);
            return;
        }

        const policyBlock = policyManager.getPolicyBlock(clientIp, hostname);
        if (policyBlock) {
            logProxyRequest('BLOCK', `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`, hostname, socketIo, clientIp, policyBlock);
            serveErrorPage(res, {
                code: 'BLOCKED',
                message: 'Blocked by policy',
                category: policyBlock.category,
                rule: policyBlock.rule,
                evidence: policyBlock.evidence
            }, hostname);
            return;
        }

        if (parsedUrl.protocol === 'http:') {
            const redirectBase = getSafeSearchRedirect(hostname);
            if (redirectBase) {
                const redirectUrl = `${redirectBase}${parsedUrl.pathname}${parsedUrl.search}`;
                logProxyRequest('SAFESEARCH', redirectUrl, hostname, socketIo, clientIp);
                res.writeHead(302, { 'Location': redirectUrl });
                res.end();
                return;
            }
        }

        const target = `${parsedUrl.protocol}//${parsedUrl.host}`;

        // Update req.url to be just the path + query to avoid issues with absolute URLs 
        // reaching origin servers and to ensure correct http-proxy behavior
        req.url = parsedUrl.pathname + parsedUrl.search;

        proxy.web(req, res, { target, secure: false, changeOrigin: true });
    } catch (err) {
        const hostname = req.headers.host ? req.headers.host.split(':')[0] : 'unknown';
        serveErrorPage(res, err, hostname);
    }
}

let localRequestHandler = null;
let dashboardHttpsServer = null;

function init(server, io, injectedProxyBlocklist, injectedDnsBlocklist, injectedLocalHandler) {
    proxyBlocklist = injectedProxyBlocklist;
    dnsBlocklist = injectedDnsBlocklist;
    localRequestHandler = injectedLocalHandler;
    socketIo = io;

    // Create a hidden HTTP server to handle local dashboard requests over TLS sockets
    dashboardHttpsServer = http.createServer(async (req, res) => {
        if (localRequestHandler) await localRequestHandler(req, res);
    });

    // Attach Socket.io to this server so live logs work over HTTPS
    if (io) io.attach(dashboardHttpsServer);

    proxy.on('error', (err, req, res) => {
        const hostname = req.headers.host ? req.headers.host.split(':')[0] : 'unknown';
        serveErrorPage(res, err, hostname);
    });
    setupConnectHandler(server, io);
}


function setupConnectHandler(server, io) {
    server.on('connect', (req, clientSocket, head) => {
        const parts = req.url.split(':');
        const hostname = parts[0];
        const port = parseInt(parts[1]) || 443;
        const clientIp = security.normalizeIp(req.socket.remoteAddress);

        const isDashboard = hostname === DASHBOARD_HOSTNAME || hostname === 'server.chakhdi.local';
        const isAllowlisted = security.isAllowlistedIp(clientIp);
        const isBlocked = !isDashboard && ((proxyBlocklist && proxyBlocklist.isBlocked(hostname)) || (dnsBlocklist && dnsBlocklist.isBlocked(hostname)));
        const policyBlock = policyManager.getPolicyBlock(clientIp, hostname);

        if (!isAllowlisted && !isDashboard) {
            logProxyRequest('AUTH', `${hostname}:${port}`, hostname, io, clientIp);
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const { key, cert } = generateCertificate(hostname, clientIp);
            const tlsSocket = new tls.TLSSocket(clientSocket, { key: Buffer.from(key), cert: Buffer.from(cert), isServer: true });
            tlsSocket.on('secure', () => {
                const errorPath = path.join(PATHS.PUBLIC, 'error.html');
                fs.readFile(errorPath, 'utf8', (err, data) => {
                    let html = data || '<h1>Authentication Required</h1>';
                    if (data) {
                        const errorData = {
                            code: 403,
                            type: 'AUTH_REQUIRED',
                            domain: hostname,
                            reason: 'Authentication required',
                            details: 'Please log in to access the internet through this gateway'
                        };
                        const metaTag = `<meta name="error-data" content="${encodeURIComponent(JSON.stringify(errorData))}">`;
                        html = data.replace('</head>', `${metaTag}</head>`);
                    }
                    const response = `HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(html)}\r\nConnection: close\r\n\r\n${html}`;
                    tlsSocket.write(response);
                    tlsSocket.end();
                });
            });
            tlsSocket.on('error', () => { try { clientSocket.end(); } catch (e) { } });
            return;
        }

        if (policyBlock) {
            logProxyRequest('BLOCK', `${hostname}:${port}`, hostname, io, clientIp, policyBlock);
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const { key, cert } = generateCertificate(hostname, clientIp);
            const tlsSocket = new tls.TLSSocket(clientSocket, { key: Buffer.from(key), cert: Buffer.from(cert), isServer: true });
            tlsSocket.on('secure', () => {
                const errorPath = path.join(PATHS.PUBLIC, 'error.html');
                fs.readFile(errorPath, 'utf8', (err, data) => {
                    let html = data || '<h1>Access Blocked</h1>';
                    if (data) {
                        const errorData = {
                            code: 403,
                            type: 'BLOCKED',
                            domain: hostname,
                            reason: 'Blocked by policy',
                            details: policyBlock.evidence || 'Policy restriction',
                            category: policyBlock.category,
                            rule: policyBlock.rule,
                            evidence: policyBlock.evidence
                        };
                        const metaTag = `<meta name="error-data" content="${encodeURIComponent(JSON.stringify(errorData))}">`;
                        html = data.replace('</head>', `${metaTag}</head>`);
                    }
                    const response = `HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(html)}\r\nConnection: close\r\n\r\n${html}`;
                    tlsSocket.write(response);
                    tlsSocket.end();
                });
            });
            tlsSocket.on('error', () => { try { clientSocket.end(); } catch (e) { } });
            return;
        }

        if (isBlocked) {
            logProxyRequest('BLOCK', `${hostname}:${port}`, hostname, io, clientIp);
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const { key, cert } = generateCertificate(hostname, clientIp);
            const tlsSocket = new tls.TLSSocket(clientSocket, { key: Buffer.from(key), cert: Buffer.from(cert), isServer: true });
            tlsSocket.on('secure', () => {
                const errorPath = path.join(PATHS.PUBLIC, 'error.html');
                fs.readFile(errorPath, 'utf8', (err, data) => {
                    let html = data || '<h1>Access Blocked</h1>';
                    if (data) {
                        // Inject error data for blocked HTTPS
                        const errorData = {
                            code: 403,
                            type: 'BLOCKED',
                            domain: hostname,
                            reason: 'Domain blocked by administrator',
                            details: 'This domain is in the blocklist and access is restricted',
                            category: 'Blocklist',
                            rule: 'Proxy/DNS blocklist',
                            evidence: 'Matched blocklist entry'
                        };
                        const metaTag = `<meta name="error-data" content="${encodeURIComponent(JSON.stringify(errorData))}">`;
                        html = data.replace('</head>', `${metaTag}</head>`);
                    }
                    const response = `HTTP/1.1 403 Forbidden\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(html)}\r\nConnection: close\r\n\r\n${html}`;
                    tlsSocket.write(response);
                    tlsSocket.end();
                });
            });
            tlsSocket.on('error', () => { try { clientSocket.end(); } catch (e) { } });
            return;
        }

        if (isDashboard) {
            logProxyRequest('DASHBOARD', `${hostname}:${port}`, hostname, io, clientIp);
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const { key, cert } = generateCertificate(hostname, clientIp);
            const tlsSocket = new tls.TLSSocket(clientSocket, { key: Buffer.from(key), cert: Buffer.from(cert), isServer: true });

            tlsSocket.on('error', (err) => {
                try { clientSocket.end(); } catch (e) { }
            });

            dashboardHttpsServer.emit('connection', tlsSocket);
            return;
        }

        // Full MITM Mode: Generate certificate for EVERY domain
        logProxyRequest('CONNECT', `${hostname}:${port}`, hostname, io, clientIp);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        // Generate a dynamic certificate for the target hostname
        const { key, cert } = generateCertificate(hostname, clientIp);

        const clientTlsSocket = new tls.TLSSocket(clientSocket, {
            key: Buffer.from(key),
            cert: Buffer.from(cert),
            isServer: true
        });

        // Connect to the actual target server over TLS
        const targetSocket = tls.connect({
            host: hostname,
            port,
            servername: hostname
        }, () => { });

        targetSocket.on('error', (err) => {
            serveErrorPage(null, err, hostname, clientTlsSocket);
        });

        clientTlsSocket.pipe(targetSocket);
        targetSocket.pipe(clientTlsSocket);

        // Track internal encrypted traffic for detailed method logging
        clientTlsSocket.on('data', d => {
            const s = d.toString();
            if (s.startsWith('GET') || s.startsWith('POST')) {
                logProxyRequest(s.split(' ')[0], `https://${hostname}${s.split(' ')[1]}`, hostname, io, clientIp);
            }
        });

        clientTlsSocket.on('error', () => targetSocket.end());
        targetSocket.on('end', () => clientTlsSocket.end());
    });
}

module.exports = {
    init,
    handleProxyRequest,
    setupConnectHandler,
    logProxyRequest,
    serveErrorPage,
    getStats
};
