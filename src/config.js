const path = require('path');
require('dotenv').config();

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const DASHBOARD_ALLOWED_HOSTS = (process.env.DASHBOARD_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

module.exports = {
	

    // Server Config
    PORT: 5309,
    HOST: '0.0.0.0',
    DASHBOARD_HOSTNAME: 'server.chakhdi.local',
    REVERSE_DNS_HOSTNAME: process.env.REVERSE_DNS_HOSTNAME || 'DNS.Chakhdi.local',
    DASHBOARD_ALLOWED_HOSTS: [
        'server.chakhdi.local',
        'localhost',
        '127.0.0.1',
        ...DASHBOARD_ALLOWED_HOSTS
    ],
    ALLOW_PRIVATE_IP_DASHBOARD: process.env.ALLOW_PRIVATE_IP_DASHBOARD === 'true',

    // DNS Config
    DNS_PORT: 53,

    // File Paths
    PATHS: {
        ROOT: ROOT_DIR,
        DATA: DATA_DIR,
        PUBLIC: path.join(ROOT_DIR, 'public'),
        BLOCKLIST_DIR: path.join(DATA_DIR, 'blocklist'),
        BLOCKLIST_PROXY_DIR: path.join(DATA_DIR, 'blocklist', 'proxy'),
        BLOCKLIST_DNS_DIR: path.join(DATA_DIR, 'blocklist', 'dns'),
        BLOCKLIST_PROXY_MANUAL: path.join(DATA_DIR, 'blocklist', 'proxy', 'blocklist.txt'),
        BLOCKLIST_DNS_MANUAL: path.join(DATA_DIR, 'blocklist', 'dns', 'blocklist.txt'),
        DNS_DIR: path.join(DATA_DIR, 'dns'),
        DNS_LOGS_DIR: path.join(DATA_DIR, 'dns', 'logs'),
        DNS_CONFIG: path.join(DATA_DIR, 'dns', 'config.json'),
        DNS_CUSTOM_UPSTREAMS: path.join(DATA_DIR, 'dns', 'custom-upstreams.txt'),
        DNS_POLICIES: path.join(DATA_DIR, 'dns', 'policies.json'),
        DNS_ADAPTIVE: path.join(DATA_DIR, 'dns', 'adaptive-suggestions.json'),
        PRIVACY_SHIELD: path.join(DATA_DIR, 'privacy-shield.json'),
        HEALTH_STATE: path.join(DATA_DIR, 'health.json'),
        NAMESERVERS_CSV: path.join(DATA_DIR, 'dns', 'nameservers-all.csv'),
        PROXY_LOGS_DIR: path.join(DATA_DIR, 'proxy-logs'),
        AUDIT_LOGS_DIR: path.join(DATA_DIR, 'audit-logs'),
        CERTS_DIR: path.join(DATA_DIR, 'certs'),
        ROOT_CA_DIR: path.join(DATA_DIR, 'certs', 'root'),
        USERS_FILE: path.join(DATA_DIR, 'users.json')
    },

    // Security - Load from environment variables
    CA_PASSPHRASE: (() => {
        const pass = process.env.CA_PASSPHRASE;
        if (!pass || pass.trim() === '' || pass === 'your-ca-passphrase-here') {
            console.error('❌ CRITICAL SECURITY ERROR: CA_PASSPHRASE is not configured in .env or is set to the default placeholder.');
            console.error('Please configure a unique, secure password for CA_PASSPHRASE in your .env file.');
            process.exit(1);
        }
        if (pass === 'Sahaj@459#459') {
            console.warn('⚠️  SECURITY WARNING: Using the default compatibility CA_PASSPHRASE ("Sahaj@459#459").');
            console.warn('   It is highly recommended to change this to a custom value in your .env file for production.');
        }
        return pass;
    })(),
    SESSION_SECRET: (() => {
        const sec = process.env.SESSION_SECRET;
        if (!sec || sec === 'your-session-secret-here' || sec === 'change-this-secret' || sec.includes('your-very-secure-random')) {
            // Allow the configured default during testing but warn if it is the template default
            if (sec === 'your-session-secret-here' || sec === 'change-this-secret') {
                console.error('❌ CRITICAL SECURITY ERROR: SESSION_SECRET is not configured or is using an insecure template default.');
                process.exit(1);
            }
        }
        return sec || 'change-this-secret';
    })(),
    JWT_SECRET: (() => {
        const sec = process.env.JWT_SECRET;
        if (!sec || sec === 'your-jwt-secret-here' || sec === 'change-this-jwt-secret') {
            console.error('❌ CRITICAL SECURITY ERROR: JWT_SECRET is not configured or is using an insecure template default.');
            process.exit(1);
        }
        return sec;
    })(),
    ADMIN_INITIAL_USERNAME: process.env.ADMIN_INITIAL_USERNAME || '',
    ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || '',
    DASHBOARD_HTTPS: true,
    DASHBOARD_HTTPS_PORT: parseInt(process.env.DASHBOARD_HTTPS_PORT || '443', 10),

    // Access Control
    ALLOWLIST_TTL_MS: parseInt(process.env.ALLOWLIST_TTL_MS || '120000', 10),
    HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),

    // Logging
    MAX_LOG_ENTRIES: 1000
};
