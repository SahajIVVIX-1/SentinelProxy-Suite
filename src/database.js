const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config');
const security = require('./security');

const DATA_DIR = config.PATHS.DATA;

// Ensure all required directories exist
const REQUIRED_DIRS = [
    DATA_DIR,
    config.PATHS.BLOCKLIST_DIR,
    config.PATHS.BLOCKLIST_PROXY_DIR,
    config.PATHS.BLOCKLIST_DNS_DIR,
    config.PATHS.DNS_DIR,
    config.PATHS.DNS_LOGS_DIR,
    config.PATHS.PROXY_LOGS_DIR,
    config.PATHS.AUDIT_LOGS_DIR,
    config.PATHS.CERTS_DIR,
    config.PATHS.ROOT_CA_DIR
];

REQUIRED_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Database files
const usersDbPath = path.join(DATA_DIR, 'users.db');
const blocklistDbPath = path.join(DATA_DIR, 'blocklist.db');
const trafficLogsDbPath = path.join(DATA_DIR, 'traffic_logs.db');  // Unified logs database
const auditLogsDbPath = path.join(DATA_DIR, 'audit_logs.db');
const certLogsDbPath = path.join(DATA_DIR, 'cert_logs.db');

// Create database connections
const usersDb = new sqlite3.Database(usersDbPath);
const blocklistDb = new sqlite3.Database(blocklistDbPath);
const trafficLogsDb = new sqlite3.Database(trafficLogsDbPath);  // Unified logs
const auditLogsDb = new sqlite3.Database(auditLogsDbPath);
const certLogsDb = new sqlite3.Database(certLogsDbPath);

// Helper for schema operations without callbacks
function runSafe(db, sql, params = []) {
    db.run(sql, params, (err) => {
        if (err && !err.message.includes('already exists')) {
            console.error(`[DB Error] ${err.message} | SQL: ${sql.substring(0, 50)}...`);
        }
    });
}

