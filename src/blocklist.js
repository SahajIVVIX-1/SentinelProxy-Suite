const { blocklistRun, blocklistAll, blocklistGet, blocklistBulkInsert } = require('./database');

class Blocklist {
    constructor(name, type) {
        this.name = name;
        this.type = type; // 'proxy' or 'dns'
        this.blockedDomains = new Set();
        this.blockedDomainsArray = [];

        // Load from database on startup
        this.loadBlocklist();
    }

    parseDomainLine(line) {
        let cleaned = line.split('#')[0].trim();
        if (!cleaned) return '';

        if (cleaned.startsWith('!') || cleaned.startsWith('[')) return '';

        const dnsmasqMatch = cleaned.match(/^server=\/(.+?)\//);
        if (dnsmasqMatch) return dnsmasqMatch[1].toLowerCase();

        if (cleaned.startsWith('||')) {
            const domain = cleaned.substring(2).replace(/[\^/].*$/, '');
            return domain.toLowerCase();
        }

        const hostsMatch = cleaned.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+(.+)$/);
        if (hostsMatch) return hostsMatch[1].trim().toLowerCase();

        if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1);

        if (cleaned.includes('.') && !cleaned.includes(' ') && !cleaned.includes('/')) {
            return cleaned.toLowerCase();
        }

        return '';
    }

    async loadBlocklist() {
        this.blockedDomains.clear();

        try {
            const rows = await blocklistAll('SELECT domain FROM blocklist WHERE type = ?', [this.type]);
            rows.forEach(row => {
                if (row.domain) this.blockedDomains.add(row.domain.toLowerCase());
            });
            this.blockedDomainsArray = Array.from(this.blockedDomains);
            console.log(`🛡️ [${this.name}] Blocklist loaded: ${this.blockedDomains.size} domains from database`);
        } catch (e) {
            console.error(`[${this.name}] Error loading blocklist from database:`, e);
        }
    }

    isBlocked(hostname) {
        if (!hostname) return false;
        const parts = hostname.toLowerCase().split('.');
        for (let i = 0; i < parts.length; i++) {
            const domainToCheck = parts.slice(i).join('.');
            if (this.blockedDomains.has(domainToCheck)) {
                return true;
            }
        }
        return false;
    }

    async getSources() {
        try {
            const rows = await blocklistAll(
                'SELECT source, COUNT(*) as count FROM blocklist WHERE type = ? GROUP BY source',
                [this.type]
            );
            return rows.map(r => {
                const source = r.source || 'manual';
                if (source.startsWith('file:')) {
                    return { name: source.replace('file:', ''), type: 'file', count: r.count };
                }
                return { name: source, type: 'manual', count: r.count };
            });
        } catch (e) {
            return [];
        }
    }

    async saveManualDomain(rawLine) {
        const domain = this.parseDomainLine(rawLine);
        if (!domain) return;

        if (this.blockedDomains.has(domain)) return;

        try {
            await blocklistRun('INSERT OR IGNORE INTO blocklist (domain, type, source) VALUES (?, ?, ?)',
                [domain, this.type, 'manual']);
            this.blockedDomains.add(domain);
            this.blockedDomainsArray = Array.from(this.blockedDomains);
            console.log(`[${this.name}] Added domain: ${domain}`);
        } catch (e) {
            console.error(`[${this.name}] Error saving domain:`, e);
        }
    }

    async removeManualDomain(domain) {
        domain = domain.toLowerCase();
        if (!this.blockedDomains.has(domain)) return false;

        try {
            await blocklistRun('DELETE FROM blocklist WHERE domain = ? AND type = ?',
                [domain, this.type]);
            this.blockedDomains.delete(domain);
            this.blockedDomainsArray = Array.from(this.blockedDomains);
            return true;
        } catch (e) {
            console.error(`[${this.name}] Error removing domain:`, e);
            return false;
        }
    }

    async removeDomains(domains) {
        const normalized = Array.from(new Set((domains || [])
            .map(d => (d || '').toLowerCase())
            .filter(Boolean)));
        if (normalized.length === 0) return 0;

        const chunkSize = 500;
        let removed = 0;

        for (let i = 0; i < normalized.length; i += chunkSize) {
            const chunk = normalized.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(', ');
            await blocklistRun(
                `DELETE FROM blocklist WHERE type = ? AND domain IN (${placeholders})`,
                [this.type, ...chunk]
            );
            chunk.forEach((domain) => this.blockedDomains.delete(domain));
            removed += chunk.length;
        }

        this.blockedDomainsArray = Array.from(this.blockedDomains);
        return removed;
    }

    async removeBySearch(term) {
        const cleaned = (term || '').toLowerCase().trim();
        if (!cleaned) return 0;

        const rows = await blocklistAll(
            'SELECT domain FROM blocklist WHERE type = ? AND domain LIKE ?',
            [this.type, `%${cleaned}%`]
        );
        const domains = rows.map(r => r.domain).filter(Boolean);
        return this.removeDomains(domains);
    }

    async importFile(filename, content) {
        const lines = content.split(/\r?\n/);
        const source = `file:${filename}`;
        const batch = new Set();
        const batchSize = 5000;
        let added = 0;

        const flushBatch = async () => {
            if (batch.size === 0) return;
            const domains = Array.from(batch);
            const inserted = await blocklistBulkInsert(domains, this.type, source);
            domains.forEach((domain) => this.blockedDomains.add(domain));
            added += inserted;
            batch.clear();
        };

        for (const line of lines) {
            const domain = this.parseDomainLine(line);
            if (!domain) continue;
            if (this.blockedDomains.has(domain) || batch.has(domain)) continue;
            batch.add(domain);
            if (batch.size >= batchSize) {
                await flushBatch();
            }
        }

        await flushBatch();
        this.blockedDomainsArray = Array.from(this.blockedDomains);
        console.log(`[${this.name}] Imported ${added} domains from ${filename}`);
        return added;
    }

    async deleteSource(source) {
        try {
            // Get domains to remove first
            const domainsToRemove = await blocklistAll(
                'SELECT domain FROM blocklist WHERE type = ? AND source = ?',
                [this.type, source]
            );

            // Delete from DB
            await blocklistRun('DELETE FROM blocklist WHERE type = ? AND source = ?', [this.type, source]);

            // Update in-memory (no full reload needed)
            domainsToRemove.forEach(row => {
                if (row.domain) this.blockedDomains.delete(row.domain.toLowerCase());
            });
            this.blockedDomainsArray = Array.from(this.blockedDomains);

            console.log(`[${this.name}] Deleted source "${source}" (${domainsToRemove.length} domains)`);
            return true;
        } catch (e) {
            console.error(`[${this.name}] Error deleting source:`, e);
            return false;
        }
    }

    getBlockedDomains() {
        return this.blockedDomainsArray;
    }
}

module.exports = Blocklist;