function init() {
    // Users Database
    usersDb.serialize(() => {
        runSafe(usersDb, `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        runSafe(usersDb, `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

        // MAC Address Allowlist - stores which MACs can access which users
        runSafe(usersDb, `CREATE TABLE IF NOT EXISTS mac_allowlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            mac_address TEXT NOT NULL,
            description TEXT,
            added_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, mac_address),
            FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
        )`);
        runSafe(usersDb, `CREATE INDEX IF NOT EXISTS idx_mac_username ON mac_allowlist(username)`);
        runSafe(usersDb, `CREATE INDEX IF NOT EXISTS idx_mac_address ON mac_allowlist(mac_address)`);

        if (config.ADMIN_INITIAL_USERNAME && config.ADMIN_INITIAL_PASSWORD) {
            // Ensure default admin user when env values are provided
            usersDb.get('SELECT * FROM users WHERE username = ?', [config.ADMIN_INITIAL_USERNAME], async (err, row) => {
                const hashedPassword = await security.hashPassword(config.ADMIN_INITIAL_PASSWORD);

                if (!row) {
                    usersDb.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                        [config.ADMIN_INITIAL_USERNAME, hashedPassword, 'admin'], (err) => {
                            if (err) console.error(`❌ Failed to create '${config.ADMIN_INITIAL_USERNAME}' user:`, err);
                            else console.log(`✅ Default admin user created: ${config.ADMIN_INITIAL_USERNAME}`);
                        });
                }

                // Remove legacy 'admin' user if it's different from the configured username
                if (config.ADMIN_INITIAL_USERNAME !== 'admin') {
                    usersDb.run('DELETE FROM users WHERE username = ?', ['admin'], (err) => {
                        if (err) console.error('❌ Failed to remove legacy admin account:', err);
                        else if (this && this.changes > 0) console.log('✅ Legacy admin account removed');
                    });
                }
            });
        }
    });

    // Blocklist Database
    blocklistDb.serialize(() => {
        runSafe(blocklistDb, `CREATE TABLE IF NOT EXISTS blocklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            type TEXT NOT NULL,
            source TEXT DEFAULT 'manual',
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(domain, type)
        )`);
        runSafe(blocklistDb, `CREATE INDEX IF NOT EXISTS idx_blocklist_domain ON blocklist(domain)`);
        runSafe(blocklistDb, `CREATE INDEX IF NOT EXISTS idx_blocklist_type ON blocklist(type)`);
        runSafe(blocklistDb, `CREATE INDEX IF NOT EXISTS idx_blocklist_source ON blocklist(source)`);
    });

    // Unified Traffic Logs Database (DNS + Proxy)
    trafficLogsDb.serialize(() => {
        runSafe(trafficLogsDb, `CREATE TABLE IF NOT EXISTS traffic_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            log_type TEXT NOT NULL,
            method TEXT,
            host TEXT,
            url TEXT,
            domain TEXT,
            record_type TEXT,
            status TEXT,
            client_ip TEXT,
            user TEXT
        )`);
        runSafe(trafficLogsDb, `CREATE INDEX IF NOT EXISTS idx_traffic_timestamp ON traffic_logs(timestamp DESC)`);
        runSafe(trafficLogsDb, `CREATE INDEX IF NOT EXISTS idx_traffic_type ON traffic_logs(log_type)`);
        runSafe(trafficLogsDb, `CREATE INDEX IF NOT EXISTS idx_traffic_host ON traffic_logs(host)`);
        runSafe(trafficLogsDb, `CREATE INDEX IF NOT EXISTS idx_traffic_domain ON traffic_logs(domain)`);

        // Migration: Add user column and index if they don't exist
        trafficLogsDb.all("PRAGMA table_info(traffic_logs)", (err, columns) => {
            if (err) return;
            const hasUser = columns.some(col => col.name === 'user');
            if (!hasUser) {
                trafficLogsDb.run("ALTER TABLE traffic_logs ADD COLUMN user TEXT", (err) => {
                    if (!err) {
                        console.log('✅ Migrated traffic_logs: Added user column');
                        trafficLogsDb.run("CREATE INDEX IF NOT EXISTS idx_traffic_user ON traffic_logs(user)");
                    }
                });
            } else {
                trafficLogsDb.run("CREATE INDEX IF NOT EXISTS idx_traffic_user ON traffic_logs(user)");
            }
        });
    });

    // Audit Logs Database
    auditLogsDb.serialize(() => {
        runSafe(auditLogsDb, `CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            session_id TEXT NOT NULL,
            user TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT
        )`);
        runSafe(auditLogsDb, `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC)`);
        runSafe(auditLogsDb, `CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user)`);
        runSafe(auditLogsDb, `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
        runSafe(auditLogsDb, `CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id)`);
    });

    // Certificate Logs Database
    certLogsDb.serialize(() => {
        runSafe(certLogsDb, `CREATE TABLE IF NOT EXISTS cert_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            hostname TEXT NOT NULL,
            serial_number TEXT NOT NULL,
            validity_start DATETIME NOT NULL,
            validity_end DATETIME NOT NULL,
            from_cache BOOLEAN DEFAULT 0,
            client_ip TEXT
        )`);
        runSafe(certLogsDb, `CREATE INDEX IF NOT EXISTS idx_cert_timestamp ON cert_logs(timestamp DESC)`);
        runSafe(certLogsDb, `CREATE INDEX IF NOT EXISTS idx_cert_hostname ON cert_logs(hostname)`);
        runSafe(certLogsDb, `CREATE INDEX IF NOT EXISTS idx_cert_serial ON cert_logs(serial_number)`);
    });

}

init();

module.exports = {
    // Database instances
    usersDb,
    blocklistDb,
    trafficLogsDb,
    auditLogsDb,
    certLogsDb,
    // Users DB functions
    usersRun: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    usersAll: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    usersGet: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),

    // Blocklist DB functions
    blocklistRun: (query, params = []) => new Promise((resolve, reject) => {
        blocklistDb.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    blocklistAll: (query, params = []) => new Promise((resolve, reject) => {
        blocklistDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    blocklistGet: (query, params = []) => new Promise((resolve, reject) => {
        blocklistDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),
    blocklistBulkInsert: (domains, type, source) => new Promise((resolve, reject) => {
        if (!domains || domains.length === 0) {
            resolve(0);
            return;
        }

        blocklistDb.serialize(() => {
            let finished = false;
            let added = 0;
            let pending = domains.length;

            const finalizeWithError = (err) => {
                if (finished) return;
                finished = true;
                blocklistDb.run('ROLLBACK', () => {
                    reject(err);
                });
            };

            blocklistDb.run('BEGIN IMMEDIATE');
            const stmt = blocklistDb.prepare(
                'INSERT OR IGNORE INTO blocklist (domain, type, source) VALUES (?, ?, ?)'
            );

            domains.forEach((domain) => {
                if (finished) return;
                stmt.run([domain, type, source], function (err) {
                    if (finished) return;
                    if (err) {
                        stmt.finalize(() => finalizeWithError(err));
                        return;
                    }

                    added += this.changes || 0;
                    pending -= 1;

                    if (pending === 0) {
                        stmt.finalize((finalErr) => {
                            if (finalErr) {
                                finalizeWithError(finalErr);
                                return;
                            }
                            blocklistDb.run('COMMIT', (commitErr) => {
                                if (commitErr) {
                                    finalizeWithError(commitErr);
                                    return;
                                }
                                finished = true;
                                resolve(added);
                            });
                        });
                    }
                });
            });
        });
    }),

    // Unified Traffic Logs DB functions (Proxy + DNS)
    trafficLogInsert: (logType, data) => new Promise((resolve, reject) => {
        const { method, host, url, domain, recordType, status, clientIp, user } = data;
        trafficLogsDb.run(
            'INSERT INTO traffic_logs (log_type, method, host, url, domain, record_type, status, client_ip, user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [logType, method || null, host || null, url || null, domain || null, recordType || null, status || null, clientIp || null, user || null],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    }),

    trafficLogGetAll: (limit = 1000, offset = 0, search = '', logType = '', user = '') => new Promise((resolve, reject) => {
        let query = 'SELECT * FROM traffic_logs WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (host LIKE ? OR url LIKE ? OR domain LIKE ? OR user LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (logType) {
            query += ' AND log_type = ?';
            params.push(logType);
        }
        if (user) {
            query += ' AND user = ?';
            params.push(user);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        trafficLogsDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    trafficLogCount: (search = '', logType = '', user = '') => new Promise((resolve, reject) => {
        let query = 'SELECT COUNT(*) as count FROM traffic_logs WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (host LIKE ? OR url LIKE ? OR domain LIKE ? OR user LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (logType) {
            query += ' AND log_type = ?';
            params.push(logType);
        }
        if (user) {
            query += ' AND user = ?';
            params.push(user);
        }

        trafficLogsDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    }),

    trafficLogDeleteAll: (logType = '') => new Promise((resolve, reject) => {
        let query = 'DELETE FROM traffic_logs';
        const params = [];
        if (logType) {
            query += ' WHERE log_type = ?';
            params.push(logType);
        }
        trafficLogsDb.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),

    trafficLogDeleteById: (id) => new Promise((resolve, reject) => {
        trafficLogsDb.run('DELETE FROM traffic_logs WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),

    trafficLogDeleteByTimeRange: (startTime, endTime, logType = '') => new Promise((resolve, reject) => {
        let query = 'DELETE FROM traffic_logs WHERE timestamp >= ? AND timestamp <= ?';
        const params = [startTime, endTime];
        if (logType) {
            query += ' AND log_type = ?';
            params.push(logType);
        }
        trafficLogsDb.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),

    trafficLogAll: (query, params = []) => new Promise((resolve, reject) => {
        trafficLogsDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    trafficLogGet: (query, params = []) => new Promise((resolve, reject) => {
        trafficLogsDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),

    // Legacy compatibility - Proxy wrapper functions
    proxyLogInsert: (method, host, url, clientIp = null) => {
        return module.exports.trafficLogInsert('proxy', { method, host, url, clientIp });
    },
    proxyLogGetAll: (limit = 100, offset = 0, search = '', method = '') => {
        return module.exports.trafficLogGetAll(limit, offset, search, 'proxy');
    },
    proxyLogCount: (search = '', method = '') => {
        return module.exports.trafficLogCount(search, 'proxy');
    },
    proxyLogDeleteAll: () => {
        return module.exports.trafficLogDeleteAll('proxy');
    },
    proxyLogDeleteById: (id) => {
        return module.exports.trafficLogDeleteById(id);
    },
    proxyLogDeleteByTimeRange: (startTime, endTime) => {
        return module.exports.trafficLogDeleteByTimeRange(startTime, endTime, 'proxy');
    },

    // Legacy compatibility - DNS wrapper functions
    dnsLogInsert: (domain, recordType, status, clientIp = null) => {
        return module.exports.trafficLogInsert('dns', { domain, recordType, status, clientIp });
    },
    dnsLogGetAll: (limit = 100, offset = 0, search = '', status = '') => {
        return module.exports.trafficLogGetAll(limit, offset, search, 'dns');
    },
    dnsLogCount: (search = '', status = '') => {
        return module.exports.trafficLogCount(search, 'dns');
    },
    dnsLogDeleteAll: () => {
        return module.exports.trafficLogDeleteAll('dns');
    },
    dnsLogDeleteById: (id) => {
        return module.exports.trafficLogDeleteById(id);
    },
    dnsLogDeleteByTimeRange: (startTime, endTime) => {
        return module.exports.trafficLogDeleteByTimeRange(startTime, endTime, 'dns');
    },

    // Audit Logs DB functions
    auditLogInsert: (sessionId, user, action, details = '', ipAddress = null, userAgent = null) => new Promise((resolve, reject) => {
        auditLogsDb.run(
            'INSERT INTO audit_logs (session_id, user, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, user, action, details, ipAddress, userAgent],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    }),
    auditLogGetAll: (limit = 100, offset = 0, user = '', action = '', sessionId = '') => new Promise((resolve, reject) => {
        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];

        if (user) {
            query += ' AND user LIKE ?';
            params.push(`%${user}%`);
        }
        if (action) {
            query += ' AND action LIKE ?';
            params.push(`%${action}%`);
        }
        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        auditLogsDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    auditLogCount: (user = '', action = '', sessionId = '') => new Promise((resolve, reject) => {
        let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
        const params = [];

        if (user) {
            query += ' AND user LIKE ?';
            params.push(`%${user}%`);
        }
        if (action) {
            query += ' AND action LIKE ?';
            params.push(`%${action}%`);
        }
        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }

        auditLogsDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    }),
    auditLogDelete: (id) => new Promise((resolve, reject) => {
        auditLogsDb.run('DELETE FROM audit_logs WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    auditLogDeleteSession: (sessionId) => new Promise((resolve, reject) => {
        auditLogsDb.run('DELETE FROM audit_logs WHERE session_id = ?', [sessionId], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    auditLogDeleteAll: () => new Promise((resolve, reject) => {
        auditLogsDb.run('DELETE FROM audit_logs', [], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    auditLogGetSessions: () => new Promise((resolve, reject) => {
        auditLogsDb.all(
            `SELECT 
                session_id, 
                user,
                MIN(timestamp) as start_time, 
                MAX(timestamp) as end_time, 
                COUNT(*) as log_count 
            FROM audit_logs 
            GROUP BY session_id 
            ORDER BY end_time DESC`,
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    }),

    auditLogAll: (query, params = []) => new Promise((resolve, reject) => {
        auditLogsDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    // Certificate Logs DB functions
    certLogInsert: (hostname, serialNumber, validityStart, validityEnd, fromCache = false, clientIp = null) => new Promise((resolve, reject) => {
        certLogsDb.run(
            'INSERT INTO cert_logs (hostname, serial_number, validity_start, validity_end, from_cache, client_ip) VALUES (?, ?, ?, ?, ?, ?)',
            [hostname, serialNumber, validityStart, validityEnd, fromCache ? 1 : 0, clientIp],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    }),
    certLogGetAll: (limit = 100, offset = 0, search = '') => new Promise((resolve, reject) => {
        let query = 'SELECT * FROM cert_logs WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND hostname LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        certLogsDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    certLogCount: (search = '') => new Promise((resolve, reject) => {
        let query = 'SELECT COUNT(*) as count FROM cert_logs WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND hostname LIKE ?';
            params.push(`%${search}%`);
        }

        certLogsDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    }),
    certLogDeleteAll: () => new Promise((resolve, reject) => {
        certLogsDb.run('DELETE FROM cert_logs', [], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    certLogDeleteById: (id) => new Promise((resolve, reject) => {
        certLogsDb.run('DELETE FROM cert_logs WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    certLogDeleteByTimeRange: (startTime, endTime) => new Promise((resolve, reject) => {
        certLogsDb.run('DELETE FROM cert_logs WHERE timestamp >= ? AND timestamp <= ?', [startTime, endTime], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),

    // Legacy compatibility (redirect to users DB)
    run: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),
    all: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    get: (query, params = []) => new Promise((resolve, reject) => {
        usersDb.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),

    // User Management Functions
    userCreate: async (username, password, role = 'user') => {
        const hashedPassword = await security.hashPassword(password);
        return new Promise((resolve, reject) => {
            usersDb.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username, hashedPassword, role],
                function (err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, username, role });
                }
            );
        });
    },

    userFindByUsername: (username) => new Promise((resolve, reject) => {
        usersDb.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),

    userUpdatePassword: async (username, newPassword) => {
        const hashedPassword = await security.hashPassword(newPassword);
        return new Promise((resolve, reject) => {
            usersDb.run(
                'UPDATE users SET password = ? WHERE username = ?',
                [hashedPassword, username],
                function (err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
    },

    userDelete: (username) => new Promise((resolve, reject) => {
        usersDb.run('DELETE FROM users WHERE username = ?', [username], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    }),

    userGetAll: () => new Promise((resolve, reject) => {
        usersDb.all('SELECT id, username, role, created_at FROM users', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    // MAC Allowlist Management Functions
    macAllowlistAdd: (username, macAddress, description = '', addedBy = 'admin') => new Promise((resolve, reject) => {
        usersDb.run(
            'INSERT OR IGNORE INTO mac_allowlist (username, mac_address, description, added_by) VALUES (?, ?, ?, ?)',
            [username, macAddress.toLowerCase(), description, addedBy],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            }
        );
    }),

    macAllowlistRemove: (username, macAddress) => new Promise((resolve, reject) => {
        usersDb.run(
            'DELETE FROM mac_allowlist WHERE username = ? AND mac_address = ?',
            [username, macAddress.toLowerCase()],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    }),

    macAllowlistGetByUsername: (username) => new Promise((resolve, reject) => {
        usersDb.all('SELECT * FROM mac_allowlist WHERE username = ? ORDER BY created_at DESC', [username], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    macAllowlistGetAll: () => new Promise((resolve, reject) => {
        usersDb.all('SELECT * FROM mac_allowlist ORDER BY username, created_at DESC', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),

    macAllowlistCheck: (username, macAddress) => new Promise((resolve, reject) => {
        if (!macAddress) {
            resolve(null);
            return;
        }
        usersDb.get(
            'SELECT * FROM mac_allowlist WHERE username = ? AND mac_address = ?',
            [username, macAddress.toLowerCase()],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    }),

    macAllowlistDeleteByUsername: (username) => new Promise((resolve, reject) => {
        usersDb.run('DELETE FROM mac_allowlist WHERE username = ?', [username], function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    })
};
